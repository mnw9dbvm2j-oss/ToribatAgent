#!/usr/bin/env node
/**
 * verify-v76-free-local-3d-generator.js
 * V76: 무료 로컬 3D 생성 AI Manager 검증
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const MAIN    = path.join(ROOT, 'src', 'main.js');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');
const HTML    = path.join(ROOT, 'src', 'index.html');
const CONFIG  = path.join(ROOT, 'asset_generator.config.json');

let passed = 0, failed = 0;

function check(label, condition, detail) {
    if (condition) { console.log(`  PASS ${label}`); passed++; }
    else           { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const main    = fs.readFileSync(MAIN,    'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html    = fs.readFileSync(HTML,    'utf8');

// ── [1] asset_generator.config.json ─────────────────────────
console.log('\n=== [1] asset_generator.config.json ===');
check('파일 존재', fs.existsSync(CONFIG));

let cfg = {};
if (fs.existsSync(CONFIG)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
}
check('enabled=false 기본값',             cfg.enabled === false);
check('dryRun=true 기본값',               cfg.dryRun === true);
check('allowExternalPaidApi=false 기본값',cfg.allowExternalPaidApi === false);
check('defaultProvider 필드 존재',        cfg.defaultProvider !== undefined);
check('providers 객체 존재',              typeof cfg.providers === 'object');
check('providers.hunyuan3d 존재',         !!(cfg.providers && cfg.providers.hunyuan3d));
check('providers.trellis 존재',           !!(cfg.providers && cfg.providers.trellis));
check('providers.stableFast3D 존재',      !!(cfg.providers && cfg.providers.stableFast3D));
check('providers.blender 존재',           !!(cfg.providers && cfg.providers.blender));
check('allowedOutputFormats 배열 존재',   Array.isArray(cfg.allowedOutputFormats));
check('maxFileSizeMBWarning 존재',        cfg.maxFileSizeMBWarning !== undefined);
check('maxFileSizeMBReject 존재',         cfg.maxFileSizeMBReject  !== undefined);
check('outputDir 존재',                   typeof cfg.outputDir === 'string');

// provider 기본값 검증
for (const key of ['hunyuan3d', 'trellis', 'stableFast3D', 'blender']) {
    const p = cfg.providers && cfg.providers[key];
    check(`${key}.enabled=false`, p && p.enabled === false);
}

// ── [2] main.js 함수 존재 ─────────────────────────────────────
console.log('\n=== [2] main.js 함수 존재 ===');
check('loadAssetGeneratorConfig 함수',    main.includes('function loadAssetGeneratorConfig'));
check('saveAssetGeneratorConfig 함수',    main.includes('function saveAssetGeneratorConfig'));
check('getAssetGeneratorStatus 함수',     main.includes('function getAssetGeneratorStatus'));
check('build3DGenerationCommand 함수',    main.includes('function build3DGenerationCommand'));
check('runLocal3DGenerator 함수',         main.includes('function runLocal3DGenerator'));
check('detectGenerated3DAssets 함수',     main.includes('function detectGenerated3DAssets'));
check('write3DGenerationLog 함수',        main.includes('function write3DGenerationLog'));
check('moveGenerationJobToDone 함수',     main.includes('function moveGenerationJobToDone'));
check('moveGenerationJobToFailed 함수',   main.includes('function moveGenerationJobToFailed'));
check('dryRun3DGeneration 함수',          main.includes('function dryRun3DGeneration'));

// ── [3] IPC 핸들러 ────────────────────────────────────────────
console.log('\n=== [3] IPC 핸들러 ===');
check("ipcMain.handle('load-asset-generator-config')",  main.includes("ipcMain.handle('load-asset-generator-config'"));
check("ipcMain.handle('save-asset-generator-config')",  main.includes("ipcMain.handle('save-asset-generator-config'"));
check("ipcMain.handle('get-asset-generator-status')",   main.includes("ipcMain.handle('get-asset-generator-status'"));
check("ipcMain.handle('build-3d-generation-command')",  main.includes("ipcMain.handle('build-3d-generation-command'"));
check("ipcMain.handle('run-local-3d-generator')",       main.includes("ipcMain.handle('run-local-3d-generator'"));
check("ipcMain.handle('detect-generated-3d-assets')",   main.includes("ipcMain.handle('detect-generated-3d-assets'"));
check("ipcMain.handle('write-3d-generation-log')",      main.includes("ipcMain.handle('write-3d-generation-log'"));
check("ipcMain.handle('dry-run-3d-generation')",        main.includes("ipcMain.handle('dry-run-3d-generation'"));

// ── [4] preload 노출 ──────────────────────────────────────────
console.log('\n=== [4] preload 노출 ===');
check('loadAssetGeneratorConfig 노출',  preload.includes('loadAssetGeneratorConfig'));
check('saveAssetGeneratorConfig 노출',  preload.includes('saveAssetGeneratorConfig'));
check('getAssetGeneratorStatus 노출',   preload.includes('getAssetGeneratorStatus'));
check('build3DGenerationCommand 노출',  preload.includes('build3DGenerationCommand'));
check('runLocal3DGenerator 노출',       preload.includes('runLocal3DGenerator'));
check('detectGenerated3DAssets 노출',   preload.includes('detectGenerated3DAssets'));
check('write3DGenerationLog 노출',      preload.includes('write3DGenerationLog'));
check('dryRun3DGeneration 노출',        preload.includes('dryRun3DGeneration'));

// ── [5] 안전장치 — dryRun일 때 spawn 호출 없음 ────────────────
console.log('\n=== [5] 안전장치 — dryRun / enabled 검사 ===');

// runLocal3DGenerator 함수 본문 추출
const runFnStart = main.indexOf('function runLocal3DGenerator');
const runFnEnd   = main.indexOf('\nfunction ', runFnStart + 1);
const runFnBody  = runFnEnd > 0 ? main.slice(runFnStart, runFnEnd) : main.slice(runFnStart, runFnStart + 3000);

check('enabled=false 차단 메시지',       runFnBody.includes('enabled=false'));
check('dryRun=true 차단 메시지',         runFnBody.includes('dryRun=true'));
check('command 빈 값 차단',              runFnBody.includes('command 빈 값'));
check('workingDir 없음 차단',            runFnBody.includes('workingDir 없음'));
check('outputDir 외부 차단',             runFnBody.includes('generated_assets 외부'));
check('allowExternalPaidApi 차단',       runFnBody.includes('allowExternalPaidApi'));

// spawn은 enabled 조건 내부에만 존재해야 함 (dryRun 검사 통과 후)
const spawnInBody = runFnBody.includes('spawn(');
const dryRunCheckBeforeSpawn = runFnBody.indexOf("dryRun=true — 실제 실행 금지") < runFnBody.indexOf('spawn(');
check('spawn 호출은 enabled/dryRun 검사 이후에만 존재', spawnInBody && dryRunCheckBeforeSpawn);

// dryRun3DGeneration은 spawn을 호출하지 않아야 함
const dryFnStart = main.indexOf('function dryRun3DGeneration');
const dryFnEnd   = main.indexOf('\nfunction ', dryFnStart + 1);
const dryFnBody  = dryFnEnd > 0 ? main.slice(dryFnStart, dryFnEnd) : main.slice(dryFnStart, dryFnStart + 1000);
check('dryRun3DGeneration 내 spawn 없음', !dryFnBody.includes('spawn('));

// ── [6] 출력 경로 안전장치 ────────────────────────────────────
console.log('\n=== [6] 출력 경로 안전장치 ===');
check('outputDir generated_assets 범위 검사', main.includes('generated_assets 외부 경로') || main.includes('generated_assets 외부'));
check('path.resolve 사용 (outputDir)',         runFnBody.includes('path.resolve'));

// 런타임 경로 검사 재현
const pp = path.resolve('D:\\ToribatMagicSchool');
const allowed = path.resolve(path.join(pp, 'generated_assets'));
const cases = [
    { out: path.resolve(path.join(pp, 'generated_assets')),               ok: true  },
    { out: path.resolve(path.join(pp, 'generated_assets', 'sub')),        ok: true  },
    { out: path.resolve(path.join(pp, 'Source')),                         ok: false },
    { out: path.resolve('C:\\evil'),                                       ok: false },
];
for (const c of cases) {
    check(`outputDir 검사: ${c.ok?'허용':'차단'} — ${c.out.slice(-30)}`, c.out.startsWith(allowed) === c.ok);
}

// ── [7] report 파일 경로 ──────────────────────────────────────
console.log('\n=== [7] report 파일 경로 ===');
check('3d_generator_report.md 경로',     main.includes('3d_generator_report.md'));
check('get3DGeneratorReportFile 함수',   main.includes('function get3DGeneratorReportFile'));
check('reports 폴더 내 저장',            main.includes("'reports', '3d_generator_report.md'") || main.includes('"reports", "3d_generator_report.md"') || (main.includes("3d_generator_report.md") && main.includes("'reports'")));

// ── [8] UI 요소 ───────────────────────────────────────────────
console.log('\n=== [8] UI 요소 ===');
check('3D Generator 섹션 (card)',         html.includes('3D Generator'));
check('gen-enabled-badge 존재',           html.includes('gen-enabled-badge'));
check('gen-provider 카드',                html.includes('id="gen-provider"'));
check('gen-dry-run 카드',                 html.includes('id="gen-dry-run"'));
check('gen-pending 카드',                 html.includes('id="gen-pending"'));
check('gen-done 카드',                    html.includes('id="gen-done"'));
check('gen-failed 카드',                  html.includes('id="gen-failed"'));
check('gen-assets 카드',                  html.includes('id="gen-assets"'));
check('gen-can-run 표시',                 html.includes('id="gen-can-run"'));
check('gen-output 출력 영역',             html.includes('id="gen-output"'));
check('btn-gen-run 실행 버튼',            html.includes('id="btn-gen-run"'));
check('doGenStatus 함수',                 html.includes('doGenStatus'));
check('doGenLoadConfig 함수',             html.includes('doGenLoadConfig'));
check('doGenListPendingJobs 함수',        html.includes('doGenListPendingJobs'));
check('doGenDryRun 함수',                 html.includes('doGenDryRun'));
check('doDetectAssets 함수',              html.includes('doDetectAssets'));
check('doGenRun 함수',                    html.includes('doGenRun'));
check('실행 버튼 disabled 기본값',        html.includes('btn-gen-run') && html.includes('disabled'));
check('enabled/dryRun 조건 안내 문구',    html.includes('enabled=true') || html.includes('dryRun=false'));
check('provider 설정 목록 (gen-provider-list)', html.includes('gen-provider-list'));

// ── [9] Obsidian 자동 기록 ────────────────────────────────────
console.log('\n=== [9] Obsidian 자동 기록 ===');
check("무료 로컬 3D 생성 엔진 우선 사용 결정 기록",  main.includes("'무료 로컬 3D 생성 엔진 우선 사용'") || main.includes('"무료 로컬 3D 생성 엔진 우선 사용"'));
check("Meshy/Tripo 후순위 결정 기록",               main.includes("'Meshy/Tripo는 후순위'") || main.includes('"Meshy/Tripo는 후순위"'));
check("Inspector 우선 결정 기록",                   main.includes('생성보다 Inspector'));
check("run-local-3d-generator recordAgentMemory",   main.includes("task: `로컬 3D 생성 실행:"));
check("detect-generated-3d-assets recordAgentMemory", main.includes("task: 'generated_assets 결과물 감지'"));
check('Obsidian 자동 기록 try/catch 감싸짐',
    (main.match(/try \{[\s\S]{1,200}recordDecision[\s\S]{0,200}\} catch \{ \/\* 비중단 \*\/ \}/g) || []).length >= 1
);

// ── [10] 런타임 로직 검증 ─────────────────────────────────────
console.log('\n=== [10] 런타임 로직 검증 ===');

// loadAssetGeneratorConfig 기본값 강제 검증 재현
function testLoadConfig(raw) {
    return Object.assign({}, {
        enabled: false, dryRun: true, allowExternalPaidApi: false
    }, raw, {
        enabled: raw.enabled === true,
        dryRun: raw.dryRun !== false,
        allowExternalPaidApi: raw.allowExternalPaidApi === true
    });
}
check('enabled 강제: true → true',           testLoadConfig({ enabled: true  }).enabled  === true);
check('enabled 강제: false → false',          testLoadConfig({ enabled: false }).enabled  === false);
check('enabled 강제: 미입력 → false',         testLoadConfig({}).enabled                  === false);
check('dryRun 강제: true → true',             testLoadConfig({ dryRun: true  }).dryRun    === true);
check('dryRun 강제: false → false',           testLoadConfig({ dryRun: false }).dryRun    === false);
check('dryRun 강제: 미입력 → true',           testLoadConfig({}).dryRun                   === true);
check('allowExternalPaidApi 강제: 미입력 → false', testLoadConfig({}).allowExternalPaidApi === false);
check('allowExternalPaidApi 강제: true → true',    testLoadConfig({ allowExternalPaidApi: true }).allowExternalPaidApi === true);

// dryRun 안전 차단 재현
function testSafetyChecks(config) {
    if (!config.enabled)             return { ok: false, reason: 'enabled=false — 실행 금지' };
    if (config.dryRun)               return { ok: false, reason: 'dryRun=true — 실제 실행 금지', dryRun: true };
    if (config.allowExternalPaidApi) return { ok: false, reason: 'allowExternalPaidApi=true — 외부 유료 API 차단' };
    return { ok: true };
}
check('enabled=false → 실행 금지',            !testSafetyChecks({ enabled: false, dryRun: false }).ok);
check('dryRun=true → 실행 금지',              !testSafetyChecks({ enabled: true,  dryRun: true  }).ok);
check('enabled+dryRun=false → 검사 통과',      testSafetyChecks({ enabled: true,  dryRun: false, allowExternalPaidApi: false }).ok);
check('allowExternalPaidApi=true → 차단',     !testSafetyChecks({ enabled: true,  dryRun: false, allowExternalPaidApi: true }).ok);

// ── [11] 기존 verify 체인 확인 ───────────────────────────────
console.log('\n=== [11] 기존 verify 체인 포함 ===');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('package.json verify:v76 존재',  !!(pkg.scripts && pkg.scripts['verify:v76']));
check('verify:v75 유지',               !!(pkg.scripts && pkg.scripts['verify:v75']));
check('verify:v74 유지',               !!(pkg.scripts && pkg.scripts['verify:v74']));
check('verify:v73 유지',               !!(pkg.scripts && pkg.scripts['verify:v73']));

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V76 무료 로컬 3D 생성 AI Manager 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
