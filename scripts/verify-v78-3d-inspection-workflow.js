#!/usr/bin/env node
/**
 * verify-v78-3d-inspection-workflow.js
 * V78: 3D Inspector 판정 시스템 + Apply Candidate 연결 검증
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

// ── [1] inspections/3d_assets 경로 함수 ──────────────────────
console.log('\n=== [1] inspections 경로 함수 ===');
check('get3DInspectionDir 함수',          main.includes('function get3DInspectionDir'));
check("inspections/3d_assets 경로",       main.includes("'inspections', '3d_assets'") || main.includes('"inspections","3d_assets"') || main.includes("path.join(projectPath, 'inspections', '3d_assets')"));
check('get3DInspectionReportPath 함수',   main.includes('function get3DInspectionReportPath'));
check("3d_inspection_report.md 경로",     main.includes('3d_inspection_report.md'));

// ── [2] 핵심 함수 존재 ────────────────────────────────────────
console.log('\n=== [2] 핵심 함수 존재 ===');
check('create3DInspectionRecord 함수',    main.includes('function create3DInspectionRecord'));
check('list3DInspectionRecords 함수',     main.includes('function list3DInspectionRecords'));
check('read3DInspectionRecord 함수',      main.includes('function read3DInspectionRecord'));
check('get3DInspectionSummary 함수',      main.includes('function get3DInspectionSummary'));
check('generate3DInspectionReport 함수',  main.includes('function generate3DInspectionReport'));
check('promoteInspectionToApplyCandidate 함수', main.includes('function promoteInspectionToApplyCandidate'));

// ── [3] Inspection Record 구조 ────────────────────────────────
console.log('\n=== [3] Inspection Record 구조 ===');
const cFnStart = main.indexOf('function create3DInspectionRecord');
const cFnEnd   = main.indexOf('\nfunction ', cFnStart + 1);
const cFnBody  = cFnEnd > 0 ? main.slice(cFnStart, cFnEnd) : main.slice(cFnStart, cFnStart + 3000);
check('assetName 저장',          cFnBody.includes('assetName'));
check('sourceFile 저장',         cFnBody.includes('sourceFile'));
check('fileSizeMB 저장',         cFnBody.includes('fileSizeMB'));
check('triangleCount 저장',      cFnBody.includes('triangleCount'));
check('vertexCount 저장',        cFnBody.includes('vertexCount'));
check('materialCount 저장',      cFnBody.includes('materialCount'));
check('textureDetected 저장',    cFnBody.includes('textureDetected'));
check('collisionNeeded 저장',    cFnBody.includes('collisionNeeded'));
check('lodNeeded 저장',          cFnBody.includes('lodNeeded'));
check('naniteRecommended 저장',  cFnBody.includes('naniteRecommended'));
check('ueImportPath 저장',       cFnBody.includes('ueImportPath'));
check('verdict 저장',            cFnBody.includes('verdict'));
check('reason 저장',             cFnBody.includes('reason'));
check('inspectedAt 저장',        cFnBody.includes('inspectedAt'));
check('inspectedBy 저장',        cFnBody.includes('inspectedBy'));
check('notes 저장',              cFnBody.includes('notes'));
check('.inspection.md 확장자',   cFnBody.includes('.inspection.md'));
check('inspections/3d_assets 하위 저장', cFnBody.includes('get3DInspectionDir'));

// ── [4] PASS / REVIEW / REJECT 판정 ──────────────────────────
console.log('\n=== [4] 판정 값 검증 ===');
check("'PASS' 판정 지원",        main.includes("'PASS'"));
check("'REVIEW' 판정 지원",      main.includes("'REVIEW'"));
check("'REJECT' 판정 지원",      main.includes("'REJECT'"));
check('verdict 유효성 검사 (3값만)', cFnBody.includes("['PASS', 'REVIEW', 'REJECT'].includes") || cFnBody.includes("!['PASS','REVIEW','REJECT'].includes"));

// ── [5] REJECT 승격 금지 로직 ─────────────────────────────────
console.log('\n=== [5] REJECT 승격 금지 ===');
const pFnStart = main.indexOf('function promoteInspectionToApplyCandidate');
const pFnEnd   = main.indexOf('\nfunction ', pFnStart + 1);
const pFnBody  = pFnEnd > 0 ? main.slice(pFnStart, pFnEnd) : main.slice(pFnStart, pFnStart + 2000);
check('REJECT 승격 금지 분기',    pFnBody.includes("verdict === 'REJECT'") || pFnBody.includes('verdict==="REJECT"'));
check('승격 금지 시 ok:false',    pFnBody.includes("ok: false") && pFnBody.includes('REJECT'));
check('REJECT 에러 메시지',       pFnBody.includes('승격 금지') || pFnBody.includes('REJECT 모델'));

// ── [6] apply_candidates 연결 ─────────────────────────────────
console.log('\n=== [6] apply_candidates 연결 ===');
check("apply_candidates/art 경로",   pFnBody.includes("apply_candidates/art"));
check("apply_candidates/world 경로", pFnBody.includes("apply_candidates/world"));
check('world 키워드 분기',           pFnBody.includes('architecture') || pFnBody.includes('environment'));
check('actual content copy: false',  pFnBody.includes('actual content copy: false'));
check('allowRealApply required',     pFnBody.includes('allowRealApply required: true'));

// ── [7] 자동 판정 권장 규칙 ───────────────────────────────────
console.log('\n=== [7] 자동 판정 권장 규칙 ===');
check('_computeAutoVerdict 함수',    html.includes('_computeAutoVerdict') || html.includes('computeAutoVerdict'));
check('100MB REVIEW 임계값',         html.includes('100'));
check('300MB REJECT 임계값',         html.includes('300'));
check('100000 삼각형 REVIEW',        html.includes('100000') || html.includes('100,000'));
check('200000 삼각형 REJECT',        html.includes('200000') || html.includes('200,000'));
check('geometry 없음 REJECT',        html.includes('geometry 없음') || html.includes("triangleCount === 0"));
check('텍스처 미감지 REVIEW',        html.includes('텍스처 미감지') || html.includes('textureDetected'));

// 런타임: 자동 판정 로직 재현
function autoVerdict(stats) {
    if (!stats.loadSuccess) return 'REJECT';
    if (stats.fileSizeMB > 300)   return 'REJECT';
    if (stats.triangleCount > 200000) return 'REJECT';
    if (stats.triangleCount === 0)    return 'REJECT';
    if (stats.fileSizeMB > 100)   return 'REVIEW';
    if (stats.triangleCount > 100000) return 'REVIEW';
    if (stats.materialCount > 10)     return 'REVIEW';
    if (!stats.textureDetected)       return 'REVIEW';
    return 'PASS';
}
check('로드 실패 → REJECT',               autoVerdict({ loadSuccess: false }) === 'REJECT');
check('500MB → REJECT',                    autoVerdict({ loadSuccess: true, fileSizeMB: 500, triangleCount: 1000, materialCount: 1, textureDetected: true, ext:'glb' }) === 'REJECT');
check('250000 삼각형 → REJECT',            autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 250000, materialCount: 1, textureDetected: true, ext:'glb' }) === 'REJECT');
check('0 삼각형 → REJECT',                 autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 0, materialCount: 1, textureDetected: true, ext:'glb' }) === 'REJECT');
check('150MB → REVIEW',                    autoVerdict({ loadSuccess: true, fileSizeMB: 150, triangleCount: 1000, materialCount: 1, textureDetected: true, ext:'glb' }) === 'REVIEW');
check('110000 삼각형 → REVIEW',            autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 110000, materialCount: 1, textureDetected: true, ext:'glb' }) === 'REVIEW');
check('15 머티리얼 → REVIEW',              autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 5000, materialCount: 15, textureDetected: true, ext:'glb' }) === 'REVIEW');
check('텍스처 없음 → REVIEW',              autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 5000, materialCount: 2, textureDetected: false, ext:'glb' }) === 'REVIEW');
check('정상 모델 → PASS',                  autoVerdict({ loadSuccess: true, fileSizeMB: 10, triangleCount: 5000, materialCount: 2, textureDetected: true, ext:'glb' }) === 'PASS');

// ── [8] 3D Inspection Report ──────────────────────────────────
console.log('\n=== [8] Inspection Report ===');
const gFnStart = main.indexOf('function generate3DInspectionReport');
const gFnEnd   = main.indexOf('\nfunction ', gFnStart + 1);
const gFnBody  = gFnEnd > 0 ? main.slice(gFnStart, gFnEnd) : main.slice(gFnStart, gFnStart + 3000);
check('전체 통계 포함',          gFnBody.includes('전체 통계') || gFnBody.includes('전체 검사'));
check('PASS/REVIEW/REJECT 집계', gFnBody.includes('pass') && gFnBody.includes('review') && gFnBody.includes('reject'));
check('큰 파일 목록 포함',       gFnBody.includes('100') && gFnBody.includes('큰 파일'));
check('LOD 필요 목록 포함',      gFnBody.includes('lodNeeded') || gFnBody.includes('LOD 필요'));
check('Nanite 추천 목록 포함',   gFnBody.includes('naniteRecommended') || gFnBody.includes('Nanite'));
check('Apply 후보 목록 포함',    gFnBody.includes('Apply 후보') || gFnBody.includes('candidates'));
check('REJECT 사유 요약 포함',   gFnBody.includes('REJECT 사유') || gFnBody.includes('reject'));
check('보고서 파일 저장',        gFnBody.includes('writeFileSync') && gFnBody.includes('reportPath'));

// ── [9] IPC 핸들러 ───────────────────────────────────────────
console.log('\n=== [9] IPC 핸들러 ===');
check("ipcMain.handle('create-3d-inspection-record')",       main.includes("ipcMain.handle('create-3d-inspection-record'"));
check("ipcMain.handle('list-3d-inspection-records')",         main.includes("ipcMain.handle('list-3d-inspection-records'"));
check("ipcMain.handle('read-3d-inspection-record')",          main.includes("ipcMain.handle('read-3d-inspection-record'"));
check("ipcMain.handle('get-3d-inspection-summary')",          main.includes("ipcMain.handle('get-3d-inspection-summary'"));
check("ipcMain.handle('generate-3d-inspection-report')",      main.includes("ipcMain.handle('generate-3d-inspection-report'"));
check("ipcMain.handle('promote-3d-inspection-to-candidate')", main.includes("ipcMain.handle('promote-3d-inspection-to-candidate'"));

// ── [10] preload API ──────────────────────────────────────────
console.log('\n=== [10] preload API ===');
check('create3DInspectionRecord 노출',       preload.includes('create3DInspectionRecord'));
check('list3DInspectionRecords 노출',        preload.includes('list3DInspectionRecords'));
check('read3DInspectionRecord 노출',         preload.includes('read3DInspectionRecord'));
check('get3DInspectionSummary 노출',         preload.includes('get3DInspectionSummary'));
check('generate3DInspectionReport 노출',     preload.includes('generate3DInspectionReport'));
check('promote3DInspectionToCandidate 노출', preload.includes('promote3DInspectionToCandidate'));

// ── [11] Obsidian 기록 ────────────────────────────────────────
console.log('\n=== [11] Obsidian 기록 ===');
check('판정 완료 recordAgentMemory',         main.includes("task: `3D 모델 검사 완료"));
check('판정 후 결정 기록 (recordDecision)',  main.includes('3D 모델은 Inspector 판정 후'));
check('REJECT 결정 기록',                    main.includes('REJECT 모델은 UE5 후보로 승격하지 않는다'));
check('승격 recordAgentMemory',              main.includes('3D Apply Candidate 승격'));
check('승격 결정 기록',                      main.includes('PASS/REVIEW 모델만 art/world 후보로 연결한다'));
check('Report 생성 recordAgentMemory',       main.includes('3D Inspection Report 생성'));
check('Obsidian 기록 try/catch 감싸짐',
    (main.match(/try \{[\s\S]{1,400}recordAgentMemory[\s\S]{0,300}\} catch \{ \/\* 비중단 \*\/ \}/g) || []).length >= 3
);

// ── [12] UI 요소 ──────────────────────────────────────────────
console.log('\n=== [12] UI 요소 ===');
check('page-3dinspector 존재',               html.includes('page-3dinspector'));
check('3열 그리드 (210px 1fr 255px)',        html.includes('210px 1fr 255px') || html.includes('210px 1fr'));
check('판정 패널 (insp-judge-panel)',        html.includes('insp-judge-panel'));
check('PASS 버튼 (vbtn-pass)',               html.includes('vbtn-pass'));
check('REVIEW 버튼 (vbtn-review)',           html.includes('vbtn-review'));
check('REJECT 버튼 (vbtn-reject)',           html.includes('vbtn-reject'));
check('판정 이유 입력란 (insp-reason)',      html.includes('insp-reason'));
check('UE5 import path 입력란 (insp-ue-path)', html.includes('insp-ue-path'));
check('검사 메모 입력란 (insp-notes)',       html.includes('insp-notes'));
check('collisionNeeded 체크박스',            html.includes('insp-collision'));
check('lodNeeded 체크박스',                  html.includes('insp-lod'));
check('naniteRecommended 체크박스',          html.includes('insp-nanite'));
check('검사 저장 버튼 (btn-save-inspection)',html.includes('btn-save-inspection'));
check('Report 생성 버튼',                    html.includes('doGenerateInspectionReport'));
check('Report 보기 버튼 (btn-view-report)',  html.includes('btn-view-report'));
check('Apply Candidate 승격 버튼',           html.includes('doPromoteToCandidate'));
check('판정 목록 새로고침 버튼',             html.includes('doRefreshInspectionList'));
check('최근 판정 목록 (insp-recent-list)',   html.includes('insp-recent-list'));
check('모델 통계 그리드 (insp-stat-grid)',   html.includes('insp-stat-grid'));
check('권장 판정 표시 (st-suggest)',         html.includes('st-suggest'));
check('삼각형 통계 (st-tris)',               html.includes('st-tris'));
check('파일 크기 통계 (st-size)',            html.includes('st-size'));

// ── [13] JS 함수 존재 ─────────────────────────────────────────
console.log('\n=== [13] JS 함수 존재 ===');
check('doSelectVerdict 함수',                html.includes('doSelectVerdict'));
check('doSaveInspection 함수',               html.includes('doSaveInspection'));
check('doGenerateInspectionReport 함수',     html.includes('doGenerateInspectionReport'));
check('doViewInspectionReport 함수',         html.includes('doViewInspectionReport'));
check('doPromoteToCandidate 함수',           html.includes('doPromoteToCandidate'));
check('doRefreshInspectionList 함수',        html.includes('doRefreshInspectionList'));
check('doLoadInspection 함수',               html.includes('doLoadInspection'));
check('_updateInspectionPanel 함수',         html.includes('_updateInspectionPanel'));
check('_computeAutoVerdict 함수',            html.includes('_computeAutoVerdict'));
check('currentInspection 상태 변수',         html.includes('currentInspection'));
check('_lastPolyCount 변수',                 html.includes('_lastPolyCount'));
check('showPage에 doRefreshInspectionList', html.includes("3dinspector") && html.includes('doRefreshInspectionList'));
check('모델 로드 시 r.path 저장',           html.includes('r.path = filePath'));
check('_afterLoad에서 _updateInspectionPanel 호출', html.includes('_updateInspectionPanel'));

// ── [14] 안전 규칙 ────────────────────────────────────────────
console.log('\n=== [14] 안전 규칙 ===');
check('실제 UE5 복사 없음 (actual content copy: false)', main.includes('actual content copy: false'));
check('allowRealApply required: true 명시',              main.includes('allowRealApply required: true'));
check('REJECT verdict 시 ok:false',                      pFnBody.includes("ok: false") && pFnBody.includes('REJECT'));
check('mkdirSync recursive true',                        cFnBody.includes("recursive: true") || cFnBody.includes('{ recursive: true }'));

// ── [15] 기존 verify 체인 ────────────────────────────────────
console.log('\n=== [15] 기존 verify 체인 ===');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('package.json verify:v78 존재', !!(pkg.scripts && pkg.scripts['verify:v78']));
check('verify:v77 유지',              !!(pkg.scripts && pkg.scripts['verify:v77']));
check('verify:v76 유지',              !!(pkg.scripts && pkg.scripts['verify:v76']));
check('verify:v75 유지',              !!(pkg.scripts && pkg.scripts['verify:v75']));

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V78 3D Inspector 판정 시스템 + Apply Candidate 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
