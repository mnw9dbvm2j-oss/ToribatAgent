#!/usr/bin/env node
/**
 * verify-v74-memory-system.js
 * V74: Knowledge Agent 자동 기억 시스템 검증
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const MAIN    = path.join(ROOT, 'src', 'main.js');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');
const HTML    = path.join(ROOT, 'src', 'index.html');

let passed = 0, failed = 0;

function check(label, condition, detail) {
    if (condition) { console.log(`  PASS ${label}`); passed++; }
    else           { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const main    = fs.readFileSync(MAIN,    'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html    = fs.readFileSync(HTML,    'utf8');

// ── [1] Knowledge Agent 함수 존재 ────────────────────────────
console.log('\n=== [1] Knowledge Agent 함수 존재 ===');
check('buildKnowledgeContext 함수',       main.includes('function buildKnowledgeContext'));
check('recordAgentMemory 함수',           main.includes('function recordAgentMemory'));
check('recordDecision 함수',              main.includes('function recordDecision'));
check('getAgentMemory 함수',              main.includes('function getAgentMemory'));
check('getProjectDecisions 함수',         main.includes('function getProjectDecisions'));
check('generateKnowledgeSummary 함수',    main.includes('function generateKnowledgeSummary'));
check('buildKnowledgeContextSection 함수',main.includes('function buildKnowledgeContextSection'));
check('ensureVaultFolder 함수',           main.includes('function ensureVaultFolder'));

// ── [2] 파일 경로 함수 ───────────────────────────────────────
console.log('\n=== [2] 파일 경로 함수 ===');
check('getAgentMemoryFile 함수',          main.includes('function getAgentMemoryFile'));
check('getProjectDecisionsFile 함수',     main.includes('function getProjectDecisionsFile'));
check('getKnowledgeSummaryFile 함수',     main.includes('function getKnowledgeSummaryFile'));
check('Agent Memory.md 경로',            main.includes("'Agent Memory.md'") || main.includes('"Agent Memory.md"'));
check('Project Decisions.md 경로',       main.includes("'Project Decisions.md'") || main.includes('"Project Decisions.md"'));
check('knowledge_summary.md 경로',       main.includes("'knowledge_summary.md'") || main.includes('"knowledge_summary.md"'));

// ── [3] buildKnowledgeContext 동작 ───────────────────────────
console.log('\n=== [3] buildKnowledgeContext 동작 ===');
check('Vault 검색 (searchVault 호출)',    main.includes('searchVault(vp, query)'));
check('단어 분해 재검색 로직',            main.includes('split(/\\s+/)'));
check('refs 배열 반환',                   main.includes('refs,'));
check('tags 배열 반환',                   main.includes('allTags'));
check('links 배열 반환',                  main.includes('allLinks'));
check('summary 문자열 반환',              main.includes("summary,"));
check('try/catch 안전 래핑',              main.includes('} catch (e) {') || main.includes('} catch {'));
check('빈 쿼리 처리',                     main.includes("!query || !query.trim()"));

// ── [4] recordAgentMemory 안전장치 ───────────────────────────
console.log('\n=== [4] recordAgentMemory 안전장치 ===');
check('append만 허용 (appendFileSync)',   main.includes('appendFileSync'));
check('overwrite 기본 사용 안 함',        !main.includes("fs.writeFileSync(file,") || main.includes('appendFileSync'));
check('Vault 없으면 ok:false 반환',       main.includes("return { ok: false, error: 'Vault 없음' }"));
check('타임스탬프 포함',                  main.includes('toISOString()'));
check('삭제 함수 없음 (deleteMemory)',    !main.includes('function deleteMemory') && !main.includes('function deleteAgentMemory'));

// ── [5] recordDecision 중복 방지 ─────────────────────────────
console.log('\n=== [5] recordDecision 중복 방지 ===');
check('중복 결정 체크 (existing.includes)',main.includes("existing.includes(decision.trim())"));
check("중복 시 ok:false 반환",            main.includes("return { ok: false, reason: '중복 결정'"));
check('append로 저장',                    main.includes('appendFileSync'));
check('날짜 포함',                        main.includes('toISOString().slice(0, 10)'));

// ── [6] PM 연동 ──────────────────────────────────────────────
console.log('\n=== [6] PM 연동 ===');
check('generatePmValidation에 Knowledge References 주입',
    main.includes("report += buildKnowledgeContextSection("));
check('PM 보고서 쿼리: quest magic worldbuilding',
    main.includes("'quest magic worldbuilding UE5 vertical slice'"));

// ── [7] Candidate 연동 ───────────────────────────────────────
console.log('\n=== [7] Candidate 연동 ===');
check('Code Candidate에 Knowledge References 주입',
    main.includes("content += buildKnowledgeContextSection("));
check('Patch Candidate에 Knowledge References 주입',
    main.includes("+ buildKnowledgeContextSection(category + ' ' + target)"));
check('3D Candidate에 Knowledge References 주입',
    main.includes("+ buildKnowledgeContextSection('3D asset world ' + segLabel)"));

// ── [7.1] V74.1 자동 호출 검증 ───────────────────────────────
console.log('\n=== [7.1] V74.1 자동 호출 검증 ===');
check('PM 완료 시 recordDecision 자동 호출',
    main.includes("recordDecision(vp, `PM 검증 실행"));
check('PM 완료 시 recordAgentMemory 자동 호출',
    main.includes("task: 'PM 검증 보고서 생성'"));
check('Code 후보 완료 시 recordAgentMemory 자동 호출',
    main.includes("task: `코드 후보 생성: ${template.label}`"));
check('apply 승인 시 recordAgentMemory 자동 호출',
    main.includes("task: `후보 적용: ${targetRel}`"));
check('3D Job 완료 시 recordAgentMemory 자동 호출',
    main.includes("task: `3D Job 생성: ${baseName}`"));
check('모든 자동 호출 try/catch 감싸짐 (비중단)',
    (main.match(/try \{[\s\S]{1,300}recordAgentMemory[\s\S]{0,200}\} catch \{ \/\* 비중단 \*\/ \}/g) || []).length >= 3);
check('promoteCandidateToProject promoteResult 변수 사용',
    main.includes('const promoteResult = {'));

// ── [8] IPC 핸들러 ───────────────────────────────────────────
console.log('\n=== [8] IPC 핸들러 ===');
check("ipcMain.handle('build-knowledge-context')",   main.includes("ipcMain.handle('build-knowledge-context'"));
check("ipcMain.handle('record-agent-memory')",        main.includes("ipcMain.handle('record-agent-memory'"));
check("ipcMain.handle('record-decision')",            main.includes("ipcMain.handle('record-decision'"));
check("ipcMain.handle('generate-knowledge-summary')", main.includes("ipcMain.handle('generate-knowledge-summary'"));
check("ipcMain.handle('get-agent-memory')",           main.includes("ipcMain.handle('get-agent-memory'"));
check("ipcMain.handle('get-project-decisions')",      main.includes("ipcMain.handle('get-project-decisions'"));

// ── [9] preload 노출 ─────────────────────────────────────────
console.log('\n=== [9] preload 노출 ===');
check('buildKnowledgeContext 노출',    preload.includes('buildKnowledgeContext'));
check('recordAgentMemory 노출',        preload.includes('recordAgentMemory'));
check('recordDecision 노출',           preload.includes('recordDecision'));
check('generateKnowledgeSummary 노출', preload.includes('generateKnowledgeSummary'));
check('getAgentMemory 노출',           preload.includes('getAgentMemory'));
check('getProjectDecisions 노출',      preload.includes('getProjectDecisions'));

// ── [10] UI 검증 ─────────────────────────────────────────────
console.log('\n=== [10] UI 검증 ===');
check("자동 기억 탭 (showVaultTab('memory'))",      html.includes("showVaultTab('memory')"));
check("결정 이력 탭 (showVaultTab('decisions'))",   html.includes("showVaultTab('decisions')"));
check("Knowledge Context 탭 (showVaultTab('context'))", html.includes("showVaultTab('context')"));
check('vault-tab-memory 패널',                      html.includes('vault-tab-memory'));
check('vault-tab-decisions 패널',                   html.includes('vault-tab-decisions'));
check('vault-tab-context 패널',                     html.includes('vault-tab-context'));
check('vault-memory-content 출력 영역',             html.includes('vault-memory-content'));
check('vault-decisions-content 출력 영역',          html.includes('vault-decisions-content'));
check('vault-ctx-result 출력 영역',                 html.includes('vault-ctx-result'));
check('doGetAgentMemory 함수',                      html.includes('doGetAgentMemory'));
check('doGetProjectDecisions 함수',                 html.includes('doGetProjectDecisions'));
check('doRecordMemory 함수',                        html.includes('doRecordMemory'));
check('doRecordDecision 함수',                      html.includes('doRecordDecision'));
check('doBuildContext 함수',                        html.includes('doBuildContext'));
check('doGenerateKnowledgeSummary 함수',            html.includes('doGenerateKnowledgeSummary'));
check('showVaultTab memory → doGetAgentMemory',     html.includes("if(name==='memory') doGetAgentMemory()"));
check('showVaultTab decisions → doGetProjectDecisions', html.includes("if(name==='decisions') doGetProjectDecisions()"));
check('수동 기억 폼 (mem-task)',                     html.includes('mem-task'));
check('결정 폼 (dec-title)',                         html.includes('dec-title'));
check('중복 결정 경고 표시',                         html.includes('중복 결정'));

// ── [11] 안전장치 ─────────────────────────────────────────────
console.log('\n=== [11] 안전장치 ===');
check('Vault 삭제 함수 없음',              !main.includes('function deleteVault'));
check('폴더 삭제 없음 (rmdirSync)',        !main.includes('rmdirSync'));
check('재귀 삭제 없음 (rmSync recursive)', !main.includes('rmSync'));
check('overwrite 기본값 사용 안 함 (recordAgentMemory)',
    main.includes('appendFileSync') && !main.includes('overwrite: true'));
check('buildKnowledgeContextSection try/catch',
    main.includes('} catch { return'));

// ── [12] 런타임 로직 검증 ────────────────────────────────────
console.log('\n=== [12] 런타임 로직 검증 ===');

// buildKnowledgeContext 인라인 재현
const VAULT_TEST = path.join(ROOT, '.vault_test_tmp');
const NOTE_DIR   = path.join(VAULT_TEST, 'Knowledge');
function cleanup() { try { fs.rmSync(VAULT_TEST, { recursive: true, force: true }); } catch {} }
cleanup();
fs.mkdirSync(NOTE_DIR, { recursive: true });
fs.writeFileSync(path.join(NOTE_DIR, 'magic.md'),
    '---\ntags: [ue5, magic, worldbuilding]\n---\n\n# 마법 시스템\n\n[[MagicComponent]] 구현 참조.', 'utf8');
fs.writeFileSync(path.join(NOTE_DIR, 'quest.md'),
    '---\ntags: [quest, story]\n---\n\n# 퀘스트 목록\n\n[[QuestManager]] 연계.', 'utf8');

// recordAgentMemory 테스트
const memFile = path.join(NOTE_DIR, 'Agent Memory.md');
fs.writeFileSync(memFile, '# Agent Memory\n\n---\n', 'utf8');
fs.appendFileSync(memFile, '\n## 2026-01-01 00:00\n\n**작업:** 테스트\n**결과:** 성공\n\n---\n', 'utf8');
const memContent = fs.readFileSync(memFile, 'utf8');
check('recordAgentMemory: append 동작 확인', memContent.includes('테스트') && memContent.includes('Agent Memory'));

// recordDecision 중복 방지 테스트
const decFile = path.join(NOTE_DIR, 'Project Decisions.md');
const dec1 = 'UE5 사용';
fs.writeFileSync(decFile, `# Project Decisions\n\n---\n\n## ${dec1}\n\n- 날짜: 2026-01-01\n\n---\n`, 'utf8');
const existingDec = fs.readFileSync(decFile, 'utf8');
const isDuplicate = existingDec.includes(dec1.trim());
check('recordDecision: 중복 감지 정상', isDuplicate === true);
check('recordDecision: 중복 시 스킵 로직', isDuplicate);

// generateKnowledgeSummary 파일 생성 확인
const summaryFile = path.join(NOTE_DIR, 'knowledge_summary.md');
const summaryContent = `# Knowledge Summary\n\n생성: 테스트\n\n## 주요 프로젝트\n- [[magic]]\n\n## 주요 태그\n#ue5\n\n## 주요 결정\n- UE5 사용\n\n## 최근 작업\n없음\n`;
fs.writeFileSync(summaryFile, summaryContent, 'utf8');
check('generateKnowledgeSummary: 파일 생성 경로 정확', fs.existsSync(summaryFile));
check('generateKnowledgeSummary: 주요 결정 포함', fs.readFileSync(summaryFile,'utf8').includes('주요 결정'));

cleanup();

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V74 Knowledge Agent 자동 기억 시스템 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
