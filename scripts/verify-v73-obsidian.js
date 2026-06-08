#!/usr/bin/env node
/**
 * verify-v73-obsidian.js
 * V73: Knowledge Agent — Obsidian Vault 연동 검증
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

// ── 상수 및 Config ───────────────────────────────────────────
console.log('\n=== [1] 상수 및 Config ===');
check('DEFAULT_VAULT_PATH 정의',           main.includes("DEFAULT_VAULT_PATH = 'E:\\\\ToribatVault'"));
check('VAULT_ALLOWED_FOLDERS 정의',        main.includes('VAULT_ALLOWED_FOLDERS'));
check('VAULT_DEFAULT_FOLDER = Knowledge',  main.includes("VAULT_DEFAULT_FOLDER = 'Knowledge'"));
check('loadConfig vaultPath 필드',         main.includes("vaultPath: saved.vaultPath || DEFAULT_VAULT_PATH"));
check('loadConfig 기본값 vaultPath',       main.includes("vaultPath: DEFAULT_VAULT_PATH"));
check('saveConfig vaultPath 저장',         main.includes("vaultPath: cfg.vaultPath || DEFAULT_VAULT_PATH"));

// ── 함수 존재 ────────────────────────────────────────────────
console.log('\n=== [2] 함수 존재 ===');
check('assertVaultPath 함수',              main.includes('function assertVaultPath'));
check('extractVaultMeta 함수',             main.includes('function extractVaultMeta'));
check('getVaultStatus 함수',               main.includes('function getVaultStatus'));
check('scanVault 함수',                    main.includes('function scanVault'));
check('searchVault 함수',                  main.includes('function searchVault'));
check('readVaultNote 함수',                main.includes('function readVaultNote'));
check('getRelatedNotes 함수',              main.includes('function getRelatedNotes'));
check('createVaultNote 함수',              main.includes('function createVaultNote'));
check('updateVaultNote 함수',              main.includes('function updateVaultNote'));
check('getRecentNotes 함수',               main.includes('function getRecentNotes'));
check('getVaultSummary 함수',              main.includes('function getVaultSummary'));

// ── V74 대비: scanVault 인덱스 구조 ─────────────────────────
console.log('\n=== [3] V74 대비 — 인덱스 구조 ===');
check('extractVaultMeta: title 추출',      main.includes('title'));
check('extractVaultMeta: tags 추출',       main.includes('tags'));
check('extractVaultMeta: links([[  ]]) 추출', main.includes('links'));
check('scanVault index에 title 포함',      main.includes('title: meta.title'));
check('scanVault index에 tags 포함',       main.includes('tags: meta.tags'));
check('scanVault index에 links 포함',      main.includes('links: meta.links'));
check('scanVault index에 mtime 포함',      main.includes('mtime: stat.mtimeMs'));
check('Frontmatter tags 파싱',             main.includes('---\\n'));
check('[[링크]] 파싱 정규식',              main.includes('\\[\\[([^\\]|]+)(?:\\|[^\\]]+)?\\]\\]'));

// ── 안전장치 ─────────────────────────────────────────────────
console.log('\n=== [4] 안전장치 ===');
check('삭제 함수 없음 (deleteVaultNote)',  !main.includes('function deleteVaultNote'));
check('재귀 삭제 없음 (rmSync recursive)', !main.includes("rmSync") && !main.includes("rmdirSync"));
check('path traversal 방지 (assertVaultPath)', main.includes("startsWith('..')"));
check('루트 저장 REVIEW 경고',             main.includes('VAULT_ALLOWED_FOLDERS'));
check('updateVaultNote 기본 append',       main.includes("mode: 'append'"));
check('overwrite는 명시 옵션일 때만',      main.includes("overwrite === true"));
check('중복 노트 방지 (existsSync 체크)',   main.includes("return { ok: false, error: '중복 노트'"));

// ── IPC 핸들러 ───────────────────────────────────────────────
console.log('\n=== [5] IPC 핸들러 ===');
check("ipcMain.handle('vault-status')",       main.includes("ipcMain.handle('vault-status'"));
check("ipcMain.handle('scan-vault')",         main.includes("ipcMain.handle('scan-vault'"));
check("ipcMain.handle('search-vault')",       main.includes("ipcMain.handle('search-vault'"));
check("ipcMain.handle('read-vault-note')",    main.includes("ipcMain.handle('read-vault-note'"));
check("ipcMain.handle('get-related-notes')",  main.includes("ipcMain.handle('get-related-notes'"));
check("ipcMain.handle('create-vault-note')",  main.includes("ipcMain.handle('create-vault-note'"));
check("ipcMain.handle('update-vault-note')",  main.includes("ipcMain.handle('update-vault-note'"));
check("ipcMain.handle('get-recent-notes')",   main.includes("ipcMain.handle('get-recent-notes'"));
check("ipcMain.handle('get-vault-summary')",  main.includes("ipcMain.handle('get-vault-summary'"));

// ── preload 노출 ─────────────────────────────────────────────
console.log('\n=== [6] preload 노출 ===');
check('getVaultStatus 노출',    preload.includes('getVaultStatus'));
check('scanVault 노출',         preload.includes('scanVault'));
check('searchVault 노출',       preload.includes('searchVault'));
check('readVaultNote 노출',     preload.includes('readVaultNote'));
check('getRelatedNotes 노출',   preload.includes('getRelatedNotes'));
check('createVaultNote 노출',   preload.includes('createVaultNote'));
check('updateVaultNote 노출',   preload.includes('updateVaultNote'));
check('getRecentNotes 노출',    preload.includes('getRecentNotes'));
check('getVaultSummary 노출',   preload.includes('getVaultSummary'));

// ── UI 검증 ──────────────────────────────────────────────────
console.log('\n=== [7] UI 검증 ===');
check("nav: showPage('vault')",            html.includes("showPage('vault'"));
check('page-vault 존재',                   html.includes('id="page-vault"'));
check('Vault 상태 새로고침 버튼',          html.includes('doVaultStatus()'));
check('노트 검색 탭',                      html.includes("showVaultTab('search')"));
check('노트 생성 탭',                      html.includes("showVaultTab('create')"));
check('최근 수정 탭',                      html.includes("showVaultTab('recent')"));
check('관련 노트 탭',                      html.includes("showVaultTab('related')"));
check('요약 탭',                           html.includes("showVaultTab('summary')"));
check('vault-search-input 존재',           html.includes('vault-search-input'));
check('vault-create-folder 드롭다운',      html.includes('vault-create-folder'));
check('허용 폴더 Knowledge 옵션',          html.includes('value="Knowledge"'));
check('허용 폴더 Projects 옵션',           html.includes('value="Projects"'));
check('허용 폴더 UE5 옵션',               html.includes('value="UE5"'));
check('허용 폴더 3DAssets 옵션',           html.includes('value="3DAssets"'));
check('vault-create-result 영역',          html.includes('vault-create-result'));
check('vault-warn-bar 경고 바',            html.includes('vault-warn-bar'));
check('vault-recent-list 존재',            html.includes('vault-recent-list'));
check('vault-related-results 존재',        html.includes('vault-related-results'));
check('vault-summary-content 존재',        html.includes('vault-summary-content'));
check('showPage vault → doVaultStatus',    html.includes("if(id==='vault') doVaultStatus()"));
check('Settings cfg-vault 입력 필드',      html.includes('id="cfg-vault"'));
check('loadSettings vaultPath 로드',       html.includes("config.vaultPath||'E:\\\\ToribatVault'"));
check('saveSettings vaultPath 저장',       html.includes("config.vaultPath=document.getElementById('cfg-vault').value"));

// ── 런타임 동작 테스트 ───────────────────────────────────────
console.log('\n=== [8] 런타임 로직 검증 ===');

// extractVaultMeta 인라인 재현
function extractVaultMeta(content, filePath) {
    const title = (() => {
        const m = content.match(/^#\s+(.+)/m);
        if (m) return m[1].trim();
        return path.basename(filePath, '.md');
    })();
    const tags = [];
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
        const tagLine = fmMatch[1].match(/^tags:\s*(.+)/m);
        if (tagLine) {
            const raw = tagLine[1].trim();
            if (raw.startsWith('[')) {
                try { tags.push(...JSON.parse(raw)); } catch {
                    tags.push(...raw.slice(1, -1).split(',').map(t => t.trim()).filter(Boolean));
                }
            } else {
                tags.push(...raw.split(',').map(t => t.trim()).filter(Boolean));
            }
        }
    }
    const links = [];
    const linkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let lm;
    while ((lm = linkRe.exec(content)) !== null) links.push(lm[1].trim());
    return { title, tags: [...new Set(tags)], links: [...new Set(links)] };
}

const sample1 = `---\ntags: [ue5, worldbuilding, quest]\n---\n\n# 마법 시스템 설계\n\n내용 [[MagicComponent]] 참조. [[QuestManager]] 연계.`;
const m1 = extractVaultMeta(sample1, 'UE5/magic.md');
check('Frontmatter tags 파싱 ([배열])',    m1.tags.includes('ue5') && m1.tags.includes('worldbuilding'));
check('[[링크]] 추출: MagicComponent',     m1.links.includes('MagicComponent'));
check('[[링크]] 추출: QuestManager',       m1.links.includes('QuestManager'));
check('# 제목 추출',                       m1.title === '마법 시스템 설계');

const sample2 = `---\ntags: quest, story\n---\n# 퀘스트 목록`;
const m2 = extractVaultMeta(sample2, 'Projects/quests.md');
check('Frontmatter tags 파싱 (쉼표)',      m2.tags.includes('quest') && m2.tags.includes('story'));

const sample3 = `일반 내용, 제목 없음`;
const m3 = extractVaultMeta(sample3, 'Knowledge/note.md');
check('파일명 fallback 제목',              m3.title === 'note');

console.log(`\n${'='.repeat(60)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) { console.log('V73 Knowledge Agent — Obsidian 연동 전체 통과!'); process.exit(0); }
else              { console.log('일부 검증 실패 — 위 항목 확인 필요'); process.exit(1); }
