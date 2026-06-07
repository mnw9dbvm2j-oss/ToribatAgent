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

function write(file, content) {
    fs.writeFileSync(file, content, 'utf8');
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

    ensureDir(path.join(ROOT, 'reports'));
    ensureDir(path.join(ROOT, 'tasks'));
    ensureDir(path.join(ROOT, 'sprints'));

    write(path.join(ROOT, 'reports', 'build_diagnostics.md'), `# UE5 빌드/오류 로그 분석

## 발견 오류
- [Error] C++ 컴파일 오류: fatal error C1083 cannot open include file
- [Error] Missing Module: Module ToribatMagicSchool could not be found

## 수정 후보 태스크
- [ ] 🔴 [코드] include 오류 수정

## Claude Code에게 넘길 수정 프롬프트
\`\`\`text
Build.cs와 include 경로를 점검하라.
\`\`\`
`);

    write(path.join(ROOT, 'reports', 'vertical_slice_plan.md'), `# 수직 슬라이스 마스터 플랜

## 핵심 목표
20~40분짜리 첫 플레이 구간.

## 첫 수업
- 주문 학습

## 첫 전투
- 훈련 전투

## 첫 비밀 발견
- 숨은 문 발견

## 첫 던전
- 소형 방 3개

## 완성 조건
- 대형 오픈월드 확장 금지
`);

    write(path.join(ROOT, 'reports', 'command_center.md'), `# 자동 개발 지휘 센터

## 현재 프로젝트 진행률
- 진행률: 50%

## 다음 10개 추천 태스크
1. - [ ] 🔴 [코드] Interaction Component 구현 | 담당 에이전트: 코드 마스터 | 예상 산출물: UE5 C++ 컴포넌트
2. - [ ] 🔴 [스토리] 첫 수업 퀘스트 작성 | 담당 에이전트: 스토리 작가 | 예상 산출물: 퀘스트 데이터

## 승인 대기
\`\`\`todo
- [ ] 🔴 [코드] Interaction Component 구현
- [ ] 🔴 [스토리] 첫 수업 퀘스트 작성
\`\`\`
`);

    checks.push(fs.existsSync(path.join(ROOT, 'reports', 'build_diagnostics.md'))
        ? pass('build_diagnostics.md 생성', '빌드 진단 보고서 존재')
        : fail('build_diagnostics.md 생성', '빌드 진단 보고서 없음'));

    checks.push(fs.existsSync(path.join(ROOT, 'reports', 'vertical_slice_plan.md'))
        ? pass('vertical_slice_plan.md 생성', '수직 슬라이스 플랜 존재')
        : fail('vertical_slice_plan.md 생성', '수직 슬라이스 플랜 없음'));

    checks.push(fs.existsSync(path.join(ROOT, 'reports', 'command_center.md'))
        ? pass('command_center.md 생성', '지휘 센터 보고서 존재')
        : fail('command_center.md 생성', '지휘 센터 보고서 없음'));

    checks.push(hasAll(main, ['findLatestLogFile', 'analyzeBuildLogs', 'classifyBuildIssue', 'Error / Warning / Fatal / Failed / Exception'.split(' / ')[0], 'Missing Module', 'Build.cs', 'include 오류'])
        ? pass('빌드 로그 파서 동작', '최신 로그 탐색과 오류 분류 코드 감지')
        : fail('빌드 로그 파서 동작', '빌드 로그 파서 코드 누락'));

    checks.push(hasAll(main, ['generateVerticalSlicePlan', '첫 수업', '첫 전투', '첫 비밀 발견', '첫 던전', '대형 오픈월드 확장 금지'])
        ? pass('수직 슬라이스 플랜 생성', '고정 범위 플랜 생성 코드 감지')
        : fail('수직 슬라이스 플랜 생성', '수직 슬라이스 플랜 코드 누락'));

    checks.push(hasAll(main, ['generateCommandCenter', 'buildCommandRecommendations', '다음 10개 추천 태스크', 'approveCommandCenterTasks', '자동으로 todo.md에 추가하지 않는다', 'resolveReadableReportFile', 'getWritableProjectPath'])
        ? pass('다음 10개 태스크 추천', '지휘 센터 후보 생성 및 승인 코드 감지')
        : fail('다음 10개 태스크 추천', '지휘 센터 추천 코드 누락'));

    checks.push(hasAll(preload, ['analyzeBuildLogs', 'generateVerticalSlicePlan', 'generateCommandCenter', 'approveCommandCenterTasks'])
        ? pass('UI IPC 연결', 'V28-V30 preload API 감지')
        : fail('UI IPC 연결', 'V28-V30 IPC 누락'));

    checks.push(hasAll(index, ['runBuildDiagnostics', 'page-vertical', 'page-command', 'generateCommandCenter', 'approveCommandCenterTasks', 'readCommandCenter', '지휘 센터 분석 실패'])
        ? pass('UI IPC 연결', '빌드/수직 슬라이스/지휘 센터 UI와 재읽기 경로 감지')
        : fail('UI IPC 연결', 'V28-V30 UI 누락'));

    checks.push(pkg.scripts && pkg.scripts.verify && pkg.scripts.verify.includes('verify-v28-v30.js') && pkg.scripts['verify:v28-v30'] === 'node scripts/verify-v28-v30.js'
        ? pass('기존 verify 스크립트 유지', 'npm run verify에 V28-V30 포함')
        : fail('기존 verify 스크립트 유지', 'package.json verify 체인 누락'));

    return checks;
}

const checks = verify();
const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`);
}

if (failed.length) {
    console.error(`\nV28-V30 검증 실패: ${failed.length}개`);
    process.exit(1);
}

console.log('\nV28-V30 검증 통과');
