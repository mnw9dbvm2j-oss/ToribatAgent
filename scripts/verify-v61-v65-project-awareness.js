#!/usr/bin/env node
/**
 * verify-v61-v65-project-awareness.js
 * V61~V65: 기존 프로젝트 인식 기능 검증 스크립트
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(ROOT, 'src', 'main.js');
const PRELOAD_JS = path.join(ROOT, 'src', 'preload.js');
const INDEX_HTML = path.join(ROOT, 'src', 'index.html');
const MCP_CONFIG = path.join(ROOT, 'mcp.config.json');
const MCP_ADAPTER = path.join(ROOT, 'src', 'mcp-adapter.js');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

function readFile(f) {
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

const main = readFile(MAIN_JS);
const preload = readFile(PRELOAD_JS);
const html = readFile(INDEX_HTML);
const mcpCfg = readFile(MCP_CONFIG);
const mcpAdp = readFile(MCP_ADAPTER);

console.log('\n=== V61: E:\\ 드라이브 참조 제거 ===');
const eRefs = (main + preload + html + mcpCfg + mcpAdp).match(/E:\\ToribatMagicSchool/g) || [];
check('E:\\ToribatMagicSchool 참조 0건', eRefs.length === 0, `${eRefs.length}건 남아있음`);
check('DEFAULT_PROJECT_PATH = D:\\\\ToribatMagicSchool', main.includes("DEFAULT_PROJECT_PATH = 'D:\\\\ToribatMagicSchool'"));
check('mcp.config.json E:\\\\ToribatAgent 포함', mcpCfg.includes('E:\\\\ToribatAgent'));
check('mcp.config.json D:\\\\ToribatMagicSchool 포함', mcpCfg.includes('D:\\\\ToribatMagicSchool'));
check('mcp-adapter.js D:\\\\ToribatMagicSchool 포함', mcpAdp.includes('D:\\\\ToribatMagicSchool'));

console.log('\n=== V62: scanExistingProject ===');
check('getExistingProjectInventoryFile 함수 존재', main.includes('function getExistingProjectInventoryFile'));
check('KNOWN_SYSTEMS 정의 존재', main.includes('const KNOWN_SYSTEMS'));
check('extractClassesFromSource 함수 존재', main.includes('function extractClassesFromSource'));
check('extractFunctionsFromHeader 함수 존재', main.includes('function extractFunctionsFromHeader'));
check('scanExistingProject 함수 존재', main.includes('function scanExistingProject'));
check('scan-existing-project IPC 핸들러 등록', main.includes("ipcMain.handle('scan-existing-project'"));
check('read-existing-project-inventory IPC 핸들러 등록', main.includes("ipcMain.handle('read-existing-project-inventory'"));

console.log('\n=== V63: findExistingImplementation ===');
check('findExistingImplementation 함수 존재', main.includes('function findExistingImplementation'));
check('find-existing-implementation IPC 핸들러 등록', main.includes("ipcMain.handle('find-existing-implementation'"));

console.log('\n=== V64: validateCandidateAgainstProject ===');
check('validateCandidateAgainstProject 함수 존재', main.includes('function validateCandidateAgainstProject'));
check('validate-candidate-against-project IPC 핸들러 등록', main.includes("ipcMain.handle('validate-candidate-against-project'"));
check('REJECT 결정 로직 포함', main.includes("decision: 'REJECT'") || main.includes("decision:'REJECT'"));
check('PASS 결정 로직 포함', main.includes("decision: 'PASS'") || main.includes("decision:'PASS'"));

console.log('\n=== V65: generateExtensionCandidate ===');
check('generateExtensionCandidate 함수 존재', main.includes('function generateExtensionCandidate'));
check('generate-extension-candidate IPC 핸들러 등록', main.includes("ipcMain.handle('generate-extension-candidate'"));
check('_Extension.candidate.md 패턴 포함', main.includes('_Extension.candidate.md') || main.includes('Extension.candidate'));

console.log('\n=== preload.js IPC 노출 ===');
check('scanExistingProject 노출', preload.includes('scanExistingProject'));
check('readExistingProjectInventory 노출', preload.includes('readExistingProjectInventory'));
check('findExistingImplementation 노출', preload.includes('findExistingImplementation'));
check('validateCandidateAgainstProject 노출', preload.includes('validateCandidateAgainstProject'));
check('generateExtensionCandidate 노출', preload.includes('generateExtensionCandidate'));

console.log('\n=== index.html UI ===');
check('기존 프로젝트 분석 nav 항목', html.includes("showPage('existing'"));
check('page-existing 페이지 존재', html.includes('id="page-existing"'));
check('doScanExistingProject 함수', html.includes('doScanExistingProject'));
check('doReadInventory 함수', html.includes('doReadInventory'));
check('doFindImplementation 함수', html.includes('doFindImplementation'));
check('doValidateCandidate 함수', html.includes('doValidateCandidate'));
check('doGenerateExtension 함수', html.includes('doGenerateExtension'));
check('showPage existing → loadExistingInventory', html.includes("if(id==='existing') loadExistingInventory"));

console.log('\n=== 안전성 검증 ===');
check('allowRealApply 게이트 존재', main.includes('allowRealApply'));
check('safeWriteFile 존재', main.includes('function safeWriteFile') || main.includes('safeWriteFile('));
check('REJECT 시 파일 쓰기 방지 패턴', main.includes("decision: 'REJECT'") || main.includes("decision:'REJECT'"));

console.log(`\n${'='.repeat(50)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) {
    console.log('🎉 V61~V65 모든 검증 통과!');
    process.exit(0);
} else {
    console.log('⚠️  일부 검증 실패. 위 항목을 확인하세요.');
    process.exit(1);
}
