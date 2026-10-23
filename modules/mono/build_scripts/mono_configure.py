import os
import os.path
import shutil


def is_desktop(platform):
    return platform in ["windows", "macos", "linuxbsd"]


def is_unix_like(platform):
    return platform in ["macos", "linuxbsd", "android", "ios"]


def module_supports_tools_on(platform):
    return is_desktop(platform)


def configure(env, env_mono):
    if env.editor_build:
        if not module_supports_tools_on(env["platform"]):
            raise RuntimeError("This module does not currently support building for this platform for editor builds.")
        env_mono.Append(CPPDEFINES=["GD_MONO_HOT_RELOAD"])

    if env["platform"] == "web":
        rid = get_rid(env["platform"], env["arch"])

        this_script_dir = os.path.dirname(os.path.realpath(__file__))
        module_dir = os.path.abspath(os.path.join(this_script_dir, os.pardir))
        get_runtime_pack_project_path = os.path.join(module_dir, "runtime", "GetRuntimePack")
        # Must match the TargetFramework in GetRuntimePack.csproj (and Godot's minimum required TFM).
        get_runtime_pack_tfm = "net10.0"

        mono_runtime_copy_path = os.path.join(get_runtime_pack_project_path, "bin", "mono_runtime")
        try:
            shutil.rmtree(mono_runtime_copy_path)
        except FileNotFoundError:
            # It's fine if this directory doesn't exist.
            pass

        # The publish compiles the runtime pack's native sources with the .NET SDK's own bundled
        # Emscripten, which may be a different version than the one used to build Godot.
        # Don't let the Emscripten config and cache selected for Godot's build leak into it,
        # since the bundled emcc would try to use them instead of its own.
        publish_env = os.environ.copy()
        for var in ("EM_CONFIG", "EM_CACHE"):
            publish_env.pop(var, None)

        import subprocess
        exit_code = subprocess.call(
            [
                "dotnet", "publish",
                get_runtime_pack_project_path,
                "-r", "browser-wasm",
                "--self-contained",
                "-c", "Release",
                # Threaded builds need the multithreaded runtime pack.
                "-p:WasmEnableThreads=" + ("true" if env["threads"] else "false"),
            ],
            env=publish_env,
        )
        if exit_code != 0:
            raise RuntimeError("Couldn't retrieve Mono runtime pack for '" + rid + "'.")

        with open(os.path.join(get_runtime_pack_project_path, "bin", rid, "runtime-pack-dir.txt")) as f:
            mono_runtime_path = os.path.join(f.readline().strip(), "runtimes", rid, "native")
            shutil.copytree(mono_runtime_path, mono_runtime_copy_path)
            mono_runtime_path = mono_runtime_copy_path

        # The default Mono runtime uses WASM exceptions.
        env.Append(CCFLAGS=["-fwasm-exceptions"])
        env.Append(LINKFLAGS=["-fwasm-exceptions"])

        env_mono.Prepend(CPPPATH=os.path.join(mono_runtime_path, "include", "mono-2.0"))

        env_mono.Append(LIBPATH=[mono_runtime_path])

        # Mono libraries.
        add_mono_library(env, "libmonosgen-2.0.a", mono_runtime_path)
        add_mono_library(env, "libmono-wasm-eh-wasm.a", mono_runtime_path)
        add_mono_library(env, "libmono-ee-interp.a", mono_runtime_path)
        add_mono_library(env, "libSystem.Native.a", mono_runtime_path)
        if env["dotnet_web_icu"]:
            add_mono_library(env, "libSystem.Globalization.Native.a", mono_runtime_path)
        add_mono_library(env, "libSystem.IO.Compression.Native.a", mono_runtime_path)
        add_mono_library(env, "wasm-bundled-timezones.a", mono_runtime_path)
        add_mono_library(env, "libmono-wasm-simd.a", mono_runtime_path)
        add_mono_library(env, "libmono-icall-table.a", mono_runtime_path)
        if env["dotnet_web_icu"]:
            add_mono_library(env, "libicuuc.a", mono_runtime_path)
            add_mono_library(env, "libicudata.a", mono_runtime_path)
            add_mono_library(env, "libicui18n.a", mono_runtime_path)
        add_mono_library(env, "libz.a", mono_runtime_path)

        # Mono components.
        # The debugger, diagnostics_tracing and hot_reload components are linked as stubs, which is
        # also what the .NET SDK does for browser-wasm Release builds. The real components can't work
        # with Godot's web loader: their transports (the debugger agent messages for the browser debug
        # proxy, the diagnostic server's WebSocket, applying hot reload deltas) are implemented by the
        # .NET JS runtime (`dotnet.runtime.js`), which Godot doesn't load, so the corresponding wasm
        # imports are only inert stubs. This applies to debug templates as well.
        # The full diagnostics_tracing component would also require `libmono-profiler-browser.a`.
        add_mono_component(env, "debugger", mono_runtime_path, is_stub=True)
        add_mono_component(env, "diagnostics_tracing", mono_runtime_path, is_stub=True)
        add_mono_component(env, "hot_reload", mono_runtime_path, is_stub=True)
        # Needed for runtime marshalling of P/Invokes and delegates with non-blittable signatures.
        add_mono_component(env, "marshal-ilgen", mono_runtime_path)

        # WASM additional sources.
        env_thirdparty = env_mono.Clone()
        env_thirdparty.disable_warnings()
        env_thirdparty.Append(CPPDEFINES=["GEN_PINVOKE"])
        if env["dlink_enabled"]:
            env_thirdparty.Append(CPPDEFINES=["WASM_SUPPORTS_DLOPEN"])
        env_thirdparty.Prepend(CPPPATH=os.path.join(mono_runtime_path, "include", "wasm"))
        # Must match the IntermediateOutputPath in GetRuntimePack.csproj.
        get_runtime_pack_obj_config = "Release-threads" if env["threads"] else "Release"
        get_runtime_pack_project_includes = os.path.join(
            get_runtime_pack_project_path, "obj", get_runtime_pack_obj_config, get_runtime_pack_tfm, rid, "wasm", "for-publish"
        )
        env_thirdparty.Prepend(CPPPATH=os.path.join(get_runtime_pack_project_includes))
        if not env["dotnet_web_icu"]:
            # Without ICU (about 1.3 MB of the wasm), only invariant globalization works.
            # 'driver.c' then doesn't link ICU, and the P/Invoke table's
            # 'libSystem.Globalization.Native' entries, which invariant mode doesn't call,
            # point to stubs instead.
            env_thirdparty.Append(CPPDEFINES=["INVARIANT_GLOBALIZATION"])
            env_mono.Append(CPPDEFINES=["GD_MONO_WEB_NO_ICU"])
            globalization_stubs_path = os.path.join(
                env.Dir("#bin/obj").abspath,
                "modules",
                "mono",
                "globalization_native_stubs." + get_runtime_pack_obj_config + ".gen.c",
            )
            write_globalization_native_stubs(
                os.path.join(get_runtime_pack_project_includes, "pinvoke-table.h"), globalization_stubs_path
            )
            env_thirdparty.add_source_files(env.modules_sources, [globalization_stubs_path])
        env_thirdparty.add_source_files(
            env.modules_sources,
            [
                os.path.join(mono_runtime_path, "src", "runtime.c"),
                os.path.join(mono_runtime_path, "src", "driver.c"),
                os.path.join(mono_runtime_path, "src", "corebindings.c"),
                os.path.join(mono_runtime_path, "src", "pinvoke.c"),
            ],
        )

        # Lets the prebuilt runtime's Wasm EH objects link with newer Emscripten versions.
        env_mono.add_source_files(env.modules_sources, [os.path.join(module_dir, "runtime", "web", "wasm_eh_compat.c")])

        # Must come after `dotnet.es6.lib.js`, as it overrides its `DOTNET.setup()` call.
        env.AddJSLibraries(
            [
                os.path.join(mono_runtime_path, "src", "es6", "dotnet.es6.lib.js"),
                os.path.join(module_dir, "runtime", "web", "library_godot_dotnet.js"),
            ]
        )


