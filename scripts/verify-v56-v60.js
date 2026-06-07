const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mainFile = path.join(root, 'src', 'main.js');
const preloadFile = path.join(root, 'src', 'preload.js');
const htmlFile = path.join(root, 'src', 'index.html');
const pkgFile = path.join(root, 'package.json');

function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
function assert(condition, message) {
    if (!condition) { console.error(`FAIL: ${message}`); process.exitCode = 1; }
    else { console.log(`PASS: ${message}`); }
}

const main = read(mainFile);
const preload = read(preloadFile);
const html = read(htmlFile);
const pkg = read(pkgFile);

// ── V56: targetPath 파싱 함수 ────────────────────────────────────────────────
assert(
    main.includes('function parseTargetPath('),
    'parseTargetPath 공통 파서 함수 존재'
);
assert(
    /parseTargetPath[\s\S]*?대상 경로/.test(main),
    'parseTargetPath가 "대상 경로" 표기 지원'
);
assert(
    /parseTargetPath[\s\S]*?추천 적용 위치/.test(main),
    'parseTargetPath가 "추천 적용 위치" 표기 지원'
);
assert(
    /parseTargetPath[\s\S]*?Target Path/.test(main),
    'parseTargetPath가 "Target Path" 표기 지원'
);
assert(
    /parseTargetPath[\s\S]*?targetPath/.test(main),
    'parseTargetPath가 "targetPath" 표기 지원'
);
assert(
    /parseTargetPath[\s\S]*?적용 위치/.test(main),
    'parseTargetPath가 "적용 위치" 표기 지원'
);
assert(
    main.includes('parseTargetPath(content)') || main.includes('parseTargetPath(candidateContent)'),
    'promoteCandidateToProject / registerApplyCandidateToQueue에서 parseTargetPath 사용'
);

// ── V56: apply 파일에 targetPath 포함 ────────────────────────────────────────
assert(
    main.includes('- 대상 경로: ${targetRel}') || main.includes("'- 대상 경로: '"),
    'registerApplyCandidateToQueue가 apply 파일에 "대상 경로:" 기록'
);
assert(
    main.includes('- 추천 적용 위치: ${targetRel}') || /registerApplyCandidateToQueue[\s\S]*?추천 적용 위치/.test(main),
    'registerApplyCandidateToQueue가 apply 파일에 "추천 적용 위치:" 기록'
);

// ── V56: getApplyQueueSummary에서 parseTargetPath 사용 ───────────────────────
assert(
    /function getApplyQueueSummary[\s\S]*?parseTargetPath/.test(main),
    'getApplyQueueSummary가 parseTargetPath로 target 파싱'
);
assert(
    /function getApplyQueueSummary[\s\S]*?targetPath/.test(main),
    'getApplyQueueSummary가 targetPath 필드 반환'
);

// ── V56: UI에 targetPath 표시 ────────────────────────────────────────────────
assert(
    html.includes('targetPath') && html.includes('추천 적용 위치'),
    '적용 큐 UI에 targetPath / 추천 적용 위치 표시'
);
assert(
    html.includes('경로 정보 없음') || html.includes('targetPath||row.target'),
    '적용 큐 UI에서 targetPath 비어있을 때 경고 표시'
);

// ── V57: 승인/거절 이동 ─────────────────────────────────────────────────────
assert(
    /function moveApplyQueueItem[\s\S]*?timestamp/.test(main),
    'moveApplyQueueItem이 이동 타임스탬프 기록'
);
assert(
    /function moveApplyQueueItem[\s\S]*?allowRealApply/.test(main),
    'moveApplyQueueItem이 allowRealApply 상태 기록'
);
assert(
    main.includes("ipcMain.handle('approve-apply-queue'"),
    'IPC 핸들러 등록: approve-apply-queue'
);
assert(
    main.includes("ipcMain.handle('reject-apply-queue'"),
    'IPC 핸들러 등록: reject-apply-queue'
);
assert(
    preload.includes('approveApplyQueue') && preload.includes("ipcRenderer.invoke('approve-apply-queue'"),
    'preload.js에 approveApplyQueue 노출'
);
assert(
    preload.includes('rejectApplyQueue') && preload.includes("ipcRenderer.invoke('reject-apply-queue'"),
    'preload.js에 rejectApplyQueue 노출'
);

// ── V57: 승인/거절 상태 표시 ─────────────────────────────────────────────────
assert(
    html.includes("row.status==='approved'") || html.includes("status==='approved'"),
    '적용 큐 UI에 approved 상태 표시'
);
assert(
    html.includes("status-fail") && html.includes("status==='rejected'"),
    '적용 큐 UI에 rejected 상태 표시'
);

