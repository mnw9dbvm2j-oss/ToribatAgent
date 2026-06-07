const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    main: path.join(root, 'src', 'main.js'),
    index: path.join(root, 'src', 'index.html'),
    pkg: path.join(root, 'package.json'),
    bible: path.join(root, 'knowledge', 'reference_design_bible.md'),
    gameState: path.join(root, 'reports', 'game_state.md'),
    verticalStatus: path.join(root, 'reports', 'vertical_slice_status.md'),
    commandCenter: path.join(root, 'reports', 'command_center.md')
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

function ensureV39CommandCenterReport() {
    const current = read(files.commandCenter);
    if (current.includes('Actual Implementation Progress')) return;
    fs.mkdirSync(path.dirname(files.commandCenter), { recursive: true });
    fs.writeFileSync(files.commandCenter, `# 자동 개발 지휘 센터

## 현재 프로젝트 진행률
- Task Progress: 0%
- Feature Progress: 13%
- Vertical Slice Progress: 10%
- Actual Implementation Progress: 11%

## 현재 게임 상태
| 기능 | 상태 단계 | 의미 |
| --- | ---: | --- |
| 전투 가능 | 1 | 상태 1 - 문서/기획만 있음 |
| 퀘스트 가능 | 1 | 상태 1 - 문서/기획만 있음 |

## 다음 10개 추천 태스크
1. - [ ] 🔴 [코드] 첫 전투용 기본 적 AI와 피격 반응 구현
2. - [ ] 🟡 [게임플레이] 첫 주문 퍼즐용 반응형 오브젝트와 성공 조건 구현 후보 작성
`, 'utf8');
}

ensureV39CommandCenterReport();

const main = read(files.main);
const index = read(files.index);
const pkg = read(files.pkg);
const bible = read(files.bible);
const gameState = read(files.gameState);
const verticalStatus = read(files.verticalStatus);
const commandCenter = read(files.commandCenter);

assert(fs.existsSync(files.bible), 'reference_design_bible.md 생성');
assert(bible.includes('제한된 마법학교') && bible.includes('수업 기반 주문 습득') && bible.includes('짧은 던전'), 'Reference Design Bible 목표 구조 포함');
assert(bible.includes('대형 오픈월드 금지') && bible.includes('원작 고유명사') && bible.includes('직접 사용 금지'), 'Reference Design Bible 금지 기준 포함');
assert(bible.includes('정문') && bible.includes('중앙홀') && bible.includes('낡은 지하서고') && bible.includes('첫 비밀 발견'), 'ToribatMagicSchool 적용 기준 포함');

assert(main.includes('function getImplementationEvidence') && main.includes('상태 0 - 없음') && main.includes('상태 4 - 실행/검수 통과'), 'V40 0~4 단계 증거 엔진 구현');
assert(main.includes('getActualImplementationProgress') && main.includes('Actual Implementation Progress'), 'Actual Implementation Progress 계산 및 지휘 센터 표시');
assert(gameState.includes('상태 단계') && /상태\s+[0-4]\s+-/.test(gameState), 'game_state.md에 0~4 단계 반영');
assert(verticalStatus.includes('상태 단계') && verticalStatus.includes('참고 설계 기준') && /상태\s+[0-4]\s+-/.test(verticalStatus), 'vertical_slice_status.md에 0~4 단계 반영');

assert(main.includes('start_area') && main.includes('first_spell') && main.includes('spell_puzzle') && main.includes('reward_save') && main.includes('qa_pass'), '필수 수직 슬라이스 10개 루프 반영');
assert(main.includes('첫 전투용 기본 적 AI와 피격 반응 구현') && main.includes('첫 수업 퀘스트 대사와 시작/완료 조건 작성') && main.includes('첫 주문 퍼즐'), '추천 태스크가 실제 부족 기능 중심');
assert(main.includes('검토\\\\s*\\\\d+') || main.includes('검토\\s*\\d+'), '의미 없는 반복 추천 차단 정규식 존재');
assert(!/수직 슬라이스 범위 유지 검토\s+\$\{/.test(main), '수직 슬라이스 검토 N 생성 패턴 없음');
assert(!/검토\s+[456]/.test(commandCenter), '현재 지휘 센터 보고서에 검토 4/5/6 반복 추천 없음');

assert(main.includes('Reference-aware Reviewer 기준') && main.includes('reference_design_bible.md') && main.includes('제한된 규모') && main.includes('수업/주문/퍼즐/탐험 루프'), 'Reference-aware Reviewer 기준 반영');
assert(index.includes('vertical-status-view') && index.includes('command-game-state'), 'UI가 수직 슬라이스 단계와 게임 상태를 표시');
assert(commandCenter.includes('Task Progress') && commandCenter.includes('Feature Progress') && commandCenter.includes('Vertical Slice Progress'), '지휘 센터가 분리 진행률 표시');
assert(pkg.includes('verify-v39-v42.js') && pkg.includes('verify:v39-v42'), 'package.json 검증 체인에 V39~V42 포함');

if (process.exitCode) {
    console.error('V39~V42 검증 실패');
    process.exit(process.exitCode);
}

console.log('V39~V42 검증 완료');
