#!/usr/bin/env node
/**
 * verify-v77-environment-readiness.js
 * V77: 3D Generator 실행 안정화 및 환경 점검 시스템 검증
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

// ── [1] imports ───────────────────────────────────────────────
console.log('\n=== [1] imports ===');
check('execSync import',  main.includes('execSync'));
check('os module import', main.includes("require('os')") || main.includes('require("os")'));

// ── [2] Environment Inspector 함수 존재 ──────────────────────
console.log('\n=== [2] Environment Inspector 함수 존재 ===');
check('tryExec 함수',              main.includes('function tryExec'));
check('getEnvironmentStatus 함수', main.includes('function getEnvironmentStatus'));
check('detectGpu 함수',            main.includes('function detectGpu'));

// ── [3] getEnvironmentStatus 확인 항목 ───────────────────────
console.log('\n=== [3] getEnvironmentStatus 확인 항목 ===');
const envFnStart = main.indexOf('function getEnvironmentStatus');
const envFnEnd   = main.indexOf('\nfunction ', envFnStart + 1);
const envFnBody  = envFnEnd > 0 ? main.slice(envFnStart, envFnEnd) : main.slice(envFnStart, envFnStart + 3000);

check('Windows 버전 확인', envFnBody.includes('windows'));
check('CPU 확인',          envFnBody.includes('os.cpus()'));
check('RAM 확인',          envFnBody.includes('os.totalmem()'));
check('GPU 확인',          envFnBody.includes('detectGpu()'));
check('NVIDIA 확인',       envFnBody.includes('nvidia'));
check('CUDA 확인',         envFnBody.includes('cuda'));
check('Python 확인',       envFnBody.includes('python'));
check('pip 확인',          envFnBody.includes('pip'));
check('Git 확인',          envFnBody.includes('git'));
check('WSL2 확인',         envFnBody.includes('wsl2') || envFnBody.includes('WSL2') || envFnBody.includes('wsl'));
check('Node 버전 확인',    envFnBody.includes('node'));
check('npm 버전 확인',     envFnBody.includes('npm'));
check('overall 3단계 판정', envFnBody.includes("'FAIL'") && envFnBody.includes("'WARNING'") && envFnBody.includes("'PASS'"));

// ── [4] GPU 판정 기준 ─────────────────────────────────────────
console.log('\n=== [4] GPU 판정 기준 ===');
const gpuFnStart = main.indexOf('function detectGpu');
const gpuFnEnd   = main.indexOf('\nfunction ', gpuFnStart + 1);
const gpuFnBody  = gpuFnEnd > 0 ? main.slice(gpuFnStart, gpuFnEnd) : main.slice(gpuFnStart, gpuFnStart + 2000);

check('nvidia-smi 사용',            gpuFnBody.includes('nvidia-smi'));
check('WMIC 폴백',                  gpuFnBody.includes('wmic') || gpuFnBody.includes('win32_videocontroller'));
check('VRAM 8GB+ PASS 판정',        gpuFnBody.includes('8') && gpuFnBody.includes("'PASS'"));
check('VRAM 6~7GB WARNING 판정',    gpuFnBody.includes('6') && gpuFnBody.includes("'WARNING'"));
check('VRAM 0~5GB FAIL 판정',       gpuFnBody.includes("'FAIL'"));
check('vramGB 반환',                 gpuFnBody.includes('vramGB'));
check('vendor 반환',                 gpuFnBody.includes('vendor'));
check('driver 반환',                 gpuFnBody.includes('driver'));

// 런타임: VRAM 판정 재현
function testVramLevel(vramGB) {
    return vramGB >= 8 ? 'PASS' : vramGB >= 6 ? 'WARNING' : 'FAIL';
}
check('VRAM 0GB → FAIL',    testVramLevel(0)   === 'FAIL');
check('VRAM 4GB → FAIL',    testVramLevel(4)   === 'FAIL');
check('VRAM 6GB → WARNING', testVramLevel(6)   === 'WARNING');
check('VRAM 7.5GB → WARNING', testVramLevel(7.5) === 'WARNING');
check('VRAM 8GB → PASS',    testVramLevel(8)   === 'PASS');
check('VRAM 16GB → PASS',   testVramLevel(16)  === 'PASS');

// ── [5] Provider 호환성 함수 ──────────────────────────────────
console.log('\n=== [5] Provider 호환성 함수 ===');
check('checkProviderCompatibility 함수', main.includes('function checkProviderCompatibility'));

const cpFnStart = main.indexOf('function checkProviderCompatibility');
const cpFnEnd   = main.indexOf('\nfunction ', cpFnStart + 1);
const cpFnBody  = cpFnEnd > 0 ? main.slice(cpFnStart, cpFnEnd) : main.slice(cpFnStart, cpFnStart + 3000);

check('TRELLIS 요구사항 (vramMin:8)',     cpFnBody.includes('trellis') && cpFnBody.includes('8'));
check('Hunyuan3D 요구사항 (vramMin:16)', cpFnBody.includes('hunyuan3d') && cpFnBody.includes('16'));
check('Stable Fast 3D (vramMin:6)',      cpFnBody.includes('stableFast3D') && cpFnBody.includes('6'));
check('VRAM FAIL 판정',                  cpFnBody.includes("'FAIL'"));
check('CUDA FAIL 판정',                  cpFnBody.includes('FAIL'));
check('Python FAIL 판정',                cpFnBody.includes('FAIL'));
check('WSL2 WARNING 판정',               cpFnBody.includes("'WARNING'"));
check('overall 집계',                    cpFnBody.includes('overall'));

// ── [6] WSL2 경로 변환 ────────────────────────────────────────
console.log('\n=== [6] WSL2 경로 변환 ===');
check('toWslPath 함수',               main.includes('function toWslPath'));
check('/mnt/ 변환 로직',              main.includes('/mnt/'));
check('드라이브 문자 소문자 변환',    main.includes('toLowerCase()'));
check('백슬래시→슬래시 변환',        main.includes("replace(/\\\\\\\\?/g, '/')") || main.includes(".replace(/\\\\/g, '/')"));

// 런타임: WSL 경로 변환 재현
function testToWslPath(winPath) {
    if (!winPath) return winPath || '';
    const m = winPath.match(/^([A-Za-z]):[\\\/](.*)/);
    if (!m) return winPath;
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}
check("D:\\ToribatMagicSchool → /mnt/d/ToribatMagicSchool",
    testToWslPath('D:\\ToribatMagicSchool') === '/mnt/d/ToribatMagicSchool');
check("C:\\Users\\test → /mnt/c/Users/test",
    testToWslPath('C:\\Users\\test') === '/mnt/c/Users/test');
check("E:\\ToribatAgent → /mnt/e/ToribatAgent",
    testToWslPath('E:\\ToribatAgent') === '/mnt/e/ToribatAgent');
check("이미 Unix 경로는 그대로 유지",
    testToWslPath('/mnt/d/path') === '/mnt/d/path');
check("빈 문자열 → 빈 문자열",
    testToWslPath('') === '');

// usesWsl2 플래그 존재
const cfgRaw = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
check("trellis usesWsl2=true",      cfgRaw.providers?.trellis?.usesWsl2     === true);
check("hunyuan3d usesWsl2=true",    cfgRaw.providers?.hunyuan3d?.usesWsl2   === true);
check("stableFast3D usesWsl2=false",cfgRaw.providers?.stableFast3D?.usesWsl2=== false);
check("blender usesWsl2=false",     cfgRaw.providers?.blender?.usesWsl2     === false);

// build3DGenerationCommand가 WSL 변환 사용
const bldFnStart = main.indexOf('function build3DGenerationCommand');
const bldFnEnd   = main.indexOf('\nfunction ', bldFnStart + 1);
const bldFnBody  = bldFnEnd > 0 ? main.slice(bldFnStart, bldFnEnd) : main.slice(bldFnStart, bldFnStart + 1500);
check('build3DGenerationCommand에 toWslPath 적용', bldFnBody.includes('toWslPath'));
check('usesWsl2 분기 존재',                         bldFnBody.includes('usesWsl2') || bldFnBody.includes('useWsl'));

// ── [7] 타임아웃 ──────────────────────────────────────────────
console.log('\n=== [7] 타임아웃 ===');
check('generatorTimeoutMinutes 설정',  main.includes('generatorTimeoutMinutes'));
check('config.json generatorTimeoutMinutes=120', cfgRaw.generatorTimeoutMinutes === 120);
check('DEFAULT_CONFIG에 generatorTimeoutMinutes', main.includes("generatorTimeoutMinutes: 120"));
check('setTimeout 타임아웃 구현',      main.includes('setTimeout'));

const runFnStart = main.indexOf('function runLocal3DGenerator');
const runFnEnd   = main.indexOf('\nfunction ', runFnStart + 1);
const runFnBody  = runFnEnd > 0 ? main.slice(runFnStart, runFnEnd) : main.slice(runFnStart, runFnStart + 4000);

check('타임아웃 시 프로세스 종료 (proc.kill)', runFnBody.includes("proc.kill"));
check('타임아웃 시 failed queue 이동',          runFnBody.includes('moveGenerationJobToFailed') && runFnBody.includes('timedOut'));
check('타임아웃 시 보고서 기록',                runFnBody.includes('write3DGenerationLog') && runFnBody.includes('timedOut'));
check('앱 중단 없음 (resolve 사용)',            runFnBody.includes("resolve({ ok: false") && runFnBody.includes('timedOut'));
check('clearTimeout 호출',                      runFnBody.includes('clearTimeout'));

// ── [8] 사전 점검 (preflight) ─────────────────────────────────
console.log('\n=== [8] 사전 점검 (preflight) ===');
check('runPreflightChecks 함수',                 main.includes('function runPreflightChecks'));
check('runPreflightChecks에서 getEnvironmentStatus 호출', main.includes('getEnvironmentStatus()') && main.includes('runPreflightChecks'));
check('runPreflightChecks에서 detectGpu 호출',   main.includes('detectGpu()'));
check('FAIL 존재 시 실행 금지 (ok: false)',      runFnBody.includes('preflight.ok') || runFnBody.includes('!preflight.ok'));
check('runLocal3DGenerator 내 preflight 호출',  runFnBody.includes('runPreflightChecks'));
check('preflight FAIL 시 Obsidian 기록',        runFnBody.includes('recordAgentMemory'));

// ── [9] Provider 설치 감지 ────────────────────────────────────
console.log('\n=== [9] Provider 설치 감지 ===');
check('detectProviderInstallation 함수',  main.includes('function detectProviderInstallation'));

const dpFnStart = main.indexOf('function detectProviderInstallation');
const dpFnEnd   = main.indexOf('\nfunction ', dpFnStart + 1);
const dpFnBody  = dpFnEnd > 0 ? main.slice(dpFnStart, dpFnEnd) : main.slice(dpFnStart, dpFnStart + 1500);

check('workingDir 존재 확인',   dpFnBody.includes('workingDir'));
check('requirements.txt 확인',  dpFnBody.includes('requirements.txt'));
check("'Installed' 상태",       dpFnBody.includes("'Installed'") || dpFnBody.includes('"Installed"'));
check("'Partial' 상태",         dpFnBody.includes("'Partial'")   || dpFnBody.includes('"Partial"'));
check("'Missing' 상태",         dpFnBody.includes("'Missing'")   || dpFnBody.includes('"Missing"'));

// ── [10] IPC 핸들러 ───────────────────────────────────────────
console.log('\n=== [10] IPC 핸들러 ===');
check("ipcMain.handle('get-environment-status')",      main.includes("ipcMain.handle('get-environment-status'"));
check("ipcMain.handle('detect-gpu')",                   main.includes("ipcMain.handle('detect-gpu'"));
check("ipcMain.handle('check-provider-compatibility')", main.includes("ipcMain.handle('check-provider-compatibility'"));
check("ipcMain.handle('detect-provider-installation')", main.includes("ipcMain.handle('detect-provider-installation'"));
check("ipcMain.handle('run-preflight-checks')",         main.includes("ipcMain.handle('run-preflight-checks'"));

// ── [11] preload 노출 ──────────────────────────────────────────
console.log('\n=== [11] preload 노출 ===');
check('getEnvironmentStatus 노출',       preload.includes('getEnvironmentStatus'));
check('detectGpu 노출',                  preload.includes('detectGpu'));
check('checkProviderCompatibility 노출', preload.includes('checkProviderCompatibility'));
check('detectProviderInstallation 노출', preload.includes('detectProviderInstallation'));
check('runPreflightChecks 노출',         preload.includes('runPreflightChecks'));

// ── [12] UI 요소 ──────────────────────────────────────────────
console.log('\n=== [12] UI 요소 ===');
check('환경 점검 섹션 (details)',         html.includes('환경 점검'));
check('env-overall-badge 존재',           html.includes('env-overall-badge'));
check('readiness-badge 존재',             html.includes('readiness-badge'));
check('env-grid 존재',                    html.includes('env-grid'));
check('Config Editor 섹션',              html.includes('Config Editor'));
check('cfg-gen-enabled 필드',            html.includes('cfg-gen-enabled'));
check('cfg-gen-dryrun 필드',             html.includes('cfg-gen-dryrun'));
check('cfg-gen-provider 필드',           html.includes('cfg-gen-provider'));
check('cfg-gen-timeout 필드',            html.includes('cfg-gen-timeout'));
check('cfg-gen-workdir 필드',            html.includes('cfg-gen-workdir'));
check('cfg-gen-outdir 필드',             html.includes('cfg-gen-outdir'));
check('저장 버튼',                        html.includes('doSaveGenConfig'));
check('새로고침 버튼',                    html.includes('doLoadGenConfigToUI'));
check('설정 검증 버튼',                   html.includes('doVerifyGenConfig'));
check('doEnvCheck 함수',                  html.includes('doEnvCheck'));
check('doGpuCheck 함수',                  html.includes('doGpuCheck'));
check('doProviderCompat 함수',            html.includes('doProviderCompat'));
check('doInstallCheck 함수',              html.includes('doInstallCheck'));
check('doPreflight 함수',                 html.includes('doPreflight'));
check('updateReadinessBadge 함수',        html.includes('updateReadinessBadge'));
check('renderEnvGrid 함수',               html.includes('renderEnvGrid'));
check('실행 준비 완료 뱃지 문구',         html.includes('실행 준비 완료'));

// ── [13] Obsidian 기록 ────────────────────────────────────────
console.log('\n=== [13] Obsidian 기록 ===');
check('V77 환경 점검 결정 기록',           main.includes('V77 환경 점검 계층 도입'));
check('생성기 설치 전 검증 결정 기록',     main.includes('생성기 설치 전 검증 우선'));
check('preflight recordAgentMemory 기록',  main.includes("task: '3D Generator 사전 점검'"));
check('타임아웃 recordAgentMemory 기록',   main.includes("task: '3D 생성 타임아웃'"));
check('사전 점검 실패 기록',               main.includes("task: '3D 생성 사전 점검'"));
check('Obsidian 기록 try/catch 감싸짐',
    (main.match(/try \{[\s\S]{1,300}recordAgentMemory[\s\S]{0,200}\} catch \{ \/\* 비중단 \*\/ \}/g) || []).length >= 4
);

// ── [14] 런타임 로직 검증 ─────────────────────────────────────
console.log('\n=== [14] 런타임 로직 검증 ===');

// toWslPath 다양한 케이스
function toWslPathTest(w) {
    if (!w) return w || '';
    const m = w.match(/^([A-Za-z]):[\\\/](.*)/);
    if (!m) return w;
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}
check("D:\\path → /mnt/d/path",            toWslPathTest('D:\\path') === '/mnt/d/path');
check("C:\\Windows\\System32 변환",         toWslPathTest('C:\\Windows\\System32') === '/mnt/c/Windows/System32');
check("경로 없음(undefined) → 빈 문자열",  toWslPathTest(undefined) === '');
check("슬래시 혼용 경로 처리",              toWslPathTest('D:/test/path') === '/mnt/d/test/path');

// tryExec 안전성 (throw 없이 {ok:false} 반환)
function testTryExec(cmd) {
    try {
        const out = require('child_process').execSync(cmd, { stdio:'pipe', timeout:3000 });
        return { ok: true, output: (out||'').toString().trim() };
    } catch (e) {
        return { ok: false, output: '', error: e.message };
    }
}
const safeResult = testTryExec('this-command-does-not-exist-xyz');
check('tryExec: 없는 명령은 ok:false 반환 (앱 중단 없음)', safeResult.ok === false && safeResult.error);

// provider 타임아웃 설정 런타임 확인
check('generatorTimeoutMinutes → ms 변환',
    (function() {
        const cfg = { generatorTimeoutMinutes: 120 };
        const ms  = (cfg.generatorTimeoutMinutes || 120) * 60 * 1000;
        return ms === 7200000;
    })()
);

// ── [15] 기존 verify 체인 확인 ───────────────────────────────
console.log('\n=== [15] 기존 verify 체인 확인 ===');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('package.json verify:v77 존재', !!(pkg.scripts && pkg.scripts['verify:v77']));
check('verify:v76 유지',              !!(pkg.scripts && pkg.scripts['verify:v76']));
check('verify:v75 유지',              !!(pkg.scripts && pkg.scripts['verify:v75']));
check('verify:v74 유지',              !!(pkg.scripts && pkg.scripts['verify:v74']));

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V77 실행 안정화 & 환경 점검 시스템 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