// ── V58: allowRealApply=false 기본값 안전성 ───────────────────────────────────
assert(
    /function promoteCandidateToProject[\s\S]*?allowRealApply === true/.test(main),
    'promoteCandidateToProject가 allowRealApply=true 조건에서만 실제 파일 쓰기'
);
assert(
    /const applied = cfg\.allowRealApply === true/.test(main),
    'applied = cfg.allowRealApply === true — false면 dry-run만'
);
assert(
    !main.includes('allowRealApply = true') && !main.includes("allowRealApply: true, //default"),
    '기본값 allowRealApply=true 자동 설정 없음'
);

// ── V58: .h + .cpp 분리 생성 지원 ───────────────────────────────────────────
assert(
    /hasCppBlock|\.h.*\.cpp|cppTargetRel/.test(main),
    'promoteCandidateToProject가 .h / .cpp 분리 생성 지원'
);
assert(
    /safeWriteFile\(targetAbs/.test(main),
    '실제 파일 쓰기에 safeWriteFile 사용'
);

// ── V58: 백업 생성 ────────────────────────────────────────────────────────────
assert(
    /function promoteCandidateToProject[\s\S]*?backupDir/.test(main),
    'promoteCandidateToProject가 기존 파일 백업 디렉터리 생성'
);
assert(
    /function promoteCandidateToProject[\s\S]*?\.bak/.test(main),
    'promoteCandidateToProject가 .bak 확장자로 백업 파일 생성'
);

// ── V59: 적용 후 보고서 자동 갱신 ────────────────────────────────────────────
assert(
    /if \(applied\)[\s\S]*?generateImplementationTrace/.test(main),
    '실제 적용 후 generateImplementationTrace 갱신 호출'
);
assert(
    /if \(applied\)[\s\S]*?generateProjectInventory/.test(main),
    '실제 적용 후 generateProjectInventory 갱신 호출'
);
assert(
    /if \(applied\)[\s\S]*?generatePmValidation/.test(main),
    '실제 적용 후 generatePmValidation 갱신 호출'
);

// ── V60: PM 검증 화면 단계 구분 ──────────────────────────────────────────────
assert(
    /enrichedStatuses/.test(main),
    'generatePmValidation이 enrichedStatuses로 큐/후보 단계 결합'
);
assert(
    main.includes('stageLabel') && main.includes('queueStatus') && main.includes('hasCandidate'),
    'enrichedStatuses에 stageLabel / queueStatus / hasCandidate 필드 포함'
);
assert(
    main.includes('적용 큐 대기') && main.includes('적용 큐 승인됨') && main.includes('후보 있음'),
    'stageLabel 값에 큐 단계 표현 포함'
);
assert(
    html.includes('stageLabel') && html.includes('queueStatus'),
    'PM 검증 UI 테이블에 stageLabel / queueStatus 컬럼 표시'
);
assert(
    html.includes('구현 단계') && html.includes('큐 상태') && html.includes('후보'),
    'PM 검증 UI 테이블 헤더에 구현 단계 / 큐 상태 / 후보 열 존재'
);
assert(
    main.includes('문서만 있음') && main.includes('실제 프로젝트 반영') && main.includes('검수/실행 통과'),
    'stageLabel이 5단계 구현 흐름 표현'
);

// ── 상태4 조건 완화 금지 ──────────────────────────────────────────────────────
assert(
    main.includes('const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;'),
    '상태4 조건 완화 없음 — 4개 조건 AND 유지'
);

// ── package.json ─────────────────────────────────────────────────────────────
assert(
    pkg.includes('verify-v56-v60.js') && pkg.includes('verify:v56-v60'),
    'package.json에 verify:v56-v60 스크립트 등록'
);
assert(
    pkg.includes('verify-v56-v60.js') && pkg.includes('"verify"'),
    'package.json verify 체인에 verify-v56-v60.js 포함'
);

// ── 기존 verify 체인 전체 통과 ───────────────────────────────────────────────
console.log('\n── 기존 verify 체인 실행 ──');
try {
    execSync('node scripts/verify-v55.js', { cwd: root, stdio: 'inherit' });
    console.log('PASS: 기존 verify 체인 전체 통과');
} catch (e) {
    console.error('FAIL: 기존 verify 체인 실패');
    process.exitCode = 1;
}

if (process.exitCode) {
    console.error('\nV56~V60 검증 실패');
    process.exit(process.exitCode);
}

console.log('\nV56~V60 검증 완료');
