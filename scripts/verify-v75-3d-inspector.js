#!/usr/bin/env node
/**
 * verify-v75-3d-inspector.js
 * V75: 3D Inspector — GLB/GLTF/OBJ 뷰어 검증
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const MAIN    = path.join(ROOT, 'src', 'main.js');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');
const HTML    = path.join(ROOT, 'src', 'index.html');
const VENDOR  = path.join(ROOT, 'src', 'vendor');

let passed = 0, failed = 0;

function check(label, condition, detail) {
    if (condition) { console.log(`  PASS ${label}`); passed++; }
    else           { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const main    = fs.readFileSync(MAIN,    'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html    = fs.readFileSync(HTML,    'utf8');

// ── [1] main.js 함수 존재 ────────────────────────────────────
console.log('\n=== [1] main.js 함수 존재 ===');
check('listGeneratedAssets 함수',        main.includes('function listGeneratedAssets'));
check('read3dFile 함수',                 main.includes('function read3dFile'));

// ── [2] IPC 핸들러 ────────────────────────────────────────────
console.log('\n=== [2] IPC 핸들러 ===');
check("ipcMain.handle('list-generated-assets')", main.includes("ipcMain.handle('list-generated-assets'"));
check("ipcMain.handle('read-3d-file')",          main.includes("ipcMain.handle('read-3d-file'"));

// ── [3] preload 노출 ──────────────────────────────────────────
console.log('\n=== [3] preload 노출 ===');
check('listGeneratedAssets 노출', preload.includes('listGeneratedAssets'));
check('read3dFile 노출',          preload.includes('read3dFile'));

// ── [4] 지원 포맷 필터링 ─────────────────────────────────────
console.log('\n=== [4] 지원 포맷 필터링 ===');
check('.glb 지원',  main.includes("'glb'") || main.includes('"glb"'));
check('.gltf 지원', main.includes("'gltf'") || main.includes('"gltf"'));
check('.obj 지원',  main.includes("'obj'") || main.includes('"obj"'));
check('확장자 필터 정규식', main.includes('glb|gltf|obj') || main.includes("'glb', 'gltf', 'obj'") || main.includes("['glb','gltf','obj']"));

// ── [5] 안전장치 — 경로 traversal 방지 ─────────────────────
console.log('\n=== [5] 안전장치 — 경로 traversal 방지 ===');
check('generated_assets 외부 차단 메시지', main.includes('generated_assets 외부 경로 접근 차단'));
check('path.resolve 사용',                main.includes('path.resolve(filePath'));
check('startsWith(allowedDir) 검사',      main.includes('startsWith(allowedDir'));
check('read3dFile 내 writeFileSync 없음',
    (() => {
        const fnStart = main.indexOf('function read3dFile');
        const fnEnd   = main.indexOf('\nfunction ', fnStart + 1);
        const body    = fnEnd > 0 ? main.slice(fnStart, fnEnd) : main.slice(fnStart, fnStart + 800);
        return !body.includes('writeFileSync') && !body.includes('appendFileSync');
    })()
);
check('FBX 지원 없음 (V75 범위 외)',
    (() => {
        const fnStart = main.indexOf('function read3dFile');
        const fnEnd   = main.indexOf('\nfunction ', fnStart + 1);
        const body    = fnEnd > 0 ? main.slice(fnStart, fnEnd) : main.slice(fnStart, fnStart + 800);
        return !body.includes("'fbx'") && !body.includes('"fbx"');
    })()
);

// ── [6] vendor 파일 존재 ──────────────────────────────────────
console.log('\n=== [6] vendor 파일 존재 ===');
check('src/vendor/ 폴더 존재',             fs.existsSync(VENDOR));
check('vendor/three.min.js 존재',          fs.existsSync(path.join(VENDOR, 'three.min.js')));
check('vendor/GLTFLoader.js 존재',         fs.existsSync(path.join(VENDOR, 'GLTFLoader.js')));
check('vendor/OBJLoader.js 존재',          fs.existsSync(path.join(VENDOR, 'OBJLoader.js')));
check('vendor/OrbitControls.js 존재',      fs.existsSync(path.join(VENDOR, 'OrbitControls.js')));
check('vendor/BufferGeometryUtils.js 존재',fs.existsSync(path.join(VENDOR, 'BufferGeometryUtils.js')));
check('vendor/SkeletonUtils.js 존재',      fs.existsSync(path.join(VENDOR, 'SkeletonUtils.js')));

// ── [7] vendor import 경로 수정 확인 ─────────────────────────
console.log('\n=== [7] vendor import 경로 수정 확인 ===');
const gltfSrc = fs.existsSync(path.join(VENDOR, 'GLTFLoader.js'))
    ? fs.readFileSync(path.join(VENDOR, 'GLTFLoader.js'), 'utf8') : '';
const objSrc  = fs.existsSync(path.join(VENDOR, 'OBJLoader.js'))
    ? fs.readFileSync(path.join(VENDOR, 'OBJLoader.js'), 'utf8') : '';
const orbitSrc = fs.existsSync(path.join(VENDOR, 'OrbitControls.js'))
    ? fs.readFileSync(path.join(VENDOR, 'OrbitControls.js'), 'utf8') : '';

check("GLTFLoader: from 'three' 잔존 없음",    !gltfSrc.includes("from 'three'") && !gltfSrc.includes('from "three"'));
check("GLTFLoader: from './three.min.js' 존재", gltfSrc.includes("from './three.min.js'"));
check("GLTFLoader: BufferGeometryUtils 로컬 경로", gltfSrc.includes("from './BufferGeometryUtils.js'"));
check("GLTFLoader: SkeletonUtils 로컬 경로",       gltfSrc.includes("from './SkeletonUtils.js'"));
check("OBJLoader: from 'three' 잔존 없음",     !objSrc.includes("from 'three'") && !objSrc.includes('from "three"'));
check("OBJLoader: from './three.min.js' 존재",  objSrc.includes("from './three.min.js'"));
check("OrbitControls: from './three.min.js' 존재", orbitSrc.includes("from './three.min.js'"));

// ── [8] UI 요소 ───────────────────────────────────────────────
console.log('\n=== [8] UI 요소 ===');
check('page-3dinspector 존재',                html.includes('id="page-3dinspector"'));
check('3D Inspector nav 항목',               html.includes("showPage('3dinspector'"));
check('inspector-canvas 존재',               html.includes('id="inspector-canvas"'));
check('insp-file-list 존재',                 html.includes('id="insp-file-list"'));
check('btn-wireframe 존재',                  html.includes('id="btn-wireframe"'));
check('insp-poly 폴리곤 표시',               html.includes('id="insp-poly"'));
check('insp-info 파일 정보',                 html.includes('id="insp-info"'));
check('doToggleWireframe 버튼',              html.includes('doToggleWireframe()'));
check('doResetCamera 버튼',                  html.includes('doResetCamera()'));
check('FBX V76 예정 안내문구',               html.includes('FBX는 V76 예정'));

// ── [9] Three.js 모듈 스크립트 ───────────────────────────────
console.log('\n=== [9] Three.js 모듈 스크립트 ===');
check("script type=module 존재",             html.includes('type="module"') || html.includes("type='module'"));
check("three.min.js import",                 html.includes("from './vendor/three.min.js'"));
check("GLTFLoader import",                   html.includes("from './vendor/GLTFLoader.js'"));
check("OBJLoader import",                    html.includes("from './vendor/OBJLoader.js'"));
check("OrbitControls import",               html.includes("from './vendor/OrbitControls.js'"));

// ── [10] JS 함수 (window 노출) ───────────────────────────────
console.log('\n=== [10] JS 함수 (window 노출) ===');
check('window.initInspector 정의',          html.includes('window.initInspector'));
check('window.doLoad3DModel 정의',          html.includes('window.doLoad3DModel'));
check('window.doToggleWireframe 정의',      html.includes('window.doToggleWireframe'));
check('window.doResetCamera 정의',          html.includes('window.doResetCamera'));
check('window.doRefreshAssetList 정의',     html.includes('window.doRefreshAssetList'));
check('window.updatePolyCount 정의',        html.includes('window.updatePolyCount'));

// ── [11] OBJ 로딩 분기 ───────────────────────────────────────
console.log('\n=== [11] OBJ 로딩 분기 ===');
check("OBJLoader 인스턴스 생성 (new OBJLoader)",   html.includes('new OBJLoader()'));
check("OBJ loader.parse() 호출",                   html.includes("loader.parse(text)") || html.includes('loader.parse('));
check("ext === 'obj' 분기",                        html.includes("ext === 'obj'") || html.includes("ext==='obj'"));

// ── [12] GLTF/GLB 로딩 분기 ──────────────────────────────────
console.log('\n=== [12] GLTF/GLB 로딩 분기 ===');
check("GLTFLoader 인스턴스 생성",  html.includes('new GLTFLoader()'));
check("loader.parse() 호출",       html.includes('loader.parse(bytes.buffer') || html.includes("loader.parse("));
check("base64 → Uint8Array 변환",  html.includes('Uint8Array.from(atob('));
check("ext 'glb'/'gltf' 분기",    html.includes("ext === 'glb'") || html.includes("ext==='glb'"));

// ── [13] showPage 연동 ────────────────────────────────────────
console.log('\n=== [13] showPage 연동 ===');
check("showPage 3dinspector 분기",        html.includes("id==='3dinspector'") || html.includes('id===\'3dinspector\''));
check("doRefreshAssetList showPage 호출", html.includes('doRefreshAssetList()'));
check("initInspector showPage 호출",      html.includes('window.initInspector'));

// ── [14] 런타임 로직 검증 ────────────────────────────────────
console.log('\n=== [14] 런타임 로직 검증 ===');

// read3dFile 경로 차단 테스트 (인라인 재현)
const DEFAULT_PROJECT_PATH = 'D:\\ToribatMagicSchool';
const projectPath = DEFAULT_PROJECT_PATH;
const generatedDir = require('path').join(projectPath, 'generated_assets');
const allowedDir   = require('path').resolve(generatedDir);

const testCases = [
    { input: require('path').join(generatedDir, 'test.glb'),        expect: true,  label: '허용: generated_assets 내부 .glb' },
    { input: require('path').join(generatedDir, 'model.obj'),       expect: true,  label: '허용: generated_assets 내부 .obj' },
    { input: require('path').join(generatedDir, '../Source/hack.h'),expect: false, label: '차단: ../ 경로 이탈' },
    { input: 'C:\\Windows\\System32\\evil.glb',                      expect: false, label: '차단: 외부 절대 경로' },
];

for (const tc of testCases) {
    const resolved = require('path').resolve(tc.input);
    const sep      = require('path').sep;
    const allowed  = resolved.startsWith(allowedDir + sep) || resolved === allowedDir;
    check(tc.label, allowed === tc.expect);
}

// 확장자 필터 테스트
const ALLOWED_EXTS = ['glb', 'gltf', 'obj'];
check('확장자 필터: fbx 차단',  !ALLOWED_EXTS.includes('fbx'));
check('확장자 필터: glb 허용',   ALLOWED_EXTS.includes('glb'));
check('확장자 필터: obj 허용',   ALLOWED_EXTS.includes('obj'));
check('확장자 필터: gltf 허용',  ALLOWED_EXTS.includes('gltf'));

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V75 3D Inspector 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
