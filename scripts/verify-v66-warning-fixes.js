#!/usr/bin/env node
/**
 * verify-v66-warning-fixes.js
 * V66: single-line UENUM / 의미 충돌 / stalePath / PM warning 검증
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(ROOT, 'src', 'main.js');
const PROJECT = 'D:\\ToribatMagicSchool';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  PASS ${label}`);
        passed++;
    } else {
        console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

const main = fs.readFileSync(MAIN_JS, 'utf8');

// ── [1] single-line UENUM 지원 ─────────────────────────────────────────────
console.log('\n=== [1] single-line UENUM 감지 ===');

// extractClassesFromSource 함수를 인라인 재현해 실제 동작 확인
function extractClassesFromSource(fileContent) {
    const classes = [];
    const uclassRe = /UCLASS[^)]*\)\s*\nclass\s+\w+_API\s+(\w+)/g;
    const plainClassRe = /^class\s+(?:\w+_API\s+)?(\w+)\s*(?::|{)/gm;
    const structRe = /USTRUCT[^)]*\)\s*\nstruct\s+(?:\w+_API\s+)?(\w+)/g;
    const enumRe = /UENUM[^)]*\)\s*\n?enum\s+class\s+(\w+)/g;
    let m;
    for (const re of [uclassRe, plainClassRe, structRe, enumRe]) {
        re.lastIndex = 0;
        while ((m = re.exec(fileContent)) !== null) {
            const name = m[1];
            if (name && name !== 'public' && name !== 'private' && name !== 'protected') {
                classes.push(name);
            }
        }
    }
    return [...new Set(classes)];
}

// single-line UENUM 테스트
const singleLineEnum = `UENUM(BlueprintType) enum class EQuestState : uint8 { Inactive, Active, Completed, Failed };`;
const multiLineEnum = `UENUM(BlueprintType)\nenum class EMagicElement : uint8\n{\n    Fire, Ice\n};`;
const singleResult = extractClassesFromSource(singleLineEnum);
const multiResult = extractClassesFromSource(multiLineEnum);

check('single-line UENUM: EQuestState 추출', singleResult.includes('EQuestState'), `실제: [${singleResult}]`);
check('multi-line UENUM: EMagicElement 추출', multiResult.includes('EMagicElement'), `실제: [${multiResult}]`);
check('regex에 \\n? 패턴 존재', main.includes('UENUM[^)]*\\)\\s*\\n?enum'));

// real file 실제 테스트 (없으면 E:\ToribatAgent\tests\fixtures 폴백)
const questManagerPath = path.join(PROJECT, 'Source\\ToribatMagicSchool\\Core\\QuestManager.h');
const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'QuestManager.h');
const questManagerFile = fs.existsSync(questManagerPath) ? questManagerPath : fixturePath;
if (fs.existsSync(questManagerFile)) {
    const content = fs.readFileSync(questManagerFile, 'utf8');
    const classes = extractClassesFromSource(content);
    const label = questManagerFile === fixturePath ? 'fixture QuestManager.h에서 EQuestState 추출' : '실제 QuestManager.h에서 EQuestState 추출';
    check(label, classes.includes('EQuestState'), `추출됨: [${classes.join(', ')}]`);
} else {
    check('QuestManager.h 파일 존재 (실제 또는 fixture)', false, '파일 없음');
}

// ── [2] 의미 충돌 감지 (SYSTEM_EXISTS) ────────────────────────────────────
console.log('\n=== [2] 시스템 의미 충돌 감지 ===');

check('SYSTEM_CONFLICT_MAP 정의 존재', main.includes('SYSTEM_CONFLICT_MAP'));
check('dialogue 키워드 매핑 존재', main.includes("'dialogue'") && main.includes("'DialogueSystem'"));
check('quest 키워드 매핑 존재', main.includes("'quest'") && main.includes("'QuestManager'"));
check('magic 키워드 매핑 존재', main.includes("'magic'") && main.includes("'MagicComponent'"));
check('save 키워드 매핑 존재', main.includes("'save'") && main.includes("'SaveLoadSubsystem'"));
check('inventory 키워드 매핑 존재', main.includes("'inventory'") && main.includes("'InventoryComponent'"));
check('minimap 키워드 매핑 존재', main.includes("'minimap'") && main.includes("'MinimapSubsystem'"));
check('daynight 키워드 매핑 존재', main.includes("'daynight'") && main.includes("'DayNightCycleManager'"));
check('SYSTEM_EXISTS 충돌 타입 정의', main.includes("type: 'SYSTEM_EXISTS'"));
check('semanticConflicts 반환', main.includes('semanticConflicts'));
check('시스템 충돌 시 REVIEW 결정', main.includes("semanticConflicts.length") && main.includes("decision = 'REVIEW'"));

// ── [3] stalePath 감지 ─────────────────────────────────────────────────────
console.log('\n=== [3] stalePath 감지 ===');

check('getApplyQueueSummary에 stalePath 필드 존재', main.includes('stalePath'));
check('E:\\\\ToribatMagicSchool 패턴 감지', main.includes('E:\\\\\\\\ToribatMagicSchool') || main.includes('E:\\\\ToribatMagicSchool'));

// 실제 pending 파일에서 stalePath 감지 테스트
const pendingDir = path.join(PROJECT, 'apply_queue', 'pending');
if (fs.existsSync(pendingDir)) {
    const pendingFiles = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    let staleCount = 0;
    for (const f of pendingFiles) {
        const content = fs.readFileSync(path.join(pendingDir, f), 'utf8');
        if (/E:\\ToribatMagicSchool|E:\/ToribatMagicSchool/i.test(content)) staleCount++;
    }
    check('실제 pending 파일에서 stale 경로 감지', staleCount > 0, `stale 파일 수: ${staleCount}/${pendingFiles.length}`);
} else {
    console.log('  (pending 폴더 없음 — 건너뜀)');
}

// ── [4] PM Warning 표시 ───────────────────────────────────────────────────
console.log('\n=== [4] PM Legacy Queue Warning ===');

check('staleQueueItems 변수 존재', main.includes('staleQueueItems'));
check('Legacy Queue Warning 텍스트', main.includes('Legacy Queue Warning'));
check('stalePath(E:\\\\) 큐 파일 수 표시', main.includes('stalePath(E:\\\\'));
check('PM 보고서에 Legacy Queue Warning 섹션', main.includes('## Legacy Queue Warning'));
check('stale 파일 목록 PM 보고서에 포함', main.includes('staleQueueItems.map'));

// ── [5] 전체 구조 검증 ────────────────────────────────────────────────────
console.log('\n=== [5] 전체 구조 ===');

check('extractClassesFromSource 함수 존재', main.includes('function extractClassesFromSource'));
check('validateCandidateAgainstProject 함수 존재', main.includes('function validateCandidateAgainstProject'));
check('getApplyQueueSummary 함수 존재', main.includes('function getApplyQueueSummary'));
check('generatePmValidation 함수 존재', main.includes('function generatePmValidation'));

console.log(`\n${'='.repeat(55)}`);
console.log(`결과: ${passed}개 통과 / ${failed}개 실패 / ${passed + failed}개 총 검사`);
if (failed === 0) {
    console.log('V66 WARNING 수정 전체 통과!');
    process.exit(0);
} else {
    console.log('일부 검증 실패 — 위 항목 확인 필요');
    process.exit(1);
}
