# Third-party notices

Lens Blur ships the following third-party software in `dist/ort`.

## ONNX Runtime Web 1.31.1

`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs` and
`ort-wasm-simd-threaded.wasm`, from the `onnxruntime-web` package
(https://github.com/microsoft/onnxruntime).

```
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Depth Anything V2 Small (downloaded, not shipped)

The depth model is downloaded at first use from
https://huggingface.co/onnx-community/depth-anything-v2-small (revision
4472b7362082ad9968fee890ca0f1e5aca36b93d, `onnx/model_quantized.onnx`). It is
Depth Anything V2 Small by Lihe Yang, Bingyi Kang, Zilong Huang, Zhen Zhao,
Xiaogang Xu, Jiashi Feng and Hengshuang Zhao
(https://github.com/DepthAnything/Depth-Anything-V2), licensed under the
Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
