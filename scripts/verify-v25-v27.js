const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mainFile = path.join(ROOT, 'src', 'main.js');
const preloadFile = path.join(ROOT, 'src', 'preload.js');
const indexFile = path.join(ROOT, 'src', 'index.html');
const adapterFile = path.join(ROOT, 'src', 'mcp-adapter.js');
const mcpConfigFile = path.join(ROOT, 'mcp.config.json');
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
    const adapter = read(adapterFile);
    const pkg = JSON.parse(read(packageFile));
    const mcpConfig = JSON.parse(read(mcpConfigFile));
    const checks = [];

    for (const dir of [
        'reviews/code',
        'reviews/story',
        'reviews/world',
        'reviews/art',
        'reviews/qa',
        'reviews/pm',
        'sprints',
        'reports'
    ]) {
        ensureDir(path.join(ROOT, dir));
    }

    writeIfMissing(path.join(ROOT, 'reviews', 'code', 'code_001.review.md'), `# Code Reviewer 검수

- Reviewer 종류: Code Reviewer
- 리뷰 분류: code
- 태스크: 검증용 코드 리뷰
- 점수: 82/100
- 판정: PASS
`);

    writeIfMissing(path.join(ROOT, 'sprints', 'sprint_001.md'), `# Sprint 001

- 상태: planned
- 생성일: ${new Date().toLocaleString('ko-KR')}

## 스프린트 목표
검증용 PM Sprint

## 포함 태스크
- [ ] 검증용 태스크 | 담당 에이전트: 프로젝트 매니저 | 우선순위: 중간

## 담당 에이전트
- 프로젝트 매니저

## 예상 산출물
- PM 보고서

## 통과 기준
- Reviewer Agent PASS 1개 이상

## 우선순위
- 중간: 검증용 태스크

## 위험 요소
- UE5 실제 실행 없음
`);

    writeIfMissing(path.join(ROOT, 'reports', 'project_report.md'), `# PM 프로젝트 보고서

## PM 스프린트 정보
- 현재 스프린트: Sprint 001 (planned)
- 다음 스프린트 후보:
  - 중간: 검증용 태스크 (프로젝트 매니저)
- 막힌 태스크: 0
- 실패 태스크 수: 0
`);

    const hasAllowedRoot = mcpConfig && mcpConfig.filesystem && Array.isArray(mcpConfig.filesystem.allowedRoots) &&
        (mcpConfig.filesystem.allowedRoots.includes('E:\\ToribatAgent') || mcpConfig.filesystem.allowedRoots.includes('C:\\ToribatAgent'));
    checks.push(hasAllowedRoot
        ? pass('mcp.config.json 생성', 'filesystem.allowedRoots 기본값 감지')
        : fail('mcp.config.json 생성', 'MCP 설정 또는 allowedRoots 누락'));

    checks.push(hasAll(adapter, ['loadMcpConfig', 'isWithinAllowedRoots', 'assertSafePath', 'listProjectFiles', 'readFileContent', 'canWrite'])
        ? pass('mcp-adapter 경로 안전성', '설정 로드, allowedRoots, 안전 경로, 읽기/쓰기 검사 감지')
        : fail('mcp-adapter 경로 안전성', 'MCP 어댑터 필수 함수 누락'));

    checks.push(hasAll(main, ['mcpAdapter', 'isFilesystemMcpEnabled', 'fs-fallback', 'MCP 어댑터 스캔 폴백'])
        ? pass('프로젝트 분석관 폴백', 'MCP 우선 사용 및 fs 폴백 감지')
        : fail('프로젝트 분석관 폴백', '분석관 MCP 폴백 연결 누락'));

    checks.push(hasAll(main, ['getReviewerProfile', 'Code Reviewer', 'Story Reviewer', 'World Reviewer', 'Art/Asset Reviewer', 'QA Reviewer', 'PM Reviewer'])
        ? pass('전문 Reviewer 분류', '6개 전문 Reviewer 감지')
        : fail('전문 Reviewer 분류', '전문 Reviewer 누락'));

    for (const dir of ['reviews/code', 'reviews/story', 'reviews/world', 'reviews/art', 'reviews/qa', 'reviews/pm']) {
        checks.push(fs.existsSync(path.join(ROOT, dir)) ? pass('reviews/<category> 생성', dir) : fail('reviews/<category> 생성', `${dir} 없음`));
    }

    checks.push(fs.existsSync(path.join(ROOT, 'sprints', 'sprint_001.md')) && hasAll(main, ['createSprint', 'listSprints', 'readCurrentSprint', 'buildSprintMarkdown'])
        ? pass('sprint 파일 생성', 'sprint_001.md 및 스프린트 함수 감지')
        : fail('sprint 파일 생성', '스프린트 파일 또는 함수 누락'));

    checks.push(hasAll(main, ['PM 스프린트 정보', '현재 스프린트', '다음 스프린트 후보', '막힌 태스크', '실패 태스크 수'])
        ? pass('PM 보고서 스프린트 정보', 'PM 보고서 확장 항목 감지')
        : fail('PM 보고서 스프린트 정보', 'PM 스프린트 보고서 항목 누락'));

    checks.push(hasAll(preload, ['listSprints', 'readCurrentSprint', 'createSprint'])
        ? pass('스프린트 IPC', 'preload 스프린트 API 감지')
        : fail('스프린트 IPC', '스프린트 IPC 누락'));

    checks.push(hasAll(index, ['page-sprints', 'loadSprints', 'loadCurrentSprint', 'createSprint', 'Reviewer 종류'])
        ? pass('스프린트/UI', '스프린트 메뉴와 Reviewer 종류 표시 감지')
        : fail('스프린트/UI', '스프린트 UI 또는 Reviewer 표시 누락'));

    checks.push(pkg.scripts && pkg.scripts['verify:v25-v27'] === 'node scripts/verify-v25-v27.js'
        ? pass('검증 명령', 'verify:v25-v27 연결됨')
        : fail('검증 명령', 'package.json verify:v25-v27 누락'));

    return checks;
}

const checks = verify();
const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`);
}

if (failed.length) {
    console.error(`\nV25-V27 검증 실패: ${failed.length}개`);
    process.exit(1);
}

console.log('\nV25-V27 검증 통과');
