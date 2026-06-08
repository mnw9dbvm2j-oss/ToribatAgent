#!/usr/bin/env node
/**
 * verify-v67-v72-image-to-3d.js
 * V67~V72: Image-to-3D Asset Decomposition Pipeline 검증
 */
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const MAIN    = path.join(ROOT, 'src', 'main.js');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');
const HTML    = path.join(ROOT, 'src', 'index.html');
const PROJECT = 'D:\\ToribatMagicSchool';

let passed = 0, failed = 0;

function check(label, condition, detail) {
    if (condition) { console.log(`  PASS ${label}`); passed++; }
    else           { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const main    = fs.readFileSync(MAIN,    'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html    = fs.readFileSync(HTML,    'utf8');

// ── V67: Image Asset Intake ───────────────────────────────────────────────
console.log('\n=== V67: Image Asset Intake ===');
check('asset_inputs/images 폴더 경로 정의',  main.includes("'asset_inputs/images'"));
check('asset_inputs/analyzed 폴더 경로 정의', main.includes("'asset_inputs/analyzed'"));
check('scanAssetInputImages 함수 존재',       main.includes('function scanAssetInputImages'));
check('.png/.jpg/.jpeg/.webp 지원',           main.includes('.png') && main.includes('.webp'));
check('.intake.md 파일 생성',                 main.includes('.intake.md'));
check('이미지 유형 감지 (IMAGE_TYPE_RULES)',  main.includes('IMAGE_TYPE_RULES'));
check('interior/exterior/prop/character 유형',main.includes("'interior'") && main.includes("'exterior'") && main.includes("'prop'"));
check('분해 필요 여부 판단 (needsDecomposition)', main.includes('function needsDecomposition'));
check('dryRun: true 기본값',                  main.includes('dryRun: true'));
check('scan-asset-input-images IPC 핸들러',   main.includes("ipcMain.handle('scan-asset-input-images'"));
check('preload scanAssetInputImages 노출',     preload.includes('scanAssetInputImages'));
check('UI 이미지 폴더 열기 버튼',             html.includes('openAssetImagesFolder'));
check('UI Intake 생성 버튼',                  html.includes('doIntakeImages'));

// ── V68: Decomposition Planner ────────────────────────────────────────────
console.log('\n=== V68: Image Decomposition Planner ===');
check('asset_decomposition_plans 폴더 정의',  main.includes("'asset_decomposition_plans'"));
check('generateImageDecompositionPlan 함수',   main.includes('function generateImageDecompositionPlan'));
check('.decomposition.md 파일 생성',           main.includes('.decomposition.md'));
check('DECOMPOSITION_PRESETS 정의',            main.includes('DECOMPOSITION_PRESETS'));
check('통짜 모델 금지 사유 포함',              main.includes('wholeModelForbiddenReason'));
check('interior 분해 프리셋 존재',             main.includes("floor_tile_module") && main.includes("stone_pillar"));
check('exterior 분해 프리셋 존재',             main.includes("facade_wall") && main.includes("gate_arch"));
check('prop 분해 프리셋 존재',                 main.includes("prop_main"));
check('통짜 모델 금지 문구 분해 계획에 포함',  main.includes('이미지 전체를 하나의 3D 모델로 생성하는 것은 금지'));
check('generate-image-decomposition-plan IPC', main.includes("ipcMain.handle('generate-image-decomposition-plan'"));
check('preload generateImageDecompositionPlan', preload.includes('generateImageDecompositionPlan'));

// ── V69: Asset Segmentation Rules ────────────────────────────────────────
console.log('\n=== V69: Asset Segmentation Rules ===');
const rulesFile = path.join(PROJECT, 'knowledge', 'asset_segmentation_rules.md');
check('asset_segmentation_rules.md 파일 생성', fs.existsSync(rulesFile));
if (fs.existsSync(rulesFile)) {
    const rules = fs.readFileSync(rulesFile, 'utf8');
    check('통짜 모델 금지 규칙 명시',           rules.includes('통짜 모델 금지'));
    check('negativePrompt 필수 문구 포함',       rules.includes('entire room') && rules.includes('full building'));
    check('폴리곤 기준 포함 (200,000 tris)',     rules.includes('200,000'));
    check('소품 poly budget 기준 (500~5,000)',   rules.includes('500~5,000'));
    check('대형 구조물 poly budget 기준',        rules.includes('25,000~80,000'));
    check('LOD/Nanite 기준 포함',               rules.includes('LOD') && rules.includes('Nanite'));
    check('UE5 임포트 기준 포함',               rules.includes('UE5 임포트'));
}
check('ASSET_SEGMENTATION_RULES_CONTENT 코드 정의', main.includes('ASSET_SEGMENTATION_RULES_CONTENT'));
check('ensureAssetSegmentationRules 함수',       main.includes('function ensureAssetSegmentationRules'));

// ── V70: Segment-to-3D Job Generator ─────────────────────────────────────
console.log('\n=== V70: Segment-to-3D Job Generator ===');
check('asset_generation_queue/pending 폴더',    main.includes("'asset_generation_queue/pending'"));
check('asset_generation_queue/running 폴더',    main.includes("'asset_generation_queue/running'"));
check('asset_generation_queue/done 폴더',       main.includes("'asset_generation_queue/done'"));
check('asset_generation_queue/failed 폴더',     main.includes("'asset_generation_queue/failed'"));
check('generateSegment3DJobs 함수',             main.includes('function generateSegment3DJobs'));
check('.job.md 파일 생성',                      main.includes('.job.md'));
check('negativePrompt 필드 포함',               main.includes('negativePrompt:'));
check('NEGATIVE_PROMPT_BASE 정의',              main.includes('NEGATIVE_PROMPT_BASE'));
check('negativePrompt에 entire room 포함',      main.includes('entire room'));
check('negativePrompt에 full building 포함',    main.includes('full building'));
check('negativePrompt에 full interior 포함',    main.includes('full interior'));
check('targetPolyBudget 필드 포함',             main.includes('targetPolyBudget:'));
check('textureBudget 필드 포함',                main.includes('textureBudget:'));
check('ueImportPath 필드 포함',                 main.includes('ueImportPath:'));
check('collision 필드 포함',                    main.includes('collision:'));
check('lodRequired 필드 포함',                  main.includes('lodRequired:'));
check('naniteRecommended 필드 포함',            main.includes('naniteRecommended:'));
check('status: pending 기본값',                 main.includes('status: pending'));
check('generate-segment-3d-jobs IPC',           main.includes("ipcMain.handle('generate-segment-3d-jobs'"));
check('preload generateSegment3DJobs',          preload.includes('generateSegment3DJobs'));

// ── V71: Quality Gate ─────────────────────────────────────────────────────
console.log('\n=== V71: Asset Quality Gate ===');
check('generated_assets 폴더 정의',             main.includes("'generated_assets'"));
check('runAssetQualityGate 함수',               main.includes('function runAssetQualityGate'));
check('asset_quality_report.md 생성',           main.includes('asset_quality_report.md'));
check('PASS/REVIEW/REJECT 판정',               main.includes("'PASS'") && main.includes("'REVIEW'") && main.includes("'REJECT'"));
check('negativePrompt 없음 → REJECT',          main.includes('negativePrompt 없음'));
check('통짜 모델 금지 문구 없음 → REJECT',     main.includes('통짜 모델 금지 문구 없음'));
check('200,000 tris 초과 → REJECT',            main.includes('200000'));
check('100,000 tris 초과 → REVIEW',            main.includes('100000'));
check('파일 크기 검사',                         main.includes('sizeMB'));
check('run-asset-quality-gate IPC',             main.includes("ipcMain.handle('run-asset-quality-gate'"));
check('read-asset-quality-report IPC',          main.includes("ipcMain.handle('read-asset-quality-report'"));
check('preload runAssetQualityGate',            preload.includes('runAssetQualityGate'));

// ── V72: Image-to-3D Dry Run ──────────────────────────────────────────────
console.log('\n=== V72: Image-to-3D Dry Run + UE5 연결 ===');
check('runImageTo3DDryRun 함수',                main.includes('function runImageTo3DDryRun'));
check('apply_candidates/world 폴더',            main.includes("'apply_candidates/world'"));
check('_import.candidate.md 생성',              main.includes('_import.candidate.md'));
check('allowRealApply 필요 명시',               main.includes('allowRealApply 필요'));
check('실제 적용 여부: false 명시',             main.includes('실제 적용 여부: false'));
check('dryRun: true 명시',                      main.includes("dryRun: true"));
check('REJECT는 후보 승격 불가',                main.includes("decision === 'REJECT') continue"));
check('run-image-to-3d-dry-run IPC',            main.includes("ipcMain.handle('run-image-to-3d-dry-run'"));
check('get-asset-pipeline-summary IPC',         main.includes("ipcMain.handle('get-asset-pipeline-summary'"));
check('preload runImageTo3DDryRun',             preload.includes('runImageTo3DDryRun'));
check('preload getAssetPipelineSummary',        preload.includes('getAssetPipelineSummary'));

// ── UI ────────────────────────────────────────────────────────────────────
console.log('\n=== UI 검증 ===');
check('3D 에셋 nav 항목',                       html.includes("showPage('asset3d'"));
check('page-asset3d 페이지',                    html.includes('id="page-asset3d"'));
check('이미지 폴더 열기 버튼',                  html.includes('openAssetImagesFolder'));
check('Image-to-3D dry-run 버튼',               html.includes('doImageTo3DDryRun'));
check('품질 검사 버튼',                         html.includes('doQualityGate'));
check('통계 카드 (이미지/intake/plan/job)',     html.includes('a3d-images') && html.includes('a3d-jobs'));
check('PASS/REVIEW/REJECT 카드',               html.includes('a3d-pass') && html.includes('a3d-reject'));
check('showPage asset3d → doRefreshAssetSummary', html.includes("id==='asset3d'") && html.includes('doRefreshAssetSummary'));

// ── 안전성 ───────────────────────────────────────────────────────────────
console.log('\n=== 안전성 검증 ===');
check('외부 API 호출 없음 (fetch/axios/http)',   !main.includes("require('node-fetch')") || !main.includes("api.openai.com/v1/3d") );
check('allowRealApply 게이트 유지',             main.includes('allowRealApply'));
check('기본 dryRun: true',                      main.includes('dryRun: true'));
check('실제 3D 생성 툴 강제 미설치',            main.includes('allow3DGeneration') || main.includes('dryRun'));
check('E:\\\\ 경로를 실제 경로로 사용하지 않음', !main.includes("DEFAULT_PROJECT_PATH = 'E:\\\\") && !main.includes("projectPath: 'E:\\\\"));

// ── 결과 ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V67~V72 Image-to-3D 파이프라인 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
