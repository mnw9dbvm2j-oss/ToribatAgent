const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mainFile = path.join(root, 'src', 'main.js');
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
const pkg = read(pkgFile);

// ── 1. validateState4Eligibility 단일 함수 존재 ──────────────────────────────
assert(
    main.includes('function validateState4Eligibility(evidence)'),
    'validateState4Eligibility 함수 정의 존재'
);
assert(
    main.includes('const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;'),
    'validateState4Eligibility가 4개 조건 AND로 판정'
);

// ── 2. state4Eligible 계산이 validateState4Eligibility를 통해서만 이루어짐 ──
//   (V43-V46/V48-V50가 ue.hasUProject 형태 요구 → validateState4Eligibility 내부에 존재)
assert(
    !main.includes('const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;\n    const passed = state4Eligible;\n    const level'),
    'getImplementationEvidence 본문에 직접 state4 계산식이 없음 (validateState4Eligibility로 이동됨)'
);
assert(
    (main.match(/validateState4Eligibility/g) || []).length >= 2,
    'validateState4Eligibility가 정의 외에 호출부에서도 사용됨'
);

// ── 3. 상태4 조건 4개 모두 없으면 false ──────────────────────────────────────
assert(
    main.includes('function validateState4Eligibility(') &&
    /function validateState4Eligibility[\s\S]{1,400}hasUProject/.test(main) &&
    /function validateState4Eligibility[\s\S]{1,400}actualImplementation/.test(main) &&
    /function validateState4Eligibility[\s\S]{1,400}reviewerPass/.test(main) &&
    /function validateState4Eligibility[\s\S]{1,400}qaPass/.test(main),
    'validateState4Eligibility 함수 본문에 4개 조건 모두 포함'
);

// ── 4. collectImplementationEvidence / classifyImplementationState 분리 ───────
assert(
    main.includes('function collectImplementationEvidence('),
    'collectImplementationEvidence 함수 존재'
);
assert(
    main.includes('function classifyImplementationState('),
    'classifyImplementationState 함수 존재'
);
assert(
    main.includes('function getImplementationEvidence('),
    'getImplementationEvidence wrapper 함수 유지'
);
assert(
    /function getImplementationEvidence[\s\S]*?collectImplementationEvidence/.test(main),
    'getImplementationEvidence가 collectImplementationEvidence를 호출'
);
assert(
    /function getImplementationEvidence[\s\S]*?classifyImplementationState/.test(main),
    'getImplementationEvidence가 classifyImplementationState를 호출'
);

// ── 5. callLocalAI 타임아웃 ───────────────────────────────────────────────────
assert(
    /async function callLocalAI[\s\S]*?timeoutMs\s*=\s*120000/.test(main),
    'callLocalAI 기본 타임아웃 120000ms 설정'
);
assert(
    /async function callLocalAI[\s\S]*?Promise\.race/.test(main),
    'callLocalAI Promise.race로 타임아웃 적용'
);
assert(
    /async function callLocalAI[\s\S]*?시간 초과/.test(main),
    'callLocalAI 타임아웃 시 "시간 초과" 로그 출력'
);

// ── 6. callChatGPT 타임아웃 ───────────────────────────────────────────────────
assert(
    /async function callChatGPT[\s\S]*?timeoutMs\s*=\s*120000/.test(main),
    'callChatGPT 기본 타임아웃 120000ms 설정'
);
assert(
    /async function callChatGPT[\s\S]*?Promise\.race/.test(main),
    'callChatGPT Promise.race로 타임아웃 적용'
);
assert(
    /async function callChatGPT[\s\S]*?시간 초과/.test(main),
    'callChatGPT 타임아웃 시 "시간 초과" 로그 출력'
);

// ── 7. safeWriteFile 존재 및 원자적 쓰기 구현 ────────────────────────────────
assert(
    main.includes('function safeWriteFile(filePath, content)'),
    'safeWriteFile 함수 존재'
);
assert(
    main.includes('.tmp') && main.includes('fs.renameSync'),
    'safeWriteFile가 .tmp 파일 + rename으로 원자적 쓰기 구현'
);

// ── 8. 핵심 파일 쓰기가 safeWriteFile 사용 ───────────────────────────────────
assert(
    main.includes('safeWriteFile(getGameStateFile('),
    'game_state.md 쓰기에 safeWriteFile 사용'
);
assert(
    main.includes('safeWriteFile(getVerticalSliceStatusFile('),
    'vertical_slice_status.md 쓰기에 safeWriteFile 사용'
);
assert(
    main.includes('safeWriteFile(getCommandCenterFile('),
    'command_center.md 쓰기에 safeWriteFile 사용'
);
assert(
    main.includes('safeWriteFile(getPmValidationFile('),
    'pm_validation.md 쓰기에 safeWriteFile 사용'
);
assert(
    main.includes('safeWriteFile(getStateAuditFile('),
    'state_audit.md 쓰기에 safeWriteFile 사용'
);
assert(
    main.includes('safeWriteFile(getTodoFile('),
    'todo.md 쓰기에 safeWriteFile 사용'
);

