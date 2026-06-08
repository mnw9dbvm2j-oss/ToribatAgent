#!/usr/bin/env node
/**
 * V79: Apply Review Workflow 검증
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

function check(label, condition) {
    if (condition) {
        console.log(`PASS ${label}`);
        passed++;
    } else {
        console.error(`FAIL ${label}`);
        failed++;
    }
}

const main = fs.readFileSync(MAIN, 'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));

check('apply_reviews 폴더 생성 대상', main.includes("'apply_reviews'"));
check('getApplyReviewsDir 함수', main.includes('function getApplyReviewsDir'));
check('createApplyReview 함수', main.includes('function createApplyReview'));
check('getApplyReviewSummary 함수', main.includes('function getApplyReviewSummary'));
check('generateApplyReviewWorkflowReport 함수', main.includes('function generateApplyReviewWorkflowReport'));
check('Apply Review PASS 승인 게이트', /nextStatus === 'approved'[\s\S]{1,500}Apply Review PASS 필요/.test(main));
check('dry-run 안전 확인', /dry-run 확인/.test(main) && /allowRealApply required: true/.test(main));
check('actual content copy false 명시', main.includes('actual content copy: false'));
check('PASS/REVIEW/REJECT 판정', main.includes("'PASS'") && main.includes("'REVIEW'") && main.includes("'REJECT'"));
check('IPC create-apply-review', main.includes("ipcMain.handle('create-apply-review'"));
check('IPC read-apply-reviews', main.includes("ipcMain.handle('read-apply-reviews'"));
check('IPC generate-apply-review-workflow-report', main.includes("ipcMain.handle('generate-apply-review-workflow-report'"));
check('preload createApplyReview', preload.includes('createApplyReview'));
check('preload readApplyReviews', preload.includes('readApplyReviews'));
check('preload generateApplyReviewWorkflowReport', preload.includes('generateApplyReviewWorkflowReport'));
check('UI Apply Review 버튼', html.includes('createApplyReview()') && html.includes('Apply Review'));
check('UI 리뷰 보고서 버튼', html.includes('generateApplyReviewReport()'));
check('UI 함수 createApplyReview', html.includes('async function createApplyReview'));
check('UI 함수 generateApplyReviewReport', html.includes('async function generateApplyReviewReport'));
check('package verify:v79 등록', !!pkg.scripts['verify:v79']);
check('package verify 체인 포함', pkg.scripts.verify.includes('verify-v79-apply-review-workflow.js'));

console.log(`\n결과: ${passed}개 통과 / ${failed}개 실패`);
if (failed) process.exit(1);
console.log('V79 Apply Review Workflow 검증 완료');
