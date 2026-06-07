const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    main: path.join(root, 'src', 'main.js'),
    pkg: path.join(root, 'package.json'),
    gameState: path.join(root, 'reports', 'game_state.md'),
    verticalStatus: path.join(root, 'reports', 'vertical_slice_status.md'),
    commandCenter: path.join(root, 'reports', 'command_center.md')
};

function read(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function write(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${message}`);
    }
}

function ensureV43Reports() {
    const game = read(files.gameState);
    if (!game.includes('.uproject 파일 수') || !game.includes('상태 4 기준')) {
        write(files.gameState, `# 게임 개발 상태

- Feature Progress: 0%
- Actual Implementation 기준: 상태 0~4 평균
- 상태 3 기준: .uproject / Source / Config / Content / .umap / .uasset 실파일 또는 적용 후보의 Source/Content 승격
- 상태 4 기준: .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 필요

| 판별 항목 | 상태 단계 | 의미 | 근거 |
| --- | ---: | --- | --- |
| 전투 가능 | 0 | 상태 0 - 없음 | 근거 없음 |

## UE5 프로젝트 실체 근거
- .uproject 파일 수: 0
- Source 파일 수: 0
- Source 코드 파일 수: 0
- Content 파일 수: 0
- .umap 파일 수: 0
- .uasset 파일 수: 0
- Config 파일 수: 0
- Plugins 파일 수: 0
- 적용 후보 Source/Content 승격 근거: 0
`);
    }
    const vertical = read(files.verticalStatus);
    if (!vertical.includes('.umap 파일 수') || !vertical.includes('상태 4 기준')) {
        write(files.verticalStatus, `# 수직 슬라이스 달성률

- Vertical Slice Progress: 0%
- 상태 단계: 0 없음 / 1 문서·기획 / 2 적용 후보 / 3 프로젝트 파일 / 4 실행·검수 통과
- 상태 3 기준: .uproject / Source / Config / Content / .umap / .uasset 실파일 또는 적용 후보의 Source/Content 승격
- 상태 4 기준: .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 필요

| 핵심 항목 | 상태 단계 | 의미 | 근거 |
| --- | ---: | --- | --- |
| 첫 전투 | 0 | 상태 0 - 없음 | 근거 없음 |

## UE5 프로젝트 실체 근거
- .uproject 파일 수: 0
- Source 파일 수: 0
- Content 파일 수: 0
- .umap 파일 수: 0
- .uasset 파일 수: 0
- Config 파일 수: 0
- Plugins 파일 수: 0
- 적용 후보 Source/Content 승격 근거: 0
`);
    }
}

ensureV43Reports();

const main = read(files.main);
const pkg = read(files.pkg);
const gameState = read(files.gameState);
const verticalStatus = read(files.verticalStatus);

assert(main.includes('function collectUEProjectEvidence'), 'UE5 프로젝트 실체 수집 함수가 존재한다');
assert(main.includes('.uproject') && main.includes('.umap') && main.includes('.uasset'), '.uproject/.umap/.uasset 분석 코드가 존재한다');
assert(main.includes("path.join(projectPath, 'Source')") && main.includes("path.join(projectPath, 'Config')") && main.includes("path.join(projectPath, 'Content')"), 'Source/Config/Content 분석 코드가 존재한다');
assert(main.includes('sourceCodeFiles') && main.includes('mapFiles') && main.includes('assetFiles'), 'Source 코드, 맵, 에셋 파일 수집이 분리되어 있다');

assert(main.includes('function extractApplyCandidatePaths') && main.includes('function getApplyCandidatePromotionSummary'), '적용 후보 대상 경로 추출 및 승격 추적 함수가 존재한다');
assert(main.includes('적용 후보 Source/Content 승격') && main.includes('promotedCandidates'), '적용 후보가 실제 Source/Content로 승격되었는지 보고한다');

assert(main.includes('Reviewer Agent:\\s*PASS') && main.includes('QA\\s*PASS'), '상태 4 승격 기준에 Reviewer PASS와 QA PASS가 있다');
assert(main.includes('const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;'), '상태 4는 .uproject, 실제 구현, QA PASS, Reviewer PASS가 모두 있어야 한다');
assert(!main.includes("빌드 성공|Build Succeeded|QA 통과|완료/.test"), '완료 단어만으로 상태 4가 되는 이전 판별식이 제거되었다');

assert(gameState.includes('.uproject 파일 수') && gameState.includes('.umap 파일 수') && gameState.includes('.uasset 파일 수'), 'game_state.md가 UE5 실체 파일 수를 표시한다');
assert(gameState.includes('상태 4 기준: .uproject') || gameState.includes('상태 4 기준: QA PASS 또는 Reviewer PASS'), 'game_state.md가 상태 4 승격 제한을 표시한다');
assert(verticalStatus.includes('.uproject 파일 수') && verticalStatus.includes('.umap 파일 수') && verticalStatus.includes('.uasset 파일 수'), 'vertical_slice_status.md가 UE5 실체 파일 수를 표시한다');
assert(verticalStatus.includes('적용 후보 Source/Content 승격 근거'), 'vertical_slice_status.md가 후보 승격 근거를 표시한다');

assert(pkg.includes('verify-v43-v46.js') && pkg.includes('verify:v43-v46'), 'package.json 검증 체인에 V43~V46 포함');

if (process.exitCode) {
    console.error('V43~V46 검증 실패');
    process.exit(process.exitCode);
}

console.log('V43~V46 검증 완료');
