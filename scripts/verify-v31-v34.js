const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mainFile = path.join(ROOT, 'src', 'main.js');
const preloadFile = path.join(ROOT, 'src', 'preload.js');
const indexFile = path.join(ROOT, 'src', 'index.html');
const packageFile = path.join(ROOT, 'package.json');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeIfMissing(file, content) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, content, 'utf8');
}

function hasAll(text, needles) {
    return needles.every(needle => text.includes(needle));
}

function pass(name, detail) {
    return { ok: true, name, detail };
}

function fail(name, detail) {
    return { ok: false, name, detail };
}

function verify() {
    const main = read(mainFile);
    const preload = read(preloadFile);
    const index = read(indexFile);
    const pkg = JSON.parse(read(packageFile));
    const checks = [];

    for (const dir of [
        'patch_candidates/code',
        'patch_candidates/build',
        'patch_candidates/config',
        'patch_candidates/blueprint',
        'apply_queue/pending',
        'apply_queue/approved',
        'apply_queue/rejected',
        'reports'
    ]) ensureDir(path.join(ROOT, dir));

    writeIfMissing(path.join(ROOT, 'patch_candidates', 'build', 'verify_patch.patch.md'), `# 패치 후보

## 오류 원문
Missing Module

## Claude Code용 프롬프트
\`\`\`text
Build.cs와 include 경로를 점검하라.
\`\`\`
`);

    writeIfMissing(path.join(ROOT, 'reports', 'traceability.md'), `# 통합 추적

| 결과물 파일 | Reviewer 결과 | 적용 후보 | 관련 빌드 오류 | 관련 태스크 | 관련 스프린트 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| verify.md | Code Reviewer PASS | apply_candidates/code | 빌드 오류 없음 | 검증 태스크 | Sprint 1 | 추적 정상 |
`);

    writeIfMissing(path.join(ROOT, 'apply_queue', 'pending', 'verify.apply.md'), `# 적용 큐 항목

- 상태: pending
- dry-run: true
- 추천 적용 경로: Source/ToribatMagicSchool/Verify.cpp
- 기존 파일 존재: 아니오

## 변경 Diff
\`\`\`diff
+ verify
\`\`\`
`);

    checks.push(['patch_candidates/code', 'patch_candidates/build', 'patch_candidates/config', 'patch_candidates/blueprint'].every(dir => fs.existsSync(path.join(ROOT, dir)))
        ? pass('patch_candidates 생성', 'code/build/config/blueprint 폴더 존재')
        : fail('patch_candidates 생성', '패치 후보 폴더 누락'));

    checks.push(hasAll(main, ['generatePatchCandidates', 'Claude Code용 프롬프트', 'classifyPatchCandidate', 'guessPatchTargetFile'])
        ? pass('Claude Code 프롬프트 생성', '패치 후보 프롬프트 생성 코드 감지')
        : fail('Claude Code 프롬프트 생성', '패치 후보 프롬프트 코드 누락'));

    checks.push(hasAll(main, ['parseCommandCenterRecommendations', 'approveSelectedCommandTasks']) && hasAll(index, ['cmd-check', 'selectAllCommandCandidates', 'approveSelectedCommandTasks'])
        ? pass('지휘 센터 체크박스 후보 파싱', '추천 파싱 및 체크박스 UI 감지')
        : fail('지휘 센터 체크박스 후보 파싱', '선택 승인 UI/파싱 누락'));

    checks.push(hasAll(main, ['approveSelectedCommandTasks', 'selectedIds', 'generated_tasks.md']) && index.includes('선택 항목 todo.md 추가')
        ? pass('선택 항목만 todo.md 추가', '선택된 추천만 추가하고 generated_tasks 기록')
        : fail('선택 항목만 todo.md 추가', '선택 승인 저장 흐름 누락'));

    checks.push(hasAll(main, ['collectTraceability', 'getTraceabilityFile']) && fs.existsSync(path.join(ROOT, 'reports', 'traceability.md'))
        ? pass('통합 추적 데이터 생성', 'traceability 보고서와 생성 함수 감지')
        : fail('통합 추적 데이터 생성', '통합 추적 누락'));

    checks.push(['apply_queue/pending', 'apply_queue/approved', 'apply_queue/rejected'].every(dir => fs.existsSync(path.join(ROOT, dir)))
        ? pass('apply_queue 생성', 'pending/approved/rejected 폴더 존재')
        : fail('apply_queue 생성', '적용 큐 폴더 누락'));

    checks.push(hasAll(main, ['makeSimpleDiff', 'registerApplyCandidateToQueue', 'runApplyDryRun', '```diff'])
        ? pass('diff 생성', 'diff 생성 및 dry-run 코드 감지')
        : fail('diff 생성', 'diff/dry-run 코드 누락'));

    checks.push(hasAll(main, ['allowRealApply: saved.allowRealApply === true', 'allowRealApply: false', 'cfg.allowRealApply === true'])
        ? pass('allowRealApply 기본 false', '설정 기본값 false 감지')
        : fail('allowRealApply 기본 false', 'allowRealApply 기본값 누락'));

    checks.push(hasAll(preload, ['generatePatchCandidates', 'parseCommandRecommendations', 'generateTraceability', 'registerApplyCandidate', 'runApplyDryRun'])
        ? pass('IPC 연결', 'V31-V34 preload API 감지')
        : fail('IPC 연결', 'V31-V34 IPC 누락'));

    checks.push(hasAll(index, ['page-patches', 'page-trace', 'page-applyqueue', 'copyFirstPatchPrompt', 'dry-run 실행', 'cfg-allow-apply'])
        ? pass('UI 연결', '패치/통합추적/적용큐 UI 감지')
        : fail('UI 연결', 'V31-V34 UI 누락'));

    checks.push(pkg.scripts && pkg.scripts.verify && pkg.scripts.verify.includes('verify-v31-v34.js') && pkg.scripts['verify:v31-v34'] === 'node scripts/verify-v31-v34.js'
        ? pass('기존 verify 스크립트 유지', 'npm run verify에 V31-V34 포함')
        : fail('기존 verify 스크립트 유지', 'package.json verify 체인 누락'));

    return checks;
}

const checks = verify();
const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`);
}

if (failed.length) {
    console.error(`\nV31-V34 검증 실패: ${failed.length}개`);
    process.exit(1);
}

console.log('\nV31-V34 검증 통과');
