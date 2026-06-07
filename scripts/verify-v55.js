const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mainFile = path.join(root, 'src', 'main.js');
const preloadFile = path.join(root, 'src', 'preload.js');
const htmlFile = path.join(root, 'src', 'index.html');
const pkgFile = path.join(root, 'package.json');

function read(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function assert(condition, message) {
    if (!condition) { console.error(`FAIL: ${message}`); process.exitCode = 1; }
    else { console.log(`PASS: ${message}`); }
}

const main = read(mainFile);
const preload = read(preloadFile);
const html = read(htmlFile);
const pkg = read(pkgFile);

// ── UI: 코드 후보 생성 버튼 ──────────────────────────────────────────────────
assert(
    html.includes("generateAllCodeCandidates()"),
    'index.html에 전체 후보 생성 버튼(generateAllCodeCandidates) 존재'
);
assert(
    html.includes("generateCodeCandidate('magic_component')"),
    'index.html에 Magic Component 후보 생성 버튼 존재'
);
assert(
    html.includes("generateCodeCandidate('quest_state_manager')"),
    'index.html에 Quest Manager 후보 생성 버튼 존재'
);
assert(
    html.includes("generateCodeCandidate('save_game')"),
    'index.html에 Save Game 후보 생성 버튼 존재'
);
assert(
    html.includes("generateCodeCandidate('dialogue_component')"),
    'index.html에 Dialogue Component 후보 생성 버튼 존재'
);
assert(
    html.includes("generateCodeCandidate('basic_enemy_ai')"),
    'index.html에 Basic Enemy AI 후보 생성 버튼 존재'
);

// ── UI: 후보 생성 함수 정의 ──────────────────────────────────────────────────
assert(
    html.includes('async function generateCodeCandidate(templateId)'),
    'index.html에 generateCodeCandidate JS 함수 정의'
);
assert(
    html.includes('async function generateAllCodeCandidates()'),
    'index.html에 generateAllCodeCandidates JS 함수 정의'
);

// ── UI: 후보 생성 후 loadApplyCandidates 새로고침 ───────────────────────────
assert(
    /async function generateCodeCandidate[\s\S]*?loadApplyCandidates/.test(html),
    'generateCodeCandidate 완료 후 loadApplyCandidates() 새로고침 호출'
);
assert(
    /async function generateAllCodeCandidates[\s\S]*?loadApplyCandidates/.test(html),
    'generateAllCodeCandidates 완료 후 loadApplyCandidates() 새로고침 호출'
);

// ── UI: 상태 표시 영역 ───────────────────────────────────────────────────────
assert(
    html.includes('code-candidate-status'),
    'index.html에 code-candidate-status 상태 표시 영역 존재'
);

// ── UI: 후보 목록 표시 항목 ──────────────────────────────────────────────────
assert(
    html.includes('targetPath') || html.includes('추천 적용 위치'),
    'loadApplyCandidates에 추천 적용 위치 표시'
);
assert(
    html.includes('dryRunOk') || html.includes('dry-run'),
    'loadApplyCandidates에 dry-run 가능 여부 표시'
);
assert(
    html.includes('toLocaleString') || html.includes('mtime'),
    'loadApplyCandidates에 생성일 표시'
);

// ── preload API ──────────────────────────────────────────────────────────────
assert(
    preload.includes('generateCodeCandidate') && preload.includes("ipcRenderer.invoke('generate-code-candidate'"),
    "preload.js에 generateCodeCandidate API 존재"
);
assert(
    preload.includes('generateCodeCandidates') && preload.includes("ipcRenderer.invoke('generate-code-candidates'"),
    "preload.js에 generateCodeCandidates API 존재"
);
assert(
    preload.includes('listCodeTemplates') && preload.includes("ipcRenderer.invoke('list-code-templates'"),
    "preload.js에 listCodeTemplates API 존재"
);

// ── main.js IPC 핸들러 ───────────────────────────────────────────────────────
assert(
    main.includes("ipcMain.handle('generate-code-candidate'"),
    "main.js IPC 핸들러: generate-code-candidate"
);
assert(
    main.includes("ipcMain.handle('generate-code-candidates'"),
    "main.js IPC 핸들러: generate-code-candidates"
);
assert(
    main.includes("ipcMain.handle('list-code-templates'"),
    "main.js IPC 핸들러: list-code-templates"
);

// ── apply_candidates/code 후보 파일 생성 가능 ────────────────────────────────
assert(
    main.includes('function generateCodeApplyCandidate(') && main.includes('function generateAllCodeCandidates('),
    'main.js에 generateCodeApplyCandidate / generateAllCodeCandidates 함수 존재'
);
assert(
    main.includes("apply_candidates/code") || main.includes("template.category"),
    'apply_candidates/code 폴더 아래 후보 파일 생성'
);
assert(
    main.includes('대상 경로:') && main.includes('targetPath'),
    '후보 파일에 대상 경로(targetPath) 포함'
);
assert(
    main.includes('상태2 — 적용 후보'),
    '후보 파일에 상태2 표시 (자동 적용 금지 — 후보 생성까지만)'
);

// ── getApplyCandidateSummary 확장 ───────────────────────────────────────────
assert(
    main.includes('targetPath') && main.includes('dryRunOk'),
    'getApplyCandidateSummary가 targetPath / dryRunOk 필드 반환'
);

// ── 자동 적용 금지 원칙 유지 ────────────────────────────────────────────────
assert(
    !html.includes('allowRealApply=true') && !html.includes("allowRealApply: true"),
    'UI에서 allowRealApply=true 자동 적용 없음'
);

// ── package.json ─────────────────────────────────────────────────────────────
assert(
    pkg.includes('verify-v55.js') && pkg.includes('verify:v55'),
    'package.json에 verify:v55 스크립트 등록'
);
assert(
    pkg.includes('verify-v55.js') && pkg.includes('"verify"'),
    'package.json verify 체인에 verify-v55.js 포함'
);

// ── 기존 verify 체인 전체 통과 ───────────────────────────────────────────────
console.log('\n── 기존 verify 체인 실행 ──');
try {
    execSync('node scripts/verify-v51-v54.js', { cwd: root, stdio: 'inherit' });
    console.log('PASS: 기존 verify 체인 전체 통과');
} catch (e) {
    console.error('FAIL: 기존 verify 체인 실패');
    process.exitCode = 1;
}

if (process.exitCode) {
    console.error('\nV55 검증 실패');
    process.exit(process.exitCode);
}

console.log('\nV55 검증 완료');