"""
Write stubs for the 'libSystem.Globalization.Native' functions in the generated P/Invoke table,
for Web builds without ICU. With invariant globalization, the runtime never calls them. Otherwise,
'GlobalizationNative_LoadICU' returning 0 makes the runtime fail with an error that asks for
invariant globalization.
"""
def write_globalization_native_stubs(pinvoke_table_path: str, output_path: str):
    import re

    with open(pinvoke_table_path, encoding="utf-8") as f:
        prototypes = sorted(set(re.findall(r"^(\w+) (GlobalizationNative_\w+) \(([^)]*)\);$", f.read(), re.MULTILINE)))
    if not prototypes:
        raise RuntimeError("No 'libSystem.Globalization.Native' functions found in '" + pinvoke_table_path + "'.")

    lines = [
        "/* THIS FILE IS GENERATED DO NOT EDIT */",
        "/* Stubs for the P/Invoke table, for Web builds with 'dotnet_web_icu=no'. */",
        "",
        "#include <stdint.h>",
        "",
    ]
    for return_type, name, params in prototypes:
        param_types = [p.strip() for p in params.split(",") if p.strip()]
        param_list = ", ".join(f"{t} p{i}" for i, t in enumerate(param_types)) or "void"
        body = "" if return_type == "void" else " return 0; "
        lines.append(f"{return_type} {name}({param_list}) {{{body}}}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    content = "\n".join(lines) + "\n"
    # Don't rewrite an unchanged file, so SCons doesn't rebuild it.
    try:
        with open(output_path, encoding="utf-8") as f:
            if f.read() == content:
                return
    except FileNotFoundError:
        pass
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


"""
Get the .NET runtime identifier for the given Godot platform and architecture names.
"""
def get_rid(platform: str, arch: str):
    # Web runtime identifier is always browser-wasm.
    if platform == "web":
        return "browser-wasm"

    # Platform renames.
    if platform == "macos":
        platform = "osx"
    elif platform == "linuxbsd":
        platform = "linux"

    # Arch renames.
    if arch == "x86_32":
        arch = "x86"
    elif arch == "x86_64":
        arch = "x64"
    elif arch == "arm32":
        arch = "arm"

    return platform + "-" + arch


"""
Link mono components statically (use the stubs to load them dynamically at runtime).
See: https://github.com/dotnet/runtime/blob/main/docs/design/mono/components.md
"""
def add_mono_component(env, name: str, mono_runtime_path: str, is_stub: bool = False):
    stub_suffix = "-stub" if is_stub else ""
    component_filename = "libmono-component-" + name + stub_suffix + "-static.a"
    add_mono_library(env, component_filename, mono_runtime_path)


"""
Link mono library archive (.a) statically.
"""
def add_mono_library(env, filename: str, mono_runtime_path: str):
    assert(filename.endswith(".a"))
    env.Append(
        LINKFLAGS=[
            "-Wl,-whole-archive",
            os.path.join(mono_runtime_path, filename),
            "-Wl,-no-whole-archive",
        ]
    )