// ── 9. buildCommandRecommendations가 recommendationRules 기반 ─────────────────
assert(
    main.includes('const recommendationRules = ['),
    'recommendationRules 배열 선언 존재'
);
assert(
    /recommendationRules\s*=\s*\[[\s\S]*?\{[\s\S]*?id:[\s\S]*?condition:/.test(main),
    'recommendationRules 각 항목에 id, condition 필드 포함'
);
assert(
    /for \(const rule of recommendationRules\)/.test(main),
    'buildCommandRecommendations가 recommendationRules를 for-of로 순회'
);
assert(
    !/if \(\(verticalByKey\.start_area/.test(main),
    '기존 if/else 하드코딩 체인이 제거됨'
);

// ── 10. 금지 추천 문자열 차단 유지 ───────────────────────────────────────────
assert(
    main.includes('검토\\s*\\d+') && main.includes('수직 슬라이스 범위 유지 검토'),
    '반복형 금지 추천 패턴 유지'
);

// ── 11. package.json verify:pre-v48 등록 ─────────────────────────────────────
assert(
    pkg.includes('verify-pre-v48.js') && pkg.includes('verify:pre-v48'),
    'package.json에 verify:pre-v48 스크립트 등록'
);
assert(
    pkg.includes('verify-pre-v48.js') && pkg.includes('"verify"'),
    'package.json verify 체인에 verify-pre-v48.js 포함'
);

// ── 12. V48-V50 신규 기능 검증 ───────────────────────────────────────────────

// countPassEvidence 중복 제거
assert(
    main.includes('function countPassEvidence(') && main.includes('seenReviewer') && main.includes('seenQa'),
    'countPassEvidence가 Set 기반 중복 제거 구현'
);
assert(
    !main.includes("qaPass += (reportCorpus.match"),
    'countPassEvidence에서 corpus 전체 단순 합산 제거됨'
);

// 플레이/빌드 로그 근거
assert(
    main.includes('buildLogPass') && main.includes('playLogPass'),
    'collectImplementationEvidence가 buildLogPass / playLogPass 스캔'
);
assert(
    main.includes('Build Succeeded') && main.includes('PIE:'),
    '빌드 성공 로그 및 PIE 로그 패턴 존재'
);
assert(
    main.includes("evidenceList.push('빌드 성공 로그')") && main.includes("evidenceList.push('PIE 플레이 로그')"),
    'classifyImplementationState evidence 목록에 로그 근거 표시'
);

// 코드/블루프린트 생성 인프라
assert(
    main.includes('const SCHOOL_CODE_TEMPLATES = ['),
    'SCHOOL_CODE_TEMPLATES 배열 존재'
);
assert(
    main.includes('function generateCodeApplyCandidate(') && main.includes('function generateAllCodeCandidates('),
    '코드 적용 후보 생성 함수 존재'
);
assert(
    main.includes('magic_component') && main.includes('quest_state_manager') && main.includes('basic_enemy_ai'),
    'SCHOOL_CODE_TEMPLATES에 Magic/Quest/Enemy 템플릿 포함'
);
assert(
    main.includes("ipcMain.handle('generate-code-candidates'") && main.includes("ipcMain.handle('list-code-templates'"),
    'IPC 핸들러 등록: generate-code-candidates, list-code-templates'
);

// 플레이 루프 템플릿
assert(
    main.includes('const SCHOOL_PLAY_LOOP_STAGES = ['),
    'SCHOOL_PLAY_LOOP_STAGES 배열 존재'
);
assert(
    main.includes('function generatePlayLoopTemplate('),
    'generatePlayLoopTemplate 함수 존재'
);
assert(
    main.includes("ipcMain.handle('generate-play-loop-template'"),
    'IPC 핸들러 등록: generate-play-loop-template'
);

// preload 노출
const preload = read(path.join(root, 'src', 'preload.js'));
assert(
    preload.includes('generatePlayLoopTemplate') && preload.includes('generateCodeCandidates') && preload.includes('listCodeTemplates'),
    'preload.js에 V48-V50 API 노출'
);

// 추천 엔진 강화 — 구현 중심 규칙
assert(
    main.includes('magic_component_candidate') && main.includes('quest_state_candidate') && main.includes('enemy_ai_candidate'),
    'recommendationRules에 코드 후보 생성 규칙 포함'
);
assert(
    main.includes('promote_magic_to_source') && main.includes('promote_quest_to_source'),
    'recommendationRules에 Source 실반영 촉진 규칙 포함'
);
assert(
    main.includes('play_loop_gap') && main.includes('SCHOOL_PLAY_LOOP_STAGES.filter'),
    'recommendationRules에 플레이 루프 미구현 감지 규칙 포함'
);

// ── 14. 기존 검증 체인 전체 통과 ─────────────────────────────────────────────
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
    console.log('PASS: 기존 verify 체인 전체 통과');
} catch (e) {
    console.error('FAIL: 기존 verify 체인 실패');
    process.exitCode = 1;
}

if (process.exitCode) {
    console.error('\nPre-V48 검증 실패');
    process.exit(process.exitCode);
}

console.log('\nPre-V48 검증 완료');
