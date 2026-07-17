import type { ModelDirection } from "./localTranslation";

export interface VerifiedModelFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface VerifiedModelManifest {
  id: string;
  repository: string;
  revision: string;
  files: VerifiedModelFile[];
}

export const verifiedModelManifests: Record<ModelDirection, VerifiedModelManifest> = {
  "en-zh": {
    id: "moyu-en-zh-q8-v1",
    repository: "Xenova/opus-mt-en-zh",
    revision: "046f55aec303cdee3e0318604406d4df20f1e8ea",
    files: [
      { path: "config.json", bytes: 1503, sha256: "4727d1229a04f95bf6f39abf949d8080615433d99d6ebd85f81c09edd247d5fa" },
      { path: "generation_config.json", bytes: 293, sha256: "b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803" },
      { path: "tokenizer.json", bytes: 6380952, sha256: "d0c7da27056e8f42adce9e76d8e792e5daa64e15f5acd2e7aabf0121877dd4c1" },
      { path: "tokenizer_config.json", bytes: 282, sha256: "a914596e6bff113a8428d4793b586da87cd0b95697a0e72aba90cc1d95858481" },
      { path: "onnx/encoder_model_quantized.onnx", bytes: 52899742, sha256: "d3b7912bf6a9bd27e4c074c2df91d4ff3d5b4bc5f7f6c8d7cc9c805c98fbafee" },
      { path: "onnx/decoder_model_merged_quantized.onnx", bytes: 60212804, sha256: "023be4f841f4c47cd65fffcbaa81c0d99d7f7e0138f7ba0e03fa220a4e688aff" },
    ],
  },
  "zh-en": {
    id: "moyu-zh-en-q8-v1",
    repository: "Xenova/opus-mt-zh-en",
    revision: "39d480d52a9ea3065a1f117adfe4dbc55de10e6f",
    files: [
      { path: "config.json", bytes: 1389, sha256: "293d318fce41dbf04114eac45037bb88a32d7c4ee21011a75e24a8b98ca45ad1" },
      { path: "generation_config.json", bytes: 293, sha256: "8dc29fef0fe82109f94ef3c2e6ea6bded3215d357b226c34cf7b4630726766c9" },
      { path: "tokenizer.json", bytes: 6381339, sha256: "b306d0301cf280bfd647d7067b5ade2a97b987e6d678df110703c002433643ff" },
      { path: "tokenizer_config.json", bytes: 282, sha256: "08849acc0a539c4749d8665e9d6217735503a97871ccebeea8a762d5fba1acf7" },
      { path: "onnx/encoder_model_quantized.onnx", bytes: 52899742, sha256: "84d5e171b626bc8b6b220d022ac58696e9528c25deeacca62b5cbf4364547a99" },
      { path: "onnx/decoder_model_merged_quantized.onnx", bytes: 60212804, sha256: "c6b7f04ff1ba0fbd1bf6852599b4c0cad6fe512d57cd887f44ef36cf705424cb" },
    ],
  },
};

export function modelTotalBytes(direction: ModelDirection) {
  return verifiedModelManifests[direction].files.reduce((total, file) => total + file.bytes, 0);
}
