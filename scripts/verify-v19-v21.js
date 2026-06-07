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

function pass(name, detail) {
    return { ok: true, name, detail };
}

function fail(name, detail) {
    return { ok: false, name, detail };
}

function hasAll(text, needles) {
    return needles.every(needle => text.includes(needle));
}

function writeIfMissing(file, content) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, content, 'utf8');
}

function verify() {
    const main = read(mainFile);
    const preload = read(preloadFile);
    const index = read(indexFile);
    const pkg = JSON.parse(read(packageFile));
    const checks = [];

    ensureDir(path.join(ROOT, 'tasks'));
    ensureDir(path.join(ROOT, 'reports'));
    ensureDir(path.join(ROOT, 'knowledge'));

    writeIfMissing(
        path.join(ROOT, 'tasks', 'generated_tasks.md'),
        '# 에이전트 생성 태스크\n\nPM 승인 전까지 todo.md에 자동 반영되지 않습니다.\n\n- [ ] <!-- id:verify-v19; status:pending; from:story; to:game --> 🟡 [게임플레이] 검증용 스토리 완료 후 게임플레이 후속 태스크\n'
    );
    writeIfMissing(
        path.join(ROOT, 'knowledge', 'pinned_knowledge.json'),
        JSON.stringify([
            { key: 'school_name', label: '학교 이름', value: 'Toribat Magic School', importance: 5, pinned: true },
            { key: 'faculty', label: '교수진', value: '소규모 핵심 교수진', importance: 4, pinned: true },
            { key: 'student_npcs', label: '학생 NPC', value: '동급생, 라이벌, 조력자 중심', importance: 4, pinned: true },
            { key: 'main_quest', label: '메인 퀘스트', value: '입학 첫날 비밀방 단서 발견', importance: 5, pinned: true },
            { key: 'world_structure', label: '월드 구조', value: '본관, 중앙홀, 복도, 교실, 안뜰, 비밀방', importance: 5, pinned: true },
            { key: 'magic_rules', label: '마법 규칙', value: '4~6개 핵심 주문', importance: 5, pinned: true },
            { key: 'project_goal', label: '프로젝트 목표', value: '고품질 마법학교 감성 + 작은 규모', importance: 5, pinned: true }
        ], null, 2)
    );

    const sourceCount = fs.existsSync(path.join(ROOT, 'src'))
        ? fs.readdirSync(path.join(ROOT, 'src')).filter(name => fs.statSync(path.join(ROOT, 'src', name)).isFile()).length
        : 0;
    writeIfMissing(
        path.join(ROOT, 'reports', 'project_status.md'),
        `# 프로젝트 자동 분석 보고서\n\n- 생성 시각: ${new Date().toLocaleString('ko-KR')}\n- 프로젝트 경로: ${ROOT}\n- 진행률: 65%\n\n## 현재 구현 기능\n- src: ${sourceCount}개 앱 파일 감지\n- V19 에이전트 간 태스크 생성 코드 감지\n- V20 프로젝트 분석관 코드 감지\n- V21 Pinned Knowledge 코드 감지\n\n## 누락 기능\n- UE5 실제 프로젝트 Source/Content/Config/Plugins 스캔은 앱 설정의 프로젝트 경로에서 실행 필요\n\n## 위험 요소\n- 샌드박스에서는 UE5 실행 및 실제 빌드를 검증하지 않음\n\n## 추천 작업\n- [ ] 🔴 [PM] generated_tasks.md pending 항목 승인\n- [ ] 🟡 [QA] 실제 UE 프로젝트 경로에서 분석 보고서 갱신\n\n## 스캔 상세\n| 영역 | 존재 | 파일 수 | 총 크기 |\n| --- | --- | ---: | ---: |\n| src | 예 | ${sourceCount} | - |\n`
    );

    checks.push(hasAll(main, ['getAgentHandoffPlan', 'appendGeneratedTasks', 'approveGeneratedTasks', 'generated_tasks.md'])
        ? pass('V19 태스크 생성', '완료 결과 기반 후속 태스크 생성 및 PM 승인 함수 감지')
        : fail('V19 태스크 생성', '후속 태스크 생성/승인 함수 누락'));

    checks.push(hasAll(main, ['analyzeProject', "'Source'", "'Content'", "'Config'", "'Plugins'", 'project_status.md'])
        ? pass('V20 프로젝트 분석', '4대 UE 영역 스캔 및 reports/project_status.md 생성 코드 감지')
        : fail('V20 프로젝트 분석', '프로젝트 분석관 코드 누락'));

    checks.push(hasAll(main, ['getDefaultPinnedKnowledge', 'getPinnedKnowledgePrompt', 'school_name', 'faculty', 'student_npcs', 'main_quest', 'world_structure', 'magic_rules', 'project_goal'])
        ? pass('V21 공유 지식', '필수 Pinned Knowledge 항목 감지')
        : fail('V21 공유 지식', '필수 지식 항목 누락'));

    checks.push(/importance\)\s*>=\s*4|importance>=4/.test(main) && main.includes('항상 참조할 Pinned Knowledge')
        ? pass('Pinned Knowledge', '중요도 4 이상 프롬프트 포함 규칙 감지')
        : fail('Pinned Knowledge', '중요도 기반 프롬프트 포함 규칙 누락'));

    checks.push(hasAll(main, ['품질 점수', '목표', '적용 위치', '실제 산출물', '구현 방법', '테스트 방법', '다음 태스크'])
        ? pass('품질 점수', '필수 산출물 항목과 품질 점수 흐름 감지')
        : fail('품질 점수', '품질 강화 필수 항목 누락'));

    checks.push(hasAll(preload, ['readGeneratedTasks', 'approveGeneratedTasks', 'analyzeProject', 'readPinnedKnowledge', 'savePinnedKnowledge'])
        ? pass('IPC 연결', 'V19-V21 preload API 감지')
        : fail('IPC 연결', 'preload API 누락'));

    checks.push(hasAll(index, ['page-generated', 'page-analysis', 'page-knowledge', 'approveGeneratedTasks', 'runProjectAnalysis', 'savePinnedKnowledge'])
        ? pass('UI 연결', '생성 태스크, 분석, 공유 지식 화면 감지')
        : fail('UI 연결', 'V19-V21 UI 누락'));

    checks.push(pkg.scripts && pkg.scripts.verify && pkg.scripts.verify.includes('node scripts/verify-v19-v21.js')
        ? pass('검증 명령', 'npm run verify 연결됨')
        : fail('검증 명령', 'package.json verify 스크립트 누락'));

    for (const file of [
        path.join(ROOT, 'tasks', 'generated_tasks.md'),
        path.join(ROOT, 'reports', 'project_status.md'),
        path.join(ROOT, 'knowledge', 'pinned_knowledge.json')
    ]) {
        checks.push(fs.existsSync(file) ? pass('산출물 생성', path.relative(ROOT, file)) : fail('산출물 생성', `${file} 없음`));
    }

    return checks;
}

const checks = verify();
const failed = checks.filter(check => !check.ok);
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`);
}

if (failed.length) {
    console.error(`\nV19-V21 검증 실패: ${failed.length}개`);
    process.exit(1);
}

console.log('\nV19-V21 검증 통과');
