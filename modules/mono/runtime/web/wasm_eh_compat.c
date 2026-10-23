/**************************************************************************/
/*  wasm_eh_compat.c                                                      */
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

// Compatibility shim for linking the prebuilt .NET Mono WebAssembly runtime
// with a newer Emscripten than the one it was built with.
//
// Objects compiled with `-fwasm-exceptions` by older LLVM versions (such as the
// Emscripten 3.1.56 used to build the .NET 10 browser-wasm runtime pack, e.g.
// `libmono-wasm-eh-wasm.a`) call `_Unwind_CallPersonality` from their catch
// blocks. Newer LLVM renamed that entry point to `__gxx_wasm_personality_v0`
// (now provided by libc++abi) and libunwind no longer defines the old name, so
// the link fails with an undefined symbol.
//
// Both functions take the thrown exception object, reset the landing pad
// selector and run the personality routine's search phase, so forwarding is
// enough. The landing pad context written by the old objects
// (`__wasm_lpad_context`) is still the object returned by
// `_Unwind_GetWasmLPadContext()` in builds without threads.

#include <emscripten/version.h>

#if defined(__WASM_EXCEPTIONS__) && __EMSCRIPTEN_MAJOR__ >= 5

#include <unwind.h>

_Unwind_Reason_Code __gxx_wasm_personality_v0(void *exception_ptr);

_Unwind_Reason_Code _Unwind_CallPersonality(void *exception_ptr) {
	return __gxx_wasm_personality_v0(exception_ptr);
}

#endif
