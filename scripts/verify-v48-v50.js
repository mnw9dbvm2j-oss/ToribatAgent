const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    main: path.join(root, 'src', 'main.js'),
    pkg: path.join(root, 'package.json'),
    audit: path.join(root, 'reports', 'state_audit.md'),
    gameState: path.join(root, 'reports', 'game_state.md'),
    verticalStatus: path.join(root, 'reports', 'vertical_slice_status.md'),
    pmValidation: path.join(root, 'reports', 'pm_validation.md')
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

const main = read(files.main);
const pkg = read(files.pkg);
const audit = read(files.audit);
const gameState = read(files.gameState);
const verticalStatus = read(files.verticalStatus);
const pmValidation = read(files.pmValidation);

assert(fs.existsSync(files.audit), 'reports/state_audit.md 생성');
assert(audit.includes('상태0') && audit.includes('상태1') && audit.includes('상태2') && audit.includes('상태3') && audit.includes('상태4'), '상태0~4 판정 조건 감사 출력');
assert(audit.includes('실제 구현 근거') && audit.includes('문서 근거') && audit.includes('QA 근거') && audit.includes('Reviewer 근거') && audit.includes('UE 파일 근거'), '감사 보고서가 근거 종류를 구분한다');
assert(audit.includes('QA PASS만') && audit.includes('Reviewer PASS만') && audit.includes('문서 + QA PASS'), '상태4 논리 오류 패턴을 감사 보고서가 검출한다');

assert(main.includes('const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;'), '상태4는 .uproject + 실제 구현 + QA PASS + Reviewer PASS 모두 필요');
assert(main.includes('const passed = state4Eligible;'), '상태4 예외 경로가 제거됨');
assert(!main.includes('const passed = (reviewerPass || qaPass)'), 'QA 또는 Reviewer 단독 PASS 조건 제거');
assert(main.includes('sourceMatch') && main.includes('contentMatch') && main.includes('mapMatch') && main.includes('assetMatch'), '실제 구현 근거가 Source/Content/.umap/.uasset로 분리됨');

assert(main.includes('function getStateWeight') && main.includes('return [0, 10, 35, 70, 100]'), '상태별 가중치 계산 함수 존재');
assert(main.includes('getWeightedStateProgress') && main.includes('getActualImplementationProgress'), 'Actual Implementation Progress가 가중치 평균을 사용한다');
assert(gameState.includes('상태별 가중치 평균') && verticalStatus.includes('상태별 가중치'), '보고서가 수정된 진행률 계산식을 표시한다');

assert(pmValidation.includes('상태4 항목 수') && pmValidation.includes('상태4 중 QA PASS 없음') && pmValidation.includes('상태4 중 Reviewer PASS 없음'), 'PM 검증 보고서가 상태4 결함 카운터를 표시한다');
assert(pmValidation.includes('상태4 중 UE 근거 없음') && pmValidation.includes('상태4 중 Source 없음') && pmValidation.includes('상태4 중 Content 없음'), 'PM 검증 보고서가 UE/Source/Content 결함 카운터를 표시한다');
assert(pkg.includes('verify-v48-v50.js') && pkg.includes('verify:v48-v50'), 'package.json 검증 체인에 V48~V50 포함');

if (process.exitCode) {
    console.error('V48~V50 검증 실패');
    process.exit(process.exitCode);
}

console.log('V48~V50 검증 완료');
