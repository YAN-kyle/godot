using System.Runtime.InteropServices;

namespace Godot.NativeInterop
{
    // GodotSharp calls the engine through unmanaged function pointers (see 'NativeFuncs').
    // The Mono interpreter can only make such calls on WebAssembly with an interp-to-native
    // wrapper for the exact wasm signature, taken from the table that the WebAssembly SDK
    // generates ('wasm_m2n_invoke.g.h') when publishing this project. The generator only
    // collects signatures from P/Invokes, so most of them already come from the BCL, but
    // GodotSharp's function pointers aren't seen by it, and the signatures below aren't used
    // by any BCL P/Invoke. Without them, calling those functions traps with
    // 'RuntimeError: function signature mismatch' (for example, any engine error print,
    // which captures the C# stack trace through 'godotsharp_stack_info_vector_resize').
    //
    // These declarations only exist to add the signatures to the table and are never called.
    // The comment on each one is the Mono signature (return type first; I = int32 or pointer,
    // L = int64, F = float, D = double, V = void). Keep them in sync with the signatures of the
    // 'UnmanagedCallbacks' struct in 'NativeFuncs.cs' that the BCL doesn't provide.
    internal static class NativeFuncsSignatures
    {
        private const string Library = "__GodotSharpSignatures";

        // F: godotsharp_randf
        [DllImport(Library)]
        private static extern float F();

        // FI: godotsharp_color_get_ok_hsl_h/s/l
        [DllImport(Library)]
        private static extern float FI(nint a);

        // LII: godotsharp_stack_info_vector_resize, godotsharp_array_resize
        [DllImport(Library)]
        private static extern long LII(nint a, int b);

        // LIIII: godotsharp_internal_signal_awaiter_connect
        [DllImport(Library)]
        private static extern long LIIII(nint a, nint b, nint c, nint d);

        // VIFFFF: godotsharp_color_from_ok_hsl
        [DllImport(Library)]
        private static extern void VIFFFF(nint a, float b, float c, float d, float e);

        // VILII: godotsharp_packed_byte_array_decompress(_dynamic)
        [DllImport(Library)]
        private static extern void VILII(nint a, long b, int c, nint d);
    }
}
