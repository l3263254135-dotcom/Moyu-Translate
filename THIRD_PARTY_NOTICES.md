# Third-Party Notices

## ECDICT

- Project: ECDICT - Free English to Chinese Dictionary Database
- Source: https://github.com/skywind3000/ECDICT
- Pinned commit: `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- Bundled derived data: structured Dictionary v2 SQLite generated from the pinned full CSV and project corrections
- License: MIT

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## WordNet 3.1

- Project: Princeton WordNet
- Source: https://wordnet.princeton.edu/
- Use in Moyu: open English definitions, examples and lexical relations used during Dictionary v2 generation
- License: Princeton WordNet License

WordNet is provided without warranty. The full license distributed by Princeton University applies to the derived data used by this project.

## CMU Pronouncing Dictionary

- Project: CMUdict
- Source: https://github.com/cmusphinx/cmudict
- Pinned commit: `74790861f652b15e4ac49015a90074ad62a27690`
- Use in Moyu: US pronunciation data converted from ARPABET during Dictionary v2 generation
- License: BSD-style CMUdict license

## Transformers.js and ONNX Runtime Web

- Transformers.js: https://github.com/huggingface/transformers.js (Apache-2.0)
- ONNX Runtime: https://github.com/microsoft/onnxruntime (MIT)
- Use in Moyu: local q8 translation inference inside a Web Worker

Translation model files are downloaded on first use and are not committed to this repository. The model card and license shown by the selected upstream model repository apply to downloaded model assets. The pinned upstream model licenses and notices must be reviewed again before Beta is promoted to stable.

Pinned model revisions used by `v0.2.0-beta.1`:

- `Xenova/opus-mt-en-zh@046f55aec303cdee3e0318604406d4df20f1e8ea`
- `Xenova/opus-mt-zh-en@39d480d52a9ea3065a1f117adfe4dbc55de10e6f`

Moyu downloads only the runtime config, tokenizer and q8 ONNX files listed in `apps/desktop/src/services/modelManifest.ts`. Each file is accepted into the offline cache only after its pinned byte count and SHA-256 match.
