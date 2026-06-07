const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mainFile = path.join(root, 'src', 'main.js');
const preloadFile = path.join(root, 'src', 'preload.js');
const pkgFile = path.join(root, 'package.json');

function read(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${message}`);
    }
}

const main = read(mainFile);
const preload = read(preloadFile);
const pkg = read(pkgFile);

// ── V51: promoteCandidateToProject ──────────────────────────────────────────
assert(
    main.includes('function promoteCandidateToProject('),
    'promoteCandidateToProject 함수 정의 존재'
);
assert(
    /function promoteCandidateToProject[\s\S]*?backup/i.test(main),
    'promoteCandidateToProject가 백업 단계 포함'
);
assert(
    /function promoteCandidateToProject[\s\S]*?diff/i.test(main),
    'promoteCandidateToProject가 diff 생성 단계 포함'
);
assert(
    /function promoteCandidateToProject[\s\S]*?allowRealApply/.test(main),
    'promoteCandidateToProject가 allowRealApply 승인 게이트 포함 — 자동 적용 금지'
);
assert(
    main.includes('function getAppliedLogDir(') && /promoteCandidateToProject[\s\S]*?getAppliedLogDir/.test(main),
    'promoteCandidateToProject가 getAppliedLogDir를 통해 apply_queue/applied/ 에 기록'
);
assert(
    main.includes("ipcMain.handle('promote-candidate-to-project'"),
    'IPC 핸들러 등록: promote-candidate-to-project'
);
assert(
    preload.includes('promoteCandidateToProject'),
    'preload.js에 promoteCandidateToProject 노출'
);

// ── V52: generateImplementationTrace ────────────────────────────────────────
assert(
    main.includes('function generateImplementationTrace('),
    'generateImplementationTrace 함수 정의 존재'
);
assert(
    /function generateImplementationTrace[\s\S]*?sourceCount/.test(main),
    'generateImplementationTrace가 Source 반영 카운터 포함'
);
assert(
    /function generateImplementationTrace[\s\S]*?contentCount/.test(main),
    'generateImplementationTrace가 Content 반영 카운터 포함'
);
assert(
    /function generateImplementationTrace[\s\S]*?unreflectedItems/.test(main),
    'generateImplementationTrace가 미반영 항목 목록 반환'
);
assert(
    main.includes('function getImplementationTraceFile('),
    'getImplementationTraceFile 경로 헬퍼 존재'
);
assert(
    main.includes("ipcMain.handle('generate-implementation-trace'"),
    'IPC 핸들러 등록: generate-implementation-trace'
);
assert(
    preload.includes('generateImplementationTrace'),
    'preload.js에 generateImplementationTrace 노출'
);

// ── V53: getActualOnlyProgress ───────────────────────────────────────────────
assert(
    main.includes('function getActualOnlyProgress('),
    'getActualOnlyProgress 함수 정의 존재'
);
assert(
    /function getActualOnlyProgress[\s\S]*?>=\s*3/.test(main),
    'getActualOnlyProgress가 >= 3 조건으로 상태3/4 항목만 집계'
);
assert(
    main.includes("ipcMain.handle('get-actual-only-progress'"),
    'IPC 핸들러 등록: get-actual-only-progress'
);
assert(
    preload.includes('getActualOnlyProgress'),
    'preload.js에 getActualOnlyProgress 노출'
);

// ── V54: generateProjectInventory ────────────────────────────────────────────
assert(
    main.includes('function generateProjectInventory('),
    'generateProjectInventory 함수 정의 존재'
);
assert(
    main.includes('const PROJECT_SYSTEMS = ['),
    'PROJECT_SYSTEMS 배열 존재'
);
assert(
    /PROJECT_SYSTEMS[\s\S]*?magic[\s\S]*?quest[\s\S]*?save/i.test(main),
    'PROJECT_SYSTEMS에 magic/quest/save 시스템 포함'
);
assert(
    /function generateProjectInventory[\s\S]*?implementedCount/.test(main),
    'generateProjectInventory가 implementedCount 반환'
);
assert(
    /function generateProjectInventory[\s\S]*?candidateOnlyCount/.test(main),
    'generateProjectInventory가 candidateOnlyCount 반환'
);
assert(
    /function generateProjectInventory[\s\S]*?missingCount/.test(main),
    'generateProjectInventory가 missingCount 반환'
);
assert(
    main.includes('function getProjectInventoryFile('),
    'getProjectInventoryFile 경로 헬퍼 존재'
);
assert(
    main.includes("ipcMain.handle('generate-project-inventory'"),
    'IPC 핸들러 등록: generate-project-inventory'
);
assert(
    preload.includes('generateProjectInventory'),
    'preload.js에 generateProjectInventory 노출'
);

// ── V54: PM 개선 규칙 ────────────────────────────────────────────────────────
assert(
    main.includes("id: 'promote_candidate_to_source'"),
    "recommendationRules에 promote_candidate_to_source 규칙 포함"
);
assert(
    main.includes("id: 'project_inventory_missing'"),
    "recommendationRules에 project_inventory_missing 규칙 포함"
);
assert(
    main.includes("id: 'candidate_only_promote'"),
    "recommendationRules에 candidate_only_promote 규칙 포함"
);

// ── 자동 적용 금지 원칙 유지 ─────────────────────────────────────────────────
assert(
    /allowRealApply/.test(main),
    '자동 적용 금지: allowRealApply 게이트가 main.js에 존재'
);
assert(
    !main.includes('safeWriteFile(targetAbsPath') || main.includes('allowRealApply'),
    '후보 파일 실제 적용은 반드시 allowRealApply 게이트를 통과해야 함'
);

// ── 기존 Apply Queue 구조 유지 ───────────────────────────────────────────────
assert(
    main.includes('function getApplyQueueDir(') && main.includes('function getAppliedLogDir('),
    'getApplyQueueDir / getAppliedLogDir 헬퍼 함수 유지'
);
assert(
    /apply_queue[\s\S]*?applied/.test(main),
    'apply_queue/applied/ 경로가 main.js에 존재'
);

// ── package.json ─────────────────────────────────────────────────────────────
assert(
    pkg.includes('verify-v51-v54.js') && pkg.includes('verify:v51-v54'),
    'package.json에 verify:v51-v54 스크립트 등록'
);
assert(
    pkg.includes('verify-v51-v54.js') && pkg.includes('"verify"'),
    'package.json verify 체인에 verify-v51-v54.js 포함'
);

// ── 기존 verify 체인 전체 통과 ───────────────────────────────────────────────
console.log('\n── 기존 verify 체인 실행 ──');
try {
    execSync('node scripts/verify-v19-v21.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v22-v24.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v25-v27.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v28-v30.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v31-v34.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v35-v38.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v39-v42.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v43-v46.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v47.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-v48-v50.js', { cwd: root, stdio: 'inherit' });
    execSync('node scripts/verify-pre-v48.js', { cwd: root, stdio: 'inherit' });
    console.log('PASS: 기존 verify 체인 전체 통과');
} catch (e) {
    console.error('FAIL: 기존 verify 체인 실패');
    process.exitCode = 1;
}

if (process.exitCode) {
    console.error('\nV51~V54 검증 실패');
    process.exit(process.exitCode);
}

console.log('\nV51~V54 검증 완료');
