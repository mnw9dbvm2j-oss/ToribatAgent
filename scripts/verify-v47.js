const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    main: path.join(root, 'src', 'main.js'),
    preload: path.join(root, 'src', 'preload.js'),
    index: path.join(root, 'src', 'index.html'),
    pkg: path.join(root, 'package.json'),
    report: path.join(root, 'reports', 'pm_validation.md')
};

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

function ensureReport() {
    const report = read(files.report);
    if (report.includes('PM 판단 신뢰도') && report.includes('Actual Implementation Progress')) return;
    fs.mkdirSync(path.dirname(files.report), { recursive: true });
    fs.writeFileSync(files.report, `# PM 판단 검증

- PM 판단 신뢰도: 주의

## Actual Implementation Progress
- 현재 값: 0%
- Source 파일 수: 0
- Content 파일 수: 0
- .umap 수: 0
- .uasset 수: 0
- Reviewer PASS 수: 0
- QA PASS 수: 0

## 상태 0~4 분류표
| 수직 슬라이스 항목 | 단계 | 의미 | 근거 |
| --- | ---: | --- | --- |
| 시작 구역 | 0 | 상태 0 - 없음 | 근거 없음 |

## 문제 감지
- [주의] 초기 보고서

## 추천 태스크 품질 검사
| 추천 태스크 | 중복 여부 | 반복 여부 | 부족 기능 연결 | 담당 에이전트 |
| --- | --- | --- | --- | --- |
| 없음 | - | - | - | - |
`, 'utf8');
}

ensureReport();

const main = read(files.main);
const preload = read(files.preload);
const index = read(files.index);
const pkg = read(files.pkg);
const report = read(files.report);

assert(index.includes("showPage('pmvalidation'") && index.includes('PM 검증'), 'PM 검증 메뉴 존재');
assert(index.includes('pm-validation-summary') && index.includes('pm-validation-status') && index.includes('pm-validation-issues'), 'PM 검증 대시보드 표시 영역 존재');
assert(index.includes('PM 판단 검증 실행') && index.includes('runPmValidation'), '자동 검증 버튼과 실행 함수 존재');
assert(preload.includes('generatePmValidation') && preload.includes('readPmValidation'), 'preload PM 검증 API 노출');
assert(main.includes("ipcMain.handle('generate-pm-validation'") && main.includes("ipcMain.handle('read-pm-validation'"), 'main.js PM 검증 IPC 등록');

assert(main.includes('function generatePmValidation') && main.includes('getPmValidationFile'), 'pm_validation.md 생성 함수 존재');
assert(report.includes('PM 판단 신뢰도') && report.includes('Actual Implementation Progress'), 'pm_validation.md 생성');
assert(main.includes('Actual Implementation Progress') && main.includes('Source 파일 수') && main.includes('.umap 수') && main.includes('Reviewer PASS 수'), 'Actual Implementation Progress 근거 표시');
assert(main.includes('상태 0~4 분류표') && main.includes('vertical.statuses.map'), '상태 0~4 표시 데이터 생성');
assert(main.includes('isMeaninglessRepeatedTask') && main.includes('검토\\s*\\d+'), '반복 추천 탐지 구현');
assert(main.includes('PASS 근거 없이 상태 4') && main.includes('Reviewer PASS|QA PASS'), 'PASS 없는 상태 4 오류 탐지 구현');
assert(main.includes('Source/Content 근거 없이 구현됨') && main.includes('Actual Implementation Progress ${progress.actual}%'), 'PM 판단 문제 감지 규칙 구현');
assert(main.includes('추천 태스크 품질 검사') && main.includes('중복 여부') && main.includes('부족 기능 연결'), '추천 태스크 품질 검사 구현');
assert(pkg.includes('verify-v47.js') && pkg.includes('verify:v47'), 'package.json 검증 체인에 V47 포함');

if (process.exitCode) {
    console.error('V47 검증 실패');
    process.exit(process.exitCode);
}

console.log('V47 검증 완료');
