/**************************************************************************/
/*  library_godot_dotnet.js                                               */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             GODOT ENGINE                               */
/*                        https://godotengine.org                         */
/**************************************************************************/
/* Copyright (c) 2014-present Godot Engine contributors (see AUTHORS.md). */
/* Copyright (c) 2007-2014 Juan Linietsky, Ariel Manzur.                  */
/*                                                                        */
/* Permission is hereby granted, free of charge, to any person obtaining  */
/* a copy of this software and associated documentation files (the        */
/* "Software"), to deal in the Software without restriction, including    */
/* without limitation the rights to use, copy, modify, merge, publish,    */
/* distribute, sublicense, and/or sell copies of the Software, and to     */
/* permit persons to whom the Software is furnished to do so, subject to  */
/* the following conditions:                                              */
/*                                                                        */
/* The above copyright notice and this permission notice shall be         */
/* included in all copies or substantial portions of the Software.        */
/*                                                                        */
/* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,        */
/* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF     */
/* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. */
/* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY   */
/* CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,   */
/* TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE      */
/* SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                 */
/**************************************************************************/

// The .NET runtime pack's `dotnet.es6.lib.js` (linked just before this file) is
// written for the .NET SDK's own loader: its `$DOTNET__postset` emits a
// `DOTNET.setup({...})` call that runs while the Emscripten module is being
// instantiated and expects `Module.__dotnet_runtime` (set up by `dotnet.js` /
// `dotnet.runtime.js`) and a global `require` to exist.
// Godot loads the module with its own `engine.js` loader and starts Mono from
// native code (`GDMono::initialize`), so neither exists and the call throws,
// aborting the engine startup.
// We still need the rest of that library (the stubs for the runtime's
// `mono_wasm_*` imports), so only drop the setup code here.
//
// Those stubs are only placeholders that `dotnet.runtime.js` swaps for its real
// implementations when the module is instantiated. Since Godot doesn't load it,
// the imports the runtime needs are implemented below instead, following the
// single-threaded implementations in the runtime's `src/mono/browser/runtime/`.
const GodotDotnet = {
	$DOTNET: {},
	$DOTNET__postset: '',

	$GodotDotnet: {
		timer_id: null,
		background_exec_id: null,
	},

	// Called by the managed `TimerQueue` with the time until the next timer is
	// due. Replaces any previously scheduled tick, as the runtime does
	// (`scheduling.ts`). Without this, `System.Threading.Timer`, `Task.Delay`
	// and timeouts never complete.
	mono_wasm_schedule_timer__deps: ['$GodotDotnet', '$safeSetTimeout', 'mono_wasm_execute_timer'],
	mono_wasm_schedule_timer__sig: 'vi',
	mono_wasm_schedule_timer: function (p_shortest_due_time_ms) {
		if (GodotDotnet.timer_id !== null) {
			clearTimeout(GodotDotnet.timer_id);
		}
		GodotDotnet.timer_id = safeSetTimeout(function () {
			GodotDotnet.timer_id = null;
			_mono_wasm_execute_timer();
		}, p_shortest_due_time_ms);
	},

	// Called when work is queued for the main thread's background job queue
	// (thread pool work items, e.g. `Task.Run` or continuations without a
	// synchronization context). Runs the queue on the next macrotask; multiple
	// requests before then are coalesced.
	schedule_background_exec__deps: ['$GodotDotnet', '$safeSetTimeout', 'mono_background_exec'],
	schedule_background_exec__sig: 'v',
	schedule_background_exec: function () {
		if (GodotDotnet.background_exec_id !== null) {
			return;
		}
		GodotDotnet.background_exec_id = safeSetTimeout(function () {
			GodotDotnet.background_exec_id = null;
			_mono_background_exec();
		}, 0);
	},

	// Source of `minipal_get_cryptographically_secure_random_bytes`, which backs
	// `RandomNumberGenerator`, `Guid.NewGuid` and the runtime's hash seeds.
	// Must return 0 only when the buffer was filled: the stub's return value
	// coerces to 0, which made callers use the untouched (zeroed) buffer.
	mono_wasm_browser_entropy__deps: ['$GodotRuntime'],
	mono_wasm_browser_entropy__sig: 'iii',
	mono_wasm_browser_entropy: function (p_buffer, p_length) {
		if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
			return -1;
		}
		const target = GodotRuntime.heapSub(HEAPU8, p_buffer, p_length);
		// `getRandomValues` rejects views on a SharedArrayBuffer (threaded builds).
		const needs_copy = typeof SharedArrayBuffer !== 'undefined' && target.buffer instanceof SharedArrayBuffer;
		const buffer = needs_copy ? new Uint8Array(p_length) : target;
		// `getRandomValues` fills at most 65536 bytes per call.
		const max_batch = 65536;
		for (let i = 0; i < p_length; i += max_batch) {
			globalThis.crypto.getRandomValues(buffer.subarray(i, Math.min(p_length, i + max_batch)));
		}
		if (needs_copy) {
			target.set(buffer);
		}
		return 0;
	},

	// The .NET loader passes the browser's time zone to the runtime as the `TZ`
	// environment variable, which `TimeZoneInfo.Local` reads. Godot sets it from
	// this before initializing the runtime.
	godot_js_dotnet_time_zone_get__deps: ['$GodotRuntime'],
	godot_js_dotnet_time_zone_get__proxy: 'sync',
	godot_js_dotnet_time_zone_get__sig: 'vii',
	godot_js_dotnet_time_zone_get: function (p_ptr, p_ptr_max) {
		let time_zone = '';
		try {
			time_zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
		} catch (e) {
			// Leave it empty, the runtime then falls back to UTC.
		}
		GodotRuntime.stringToHeap(time_zone, p_ptr, p_ptr_max);
	},

	// The Mono log handler installed by `mono_wasm_load_runtime`. Runtime
	// errors (e.g. failing to load an assembly, or the message before a fatal
	// error aborts) would otherwise be lost.
	mono_wasm_trace_logger__deps: ['$GodotRuntime'],
	mono_wasm_trace_logger__sig: 'viiiii',
	mono_wasm_trace_logger: function (p_domain, p_level, p_message, p_fatal, p_user_data) {
		const message = `[MONO] ${p_message ? GodotRuntime.parseString(p_message) : '<no message>'}`;
		const level = p_level ? GodotRuntime.parseString(p_level) : '';
		if (p_fatal || level === 'critical' || level === 'error' || level === 'warning') {
			GodotRuntime.error(message);
		} else {
			GodotRuntime.print(message);
		}
	},

	// `Console.Clear()`.
	mono_wasm_console_clear__sig: 'v',
	mono_wasm_console_clear: function () {
		console.clear(); // eslint-disable-line no-console
	},

	/*
	 * JavaScript interop (`System.Runtime.InteropServices.JavaScript`) is
	 * implemented by `dotnet.runtime.js`, so it isn't available here.
	 */

	$GodotDotnetInterop__deps: ['$stringToUTF16', 'malloc'],
	$GodotDotnetInterop: {
		NOT_SUPPORTED: 'JavaScript interop ([JSImport]/[JSExport], JSHost, JSObject) is not supported by Godot\'s .NET Web export. Use Godot\'s JavaScriptBridge instead.',

		// Returns the message as a UTF-16 string allocated with `malloc`, the way
		// the runtime returns error messages to managed code, which frees it.
		allocErrorString: function (p_message) {
			const size = (p_message.length + 1) * 2;
			const ptr = _malloc(size);
			stringToUTF16(p_message, ptr, size);
			return ptr;
		},
	},

	// Called first for every [JSImport] (including the runtime's own, used by
	// `JSHost`). Returning a message makes managed code throw a `JSException`
	// with it, so none of the other interop imports can be reached.
	mono_wasm_bind_js_import_ST__deps: ['$GodotDotnetInterop'],
	mono_wasm_bind_js_import_ST__sig: 'ii',
	mono_wasm_bind_js_import_ST: function (p_signature) {
		return GodotDotnetInterop.allocErrorString(GodotDotnetInterop.NOT_SUPPORTED);
	},

	mono_wasm_invoke_jsimport_ST__deps: ['$GodotDotnetInterop'],
	mono_wasm_invoke_jsimport_ST__sig: 'vii',
	mono_wasm_invoke_jsimport_ST: function (p_function_handle, p_args) {
		throw new Error(GodotDotnetInterop.NOT_SUPPORTED);
	},

	mono_wasm_invoke_js_function__deps: ['$GodotDotnetInterop'],
	mono_wasm_invoke_js_function__sig: 'vii',
	mono_wasm_invoke_js_function: function (p_function_js_handle, p_args) {
		throw new Error(GodotDotnetInterop.NOT_SUPPORTED);
	},

	mono_wasm_resolve_or_reject_promise__deps: ['$GodotDotnetInterop'],
	mono_wasm_resolve_or_reject_promise__sig: 'vi',
	mono_wasm_resolve_or_reject_promise: function (p_args) {
		throw new Error(GodotDotnetInterop.NOT_SUPPORTED);
	},

	mono_wasm_cancel_promise__deps: ['$GodotDotnetInterop'],
	mono_wasm_cancel_promise__sig: 'vi',
	mono_wasm_cancel_promise: function (p_task_holder_gc_handle) {
		throw new Error(GodotDotnetInterop.NOT_SUPPORTED);
	},

	// Called when a `JSObject` is disposed or finalized. None can exist without
	// interop, and throwing from a finalizer would bring the runtime down.
	mono_wasm_release_cs_owned_object__sig: 'vi',
	mono_wasm_release_cs_owned_object: function (p_js_handle) {},

	// Only used when globalization isn't invariant, which needs ICU data that
	// only the .NET loader can load. Return an error for managed code to throw.
	mono_wasm_get_locale_info__deps: ['$GodotDotnetInterop', '$GodotRuntime'],
	mono_wasm_get_locale_info__sig: 'iiiiiiii',
	mono_wasm_get_locale_info: function (p_locale, p_locale_length, p_culture, p_culture_length, p_dst, p_dst_max_length, p_dst_length) {
		GodotRuntime.setHeapValue(p_dst_length, -1, 'i32');
		return GodotDotnetInterop.allocErrorString('Locale info requires the .NET JavaScript runtime, which Godot\'s .NET Web export doesn\'t load.');
	},
};

mergeInto(LibraryManager.library, GodotDotnet);
