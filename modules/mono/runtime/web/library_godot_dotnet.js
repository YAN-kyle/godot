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
const GodotDotnet = {
	$DOTNET: {},
	$DOTNET__postset: '',
};

mergeInto(LibraryManager.library, GodotDotnet);
