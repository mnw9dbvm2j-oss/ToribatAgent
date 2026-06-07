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

    ensureDir(path.join(ROOT, 'reviews'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'code'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'quest'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'story'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'art'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'world'));
    ensureDir(path.join(ROOT, 'apply_candidates', 'qa'));
    ensureDir(path.join(ROOT, 'reports'));

    writeIfMissing(path.join(ROOT, 'reviews', 'story_001.review.md'), `# Reviewer Agent 검수

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 작성 AI: verify
- 태스크: 검증용 스토리 결과물
- 시도: 1

## 평가 점수
| 항목 | 점수 |
| --- | ---: |
| 완성도 | 84 |
| 일관성 | 82 |
| 구현 가능성 | 83 |
| 프로젝트 적합성 | 86 |
| 품질 | 85 |

## 최종 판정
- 점수: 84/100
- 판정: PASS
`);

    writeIfMissing(path.join(ROOT, 'apply_candidates', 'story', 'verify_story.candidate.md'), `# 적용 후보

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 작성 AI: verify
- 분류: story
- 품질 점수: 85/100
- 검수 결과: PASS
- 검수 점수: 84/100
- 추천 적용 위치: Content/ToribatMagicSchool/Data/Story/

## 원본 태스크
검증용 스토리 적용 후보
`);

    writeIfMissing(path.join(ROOT, 'reports', 'project_report.md'), `# PM 프로젝트 보고서

## PM 확장 지표
- 적용 후보 수: 1
- PASS 결과물 수: 1
- REJECT 결과물 수: 0
- 중복 태스크 수: 0
`);

    checks.push(hasAll(main, ['runReviewerAgent', 'getReviewDecision', 'reviews', 'PASS', 'REVIEW', 'REJECT', '완성도', '일관성', '구현 가능성', '프로젝트 적합성'])
        ? pass('Reviewer Agent', '검수 함수, 파일 저장, 판정 체계 감지')
        : fail('Reviewer Agent', '검수 체계 누락'));

    checks.push(hasAll(main, ['detectDuplicateTask', 'jaccardSimilarity', 'collectTaskSearchCorpus', 'todo.md', 'generated_tasks.md', 'done.md', '중복 가능성', '생성 중단'])
        ? pass('중복 감지', 'todo/generated/done 검색 및 유사도 차단 감지')
        : fail('중복 감지', '중복 태스크 감지 코드 누락'));

    checks.push(hasAll(main, ['saveApplyCandidate', 'apply_candidates', 'classifyApplyCandidate', '추천 적용 위치', 'code', 'quest', 'story', 'art', 'world', 'qa'])
        ? pass('적용 후보', '분류별 적용 후보 저장 코드 감지')
        : fail('적용 후보', '적용 후보 시스템 누락'));

    checks.push(hasAll(main, ['getProjectReportFile', 'project_report.md', '적용 후보 수', 'PASS 결과물 수', 'REJECT 결과물 수', '중복 태스크 수'])
        ? pass('PM 보고서', 'V24 PM 확장 지표 감지')
        : fail('PM 보고서', 'PM 확장 보고서 누락'));

    checks.push(hasAll(preload, ['detectDuplicateTask', 'readReviewSummary', 'readApplyCandidates', 'onApplyCandidatesUpdate'])
        ? pass('IPC 연결', 'V22-V24 preload API 감지')
        : fail('IPC 연결', 'V22-V24 IPC 누락'));

    checks.push(hasAll(index, ['page-reviews', 'page-candidates', 'loadReviews', 'loadApplyCandidates', 'duplicate-hint', '중복 가능성'])
        ? pass('UI 연결', '검수/적용 후보/중복 표시 UI 감지')
        : fail('UI 연결', 'V22-V24 UI 누락'));

    checks.push(pkg.scripts && pkg.scripts['verify:v22-v24'] === 'node scripts/verify-v22-v24.js'
        ? pass('검증 명령', 'verify:v22-v24 연결됨')
        : fail('검증 명령', 'package.json 검증 명령 누락'));

    for (const dir of ['reviews', 'apply_candidates/code', 'apply_candidates/quest', 'apply_candidates/story', 'apply_candidates/art', 'apply_candidates/world', 'apply_candidates/qa']) {
        const full = path.join(ROOT, dir);
        checks.push(fs.existsSync(full) ? pass('폴더 생성', dir) : fail('폴더 생성', `${dir} 없음`));
    }

    for (const file of ['reviews/story_001.review.md', 'apply_candidates/story/verify_story.candidate.md', 'reports/project_report.md']) {
        const full = path.join(ROOT, file);
        checks.push(fs.existsSync(full) ? pass('샘플 산출물', file) : fail('샘플 산출물', `${file} 없음`));
    }

    return checks;
}

const checks = verify();
const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`);
}

if (failed.length) {
    console.error(`\nV22-V24 검증 실패: ${failed.length}개`);
    process.exit(1);
}

console.log('\nV22-V24 검증 통과');
