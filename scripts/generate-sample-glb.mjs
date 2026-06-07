/**
 * 간단한 보라색 박스 GLB 파일을 생성합니다.
 * webapp/public/sample.glb 에 저장됩니다.
 * 실행: node scripts/generate-sample-glb.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../webapp/public/sample.glb');

// 박스 메쉬 정의: 6면 × 4꼭짓점 = 24개 정점, 6면 × 2삼각형 × 3인덱스 = 36개 인덱스
const s = 0.5; // 박스 크기 절반

const faces = [
  { n: [1, 0, 0],  v: [[s,-s,-s],[s,s,-s],[s,s,s],[s,-s,s]] },
  { n: [-1, 0, 0], v: [[-s,-s,s],[-s,s,s],[-s,s,-s],[-s,-s,-s]] },
  { n: [0, 1, 0],  v: [[-s,s,-s],[-s,s,s],[s,s,s],[s,s,-s]] },
  { n: [0, -1, 0], v: [[-s,-s,s],[-s,-s,-s],[s,-s,-s],[s,-s,s]] },
  { n: [0, 0, 1],  v: [[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]] },
  { n: [0, 0, -1], v: [[s,-s,-s],[-s,-s,-s],[-s,s,-s],[s,s,-s]] },
];

const positions = [];
const normals = [];
const indices = [];

faces.forEach((face, fi) => {
  const base = fi * 4;
  face.v.forEach(v => { positions.push(...v); });
  for (let i = 0; i < 4; i++) normals.push(...face.n);
  indices.push(base, base+1, base+2, base, base+2, base+3);
});

// 바이너리 버퍼 구성
const posBytes = 24 * 3 * 4;  // 24 vertices × VEC3 × float32
const nrmBytes = 24 * 3 * 4;
const idxBytes = 36 * 2;       // 36 indices × uint16
const pad = (idxBytes % 4 !== 0) ? 4 - (idxBytes % 4) : 0;
const binLength = posBytes + nrmBytes + idxBytes + pad;

const bin = Buffer.alloc(binLength, 0);
let offset = 0;

for (const v of positions) { bin.writeFloatLE(v, offset); offset += 4; }
for (const v of normals)   { bin.writeFloatLE(v, offset); offset += 4; }
for (const v of indices)   { bin.writeUInt16LE(v, offset); offset += 2; }

// GLTF JSON
const gltf = {
  asset: { version: '2.0', generator: 'image-to-3d-webapp' },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [0] }],
  nodes: [{ name: 'Box', mesh: 0 }],
  meshes: [{
    name: 'BoxMesh',
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2,
      material: 0,
    }],
  }],
  materials: [{
    name: 'BoxMaterial',
    pbrMetallicRoughness: {
      baseColorFactor: [0.48, 0.22, 0.78, 1.0],
      metallicFactor: 0.05,
      roughnessFactor: 0.6,
    },
    doubleSided: false,
  }],
  accessors: [
    {
      name: 'positions',
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: 24,
      type: 'VEC3',
      min: [-s, -s, -s],
      max: [s, s, s],
    },
    {
      name: 'normals',
      bufferView: 1,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
    },
    {
      name: 'indices',
      bufferView: 2,
      componentType: 5123, // UNSIGNED_SHORT
      count: 36,
      type: 'SCALAR',
    },
  ],
  bufferViews: [
    { name: 'positions', buffer: 0, byteOffset: 0,                byteLength: posBytes, target: 34962 },
    { name: 'normals',   buffer: 0, byteOffset: posBytes,         byteLength: nrmBytes, target: 34962 },
    { name: 'indices',   buffer: 0, byteOffset: posBytes+nrmBytes, byteLength: idxBytes, target: 34963 },
  ],
  buffers: [{ byteLength: binLength }],
};

const jsonStr = JSON.stringify(gltf);
// JSON을 4바이트 경계에 맞게 공백으로 패딩
const jsonPadLen = Math.ceil(jsonStr.length / 4) * 4;
const jsonBuf = Buffer.alloc(jsonPadLen, 0x20); // 0x20 = space
Buffer.from(jsonStr, 'utf8').copy(jsonBuf);

// BIN 청크도 4바이트 경계로 (이미 위에서 처리)
const totalLen = 12 + 8 + jsonPadLen + 8 + binLength;
const glb = Buffer.alloc(totalLen);
let pos = 0;

// GLB 헤더
glb.writeUInt32LE(0x46546C67, pos); pos += 4; // magic "glTF"
glb.writeUInt32LE(2, pos);          pos += 4; // version 2
glb.writeUInt32LE(totalLen, pos);   pos += 4; // total length

// JSON 청크
glb.writeUInt32LE(jsonPadLen, pos); pos += 4;
glb.writeUInt32LE(0x4E4F534A, pos); pos += 4; // "JSON"
jsonBuf.copy(glb, pos);             pos += jsonPadLen;

// BIN 청크
glb.writeUInt32LE(binLength, pos);  pos += 4;
glb.writeUInt32LE(0x004E4942, pos); pos += 4; // "BIN\0"
bin.copy(glb, pos);

// 저장
mkdirSync(join(__dirname, '../webapp/public'), { recursive: true });
writeFileSync(OUT_PATH, glb);
console.log(`✓ sample.glb 생성 완료: ${OUT_PATH} (${glb.length} bytes)`);
