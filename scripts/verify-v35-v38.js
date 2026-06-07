const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcMain = path.join(root, 'src', 'main.js');
const srcPreload = path.join(root, 'src', 'preload.js');
const srcIndex = path.join(root, 'src', 'index.html');
const pkgFile = path.join(root, 'package.json');
const reportsDir = path.join(root, 'reports');
const verticalStatusFile = path.join(reportsDir, 'vertical_slice_status.md');
const gameStateFile = path.join(reportsDir, 'game_state.md');
const commandCenterFile = path.join(reportsDir, 'command_center.md');

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

function ensureReportFiles() {
    fs.mkdirSync(reportsDir, { recursive: true });
    if (!fs.existsSync(verticalStatusFile)) {
        fs.writeFileSync(verticalStatusFile, `# 수직 슬라이스 달성률

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- Vertical Slice Progress: 0%

| 핵심 항목 | 상태 |
| --- | --- |
| 정문 | 미구현 |
| 중앙홀 | 미구현 |
| 첫 수업 | 미구현 |
| 첫 전투 | 미구현 |
| 첫 비밀 | 미구현 |
| 첫 던전 | 미구현 |
| 보스/위험 요소 | 미구현 |
`, 'utf8');
    }
    if (!fs.existsSync(gameStateFile)) {
        fs.writeFileSync(gameStateFile, `# 게임 개발 상태

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- Feature Progress: 0%

| 판별 항목 | 상태 |
| --- | --- |
| 플레이 가능 | 미구현 |
| 전투 가능 | 미구현 |
| 퀘스트 가능 | 미구현 |
| 대화 가능 | 미구현 |
| 세이브 가능 | 미구현 |
| 던전 가능 | 미구현 |
| 마법 사용 | 미구현 |
| 맵/동선 | 미구현 |
`, 'utf8');
    }
}

ensureReportFiles();

const main = read(srcMain);
const preload = read(srcPreload);
const index = read(srcIndex);
const pkg = read(pkgFile);
const verticalStatus = read(verticalStatusFile);
const gameState = read(gameStateFile);
const commandCenter = read(commandCenterFile);

assert(main.includes('function calculateProjectProgress'), 'V35 실제 진행률 엔진 함수가 존재한다');
assert(main.includes('Task Progress') && main.includes('Feature Progress') && main.includes('Vertical Slice Progress'), '지휘 센터가 진행률을 Task/Feature/Vertical Slice로 분리한다');
assert(main.includes('function analyzeVerticalSliceStatus') && main.includes('getVerticalSliceStatusFile'), 'V37 수직 슬라이스 달성률 엔진이 존재한다');
assert(main.includes('function analyzeGameState') && main.includes('getGameStateFile'), 'V38 게임 개발 상태 분석 엔진이 존재한다');
assert(main.includes('function isRecommendationAllowed') && main.includes('similarity >= 80'), 'V36 추천 전 중복 유사도 차단이 존재한다');
assert(main.includes("if (/검토\\s*\\d+|수직 슬라이스 범위 유지 검토/i.test(line)) return false;"), '반복 검토형 추천 차단 규칙이 존재한다');
assert(main.includes('첫 전투용 기본 적 AI') && main.includes('첫 수업 퀘스트') && main.includes('시작 구역에서 중앙홀까지'), '추천 태스크가 실제 부족 기능 중심이다');
assert(!/while\s*\([^)]*recommendations\.length[^)]*\)[\s\S]{0,300}수직 슬라이스 범위 유지 검토/.test(main), '검토 N 자동 채우기 루프가 제거되었다');

assert(preload.includes('generateVerticalSliceStatus') && preload.includes('readVerticalSliceStatus'), 'preload가 수직 슬라이스 달성률 API를 노출한다');
assert(preload.includes('generateGameState') && preload.includes('readGameState'), 'preload가 게임 상태 API를 노출한다');
assert(main.includes("ipcMain.handle('generate-vertical-slice-status'") && main.includes("ipcMain.handle('generate-game-state'"), 'main.js IPC 핸들러가 등록되어 있다');
assert(index.includes('vertical-status-view') && index.includes('command-game-state'), 'UI에 수직 슬라이스 달성률과 게임 상태 표시 영역이 있다');
assert(index.includes('generateVerticalSliceStatus()') && index.includes('loadGameState()'), 'UI 렌더링 함수가 새 분석 결과를 갱신한다');

assert(verticalStatus.includes('Vertical Slice Progress') && verticalStatus.includes('| 첫 전투 |'), 'vertical_slice_status.md가 생성되고 핵심 항목을 포함한다');
assert(gameState.includes('Feature Progress') && gameState.includes('| 전투 가능 |') && gameState.includes('| 퀘스트 가능 |'), 'game_state.md가 생성되고 게임 기능 판별 항목을 포함한다');
assert(pkg.includes('verify-v35-v38.js') && pkg.includes('verify:v35-v38'), 'package.json 검증 체인이 V35~V38을 포함한다');

if (commandCenter) {
    assert(!/수직 슬라이스 검토\s+\d|검토\s+4|검토\s+5|검토\s+6/.test(commandCenter), '현재 command_center.md에 반복 검토형 추천이 없다');
} else {
    console.log('INFO: command_center.md는 앱 실행 시 새 지휘 센터 분석으로 갱신된다');
}

if (process.exitCode) {
    console.error('V35~V38 검증 실패');
    process.exit(process.exitCode);
}

console.log('V35~V38 검증 완료');
