#!/usr/bin/env node
/**
 * V80: UE5 Import Manifest System 검증
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(ROOT, 'src', 'main.js');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');
const HTML = path.join(ROOT, 'src', 'index.html');
const PKG = path.join(ROOT, 'package.json');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
    if (condition) {
        console.log(`PASS ${label}`);
        passed++;
    } else {
        console.error(`FAIL ${label}${detail ? ' - ' + detail : ''}`);
        failed++;
    }
}

const main = fs.readFileSync(MAIN, 'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

const v80Start = main.indexOf('// ── V80: UE5 Import Manifest System');
const v80End = main.indexOf('\nfunction getAgentHandoffPlan', v80Start);
const v80Body = v80Start >= 0 && v80End > v80Start ? main.slice(v80Start, v80End) : '';

console.log('\n=== [1] V80 함수/경로 ===');
check('import_manifests 경로 함수 존재', main.includes('function getUE5ImportManifestDir'));
check('ue5_import_manifest_report.md 경로 함수 존재', main.includes('function getUE5ImportManifestReportFile'));
check('listApprovedApplyCandidates 존재', main.includes('function listApprovedApplyCandidates'));
check('readApprovedApplyCandidate 존재', main.includes('function readApprovedApplyCandidate'));
check('extractImportFieldsFromCandidate 존재', main.includes('function extractImportFieldsFromCandidate'));
check('evaluateUE5ImportReadiness 존재', main.includes('function evaluateUE5ImportReadiness'));
check('createUE5ImportManifest 존재', main.includes('function createUE5ImportManifest'));
check('createUE5ImportManifestsFromApproved 존재', main.includes('function createUE5ImportManifestsFromApproved'));
check('readUE5ImportManifests 존재', main.includes('function readUE5ImportManifests'));
check('generateUE5ImportManifestReport 존재', main.includes('function generateUE5ImportManifestReport'));
check('ensureProjectFolders import_manifests 포함', main.includes("'import_manifests'"));

console.log('\n=== [2] Manifest 필드/판정 ===');
[
    'manifestId', 'createdAt', 'sourceCandidate', 'sourceInspection', 'sourceModelFile',
    'assetName', 'fileSizeMB', 'extension', 'triangleCount', 'materialCount',
    'inspectionVerdict', 'applyReviewVerdict', 'recommendedImportPath', 'ueContentPath',
    'assetCategory', 'collisionNeeded', 'lodNeeded', 'naniteRecommended',
    'materialSetupNeeded', 'textureCheckNeeded', 'scaleCheckNeeded', 'pivotCheckNeeded',
    'importStatus', 'blockReasons', 'notes'
].forEach(field => check(`Manifest 필드: ${field}`, v80Body.includes(field)));
check('READY_FOR_IMPORT 문자열 존재', v80Body.includes('READY_FOR_IMPORT'));
check('MANIFEST_ONLY 문자열 존재', v80Body.includes('MANIFEST_ONLY'));
check('BLOCKED 문자열 존재', v80Body.includes('BLOCKED'));
check('WARNING 카운트/경고 기록', v80Body.includes('warnings') && v80Body.includes('WARNING 수'));
check('approved candidate만 대상', v80Body.includes('approved candidate만 Manifest 대상'));

console.log('\n=== [3] 안전 규칙 ===');
check('실제 Content 복사 금지 문구', v80Body.includes('actual UE5 Content copy: false'));
check('.uasset 생성 금지 문구', v80Body.includes('.uasset generation: false'));
check('Unreal Editor 자동 실행 금지 문구', v80Body.includes('Unreal Editor auto launch: false'));
check('allowRealApply=false 유지 문구', v80Body.includes('allowRealApply=false 유지'));
check('V80 내 fs.copyFileSync 없음', !/copyFileSync/.test(v80Body));
check('V80 내 Content 대상 복사 없음', !/Content[\\/].*copyFileSync|copyFileSync[\s\S]{0,120}Content[\\/]/i.test(v80Body));
check('V80 내 Unreal Editor 실행 없음', !/UnrealEditor|UE5Editor|Unreal\s+Editor.*spawn/i.test(v80Body));
check('지원 확장자 제한', v80Body.includes("'.glb'") && v80Body.includes("'.gltf'") && v80Body.includes("'.obj'") && v80Body.includes("'.fbx'"));

console.log('\n=== [4] IPC/preload ===');
[
    'list-approved-apply-candidates',
    'create-ue5-import-manifest',
    'create-ue5-import-manifests-from-approved',
    'read-ue5-import-manifests',
    'generate-ue5-import-manifest-report'
].forEach(name => check(`IPC ${name}`, main.includes(`ipcMain.handle('${name}'`)));
[
    'listApprovedApplyCandidates',
    'createUE5ImportManifest',
    'createUE5ImportManifestsFromApproved',
    'readUE5ImportManifests',
    'generateUE5ImportManifestReport'
].forEach(name => check(`preload API ${name}`, preload.includes(name)));

console.log('\n=== [5] UI ===');
check('UE5 Import Manifest 섹션 존재', html.includes('UE5 Import Manifest'));
check('Approved 후보 새로고침 버튼', html.includes('refreshUE5ImportManifest'));
check('선택 후보 Manifest 생성 버튼', html.includes('createSelectedUE5ImportManifest'));
check('Approved 전체 Manifest 생성 버튼', html.includes('createAllUE5ImportManifests'));
check('Manifest Report 생성 버튼', html.includes('generateUE5ImportManifestReport'));
check('Report 보기 버튼', html.includes('viewUE5ImportManifestReport'));
check('실제 UE5 Import 버튼 없음', !html.includes('실제 UE5 Import'));
check('Content 복사 버튼 없음', !html.includes('Content 복사 버튼'));

console.log('\n=== [6] Obsidian 기록 ===');
check('recordAgentMemory 호출 존재', v80Body.includes('recordAgentMemory'));
check('Project Decisions 기록 존재', v80Body.includes('recordDecision'));
check('Obsidian 기록 try/catch 비중단', /try \{[\s\S]*recordAgentMemory[\s\S]*\} catch \{ \/\* 비중단 \*\/ \}/.test(v80Body));
check('결정: Import Manifest 먼저 생성', v80Body.includes('UE5 실제 복사 전 Import Manifest를 먼저 생성한다'));
check('결정: allowRealApply=false Manifest만', v80Body.includes('allowRealApply=false 상태에서는 Manifest만 생성한다'));
check('결정: approved candidate만 대상', v80Body.includes('approved candidate만 Manifest 대상이 된다'));

console.log('\n=== [7] package.json ===');
check('verify:v80 등록', !!pkg.scripts['verify:v80']);
check('verify 체인에 V80 포함', pkg.scripts.verify.includes('verify-v80-ue5-import-manifest.js'));
[
    'verify:v66', 'verify:v67-v72', 'verify:v73', 'verify:v74',
    'verify:v75', 'verify:v76', 'verify:v77', 'verify:v78', 'verify:v79'
].forEach(name => check(`기존 ${name} 유지`, !!pkg.scripts[name]));

console.log(`\n결과: ${passed}개 통과 / ${failed}개 실패`);
if (failed) process.exit(1);
console.log('V80 UE5 Import Manifest System 검증 완료');
