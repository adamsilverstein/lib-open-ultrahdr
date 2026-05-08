# Open UltraHDR WASM

WebAssembly module for UltraHDR (ISO 21496-1) gain map encoding/decoding,
built from upstream [`google/libultrahdr`](https://github.com/google/libultrahdr)
via Emscripten/embind.

This is the low-level WASM package. For most use cases, use the `open-ultrahdr`
package instead, which provides a higher-level TypeScript API.

## Building

Requires Emscripten SDK (`emcc`, `emcmake`) and CMake 3.20+:

```bash
source /path/to/emsdk/emsdk_env.sh
npm run build
```

The build vendors libultrahdr from the `third_party/libultrahdr` submodule and
links Emscripten's `libjpeg` port (no `UHDR_BUILD_DEPS` path).

## License

Dual-licensed under `Apache-2.0 OR MIT`. See the project root [LICENSE](../LICENSE) for details.
