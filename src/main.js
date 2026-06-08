const { app, BrowserWindow, ipcMain, Tray, Menu, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const os = require('os');
const mcpAdapter = require('./mcp-adapter');

let mainWindow, tray;
let isRunning = false;
let cycleCount = 0;
let completedTasks = 0;
let generatedFiles = 0;
let runningTimer = null;

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_PROJECT_PATH = 'D:\\ToribatMagicSchool';
const DEFAULT_VAULT_PATH = 'E:\\ToribatVault';
const APP_ROOT = path.resolve(__dirname, '..');

const AGENT_KEYS = [
    'code', 'render', 'world', 'game', 'art', 'qa', 'story', 'pm',
    'ai', 'dungeon', 'sound', 'balance', 'magic'
];

const DEFAULT_ENABLED_AGENTS = {
    // 사용자가 직접 비주얼/맵/아트를 담당하므로 기본값에서 관련 직원은 OFF
    code: true,
    render: false,
    world: false,
    game: true,
    art: false,
    qa: true,
    story: true,
    pm: true,
    ai: true,
    dungeon: false,
    sound: false,
    balance: true,
    magic: true
};

function normalizeEnabledAgents(value) {
    return { ...DEFAULT_ENABLED_AGENTS, ...(value || {}) };
}


function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            return {
                openaiKey: saved.openaiKey || '',
                anthropicKey: saved.anthropicKey || '',
                projectPath: saved.projectPath || DEFAULT_PROJECT_PATH,
                intervalSeconds: Number(saved.intervalSeconds || 60),
                maxParallelTasks: Number(saved.maxParallelTasks || 2),
                claudeTimeoutSeconds: Number(saved.claudeTimeoutSeconds || 300),
                localAiEnabled: saved.localAiEnabled !== false,
                localAiBaseUrl: saved.localAiBaseUrl || 'http://127.0.0.1:1234/v1',
                localAiModel: saved.localAiModel || 'qwen2.5-vl-3b-instruct',
                localAiFallbackPaid: saved.localAiFallbackPaid === true,
                allowRealApply: saved.allowRealApply === true,
                enabledAgents: normalizeEnabledAgents(saved.enabledAgents),
                vaultPath: saved.vaultPath || DEFAULT_VAULT_PATH
            };
        }
    } catch (e) {
        console.error('설정 로드 실패:', e.message);
    }
    return {
        openaiKey: '',
        anthropicKey: '',
        projectPath: DEFAULT_PROJECT_PATH,
        intervalSeconds: 60,
        maxParallelTasks: 2,
        claudeTimeoutSeconds: 300,
        localAiEnabled: true,
        localAiBaseUrl: 'http://127.0.0.1:1234/v1',
        localAiModel: 'qwen2.5-vl-3b-instruct',
        localAiFallbackPaid: false,
        allowRealApply: false,
        enabledAgents: normalizeEnabledAgents(),
        vaultPath: DEFAULT_VAULT_PATH
    };
}

function saveConfig(cfg) {
    const normalized = {
        openaiKey: cfg.openaiKey || '',
        anthropicKey: cfg.anthropicKey || '',
        projectPath: cfg.projectPath || DEFAULT_PROJECT_PATH,
        intervalSeconds: Number(cfg.intervalSeconds || 60),
        maxParallelTasks: Number(cfg.maxParallelTasks || 2),
        claudeTimeoutSeconds: Number(cfg.claudeTimeoutSeconds || 300),
        localAiEnabled: cfg.localAiEnabled !== false,
        localAiBaseUrl: cfg.localAiBaseUrl || 'http://127.0.0.1:1234/v1',
        localAiModel: cfg.localAiModel || 'qwen2.5-vl-3b-instruct',
        localAiFallbackPaid: cfg.localAiFallbackPaid === true,
        allowRealApply: cfg.allowRealApply === true,
        enabledAgents: normalizeEnabledAgents(cfg.enabledAgents),
        vaultPath: cfg.vaultPath || DEFAULT_VAULT_PATH
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0d0d0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('close', (e) => {
        if (isRunning) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, '../assets/icon.png');
        tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(app.getAppPath(), 'assets/icon.png'));
    } catch {
        return;
    }
    tray.setToolTip('ToribatAgent');
    tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
    updateTrayMenu();
}

function updateTrayMenu() {
    if (!tray) return;
    const menu = Menu.buildFromTemplate([
        { label: '🧙 ToribatAgent', enabled: false },
        { label: `상태: ${isRunning ? '실행 중' : '대기'}`, enabled: false },
        { type: 'separator' },
        { label: '대시보드 열기', click: () => mainWindow.show() },
        { label: isRunning ? '중지' : '시작', click: () => isRunning ? stopAgents() : startAgents() },
        { type: 'separator' },
        { label: '종료', click: () => { stopAgents(); app.quit(); } }
    ]);
    tray.setContextMenu(menu);
}

function ensureProjectFolders(projectPath) {
    [
        'tasks',
        'reports',
        'knowledge',
        'reviews',
        'reviews/code',
        'reviews/story',
        'reviews/world',
        'reviews/art',
        'reviews/qa',
        'reviews/pm',
        'apply_candidates',
        'apply_candidates/code',
        'apply_candidates/quest',
        'apply_candidates/story',
        'apply_candidates/art',
        'apply_candidates/world',
        'apply_candidates/qa',
        'patch_candidates',
        'patch_candidates/code',
        'patch_candidates/build',
        'patch_candidates/config',
        'patch_candidates/blueprint',
        'apply_queue',
        'apply_queue/pending',
        'apply_queue/approved',
        'apply_queue/rejected',
        'apply_reviews',
        'import_manifests',
        'tasks/outputs',
        'tasks/outputs/code',
        'tasks/outputs/world',
        'tasks/outputs/art',
        'tasks/outputs/story',
        'tasks/outputs/qa',
        'tasks/outputs/system',
        'tasks/outputs/general',
        'tasks/story',
        'tasks/world_design',
        'tasks/bug_reports',
        'art_prompts/buildings',
        'art_prompts/characters',
        'agents',
        'sprints',
        // V67-V72: Image-to-3D pipeline
        'asset_inputs',
        'asset_inputs/images',
        'asset_inputs/analyzed',
        'asset_decomposition_plans',
        'asset_generation_queue',
        'asset_generation_queue/pending',
        'asset_generation_queue/running',
        'asset_generation_queue/done',
        'asset_generation_queue/failed',
        'generated_assets',
        'apply_candidates/world'
    ].forEach((dir) => {
        const full = path.join(projectPath, dir);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    });

    const todoFile = path.join(projectPath, 'tasks', 'todo.md');
    const doneFile = path.join(projectPath, 'tasks', 'done.md');
    const generatedTasksFile = path.join(projectPath, 'tasks', 'generated_tasks.md');
    const pinnedKnowledgeFile = path.join(projectPath, 'knowledge', 'pinned_knowledge.json');
    const referenceDesignBibleFile = path.join(projectPath, 'knowledge', 'reference_design_bible.md');
    const firstSprintFile = path.join(projectPath, 'sprints', 'sprint_001.md');
    if (!fs.existsSync(todoFile)) {
        fs.writeFileSync(todoFile, '# 📋 ToribatMagicSchool - 태스크 목록\n\n- [ ] 🔴 [전체] 첫 번째 태스크를 입력하세요\n', 'utf8');
    }
    if (!fs.existsSync(doneFile)) fs.writeFileSync(doneFile, '# ✅ 완료 로그\n', 'utf8');
    if (!fs.existsSync(generatedTasksFile)) {
        fs.writeFileSync(generatedTasksFile, '# 에이전트 생성 태스크\n\nPM 승인 전까지 todo.md에 자동 반영되지 않습니다.\n\n', 'utf8');
    }
    if (!fs.existsSync(pinnedKnowledgeFile)) {
        fs.writeFileSync(pinnedKnowledgeFile, JSON.stringify(getDefaultPinnedKnowledge(), null, 2), 'utf8');
    }
    if (!fs.existsSync(referenceDesignBibleFile)) {
        fs.writeFileSync(referenceDesignBibleFile, buildReferenceDesignBible(), 'utf8');
    }
    if (!fs.existsSync(firstSprintFile)) {
        fs.writeFileSync(firstSprintFile, buildSprintMarkdown({
            id: 1,
            status: 'planned',
            goal: '첫 자동 스프린트 준비',
            tasks: [],
            createdAt: new Date()
        }), 'utf8');
    }
}

function getTodoFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'tasks', 'todo.md');
}

function getDoneFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'tasks', 'done.md');
}

function getGeneratedTasksFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'tasks', 'generated_tasks.md');
}

function getProjectStatusFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'project_status.md');
}

function getProjectReportFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'project_report.md');
}

function getBuildDiagnosticsFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'build_diagnostics.md');
}

function getVerticalSlicePlanFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'vertical_slice_plan.md');
}

function getVerticalSliceStatusFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'vertical_slice_status.md');
}

function getGameStateFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'game_state.md');
}

function getReferenceDesignBibleFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'knowledge', 'reference_design_bible.md');
}

function getCommandCenterFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'command_center.md');
}

function getPmValidationFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'pm_validation.md');
}

function getStateAuditFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'state_audit.md');
}

function safeWriteFile(filePath, content) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
}

// ═══════════════════════════════════════════════════════════════
// V48-V50 § 코드/블루프린트 생성 인프라
// ═══════════════════════════════════════════════════════════════

const SCHOOL_CODE_TEMPLATES = [
    {
        id: 'magic_component',
        label: 'Magic Component (C++)',
        category: 'code',
        targetPath: 'Source/ToribatMagicSchool/Components/UMagicComponent.h',
        description: '플레이어 주문 습득·시전·쿨다운 관리 컴포넌트',
        body: `// UMagicComponent.h — 첫 주문 습득 및 시전 컴포넌트
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "UMagicComponent.generated.h"

USTRUCT(BlueprintType)
struct FSpellData {
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FName SpellID;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Cooldown = 1.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ManaCost = 10.0f;
};

UCLASS(ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class TORIBATMAGICSCHOOL_API UUMagicComponent : public UActorComponent {
    GENERATED_BODY()
public:
    UUMagicComponent();
    UFUNCTION(BlueprintCallable) bool LearnSpell(FName SpellID);
    UFUNCTION(BlueprintCallable) bool CastSpell(FName SpellID);
    UPROPERTY(BlueprintReadOnly) TArray<FSpellData> LearnedSpells;
protected:
    virtual void BeginPlay() override;
    UPROPERTY(EditDefaultsOnly) TArray<FSpellData> SpellDatabase;
    TMap<FName, float> CooldownTimers;
};`,
        testCriteria: [
            'LearnSpell("Lumos") 호출 후 LearnedSpells 배열에 추가 확인',
            'CastSpell 쿨다운 중 재호출 시 false 반환 확인',
            'PIE에서 BeginPlay 오류 없음 확인'
        ]
    },
    {
        id: 'quest_state_manager',
        label: 'Quest State Manager (C++)',
        category: 'code',
        targetPath: 'Source/ToribatMagicSchool/Quest/UQuestStateManager.h',
        description: '퀘스트 시작/진행/완료 상태 관리 컴포넌트',
        body: `// UQuestStateManager.h — 퀘스트 상태 관리
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "UQuestStateManager.generated.h"

UENUM(BlueprintType) enum class EQuestState : uint8 { Inactive, Active, Completed, Failed };

USTRUCT(BlueprintType)
struct FQuestData {
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FName QuestID;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FText Title;
    UPROPERTY(BlueprintReadOnly) EQuestState State = EQuestState::Inactive;
};

UCLASS(ClassGroup=(Quest), meta=(BlueprintSpawnableComponent))
class TORIBATMAGICSCHOOL_API UUQuestStateManager : public UActorComponent {
    GENERATED_BODY()
public:
    UFUNCTION(BlueprintCallable) bool StartQuest(FName QuestID);
    UFUNCTION(BlueprintCallable) bool CompleteQuest(FName QuestID);
    UFUNCTION(BlueprintCallable) EQuestState GetQuestState(FName QuestID) const;
    UPROPERTY(BlueprintReadOnly) TArray<FQuestData> ActiveQuests;
protected:
    UPROPERTY(EditDefaultsOnly) TArray<FQuestData> QuestDatabase;
};`,
        testCriteria: [
            'StartQuest("FirstClass") 후 State == Active 확인',
            'CompleteQuest 호출 후 State == Completed 확인',
            '동일 퀘스트 중복 시작 방지 확인'
        ]
    },
    {
        id: 'save_game',
        label: 'SaveGame (C++/Blueprint)',
        category: 'code',
        targetPath: 'Source/ToribatMagicSchool/Save/UToribatSaveGame.h',
        description: '체크포인트·주문·퀘스트 진행 저장 구조',
        body: `// UToribatSaveGame.h — 게임 저장 구조
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "UToribatSaveGame.generated.h"

UCLASS()
class TORIBATMAGICSCHOOL_API UToribatSaveGame : public USaveGame {
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame) FName LastCheckpointID;
    UPROPERTY(SaveGame) TArray<FName> LearnedSpells;
    UPROPERTY(SaveGame) TArray<FName> CompletedQuests;
    UPROPERTY(SaveGame) int32 PlayTimeSeconds = 0;
    static const FString SlotName;
};`,
        testCriteria: [
            'UGameplayStatics::SaveGameToSlot 호출 후 파일 생성 확인',
            '로드 후 LearnedSpells 배열 복원 확인',
            'PIE 재시작 후 체크포인트 복귀 확인'
        ]
    },
    {
        id: 'dialogue_component',
        label: 'Dialogue Component (Blueprint 기반)',
        category: 'code',
        targetPath: 'Content/ToribatMagicSchool/Blueprints/BP_DialogueComponent.uasset',
        description: 'NPC 대화 트리거·대사 표시·퀘스트 연결 Blueprint',
        body: `## BP_DialogueComponent 설계 명세

### 변수
| 변수명 | 타입 | 설명 |
|--------|------|------|
| DialogueTable | DataTable<FDialogueRow> | 대화 데이터 테이블 |
| CurrentLineIndex | int32 | 현재 대사 인덱스 |
| LinkedQuestID | FName | 대화 완료 시 시작할 퀘스트 |

### 이벤트
- **OnTalkPressed** → ShowNextLine() → if 마지막 줄: TriggerQuest(LinkedQuestID)
- **OnInteractOverlap** → UI_DialogueWidget 표시

### 데이터 테이블 행 (FDialogueRow)
\`\`\`
SpeakerName | LineText | EmotionTag | WaitForInput
\`\`\`

### 테스트 기준
- NPC 근처 E키 → 대화 위젯 표시
- 마지막 대사 후 연결 퀘스트 시작
- ESC 대화 중단 후 재개 가능`,
        testCriteria: [
            'NPC에서 Interact 입력 시 대화 UI 표시',
            '마지막 대사 완료 후 Quest 트리거 확인',
            'PIE 중 중단/재개 정상 동작'
        ]
    },
    {
        id: 'basic_enemy_ai',
        label: 'Basic Enemy AI (C++)',
        category: 'code',
        targetPath: 'Source/ToribatMagicSchool/Enemy/ABasicEnemy.h',
        description: '첫 전투용 기본 적 AI - 탐지·추격·피격 반응',
        body: `// ABasicEnemy.h — 기본 적 AI
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "ABasicEnemy.generated.h"

UCLASS()
class TORIBATMAGICSCHOOL_API ABasicEnemy : public ACharacter {
    GENERATED_BODY()
public:
    ABasicEnemy();
    UFUNCTION(BlueprintCallable) void TakeMagicDamage(float Damage);
    UFUNCTION(BlueprintNativeEvent) void OnDetectPlayer(APawn* Player);
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxHealth = 100.f;
    UPROPERTY(BlueprintReadOnly) float CurrentHealth;
    UPROPERTY(EditAnywhere) float DetectionRadius = 600.f;
    UPROPERTY(EditAnywhere) float AttackRange = 150.f;
protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
private:
    APawn* TargetPlayer = nullptr;
    bool bIsDead = false;
};`,
        testCriteria: [
            'PIE에서 적 탐지 반경 진입 시 추격 시작',
            'TakeMagicDamage 호출 후 HP 감소 확인',
            'HP 0 시 사망 처리 (Ragdoll or Destroy)'
        ]
    }
];

function getPlayLoopTemplateFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'play_loop_template.md');
}

const SCHOOL_PLAY_LOOP_STAGES = [
    { id: 'entry',        label: '시작 구역 입장',    key: 'start_area',    minutes: 2,  required: true },
    { id: 'first_class',  label: '첫 수업 퀘스트',    key: 'first_class',   minutes: 5,  required: true },
    { id: 'first_spell',  label: '첫 주문 습득',       key: 'first_spell',   minutes: 5,  required: true },
    { id: 'spell_puzzle', label: '주문 퍼즐 도전',     key: 'spell_puzzle',  minutes: 5,  required: false },
    { id: 'first_combat', label: '첫 전투',            key: 'first_combat',  minutes: 5,  required: true },
    { id: 'npc_hint',     label: 'NPC 힌트 대화',      key: 'npc_dialogue',  minutes: 3,  required: false },
    { id: 'first_secret', label: '비밀 발견',           key: 'first_secret',  minutes: 5,  required: false },
    { id: 'dungeon',      label: '짧은 던전 (3방)',     key: 'short_dungeon', minutes: 10, required: true },
    { id: 'reward_save',  label: '보상/저장',           key: 'reward_save',   minutes: 3,  required: true },
    { id: 'qa',           label: 'QA 통과 검증',        key: 'qa_pass',       minutes: 2,  required: true }
];

function generatePlayLoopTemplate(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const vertical = analyzeVerticalSliceStatus(projectPath);
    const byKey = Object.fromEntries((vertical.statuses || []).map(item => [item.key, item]));
    const totalMinutes = SCHOOL_PLAY_LOOP_STAGES.reduce((s, st) => s + st.minutes, 0);

    const stageRows = SCHOOL_PLAY_LOOP_STAGES.map(stage => {
        const item = byKey[stage.key] || { level: 0, status: '상태 0 - 없음', evidence: '근거 없음' };
        const levelIcon = ['❌', '📄', '🗂️', '✅', '🏆'][Math.min(4, item.level || 0)];
        const gap = (item.level || 0) < 3 ? (stage.required ? '🔴 필수' : '🟡 권장') : '—';
        return `| ${stage.label} | ${stage.minutes}분 | ${levelIcon} 상태${item.level || 0} | ${item.evidence} | ${gap} |`;
    });

    const implemented = SCHOOL_PLAY_LOOP_STAGES.filter(st => (byKey[st.key]?.level || 0) >= 3).length;
    const requiredGaps = SCHOOL_PLAY_LOOP_STAGES.filter(st => st.required && (byKey[st.key]?.level || 0) < 3);
    const estimatedPlayable = Math.round((implemented / SCHOOL_PLAY_LOOP_STAGES.length) * totalMinutes);

    const nextTasks = requiredGaps.slice(0, 5).map(st => {
        const item = byKey[st.key] || { level: 0 };
        const action = (item.level || 0) === 0 ? '기획 문서 작성' : (item.level || 0) === 1 ? '적용 후보 생성' : (item.level || 0) === 2 ? '프로젝트에 실제 반영' : 'QA PASS 획득';
        return `- [ ] 🔴 [${st.required ? '필수' : '권장'}] ${st.label}: ${action}`;
    });

    const codeTemplateList = SCHOOL_CODE_TEMPLATES.map(t =>
        `| ${t.label} | ${t.description} | ${t.targetPath} |`
    );

    const report = `# 소규모 학교 플레이 루프 템플릿

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 목표 플레이 시간: ${totalMinutes}분 (20~40분 루프)
- 현재 구현 단계: ${implemented}/${SCHOOL_PLAY_LOOP_STAGES.length}개 상태3 이상
- 추정 플레이 가능 시간: ${estimatedPlayable}분

## 플레이 루프 단계별 구현 현황

| 단계 | 예상 시간 | 구현 상태 | 근거 | 우선순위 |
| --- | ---: | --- | --- | --- |
${stageRows.join('\n')}

## 플레이 루프 흐름
\`\`\`
시작 구역 입장
  → 첫 수업 퀘스트 수락 (교수 NPC)
    → 첫 주문 습득 (Magic Component)
      → 주문 퍼즐 도전 (반응형 오브젝트)
        → 비밀 발견 (퀘스트 갱신)
          → 짧은 던전 진입 (3방 구성)
            → 첫 전투 (기본 적 AI)
              → 보상/저장 (SaveGame 체크포인트)
                → QA 통과 검증
\`\`\`

## 필수 미구현 단계 (다음 태스크)
${nextTasks.join('\n') || '- 모든 필수 단계 상태3 이상 달성'}

## 코드/블루프린트 템플릿 목록

| 템플릿 | 설명 | 대상 경로 |
| --- | --- | --- |
${codeTemplateList.join('\n')}

## 상태 기준
- 상태0 ❌ 근거 없음 → 상태1 📄 문서/기획 → 상태2 🗂️ 적용 후보 → 상태3 ✅ 실파일 → 상태4 🏆 검수 통과
- 상태3 이상: 실제 Source/Content/Map/Asset 또는 빌드·플레이 로그 근거 존재
- 상태4: .uproject + 실제 구현 + QA PASS + Reviewer PASS 모두 필요
`;
    safeWriteFile(getPlayLoopTemplateFile(projectPath), report);
    generatedFiles++;
    return { report, implemented, total: SCHOOL_PLAY_LOOP_STAGES.length, requiredGaps: requiredGaps.map(s => s.key), estimatedPlayable };
}

function generateCodeApplyCandidate(projectPath, templateId) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const template = SCHOOL_CODE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return null;
    const dir = path.join(getApplyCandidatesDir(projectPath), template.category);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${timestamp}_${templateId}.candidate.md`;
    const filePath = path.join(dir, filename);
    const content = `# 코드 적용 후보 — ${template.label}

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 템플릿 ID: ${template.id}
- 분류: ${template.category}
- 대상 경로: ${template.targetPath}
- 설명: ${template.description}

## 코드/설계 본문

\`\`\`
${template.body}
\`\`\`

## 테스트/검수 기준
${template.testCriteria.map(c => `- [ ] ${c}`).join('\n')}

## 적용 방법
1. 위 코드를 \`${template.targetPath}\`에 생성한다.
2. Build.cs에 필요한 모듈 의존성을 추가한다.
3. PIE에서 BeginPlay 오류 없이 실행되는지 확인한다.
4. 위 테스트 기준을 모두 통과하면 Reviewer Agent 검수를 요청한다.

## 상태
- 현재 단계: 상태2 — 적용 후보
- 상태3 조건: Source 파일로 실제 복사 적용
- 상태4 조건: .uproject + 실제 구현 + QA PASS + Reviewer PASS
`;
    content += buildKnowledgeContextSection(template.label + ' ' + template.category);
    safeWriteFile(filePath, content);
    generatedFiles++;
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, { task: `코드 후보 생성: ${template.label}`, decision: `templateId: ${templateId}`, result: `${template.category} → ${template.targetPath}` });
    } catch { /* 비중단 */ }
    return { filePath, templateId, category: template.category, targetPath: template.targetPath };
}

function generateAllCodeCandidates(projectPath) {
    return SCHOOL_CODE_TEMPLATES.map(t => generateCodeApplyCandidate(projectPath, t.id)).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════

function resolveReadableReportFile(projectPath, filename) {
    const candidates = [
        path.join(projectPath || '', 'reports', filename),
        path.join(APP_ROOT, 'reports', filename),
        path.join(DEFAULT_PROJECT_PATH, 'reports', filename)
    ].filter(Boolean);
    return candidates.find(file => fs.existsSync(file)) || candidates[0];
}

function getWritableProjectPath(projectPath) {
    const requested = projectPath || DEFAULT_PROJECT_PATH;
    try {
        ensureProjectFolders(requested);
        return requested;
    } catch (e) {
        sendLog(`프로젝트 경로 준비 실패, 앱 루트로 폴백: ${e.message}`, 'warn');
        ensureProjectFolders(APP_ROOT);
        return APP_ROOT;
    }
}

function getPinnedKnowledgeFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'knowledge', 'pinned_knowledge.json');
}

function getReviewsDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reviews');
}

function getApplyCandidatesDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'apply_candidates');
}

function getSprintsDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'sprints');
}

function getPatchCandidatesDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'patch_candidates');
}

function getApplyQueueDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'apply_queue');
}

function getTraceabilityFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'traceability.md');
}
function getAssetInputsDir(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'asset_inputs'); }
function getAssetAnalyzedDir(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'asset_inputs', 'analyzed'); }
function getAssetDecompositionPlansDir(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'asset_decomposition_plans'); }
function getAssetGenerationQueueDir(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'asset_generation_queue'); }
function getGeneratedAssetsDir(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'generated_assets'); }
function getAssetQualityReportFile(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'asset_quality_report.md'); }
function getAssetSegmentationRulesFile(projectPath) { return path.join(projectPath || DEFAULT_PROJECT_PATH, 'knowledge', 'asset_segmentation_rules.md'); }

function getDefaultPinnedKnowledge() {
    return [
        { key: 'school_name', label: '학교 이름', value: 'Toribat Magic School', importance: 5, pinned: true },
        { key: 'faculty', label: '교수진', value: '마법 기초 교수, 전투 마법 교수, 고대 룬 교수, 비행/이동 교수 중심의 소규모 교수진', importance: 4, pinned: true },
        { key: 'student_npcs', label: '학생 NPC', value: '주인공 동급생 3~5명, 라이벌 1명, 조력자 1명으로 제한', importance: 4, pinned: true },
        { key: 'main_quest', label: '메인 퀘스트', value: '입학 첫날 숨겨진 비밀방 단서를 발견하고 첫 전투와 첫 퍼즐을 해결하는 20~40분 수직 슬라이스', importance: 5, pinned: true },
        { key: 'world_structure', label: '월드 구조', value: '본관, 중앙홀, 복도, 교실 2개, 안뜰, 비밀방/소형 던전만 우선 구현', importance: 5, pinned: true },
        { key: 'magic_rules', label: '마법 규칙', value: '마법은 4~6개 핵심 주문으로 제한하고 전투, 퍼즐, 상호작용에 재사용한다', importance: 5, pinned: true },
        { key: 'project_goal', label: '프로젝트 목표', value: '고품질 마법학교 감성을 지향하되 2002년 PC식 소규모 액션 어드벤처 범위로 완성한다', importance: 5, pinned: true }
    ];
}

function buildReferenceDesignBible() {
    return `# Reference Design Bible

이 문서는 특정 IP를 복제하지 않고, 2002년 PC식 소규모 마법학교 액션 어드벤처의 제작 구조만 참고한다.

## 1. 목표 게임 구조
- 제한된 마법학교: 본관 일부, 중앙홀, 복도, 첫 교실, 안뜰, 낡은 지하서고만 우선 구현한다.
- 수업 기반 주문 습득: 첫 수업에서 핵심 주문 1~2개를 배우고 즉시 퍼즐과 전투에 재사용한다.
- 복도/교실/비밀방 중심 탐험: 거대한 월드보다 짧고 명확한 동선, 잠긴 문, 숨은 통로, 반응형 오브젝트를 우선한다.
- 퍼즐과 주문 활용: 주문은 전투 버튼이 아니라 스위치, 장애물, 숨은 장치에도 쓰인다.
- 수집 요소: 작은 보상, 기록물, 수업 토큰 정도로 제한한다.
- 짧은 던전: 3~5개 방, 퍼즐 1개, 전투 1개, 보상 1개로 끝낸다.
- 20~40분 수직 슬라이스: 시작 구역부터 첫 보상/저장까지 한 번에 플레이 가능해야 한다.

## 2. 하지 말 것
- 대형 오픈월드 금지.
- 학교 전체 구현 금지.
- 멀티플레이 우선 금지.
- 복잡한 RPG 성장 시스템 과잉 금지.
- 원작 고유명사, 인물명, 장소명, 음악/대사/문장 직접 사용 금지.
- 분위기는 오케스트라 판타지 감성만 참고하고 선율, 테마, 제목은 복제하지 않는다.

## 3. ToribatMagicSchool 적용 기준
- 정문: 플레이어 도착과 첫 목표 제시.
- 중앙홀: 시작 허브이자 첫 교실로 이어지는 핵심 동선.
- 복도: 짧은 탐험, 잠긴 문, 숨은 상호작용.
- 첫 교실: 주문 습득, 튜토리얼, 교수 NPC 안내.
- 안뜰: 짧은 퍼즐 또는 안전한 주문 사용 공간.
- 낡은 지하서고: 첫 비밀 발견과 짧은 던전 진입.
- 첫 수업: 주문 1~2개 습득, 대사, 완료 조건.
- 첫 전투: 기본 적 AI, 피격 반응, 체력/피해 처리.
- 첫 비밀 발견: 주문 반응 오브젝트, 퀘스트 갱신, 보상/저장.

## 4. 필수 수직 슬라이스 루프
1. 시작 구역
2. 첫 수업
3. 첫 주문 습득
4. 주문 사용 퍼즐
5. 첫 전투
6. NPC 대화
7. 첫 비밀 발견
8. 짧은 던전
9. 보상/저장
10. QA 통과

## 5. Reviewer 기준
- 제한된 규모에 맞는가.
- 수업/주문/퍼즐/탐험 루프가 있는가.
- 소규모 마법학교 게임에 필요한가.
- 대형 오픈월드식 과잉 설계가 아닌가.
- 실제 UE5 프로젝트에 적용 가능한가.
- 문서뿐 아니라 적용 후보, Source, Content와 연결되는가.
`;
}

function normalizePinnedKnowledge(items) {
    const source = Array.isArray(items) ? items : [];
    const defaults = getDefaultPinnedKnowledge();
    const byKey = new Map(defaults.map(item => [item.key, item]));
    for (const item of source) {
        if (!item || !item.key) continue;
        byKey.set(item.key, {
            key: String(item.key),
            label: item.label || item.key,
            value: item.value || '',
            importance: Math.max(1, Math.min(5, Number(item.importance || 3))),
            pinned: item.pinned !== false
        });
    }
    return Array.from(byKey.values());
}

function loadPinnedKnowledge(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const file = getPinnedKnowledgeFile(projectPath);
    try {
        if (fs.existsSync(file)) {
            return normalizePinnedKnowledge(JSON.parse(fs.readFileSync(file, 'utf8')));
        }
    } catch (e) {
        sendLog(`Pinned Knowledge 로드 실패: ${e.message}`, 'warn');
    }
    return getDefaultPinnedKnowledge();
}

function savePinnedKnowledge(projectPath, items) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const normalized = normalizePinnedKnowledge(items);
    fs.writeFileSync(getPinnedKnowledgeFile(projectPath), JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}

function getPinnedKnowledgePrompt(projectPath) {
    const items = loadPinnedKnowledge(projectPath).filter(item => item.pinned && Number(item.importance) >= 4);
    if (!items.length) return '';
    return `항상 참조할 Pinned Knowledge:
${items.map(item => `- ${item.label}(중요도 ${item.importance}/5): ${item.value}`).join('\n')}`;
}

function parseTaskLine(line) {
    const match = line.match(/^\s*- \[([ x\/])\]\s*(🔴|🟡|🟢)?\s*(\[[^\]]+\])?\s*(.*)$/);
    if (!match) return null;
    return {
        raw: line,
        state: match[1],
        priority: match[2] || '🟢',
        tag: match[3] || '[전체]',
        text: (match[4] || '').trim()
    };
}

function cleanTaskText(taskLine) {
    const parsed = parseTaskLine(taskLine);
    if (!parsed) return taskLine.trim();
    return `${parsed.priority} ${parsed.tag} ${parsed.text}`.trim();
}

function getOutputSubdir(taskLine) {
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]' };
    const tag = parsed.tag;
    if (tag.includes('코드')) return 'code';
    if (tag.includes('월드')) return 'world';
    if (tag.includes('아트')) return 'art';
    if (tag.includes('스토리')) return 'story';
    if (tag.includes('QA')) return 'qa';
    if (tag.includes('시스템') || tag.includes('전체')) return 'system';
    return 'general';
}

function markTasksInProgress(config, taskLines) {
    const todoFile = getTodoFile(config.projectPath);
    let content = fs.readFileSync(todoFile, 'utf8');
    for (const taskLine of taskLines) {
        const inProgress = taskLine.replace('- [ ]', '- [/]');
        content = content.replace(taskLine, inProgress);
    }
    fs.writeFileSync(todoFile, content, 'utf8');
}

function markTaskDone(config, taskLine) {
    const todoFile = getTodoFile(config.projectPath);
    let content = fs.readFileSync(todoFile, 'utf8');
    const inProgress = taskLine.replace('- [ ]', '- [/]');
    const done = taskLine.replace('- [ ]', '- [x]');
    if (content.includes(inProgress)) content = content.replace(inProgress, done);
    else if (content.includes(taskLine)) content = content.replace(taskLine, done);
    fs.writeFileSync(todoFile, content, 'utf8');
}

function markTaskFailed(config, taskLine, reason) {
    const todoFile = getTodoFile(config.projectPath);
    let content = fs.readFileSync(todoFile, 'utf8');
    const inProgress = taskLine.replace('- [ ]', '- [/]');
    const failed = `${taskLine}  <!-- 실패: ${reason.replace(/-->/g, '')} -->`;
    if (content.includes(inProgress)) content = content.replace(inProgress, failed);
    fs.writeFileSync(todoFile, content, 'utf8');
}

function routeTask(taskLine) {
    const t = taskLine.toLowerCase();

    // 실제 UE5 프로젝트 파일을 생성/수정해야 하는 태스크만 Claude Code가 담당한다.
    // 중요: "생성"이라는 단어만으로 Claude Code를 쓰지 않는다. 스토리/기획/프롬프트 생성까지 유료 도구로 가는 문제를 막기 위해서다.
    if (
        t.includes('[코드]') ||
        t.includes('버그 수정') ||
        t.includes('리팩터링') ||
        t.includes('c++') ||
        t.includes('blueprint') ||
        t.includes('gas') ||
        t.includes('source/') ||
        t.includes('.h') ||
        t.includes('.cpp') ||
        t.includes('컴포넌트') ||
        t.includes('클래스') ||
        t.includes('컴파일 오류') ||
        t.includes('빌드 오류')
    ) return 'claude_code';

    // 나머지 문서/기획/QA/스토리/월드 설계는 기본적으로 무료 로컬 AI가 담당한다.
    return 'local_ai';
}

async function callLocalAI(prompt, config, timeoutMs = 120000) {
    if (!config.localAiEnabled) {
        return 'Local AI 비활성화';
    }

    const baseUrl = (config.localAiBaseUrl || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
    const model = config.localAiModel || 'qwen2.5-vl-3b-instruct';

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout:${timeoutMs / 1000}s`)), timeoutMs)
    );

    try {
        const fetch = (await import('node-fetch')).default;
        const fetchPromise = fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: `너는 ToribatMagicSchool의 무료 로컬 AI 직원이다. 목표는 '호그와트 레거시급 비주얼 감성 + 해리포터와 비밀의 방 PC판 수준의 작은 규모'를 가진 UE5 마법학교 액션 RPG 프로토타입이다. 한국어로 답하되, 추상적인 설명보다 바로 적용 가능한 산출물을 만든다. 반드시 지정된 산출물 규격을 지킨다.`
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 1800,
                stream: false
            })
        });

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            const message = data.error?.message || `${res.status} ${res.statusText}`;
            sendLog(`Local AI 오류: ${message}`, 'warn');
            return `Local AI 오류: ${message}`;
        }

        return data.choices?.[0]?.message?.content || 'Local AI 응답 없음';
    } catch (e) {
        const isTimeout = e.message && e.message.startsWith('timeout:');
        sendLog(`Local AI ${isTimeout ? '시간 초과' : '연결 오류'}: ${e.message}`, 'warn');
        return `Local AI ${isTimeout ? '시간 초과' : '연결 오류'}: ${e.message}`;
    }
}

async function callChatGPT(prompt, config, timeoutMs = 120000) {
    if (!config.openaiKey) {
        sendLog('⚠️ OpenAI API 키가 없습니다. 설정에서 입력해주세요.', 'error');
        return 'OpenAI API 키 없음';
    }

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout:${timeoutMs / 1000}s`)), timeoutMs)
    );

    try {
        const fetch = (await import('node-fetch')).default;
        const fetchPromise = fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: '너는 UE5.4+ 게임 개발 보조 AI다. 한국어로 명확하고 실행 가능한 결과물을 작성한다.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 3000
            })
        });
        const res = await Promise.race([fetchPromise, timeoutPromise]);
        const data = await res.json();
        if (data.error) {
            sendLog(`ChatGPT 오류: ${data.error.message}`, 'error');
            return `ChatGPT 오류: ${data.error.message}`;
        }
        return data.choices?.[0]?.message?.content || '응답 없음';
    } catch (e) {
        const isTimeout = e.message && e.message.startsWith('timeout:');
        sendLog(`ChatGPT ${isTimeout ? '시간 초과' : '연결 오류'}: ${e.message}`, isTimeout ? 'warn' : 'error');
        return `ChatGPT ${isTimeout ? '시간 초과' : '연결 오류'}: ${e.message}`;
    }
}

async function callClaudeApi(prompt, config) {
    if (!config.anthropicKey) return callChatGPT(prompt, config);
    try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 3000,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await res.json();
        if (data.error) return `Claude API 오류: ${data.error.message}`;
        return data.content?.[0]?.text || '응답 없음';
    } catch (e) {
        sendLog(`Claude API 오류, ChatGPT로 폴백: ${e.message}`, 'warn');
        return callChatGPT(prompt, config);
    }
}

function callClaudeCode(prompt, config) {
    return new Promise((resolve) => {
        let finished = false;
        let proc;
        const timeoutMs = Number(config.claudeTimeoutSeconds || 300) * 1000;

        try {
            proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
                cwd: config.projectPath,
                shell: true,
                env: { ...process.env, FORCE_COLOR: '0' }
            });
        } catch (e) {
            resolve(`Claude Code 실행 오류: ${e.message}`);
            return;
        }

        let out = '';
        let err = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('error', e => {
            if (finished) return;
            finished = true;
            resolve(`Claude Code 프로세스 오류: ${e.message}`);
        });
        proc.on('close', (code) => {
            if (finished) return;
            finished = true;
            const result = [out.trim(), err.trim()].filter(Boolean).join('\n\n');
            resolve(result || `Claude Code 종료 코드: ${code}`);
        });

        proc.stdin.write(prompt);
        proc.stdin.end();

        setTimeout(() => {
            if (finished) return;
            finished = true;
            try { proc.kill(); } catch {}
            resolve(`Claude Code 시간 초과: ${config.claudeTimeoutSeconds || 300}초`);
        }, timeoutMs);
    });
}


function getProjectQualityBrief() {
    return `프로젝트 품질 기준:
- 목표: 그래픽 감성은 호그와트 레거시급을 지향하되, 범위는 해리포터와 비밀의 방 PC판처럼 작고 밀도 있게 만든다.
- 월드 규모: 거대한 오픈월드 금지. 본관, 중앙홀, 복도, 교실 2개, 안뜰, 비밀방/소형 던전 중심.
- 플레이 범위: 20~40분짜리 수직 슬라이스. 입학/첫 수업/첫 전투/첫 비밀 발견까지.
- 시스템 수: 적게 만들되 완성도 높게. 이동, 상호작용, 마법 4~6개, NPC 대화, 퀘스트, 저장 정도만 우선.
- 비주얼: 사용자가 직접 담당한다. 아트/이미지/모델링 프롬프트보다 구현, 최적화, 검수 기준에 집중한다.
- 최적화: 8GB RAM 개발 환경을 고려한다. 대형 월드, 과도한 동시 로딩, 불필요한 고해상도 에셋 지시는 금지.
- 산출물은 반드시 '게임에 어떻게 적용하는지'가 보여야 한다.`;
}

function getDeliverableRules(taskLine, aiType) {
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]', text: taskLine };
    const tag = parsed.tag || '[전체]';
    const text = `${tag} ${parsed.text || ''}`;

    if (aiType === 'claude_code' || tag.includes('코드') || /c\+\+|\.h|\.cpp|blueprint|컴포넌트|클래스/i.test(text)) {
        return `코드 산출물 규격:
1. 목적: 이 코드가 게임의 어떤 부분인지 3줄 이내로 설명.
2. 생성/수정 파일: 실제 경로를 명시. 예: Source/ToribatMagicSchool/Magic/ToribatMagicComponent.h
3. 실제 코드: 헤더(.h)와 소스(.cpp)를 분리해서 완성본으로 작성 또는 직접 수정.
4. UE5 적용 방법: Unreal Editor에서 해야 할 단계와 Build.cs 변경 필요 여부.
5. 테스트 방법: 컴파일, PIE 실행, 입력 테스트, 예상 성공 기준.
6. 실패 가능성: 컴파일 오류가 날 만한 지점과 수정 힌트.
금지: 개념 설명만 하고 끝내기, '예시 코드'라고만 쓰기, 존재하지 않는 엔진 API 확정 사용.`;
    }

    if (tag.includes('QA') || /qa|테스트|검수|버그|밸런스/i.test(text)) {
        return `QA 산출물 규격:
1. 검사 대상: 어떤 시스템/장면을 점검하는지.
2. 통과 기준: 사용자가 직접 확인 가능한 기준.
3. 체크리스트: 최소 10개, 각 항목은 [통과/실패/확인필요] 형태.
4. 위험도: 치명/높음/중간/낮음으로 분류.
5. 바로 다음 수정 태스크: todo.md에 넣을 수 있는 문장 3~5개.
금지: 막연한 '테스트해보세요' 식 답변.`;
    }

    if (tag.includes('스토리') || /스토리|퀘스트|대사|npc|교수|학생/i.test(text)) {
        return `스토리/퀘스트 산출물 규격:
1. 퀘스트명 또는 장면명.
2. 게임 내 목적: 플레이어가 실제로 무엇을 하는지.
3. 시작 조건 / 진행 조건 / 완료 조건.
4. NPC 대사: 실제 게임에 넣을 수 있는 짧은 대사 8~15줄.
5. 플레이 동선: 장소 이동 순서.
6. 보상/해금 요소.
7. 구현용 데이터: 퀘스트 ID, 목표 ID, NPC ID를 표로 정리.
금지: 소설처럼 길게만 쓰기. 반드시 게임 이벤트 단위로 쪼갤 것.`;
    }

    if (tag.includes('월드') || /레벨|월드|맵|공간|던전|교실|복도|중앙홀|비밀방/i.test(text)) {
        return `월드/레벨 산출물 규격:
1. 공간 목적: 이 장소가 플레이에서 맡는 역할.
2. 최소 구현 범위: 방/복도/문/상호작용 오브젝트 단위로 나열.
3. 플레이 동선: 시작점 → 목표 → 보상/탈출.
4. UE5 배치 기준: World Partition 여부, 레벨 스트리밍 필요 여부, 충돌/네비메시 주의점.
5. 성능 기준: 한 화면에 보이는 주요 메시 수, LOD/텍스처 권장.
6. 구현 태스크: todo.md에 넣을 작업 5개.
금지: 거대한 오픈월드로 확장하기.`;
    }

    if (tag.includes('아트') || /아트|이미지|프롬프트|모델|에셋|비주얼/i.test(text)) {
        return `아트/에셋 검수 산출물 규격:
1. 사용자가 비주얼 제작을 담당하므로 새 이미지 프롬프트 남발 금지.
2. 3D 모델링 전 무게 판단: 예상 폴리곤, 텍스처, 머티리얼 위험도.
3. UE5 적용 기준: Nanite 사용 여부, LOD 필요 여부, 충돌 단순화 방식.
4. 모듈화 제안: 하나의 거대 모델 대신 나눌 부품.
5. 통과/수정/폐기 판단 기준.
금지: 단순히 '멋진 이미지 프롬프트'만 작성하기.`;
    }

    return `일반 산출물 규격:
1. 목적
2. 게임 내 적용 위치
3. 실제 산출물 본문
4. 적용 방법
5. 테스트/검수 기준
6. 다음 todo 태스크 3개
금지: 추상적인 조언만 작성하기.`;
}

function getResultQualityGateText() {
    return `공통 품질 게이트:
- 결과가 1KB 미만의 빈약한 답변이면 실패로 간주된다.
- 반드시 '목표', '적용 위치', '실제 산출물', '구현 방법', '테스트 방법', '다음 태스크'를 포함한다.
- ToribatMagicSchool의 규모를 키우지 말고 작은 수직 슬라이스에 집중한다.
- 호그와트 레거시라는 이름/저작권 요소를 직접 복제하지 말고, '고품질 마법학교 감성'만 참고한다.
- 해리포터와 비밀의 방 PC판처럼 작은 공간 밀도, 명확한 동선, 퍼즐/전투/대화 중심으로 설계한다.`;
}


function countRegexMatches(text, regex) {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
}

function evaluateResultQuality(result, taskLine, aiType) {
    const text = (result || '').trim();
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]', text: taskLine };
    const tagText = `${parsed.tag || ''} ${parsed.text || ''}`.toLowerCase();
    const reasons = [];
    let score = 0;

    // 1) 분량: 너무 짧은 결과는 실제 개발 산출물로 보기 어렵다.
    if (text.length >= 2200) score += 25;
    else if (text.length >= 1400) score += 20;
    else if (text.length >= 900) score += 12;
    else reasons.push(`분량 부족(${text.length}자)`);

    // 2) 공통 산출물 섹션 검사
    const commonSections = [
        /목표|목적|개요|역할/i,
        /적용 위치|적용 경로|파일 위치|게임 내 적용/i,
        /실제 산출물|본문|코드|데이터|체크리스트/i,
        /구현 방법|적용 방법|반영 방법/i,
        /테스트 방법|테스트|검수|통과 기준|확인 기준/i,
        /다음.*태스크|todo|후속 작업/i
    ];
    let sectionHits = 0;
    for (const r of commonSections) if (r.test(text)) sectionHits++;
    score += sectionHits * 6;
    if (sectionHits < 5) reasons.push(`필수 섹션 부족(${sectionHits}/6)`);

    // 3) 프로젝트 목표 반영 여부
    const projectHits = countRegexMatches(text, /수직 슬라이스|소규모|마법학교|중앙홀|복도|교실|안뜰|비밀방|20~40분|고품질|최적화|UE5|Unreal/i);
    if (projectHits >= 5) score += 14;
    else if (projectHits >= 3) score += 9;
    else reasons.push('프로젝트 목표 반영 부족');

    // 4) 태그별 전문성 검사
    if (aiType === 'claude_code' || tagText.includes('코드') || /c\+\+|\.h|\.cpp|blueprint|컴포넌트|클래스/i.test(tagText)) {
        const codeHits = countRegexMatches(text, /\.h|\.cpp|Build\.cs|UCLASS|USTRUCT|UPROPERTY|UFUNCTION|BeginPlay|Tick|Input|컴파일|PIE|Source\//i);
        if (codeHits >= 6) score += 20;
        else if (codeHits >= 3) score += 10;
        else reasons.push('코드 태스크인데 실제 UE5 코드/파일 정보 부족');
    } else if (tagText.includes('qa') || /테스트|검수|버그|밸런스/i.test(tagText)) {
        const checklistHits = countRegexMatches(text, /통과|실패|확인필요|치명|높음|중간|낮음|체크리스트|재현|기대 결과/i);
        if (checklistHits >= 10) score += 20;
        else if (checklistHits >= 6) score += 12;
        else reasons.push('QA 체크리스트/위험도 기준 부족');
    } else if (tagText.includes('스토리') || /스토리|퀘스트|대사|npc|교수|학생/i.test(tagText)) {
        const storyHits = countRegexMatches(text, /퀘스트|시작 조건|진행 조건|완료 조건|NPC|대사|보상|ID|트리거|목표/i);
        if (storyHits >= 10) score += 20;
        else if (storyHits >= 6) score += 12;
        else reasons.push('스토리/퀘스트 데이터화 부족');
    } else if (tagText.includes('월드') || /월드|레벨|맵|공간|던전|복도|교실|중앙홀/i.test(tagText)) {
        const worldHits = countRegexMatches(text, /동선|충돌|NavMesh|레벨|스트리밍|LOD|텍스처|메시|상호작용|배치/i);
        if (worldHits >= 8) score += 20;
        else if (worldHits >= 5) score += 12;
        else reasons.push('레벨 구현/성능 기준 부족');
    } else {
        const practicalHits = countRegexMatches(text, /표|ID|경로|단계|기준|체크|파일|태스크|구현|반영/i);
        if (practicalHits >= 8) score += 20;
        else if (practicalHits >= 5) score += 12;
        else reasons.push('실무 적용 정보 부족');
    }

    // 5) 빈약한 표현 감점
    const weakPhrases = countRegexMatches(text, /좋습니다|추천합니다|할 수 있습니다|도움이 됩니다|고려해보세요|예시입니다|개념적으로/i);
    if (weakPhrases >= 6) {
        score -= 12;
        reasons.push('추상적/권유형 표현 과다');
    }

    // 6) 명백한 오류/연결 실패 감점
    if (/키 없음|오류|시간 초과|error|failed|연결 오류|응답 없음|ECONNREFUSED|Internal Server Error/i.test(text)) {
        score -= 40;
        reasons.push('AI 실행/연결 오류 포함');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    return {
        score,
        passed: score >= 70,
        reasons: reasons.length ? reasons : ['품질 기준 통과']
    };
}

function buildQualityRewritePrompt(originalPrompt, firstResult, quality) {
    return `${originalPrompt}

---

위 결과물은 품질 검사에서 ${quality.score}/100점으로 부족했다.
부족한 이유:
${quality.reasons.map(r => `- ${r}`).join('\n')}

재작성 지시:
1. 설명형 답변을 줄이고 실제 적용 가능한 산출물로 다시 작성해라.
2. 반드시 목적, 적용 위치, 실제 산출물, 적용 방법, 테스트/검수 기준, 다음 todo 태스크를 포함해라.
3. ToribatMagicSchool 목표: 레거시급 고품질 마법학교 감성 + 해리포터와 비밀의 방 PC판 정도의 작은 규모.
4. 결과는 최소 1400자 이상으로 작성해라.
5. 추상적인 조언 대신 표, ID, 경로, 체크리스트, 구현 단계로 작성해라.

이전 결과물:
${firstResult}`;
}

function stripTaskMarkup(line) {
    return String(line || '')
        .replace(/<!--.*?-->/g, ' ')
        .replace(/^- \[[ x\/!]\]\s*/i, ' ')
        .replace(/[🔴🟡🟢✅⚠️✓]/g, ' ')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeForSimilarity(text) {
    const normalized = stripTaskMarkup(text).toLowerCase().replace(/[^\w가-힣\s]/g, ' ');
    const words = normalized.split(/\s+/).filter(word => word.length >= 2);
    const compact = normalized.replace(/\s+/g, '');
    const grams = [];
    for (let i = 0; i < compact.length - 1; i++) grams.push(compact.slice(i, i + 2));
    return new Set([...words, ...grams]);
}

function jaccardSimilarity(a, b) {
    const left = tokenizeForSimilarity(a);
    const right = tokenizeForSimilarity(b);
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection++;
    const union = new Set([...left, ...right]).size;
    return union ? Math.round((intersection / union) * 100) : 0;
}

function collectTaskSearchCorpus(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const files = [
        { source: 'todo.md', file: getTodoFile(projectPath) },
        { source: 'generated_tasks.md', file: getGeneratedTasksFile(projectPath) },
        { source: 'done.md', file: getDoneFile(projectPath) }
    ];
    const rows = [];
    for (const item of files) {
        if (!fs.existsSync(item.file)) continue;
        const lines = fs.readFileSync(item.file, 'utf8').split('\n');
        for (const line of lines) {
            if (/^- \[[ x\/!]\]/.test(line.trim()) || /\|.*품질\s*\d+\/100/.test(line)) {
                const text = stripTaskMarkup(line);
                if (text.length >= 4) rows.push({ source: item.source, text, raw: line.trim() });
            }
        }
    }
    return rows;
}

function detectDuplicateTask(projectPath, taskText) {
    const corpus = collectTaskSearchCorpus(projectPath);
    const matches = corpus
        .map(item => ({ ...item, similarity: jaccardSimilarity(taskText, item.text) }))
        .filter(item => item.similarity >= 45)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
    const top = matches[0] || null;
    return {
        taskText: stripTaskMarkup(taskText),
        duplicate: !!top && top.similarity >= 85,
        warning: !!top && top.similarity >= 65,
        similarity: top ? top.similarity : 0,
        recommendation: top && top.similarity >= 85 ? '기존 태스크 활용, 생성 중단' : top && top.similarity >= 65 ? '중복 가능성 검토 후 생성' : '새 태스크 생성 가능',
        matches
    };
}

function getReviewDecision(score) {
    if (score >= 80) return 'PASS';
    if (score >= 60) return 'REVIEW';
    return 'REJECT';
}

function getReviewerProfile(taskLine, result) {
    const category = classifyApplyCandidate(taskLine, result);
    const profiles = {
        code: {
            category: 'code',
            name: 'Code Reviewer',
            checks: [
                ['실제 파일 경로', /Source\/|\.h|\.cpp|Build\.cs/i],
                ['UE5 호환성', /UE5|Unreal|UCLASS|USTRUCT|UPROPERTY|UFUNCTION|Blueprint/i],
                ['Build.cs 필요 여부', /Build\.cs|모듈|Dependency|PublicDependencyModuleNames|PrivateDependencyModuleNames/i],
                ['컴파일 위험', /컴파일|빌드|오류|위험|PIE|테스트/i]
            ]
        },
        story: {
            category: 'story',
            name: 'Story Reviewer',
            checks: [
                ['퀘스트 구조', /퀘스트|시작 조건|진행 조건|완료 조건|Quest ID/i],
                ['NPC 대사', /NPC|대사|교수|학생|라이벌|조력자/i],
                ['플레이 동선', /동선|중앙홀|복도|교실|안뜰|비밀방/i],
                ['구현 가능성', /구현|트리거|ID|데이터|적용 위치/i]
            ]
        },
        quest: {
            category: 'story',
            name: 'Story Reviewer',
            checks: [
                ['퀘스트 구조', /퀘스트|시작 조건|진행 조건|완료 조건|Quest ID/i],
                ['NPC 대사', /NPC|대사|교수|학생|라이벌|조력자/i],
                ['플레이 동선', /동선|중앙홀|복도|교실|안뜰|비밀방/i],
                ['구현 가능성', /구현|트리거|ID|데이터|적용 위치/i]
            ]
        },
        world: {
            category: 'world',
            name: 'World Reviewer',
            checks: [
                ['공간 목적', /공간 목적|장소|역할|목적/i],
                ['플레이 동선', /동선|시작점|목표|탈출|이동/i],
                ['충돌/NavMesh', /충돌|NavMesh|네비메시|캡슐|콜리전/i],
                ['성능 기준', /성능|LOD|텍스처|메시|스트리밍|월드 파티션/i]
            ]
        },
        art: {
            category: 'art',
            name: 'Art/Asset Reviewer',
            checks: [
                ['폴리곤', /폴리곤|poly|tris|triangle|메시/i],
                ['머티리얼', /머티리얼|material|shader/i],
                ['텍스처', /텍스처|texture|해상도|맵/i],
                ['LOD/Nanite', /LOD|Nanite|나나이트|최적화/i]
            ]
        },
        qa: {
            category: 'qa',
            name: 'QA Reviewer',
            checks: [
                ['체크리스트', /체크리스트|통과|실패|확인필요/i],
                ['재현 방법', /재현|단계|절차/i],
                ['통과 기준', /통과 기준|기대 결과|성공 기준/i],
                ['위험도', /위험도|치명|높음|중간|낮음/i]
            ]
        },
        pm: {
            category: 'pm',
            name: 'PM Reviewer',
            checks: [
                ['프로젝트 목표 부합성', /고품질|작은 규모|소규모|수직 슬라이스|프로젝트 목표|Reference Design Bible/i],
                ['다음 스프린트 연결성', /스프린트|다음 태스크|후속 작업|우선순위/i],
                ['중복 여부', /중복|기존 태스크|generated_tasks|todo\.md/i],
                ['PM 판단', /승인|검토|보고서|일정|리스크/i]
            ]
        }
    };
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]' };
    if ((parsed.tag || '').includes('PM')) return profiles.pm;
    return profiles[category] || profiles.pm;
}

function scoreReviewerChecks(text, checks) {
    const results = checks.map(([label, regex]) => ({ label, passed: regex.test(text) }));
    const passed = results.filter(item => item.passed).length;
    return { results, score: Math.round((passed / Math.max(1, checks.length)) * 100) };
}

function runReviewerAgent(config, taskLine, result, quality, aiName, attempt = 1) {
    ensureProjectFolders(config.projectPath);
    const text = (result || '').trim();
    const referenceBible = readTextIfExists(getReferenceDesignBibleFile(config.projectPath));
    const profile = getReviewerProfile(taskLine, result);
    const checkScore = scoreReviewerChecks(text, profile.checks);
    const completeness = Math.min(100, Math.max(0, quality.score + (text.length >= 1800 ? 8 : text.length >= 1000 ? 2 : -12)));
    const consistency = /Pinned Knowledge|마법학교|중앙홀|교실|비밀방|수직 슬라이스|UE5|Unreal/i.test(text) ? 82 : 58;
    const feasibility = /적용 위치|구현 방법|테스트 방법|파일|ID|체크리스트|단계|경로/i.test(text) ? 84 : 55;
    const referenceChecks = [
        ['제한된 규모', /제한|소규모|작은 규모|20~40분|3~5개 방/i],
        ['수업/주문/퍼즐/탐험 루프', /수업|주문|퍼즐|탐험|비밀|던전/i],
        ['소규모 마법학교 필요성', /마법학교|중앙홀|교실|복도|안뜰|지하서고/i],
        ['대형 오픈월드 과잉 방지', /오픈월드 금지|학교 전체 구현 금지|과잉|범위 제한|멀티플레이 우선 금지/i],
        ['UE5 적용 가능성', /UE5|Unreal|Source\/|Content\/|적용 위치|Blueprint|C\+\+/i],
        ['적용 후보/프로젝트 파일 연결', /apply_candidates|적용 후보|Source|Content|파일 경로|리뷰 파일/i]
    ];
    const referenceScore = scoreReviewerChecks(`${text}\n${referenceBible}`, referenceChecks);
    const fit = referenceScore.score >= 70 ? 86 : /작은 규모|20~40분|고품질|소규모|Reference Design Bible/i.test(text) ? 78 : 58;
    const qualityScore = quality.score;
    const score = Math.round((completeness * 0.15) + (consistency * 0.12) + (feasibility * 0.16) + (fit * 0.12) + (qualityScore * 0.14) + (checkScore.score * 0.18) + (referenceScore.score * 0.13));
    const decision = getReviewDecision(score);
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]', text: taskLine };
    const clean = cleanTaskText(taskLine);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const reviewDir = path.join(getReviewsDir(config.projectPath), profile.category);
    if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });
    const prefix = profile.category || (parsed.tag || '[전체]').replace(/[\[\]]/g, '').replace(/[^\w가-힣]/g, '_') || 'general';
    const file = path.join(reviewDir, `${prefix}_${timestamp}_attempt${attempt}.review.md`);
    const reasons = [
        completeness < 70 ? '완성도 보강 필요' : '완성도 기준 충족',
        consistency < 70 ? '공유 지식/세계관 일관성 보강 필요' : '일관성 기준 충족',
        feasibility < 70 ? '구현 가능성 근거 부족' : '구현 가능성 기준 충족',
        fit < 70 ? '프로젝트 규모/목표 적합성 보강 필요' : '프로젝트 적합성 기준 충족',
        qualityScore < 70 ? '기초 품질 점수 미달' : '품질 점수 기준 충족',
        checkScore.score < 75 ? `${profile.name} 전문 기준 보강 필요` : `${profile.name} 전문 기준 충족`
        , referenceScore.score < 75 ? 'Reference Design Bible 기준 보강 필요' : 'Reference Design Bible 기준 충족'
    ];
    const content = `# ${profile.name} 검수

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 작성 AI: ${aiName}
- Reviewer 종류: ${profile.name}
- 리뷰 분류: ${profile.category}
- 태스크: ${clean}
- 시도: ${attempt}

## 평가 점수
| 항목 | 점수 |
| --- | ---: |
| 완성도 | ${completeness} |
| 일관성 | ${consistency} |
| 구현 가능성 | ${feasibility} |
| 프로젝트 적합성 | ${fit} |
| 품질 | ${qualityScore} |
| ${profile.name} 전문 기준 | ${checkScore.score} |
| Reference-aware 기준 | ${referenceScore.score} |

## 최종 판정
- 점수: ${score}/100
- 판정: ${decision}

## 검수 의견
${reasons.map(reason => `- ${reason}`).join('\n')}

## 전문 검수 항목
${checkScore.results.map(item => `- [${item.passed ? '통과' : '보강'}] ${item.label}`).join('\n')}

## Reference-aware Reviewer 기준
- 참조 문서: knowledge/reference_design_bible.md
${referenceScore.results.map(item => `- [${item.passed ? '통과' : '보강'}] ${item.label}`).join('\n')}
`;
    fs.writeFileSync(file, content, 'utf8');
    generatedFiles++;
    return { score, decision, file, reasons, reviewer: profile.name, category: profile.category, items: { completeness, consistency, feasibility, fit, quality: qualityScore, specialized: checkScore.score } };
}

function classifyApplyCandidate(taskLine, result) {
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]', text: taskLine };
    const tag = parsed.tag || '[전체]';
    const text = `${tag} ${parsed.text || ''} ${result || ''}`.toLowerCase();
    if (tag.includes('코드') || /source\/|\.h|\.cpp|blueprint|c\+\+|컴포넌트|클래스/.test(text)) return 'code';
    if (/퀘스트|quest|목표 id|quest id|완료 조건|시작 조건/.test(text)) return 'quest';
    if (tag.includes('스토리') || /스토리|대사|npc|교수|학생/.test(text)) return 'story';
    if (tag.includes('아트') || /아트|에셋|모델|텍스처|머티리얼/.test(text)) return 'art';
    if (tag.includes('월드') || /월드|레벨|맵|던전|복도|교실|중앙홀/.test(text)) return 'world';
    if (tag.includes('QA') || /qa|검수|테스트|버그/.test(text)) return 'qa';
    return 'story';
}

function getRecommendedApplyLocation(category, taskLine, result) {
    const text = `${cleanTaskText(taskLine)} ${result || ''}`;
    const pathMatch = text.match(/(?:Source|Content|Config|Plugins)\/[^\s)`'"|]+/i);
    if (pathMatch) return pathMatch[0];
    const defaults = {
        code: 'Source/ToribatMagicSchool/',
        quest: 'Content/ToribatMagicSchool/Quests/',
        story: 'Content/ToribatMagicSchool/Data/Story/',
        art: 'Content/ToribatMagicSchool/Art/',
        world: 'Content/ToribatMagicSchool/Maps/',
        qa: 'tasks/bug_reports/'
    };
    return defaults[category] || 'Content/ToribatMagicSchool/';
}

function saveApplyCandidate(config, taskLine, result, quality, review, aiName, outputFile) {
    ensureProjectFolders(config.projectPath);
    const category = classifyApplyCandidate(taskLine, result);
    const dir = path.join(getApplyCandidatesDir(config.projectPath), category);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const clean = cleanTaskText(taskLine);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const safeTask = clean.replace(/[^\w가-힣]/g, '_').substring(0, 48);
    const file = path.join(dir, `${timestamp}_${safeTask}.candidate.md`);
    const applyLocation = getRecommendedApplyLocation(category, taskLine, result);
    const content = `# 적용 후보

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 작성 AI: ${aiName}
- 분류: ${category}
- 품질 점수: ${quality.score}/100
- 검수 결과: ${review.decision}
- 검수 점수: ${review.score}/100
- 추천 적용 위치: ${applyLocation}
- 원본 결과물: ${outputFile ? path.relative(config.projectPath, outputFile).replace(/\\/g, '/') : '저장 결과물 참조'}
- 리뷰 파일: ${review.file ? path.relative(config.projectPath, review.file).replace(/\\/g, '/') : '없음'}

## 원본 태스크
${clean}

## 실제 산출물 요약
${(result || '').replace(/\s+/g, ' ').substring(0, 1200)}

## 적용 메모
- PASS 후보는 PM 보고서에서 바로 적용 검토 대상으로 집계된다.
- REVIEW 후보는 보완 후 적용한다.
- REJECT 후보는 실패 태스크 또는 재작성 대상으로 유지한다.
`;
    fs.writeFileSync(file, content, 'utf8');
    generatedFiles++;
    return { file, category, applyLocation };
}

function listMarkdownFilesRecursive(dir, limit = 300) {
    const files = [];
    function walk(current) {
        if (files.length >= limit || !fs.existsSync(current)) return;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                const stat = fs.statSync(full);
                files.push({ full, name: entry.name, size: stat.size, mtime: stat.mtime });
            }
        }
    }
    walk(dir);
    return files.sort((a, b) => b.mtime - a.mtime);
}

function getReviewSummary(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const files = listMarkdownFilesRecursive(getReviewsDir(projectPath));
    return files.map(file => {
        const content = fs.readFileSync(file.full, 'utf8');
        const decision = content.match(/판정:\s*(PASS|REVIEW|REJECT)/)?.[1] || 'REVIEW';
        const score = Number(content.match(/점수:\s*(\d+)\/100/)?.[1] || 0);
        const task = content.match(/- 태스크:\s*(.+)/)?.[1] || file.name;
        const reviewer = content.match(/- Reviewer 종류:\s*(.+)/)?.[1]?.trim() || path.basename(path.dirname(file.full));
        return { file: file.full, decision, score, task, reviewer, category: path.basename(path.dirname(file.full)), mtime: file.mtime };
    });
}

function getApplyCandidateSummary(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const files = listMarkdownFilesRecursive(getApplyCandidatesDir(projectPath));
    return files.map(file => {
        const content = fs.readFileSync(file.full, 'utf8');
        const category = content.match(/- 분류:\s*(.+)/)?.[1]?.trim() || path.basename(path.dirname(file.full));
        const quality = Number(content.match(/- 품질 점수:\s*(\d+)\/100/)?.[1] || 0);
        const review = content.match(/- 검수 결과:\s*(PASS|REVIEW|REJECT)/)?.[1] || 'REVIEW';
        const location = parseTargetPath(content);
        const task = content.match(/## 원본 태스크\s*\n(.+)/)?.[1]?.trim() || file.name;
        const targetPath = location;
        const dryRunOk = /dry.run.*ok|dry.run.*pass|allowRealApply.*false/i.test(content);
        return { file: file.full, category, quality, review, location, task, targetPath, dryRunOk, mtime: file.mtime };
    });
}

function getAgentForTaskText(text) {
    const line = String(text || '');
    const key = getAgentKeyForTask(line);
    const names = {
        code: '코드 마스터',
        render: '렌더링 전문가',
        world: '월드 빌더',
        game: '게임플레이',
        art: '아트 디렉터',
        qa: 'QA 엔지니어',
        story: '스토리 작가',
        pm: '프로젝트 매니저',
        ai: 'AI 시스템 엔지니어',
        dungeon: '던전 디자이너',
        sound: '사운드 디렉터',
        balance: '밸런스 디자이너',
        magic: '마법 시스템 설계자'
    };
    return names[key] || '프로젝트 매니저';
}

function getPriorityFromTaskText(text) {
    if (String(text).includes('🔴')) return '높음';
    if (String(text).includes('🟡')) return '중간';
    return '낮음';
}

function getPendingTodoTasks(projectPath, limit = 8) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const todoFile = getTodoFile(projectPath);
    if (!fs.existsSync(todoFile)) return [];
    return fs.readFileSync(todoFile, 'utf8')
        .split('\n')
        .filter(line => /^\s*- \[ \]/.test(line))
        .slice(0, limit)
        .map(line => ({ raw: line.trim(), text: stripTaskMarkup(line), agent: getAgentForTaskText(line), priority: getPriorityFromTaskText(line) }));
}

function getNextSprintNumber(projectPath) {
    const dir = getSprintsDir(projectPath);
    if (!fs.existsSync(dir)) return 1;
    const nums = fs.readdirSync(dir)
        .map(name => name.match(/^sprint_(\d+)\.md$/)?.[1])
        .filter(Boolean)
        .map(Number);
    return nums.length ? Math.max(...nums) + 1 : 1;
}

function buildSprintMarkdown({ id, status, goal, tasks, createdAt }) {
    const normalizedTasks = Array.isArray(tasks) ? tasks : [];
    return `# Sprint ${String(id).padStart(3, '0')}

- 상태: ${status || 'planned'}
- 생성일: ${(createdAt || new Date()).toLocaleString('ko-KR')}

## 스프린트 목표
${goal || '20~40분 수직 슬라이스 완성도를 높이는 작은 단위 작업 묶음'}

## 포함 태스크
${normalizedTasks.length ? normalizedTasks.map((task, index) => `- [ ] ${index + 1}. ${task.text || stripTaskMarkup(task.raw || task)} | 담당 에이전트: ${task.agent || getAgentForTaskText(task.raw || task)} | 우선순위: ${task.priority || getPriorityFromTaskText(task.raw || task)}`).join('\n') : '- [ ] PM이 todo.md에서 태스크를 선택해 추가'}

## 담당 에이전트
${normalizedTasks.length ? Array.from(new Set(normalizedTasks.map(task => task.agent || getAgentForTaskText(task.raw || task)))).map(agent => `- ${agent}`).join('\n') : '- 프로젝트 매니저'}

## 예상 산출물
- 검수 가능한 결과물 문서
- Reviewer Agent 검수 파일
- 적용 후보 파일
- PM 보고서 갱신

## 통과 기준
- Reviewer Agent PASS 1개 이상
- REJECT 결과물은 실패 태스크로 기록
- 적용 후보가 추천 적용 위치를 포함
- 스프린트 태스크가 todo.md와 중복되지 않음

## 우선순위
${normalizedTasks.length ? normalizedTasks.map(task => `- ${task.priority || getPriorityFromTaskText(task.raw || task)}: ${task.text || stripTaskMarkup(task.raw || task)}`).join('\n') : '- 중간: PM 초기 편성'}

## 위험 요소
- UE5 실제 빌드는 샌드박스에서 실행하지 않음
- 외부 MCP 서버는 실행하지 않고 어댑터 구조만 사용
- Local AI 연결 실패 시 기존 폴백 정책 적용
`;
}

function createSprint(projectPath, selectedTaskTexts = []) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const id = getNextSprintNumber(projectPath);
    const pending = getPendingTodoTasks(projectPath, 12);
    const selected = selectedTaskTexts.length
        ? pending.filter(task => selectedTaskTexts.includes(task.raw) || selectedTaskTexts.includes(task.text))
        : pending.slice(0, 5);
    const goal = selected.length
        ? `현재 todo.md의 상위 ${selected.length}개 태스크를 묶어 적용 후보와 PASS 결과물을 확보`
        : '태스크가 비어 있어 PM 초기 계획 스프린트 생성';
    const file = path.join(getSprintsDir(projectPath), `sprint_${String(id).padStart(3, '0')}.md`);
    fs.writeFileSync(file, buildSprintMarkdown({ id, status: 'planned', goal, tasks: selected, createdAt: new Date() }), 'utf8');
    generatedFiles++;
    return { id, file, status: 'planned', goal, tasks: selected };
}

function listSprints(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    return listMarkdownFilesRecursive(getSprintsDir(projectPath), 100).map(file => {
        const content = fs.readFileSync(file.full, 'utf8');
        const title = content.match(/^#\s*(.+)$/m)?.[1] || file.name;
        const status = content.match(/- 상태:\s*(.+)/)?.[1]?.trim() || 'planned';
        const goal = content.match(/## 스프린트 목표\s*\n([\s\S]*?)(\n##|$)/)?.[1]?.trim() || '';
        return { file: file.full, title, status, goal, mtime: file.mtime };
    });
}

function readCurrentSprint(projectPath) {
    const sprints = listSprints(projectPath);
    const active = sprints.find(sprint => sprint.status === 'active') || sprints[0];
    if (!active) return '';
    return fs.readFileSync(active.file, 'utf8');
}

function getSprintReportSummary(projectPath, todoContent) {
    const sprints = listSprints(projectPath);
    const current = sprints.find(sprint => sprint.status === 'active') || sprints[0] || null;
    const failedTasks = (todoContent.match(/<!-- 실패:/g) || []).length;
    const blockedTasks = (todoContent.match(/막힘|blocked|차단|보류/gi) || []).length;
    const nextCandidates = getPendingTodoTasks(projectPath, 5);
    return {
        currentSprint: current ? `${current.title} (${current.status})` : '없음',
        nextCandidates,
        blockedTasks,
        failedTasks
    };
}

function findLatestLogFile(projectPath) {
    const candidates = [
        path.join(projectPath, 'Saved', 'Logs'),
        path.join(projectPath, 'Intermediate'),
        path.join(projectPath, 'Binaries')
    ];
    const logs = [];
    for (const dir of candidates) {
        try {
            if (!fs.existsSync(dir)) continue;
            for (const file of listMarkdownAndLogFiles(dir, 500)) {
                if (/\.log$/i.test(file.full)) logs.push(file);
            }
        } catch (e) {
            sendLog(`빌드 로그 후보 스캔 실패: ${e.message}`, 'warn');
        }
    }
    return logs.sort((a, b) => b.mtime - a.mtime)[0] || null;
}

function listMarkdownAndLogFiles(dir, limit = 300) {
    const files = [];
    function walk(current) {
        if (files.length >= limit || !fs.existsSync(current)) return;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && /\.(md|log|txt)$/i.test(entry.name)) {
                const stat = fs.statSync(full);
                files.push({ full, name: entry.name, size: stat.size, mtime: stat.mtime });
            }
        }
    }
    walk(dir);
    return files;
}

function classifyBuildIssue(line) {
    const text = String(line || '');
    if (/fatal|crash|exception/i.test(text)) return { severity: 'Fatal', type: 'Fatal/Exception', cause: '엔진 실행 또는 빌드 파이프라인 중단 가능성' };
    if (/error C\d+|fatal error C\d+|LNK\d+|MSB\d+/i.test(text)) return { severity: 'Error', type: 'C++ 컴파일 오류', cause: 'C++ 문법, 링커, 모듈 설정 또는 헤더 연결 문제' };
    if (/Blueprint|K2Node|BP_|블루프린트/i.test(text) && /Error|Warning|Failed/i.test(text)) return { severity: 'Error', type: 'Blueprint 오류', cause: 'Blueprint 노드, 참조, 타입 또는 컴파일 상태 문제' };
    if (/Missing.*Module|could not be found|module.*not.*found/i.test(text)) return { severity: 'Error', type: 'Missing Module', cause: 'uproject, 플러그인, Build.cs 모듈 의존성 불일치' };
    if (/Build\.cs|PublicDependencyModuleNames|PrivateDependencyModuleNames|Unable to instantiate module/i.test(text)) return { severity: 'Error', type: 'Build.cs 오류', cause: 'Build.cs 의존성 또는 모듈 선언 문제' };
    if (/#include|cannot open include file|No such file or directory/i.test(text)) return { severity: 'Error', type: '헤더 include 오류', cause: 'include 경로, 모듈 의존성, 파일명 불일치' };
    if (/warning/i.test(text)) return { severity: 'Warning', type: 'Warning', cause: '실행은 가능할 수 있으나 품질/호환성 확인 필요' };
    if (/failed/i.test(text)) return { severity: 'Error', type: 'Failed', cause: '빌드 단계 실패 또는 에셋 처리 실패' };
    return { severity: 'Info', type: 'Log Match', cause: '추가 확인 필요' };
}

function analyzeBuildLogs(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const latest = findLatestLogFile(projectPath);
    const issues = [];
    let logText = '';
    if (latest) {
        try {
            const maxBytes = 1024 * 700;
            const raw = fs.readFileSync(latest.full);
            logText = raw.slice(Math.max(0, raw.length - maxBytes)).toString('utf8');
            for (const [index, line] of logText.split(/\r?\n/).entries()) {
                if (/Error|Warning|Fatal|Failed|Exception|error C\d+|Blueprint|Missing.*Module|Build\.cs|cannot open include file|#include/i.test(line)) {
                    const issue = classifyBuildIssue(line);
                    issues.push({ ...issue, line: index + 1, text: line.trim().substring(0, 500) });
                }
            }
        } catch (e) {
            issues.push({ severity: 'Error', type: '로그 읽기 실패', cause: e.message, line: 0, text: latest.full });
        }
    }
    const uniqueIssues = issues.filter((issue, index, arr) => arr.findIndex(other => other.type === issue.type && other.text === issue.text) === index).slice(0, 40);
    const fixTasks = uniqueIssues.slice(0, 10).map(issue => `- [ ] 🔴 [코드] ${issue.type} 수정: ${issue.text.replace(/\s+/g, ' ').substring(0, 120)}`);
    const claudePrompt = `ToribatMagicSchool UE5 프로젝트의 빌드 로그를 분석해 다음 오류를 수정해라.
프로젝트 루트: ${projectPath}
최신 로그: ${latest ? latest.full : '로그 없음'}

우선순위:
${uniqueIssues.slice(0, 8).map(issue => `- ${issue.severity} / ${issue.type}: ${issue.text}`).join('\n') || '- 로그 파일이 없으므로 Saved/Logs, Intermediate, Binaries 생성 여부부터 확인'}

규칙:
1. Source/Config/Plugins 관련 파일을 먼저 읽고 최소 수정한다.
2. Build.cs, include, missing module 오류를 우선 처리한다.
3. UE5 직접 실행은 하지 말고 정적 수정과 테스트 절차만 작성한다.`;
    const report = `# UE5 빌드/오류 로그 분석

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- 최신 로그: ${latest ? latest.full : '감지되지 않음'}

## 발견 오류
${uniqueIssues.length ? uniqueIssues.map(issue => `- [${issue.severity}] ${issue.type}: ${issue.text}`).join('\n') : '- 로그 파일 또는 오류 패턴이 감지되지 않음'}

## 심각도
${uniqueIssues.length ? uniqueIssues.map(issue => `- ${issue.severity}: ${issue.type} (line ${issue.line})`).join('\n') : '- 정보 없음'}

## 원인 추정
${uniqueIssues.length ? uniqueIssues.map(issue => `- ${issue.type}: ${issue.cause}`).join('\n') : '- Saved/Logs, Intermediate, Binaries 폴더가 비어 있거나 아직 빌드 로그가 없음'}

## 수정 후보 태스크
${fixTasks.length ? fixTasks.join('\n') : '- [ ] 🟡 [QA] UE5 빌드 로그 생성 후 build_diagnostics.md 재분석'}

## Claude Code에게 넘길 수정 프롬프트
\`\`\`text
${claudePrompt}
\`\`\`
`;
    fs.writeFileSync(getBuildDiagnosticsFile(projectPath), report, 'utf8');
    generatedFiles++;
    return { report, latestLog: latest ? latest.full : '', issues: uniqueIssues, fixTasks, claudePrompt };
}

function generateVerticalSlicePlan(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const referencePath = path.relative(projectPath, getReferenceDesignBibleFile(projectPath)).replace(/\\/g, '/');
    const report = `# 수직 슬라이스 마스터 플랜

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- 그래픽 감성: 고품질 오케스트라 판타지풍 마법학교 감성
- 규모: 2002년 PC식 소규모 마법학교 액션 어드벤처 수준의 제한된 범위
- 참고 설계 기준: ${referencePath}

## 핵심 목표
20~40분짜리 첫 플레이 구간을 완성한다. 학교 전체나 대형 오픈월드가 아니라 본관, 중앙홀, 복도, 교실 2개, 안뜰, 비밀방/첫 던전만 다룬다.

## 플레이어 경험
입학 직후 낯선 마법학교를 탐색하고, 첫 수업에서 주문을 배우며, 작은 전투와 퍼즐을 지나 숨겨진 비밀을 발견한다.

## 시작 장면
- 중앙홀 도착
- 조력자 학생 NPC와 첫 대화
- 교수 NPC가 첫 수업으로 안내

## 첫 수업
- 기본 상호작용 설명
- 핵심 주문 1~2개 습득
- 간단한 타깃/오브젝트 반응 테스트

## 첫 전투
- 훈련용 적 또는 통제된 마법 생명체 1~2마리
- 회피, 조준, 기본 주문, 짧은 쿨다운 확인

## 첫 비밀 발견
- 복도 또는 교실 뒤 숨은 문
- 주문으로 반응하는 오브젝트
- 짧은 대사와 퀘스트 갱신

## 첫 던전
- 소형 방 3~5개
- 퍼즐 1개, 전투 1개, 보상 1개

## 보스/위험 요소
- 소형 위험 요소 1개
- 보스보다 “첫 위험한 사건” 수준으로 제한

## 필요한 시스템
- 이동/카메라
- 상호작용
- 주문 4~6개 기반 구조
- 퀘스트 상태
- NPC 대화
- 저장/로드 최소 구조

## 필요한 에셋
- 중앙홀 모듈
- 복도 모듈
- 교실 2종
- 안뜰 소형 세트
- 비밀방/던전 소형 세트
- 학생/교수 NPC 기본형

## 필요한 코드
- Interaction Component
- Magic Component
- Quest State Manager
- Dialogue Data Loader
- SaveGame 최소 구현
- QA 로그/디버그 표시

## QA 기준
- 20~40분 내 플레이 가능
- 치명 오류 없이 시작부터 첫 던전 보상까지 완료
- REJECT 리뷰 결과물 0개
- PASS 적용 후보 3개 이상

## 완성 조건
- 시작 장면, 첫 수업, 첫 전투, 첫 비밀 발견, 첫 던전이 하나의 동선으로 연결
- 대형 오픈월드 확장 금지
- 지나친 시스템 확장 금지
- 학교 전체 구현 요구 금지
- 멀티플레이 우선 구현 금지
`;
    fs.writeFileSync(getVerticalSlicePlanFile(projectPath), report, 'utf8');
    generatedFiles++;
    return report;
}

function readTextIfExists(file) {
    try {
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    } catch {
        return '';
    }
}

function getProjectTextCorpus(projectPath) {
    const files = [
        getTodoFile(projectPath),
        getDoneFile(projectPath),
        getGeneratedTasksFile(projectPath),
        getReferenceDesignBibleFile(projectPath),
        getProjectStatusFile(projectPath),
        getProjectReportFile(projectPath),
        getVerticalSlicePlanFile(projectPath),
        getBuildDiagnosticsFile(projectPath)
    ];
    const reportDirs = [
        path.join(projectPath, 'reports'),
        path.join(projectPath, 'tasks', 'outputs'),
        getApplyCandidatesDir(projectPath),
        getReviewsDir(projectPath),
        getSprintsDir(projectPath)
    ];
    for (const dir of reportDirs) {
        for (const file of listMarkdownFilesRecursive(dir, 200)) files.push(file.full);
    }
    return files.map(readTextIfExists).join('\n');
}

function collectUEProjectEvidence(projectPath) {
    const rootFiles = listFilesSafe(projectPath, 250);
    const sourceFiles = listFilesSafe(path.join(projectPath, 'Source'), 2500);
    const contentFiles = listFilesSafe(path.join(projectPath, 'Content'), 5000);
    const configFiles = listFilesSafe(path.join(projectPath, 'Config'), 1000);
    const pluginFiles = listFilesSafe(path.join(projectPath, 'Plugins'), 1000);
    const uprojectFiles = rootFiles.filter(file => /\.uproject$/i.test(file.name || file.full));
    const sourceCodeFiles = sourceFiles.filter(file => /\.(h|hpp|cpp|cs)$/i.test(file.name || file.full));
    const mapFiles = contentFiles.filter(file => /\.umap$/i.test(file.name || file.full));
    const assetFiles = contentFiles.filter(file => /\.uasset$/i.test(file.name || file.full));
    const projectFilesCorpus = [
        ...uprojectFiles,
        ...sourceCodeFiles,
        ...contentFiles,
        ...configFiles,
        ...pluginFiles
    ].map(file => file.full).join('\n');
    return {
        rootFiles,
        sourceFiles,
        contentFiles,
        configFiles,
        pluginFiles,
        uprojectFiles,
        sourceCodeFiles,
        mapFiles,
        assetFiles,
        projectFilesCorpus,
        hasUProject: uprojectFiles.length > 0
    };
}

function extractApplyCandidatePaths(text) {
    const matches = [];
    const regex = /(?:추천 적용 위치|적용 위치|수정 대상 파일|대상 파일)\s*[:：]\s*([^\n\r]+)/gi;
    let match;
    while ((match = regex.exec(text || ''))) {
        matches.push(match[1].trim());
    }
    const inline = (text || '').match(/\b(?:Source|Content|Config|Plugins)[\\/][^\s`|)]+/gi) || [];
    return [...matches, ...inline]
        .map(item => item.replace(/^["']|["']$/g, '').replace(/[.,;]+$/g, '').trim())
        .filter(Boolean);
}

function getApplyCandidatePromotionSummary(projectPath, patterns = []) {
    const candidateFiles = listMarkdownFilesRecursive(getApplyCandidatesDir(projectPath), 500);
    const rows = [];
    for (const file of candidateFiles) {
        const content = readTextIfExists(file.full);
        const paths = extractApplyCandidatePaths(content);
        for (const target of paths) {
            const normalized = target.replace(/\//g, path.sep);
            const absolute = path.isAbsolute(normalized) ? normalized : path.join(projectPath, normalized);
            const inProjectTarget = /^(Source|Content|Config|Plugins)[\\/]/i.test(target);
            const exists = inProjectTarget && fs.existsSync(absolute);
            const haystack = `${target}\n${content}`;
            const related = !patterns.length || patterns.some(pattern => pattern.test(haystack));
            if (related) {
                rows.push({
                    candidate: file.full,
                    target,
                    exists,
                    promoted: exists && /^(Source|Content)[\\/]/i.test(target)
                });
            }
        }
    }
    return rows;
}

function getStateWeight(level) {
    return [0, 10, 35, 70, 100][Math.max(0, Math.min(4, Number(level) || 0))];
}

function getWeightedStateProgress(items) {
    return items && items.length ? Math.round(items.reduce((sum, item) => sum + getStateWeight(item.level), 0) / items.length) : 0;
}

function validateState4Eligibility(evidence) {
    const ue = evidence;
    const actualImplementation = evidence.actualImplementation;
    const reviewerPass = evidence.reviewerPass;
    const qaPass = evidence.qaPass;
    const state4Eligible = ue.hasUProject && actualImplementation && reviewerPass && qaPass;
    return !!state4Eligible;
}

function collectImplementationEvidence(projectPath, patterns, options = {}) {
    const docsCorpus = [
        readTextIfExists(getTodoFile(projectPath)),
        readTextIfExists(getDoneFile(projectPath)),
        readTextIfExists(getGeneratedTasksFile(projectPath)),
        readTextIfExists(getProjectStatusFile(projectPath)),
        readTextIfExists(getProjectReportFile(projectPath)),
        readTextIfExists(getVerticalSlicePlanFile(projectPath)),
        readTextIfExists(getReferenceDesignBibleFile(projectPath))
    ].join('\n');
    const candidateCorpus = listMarkdownFilesRecursive(getApplyCandidatesDir(projectPath), 300).map(file => `${file.full}\n${readTextIfExists(file.full)}`).join('\n');
    const reviewCorpus = listMarkdownFilesRecursive(getReviewsDir(projectPath), 300).map(file => `${file.full}\n${readTextIfExists(file.full)}`).join('\n');
    const ue = collectUEProjectEvidence(projectPath);
    const promotions = getApplyCandidatePromotionSummary(projectPath, patterns);
    const has = (text) => patterns.some(pattern => pattern.test(text || ''));
    const doc = has(docsCorpus);
    const candidate = has(candidateCorpus);
    const promoted = promotions.some(row => row.promoted);
    const sourceMatch = has(ue.sourceCodeFiles.map(file => file.full).join('\n'));
    const contentMatch = has(ue.contentFiles.map(file => file.full).join('\n'));
    const mapMatch = has(ue.mapFiles.map(file => file.full).join('\n'));
    const assetMatch = has(ue.assetFiles.map(file => file.full).join('\n'));
    const configMatch = has(ue.configFiles.map(file => file.full).join('\n'));
    const actualImplementation = sourceMatch || contentMatch || mapMatch || assetMatch || promoted;
    const passCorpus = reviewCorpus + '\n' + docsCorpus;
    const reviewerPass = /판정:\s*PASS|Reviewer Agent:\s*PASS/i.test(passCorpus) && has(passCorpus);
    const qaPass = /QA\s*PASS|QA\s*통과|테스트\s*통과|검수\s*통과/i.test(passCorpus) && has(passCorpus);

    // 플레이/빌드 로그 근거 스캔
    const latestLog = findLatestLogFile(projectPath);
    const buildLogText = latestLog ? (() => {
        try {
            const raw = fs.readFileSync(latestLog.full);
            return raw.slice(Math.max(0, raw.length - 200 * 1024)).toString('utf8');
        } catch { return ''; }
    })() : '';
    const buildLogPass = /Build Succeeded|succeeded!/i.test(buildLogText) && has(buildLogText);
    const playLogPass = /PIE:|LogWorld:|LogGameMode:|BeginPlay|PIE session started/i.test(buildLogText) && has(buildLogText);

    const actual = actualImplementation || configMatch || buildLogPass || playLogPass || (options.requireUProject === false ? false : ue.hasUProject && options.actualWhenProjectFiles && has(docsCorpus));
    return {
        doc, candidate, actual, actualImplementation,
        hasUProject: ue.hasUProject,
        sourceMatch, contentMatch, mapMatch, assetMatch, configMatch,
        reviewerPass, qaPass, promoted,
        buildLogPass, playLogPass,
        sourceFiles: ue.sourceFiles.length,
        contentFiles: ue.contentFiles.length,
        configFiles: ue.configFiles.length,
        pluginFiles: ue.pluginFiles.length,
        uprojectFiles: ue.uprojectFiles.length,
        sourceCodeFiles: ue.sourceCodeFiles.length,
        mapFiles: ue.mapFiles.length,
        assetFiles: ue.assetFiles.length,
        promotedCandidates: promotions.filter(row => row.promoted).length
    };
}

function classifyImplementationState(evidence) {
    const state4Eligible = validateState4Eligibility(evidence);
    const passed = state4Eligible;
    const level = passed ? 4 : evidence.actual ? 3 : evidence.candidate ? 2 : evidence.doc ? 1 : 0;
    const labels = [
        '상태 0 - 없음',
        '상태 1 - 문서/기획만 있음',
        '상태 2 - 코드/에셋 후보 있음',
        '상태 3 - 프로젝트 파일에 실제 존재함',
        '상태 4 - 실행/검수 통과'
    ];
    const evidenceList = [];
    if (evidence.doc) evidenceList.push('문서/기획');
    if (evidence.candidate) evidenceList.push('적용 후보');
    if (evidence.promoted) evidenceList.push('적용 후보 Source/Content 승격');
    if (evidence.actual) evidenceList.push('.uproject/Source/Content/Config 실파일');
    if (evidence.buildLogPass) evidenceList.push('빌드 성공 로그');
    if (evidence.playLogPass) evidenceList.push('PIE 플레이 로그');
    if (evidence.reviewerPass) evidenceList.push('Reviewer PASS');
    if (evidence.qaPass) evidenceList.push('QA PASS');
    if (passed) evidenceList.push('상태4 조건 충족');
    return { level, status: labels[level], evidence: evidenceList.join(', ') || '근거 없음', state4Eligible };
}

function getImplementationEvidence(projectPath, patterns, options = {}) {
    const raw = collectImplementationEvidence(projectPath, patterns, options);
    const classified = classifyImplementationState(raw);
    return { ...raw, ...classified };
}

function getActualImplementationProgress(featureStates, verticalStatuses) {
    const all = [...(featureStates || []), ...(verticalStatuses || [])];
    return getWeightedStateProgress(all);
}

function calculateTaskProgress(projectPath, todoContent, doneContent) {
    const pending = (todoContent.match(/^- \[ \]/gm) || []).length;
    const doing = (todoContent.match(/^- \[\/\]/gm) || []).length;
    const doneInTodo = (todoContent.match(/^- \[x\]/gmi) || []).length;
    const doneLog = (doneContent.match(/^- \[[x!]\]/gm) || []).length;
    const failed = (todoContent.match(/<!-- 실패:/g) || []).length + (doneContent.match(/^- \[!\]/gm) || []).length;
    const total = pending + doing + doneInTodo + doneLog + failed;
    return {
        percent: total ? Math.round(((doneInTodo + doneLog) / total) * 100) : 0,
        pending,
        doing,
        done: doneInTodo + doneLog,
        failed,
        total
    };
}

function analyzeGameState(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const checks = [
        { key: 'playable', label: '플레이 가능', patterns: [/gamemode|playercontroller|character|pawn|input|enhancedinput|플레이 가능|시작 구역/i, /map|level|umap|world|중앙홀/i] },
        { key: 'combat', label: '전투 가능', patterns: [/combat|enemy|damage|health|attack|ai|basic enemy|피격|첫 전투|전투/i] },
        { key: 'quest', label: '퀘스트 가능', patterns: [/quest|objective|퀘스트|목표|시작 조건|완료 조건|첫 수업/i] },
        { key: 'dialogue', label: '대화 가능', patterns: [/dialogue|conversation|npc|대사|교수|학생/i] },
        { key: 'save', label: '세이브 가능', patterns: [/savegame|save game|저장|로드|보상\/저장/i] },
        { key: 'dungeon', label: '던전 가능', patterns: [/dungeon|secret room|지하서고|짧은 던전|첫 던전|퍼즐/i] },
        { key: 'magic', label: '마법 주문 가능', patterns: [/magic|spell|주문|마법|umagic|첫 주문 습득/i] },
        { key: 'map', label: '맵/동선 구현', patterns: [/central hall|중앙홀|courtyard|안뜰|classroom|교실|corridor|복도|정문|\.umap/i] }
    ];
    const states = checks.map(check => ({ ...check, ...getImplementationEvidence(projectPath, check.patterns) }));
    const featureProgress = getWeightedStateProgress(states);
    const fileCounts = states[0] || { sourceFiles: 0, contentFiles: 0, configFiles: 0, pluginFiles: 0, uprojectFiles: 0, sourceCodeFiles: 0, mapFiles: 0, assetFiles: 0, promotedCandidates: 0 };
    const promotedTotal = states.reduce((sum, item) => sum + (item.promotedCandidates || 0), 0);
    const report = `# 게임 개발 상태

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- Feature Progress: ${featureProgress}%
- Actual Implementation 기준: 상태별 가중치 평균 (0=0, 1=10, 2=35, 3=70, 4=100)
- 상태 3 기준: .uproject / Source / Config / Content / .umap / .uasset 실파일 또는 적용 후보의 Source/Content 승격
- 상태 4 기준: .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 필요

| 판별 항목 | 상태 단계 | 의미 | 근거 |
| --- | ---: | --- | --- |
${states.map(item => `| ${item.label} | ${item.level} | ${item.status} | ${item.evidence} |`).join('\n')}

## UE5 프로젝트 실체 근거
- .uproject 파일 수: ${fileCounts.uprojectFiles}
- Source 파일 수: ${fileCounts.sourceFiles}
- Source 코드 파일 수: ${fileCounts.sourceCodeFiles}
- Content 파일 수: ${fileCounts.contentFiles}
- .umap 파일 수: ${fileCounts.mapFiles}
- .uasset 파일 수: ${fileCounts.assetFiles}
- Config 파일 수: ${fileCounts.configFiles}
- Plugins 파일 수: ${fileCounts.pluginFiles}
- 적용 후보 Source/Content 승격 근거: ${promotedTotal}
`;
    safeWriteFile(getGameStateFile(projectPath), report);
    generatedFiles++;
    return { report, states, featureProgress };
}

function analyzeVerticalSliceStatus(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const items = [
        { key: 'start_area', label: '시작 구역', patterns: [/시작 구역|정문|도착|start area|entry/i] },
        { key: 'first_class', label: '첫 수업', patterns: [/첫 수업|first class|수업|classroom|교실/i] },
        { key: 'first_spell', label: '첫 주문 습득', patterns: [/첫 주문|주문 습득|spell learn|magic component|마법 주문/i] },
        { key: 'spell_puzzle', label: '주문 사용 퍼즐', patterns: [/주문.*퍼즐|퍼즐.*주문|반응형 오브젝트|switch|puzzle/i] },
        { key: 'first_combat', label: '첫 전투', patterns: [/첫 전투|combat|enemy|damage|attack|피격|전투/i] },
        { key: 'npc_dialogue', label: 'NPC 대화', patterns: [/npc|대화|dialogue|conversation|교수|학생/i] },
        { key: 'first_secret', label: '첫 비밀 발견', patterns: [/첫 비밀|비밀 발견|secret|숨은 문|비밀방 단서|지하서고/i] },
        { key: 'short_dungeon', label: '짧은 던전', patterns: [/짧은 던전|첫 던전|dungeon|지하서고|3~5개 방|보상/i] },
        { key: 'reward_save', label: '보상/저장', patterns: [/보상\/저장|보상|savegame|저장|로드/i] },
        { key: 'qa_pass', label: 'QA 통과', patterns: [/qa 통과|PASS|체크리스트|재현 테스트|플레이 테스트/i] }
    ];
    const statuses = items.map(item => ({ ...item, ...getImplementationEvidence(projectPath, item.patterns) }));
    const percent = getWeightedStateProgress(statuses);
    const evidenceBase = statuses[0] || { uprojectFiles: 0, sourceFiles: 0, contentFiles: 0, configFiles: 0, pluginFiles: 0, mapFiles: 0, assetFiles: 0, promotedCandidates: 0 };
    const promotedTotal = statuses.reduce((sum, item) => sum + (item.promotedCandidates || 0), 0);
    const report = `# 수직 슬라이스 달성률

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- Vertical Slice Progress: ${percent}%
- 참고 설계 기준: knowledge/reference_design_bible.md
- 상태 단계: 0 없음 / 1 문서·기획 / 2 적용 후보 / 3 프로젝트 파일 / 4 실행·검수 통과
- 상태별 가중치: 상태0=0 / 상태1=10 / 상태2=35 / 상태3=70 / 상태4=100
- 상태 3 기준: .uproject / Source / Config / Content / .umap / .uasset 실파일 또는 적용 후보의 Source/Content 승격
- 상태 4 기준: .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 필요

| 핵심 항목 | 상태 단계 | 의미 | 근거 |
| --- | ---: | --- | --- |
${statuses.map(item => `| ${item.label} | ${item.level} | ${item.status} | ${item.evidence} |`).join('\n')}

## UE5 프로젝트 실체 근거
- .uproject 파일 수: ${evidenceBase.uprojectFiles}
- Source 파일 수: ${evidenceBase.sourceFiles}
- Content 파일 수: ${evidenceBase.contentFiles}
- .umap 파일 수: ${evidenceBase.mapFiles}
- .uasset 파일 수: ${evidenceBase.assetFiles}
- Config 파일 수: ${evidenceBase.configFiles}
- Plugins 파일 수: ${evidenceBase.pluginFiles}
- 적용 후보 Source/Content 승격 근거: ${promotedTotal}

## 참고 설계 기준
- 제한된 학교 공간, 수업 기반 주문 습득, 복도/교실/비밀 공간 탐험, 주문 퍼즐, 수집, 짧은 던전, 보상/저장을 하나의 20~40분 루프로 묶는다.
- 대형 오픈월드, 학교 전체 구현, 멀티플레이 우선, 과도한 RPG 성장 시스템은 제외한다.

## 다음 보강 우선순위
${statuses.filter(item => item.level < 4).map(item => `- ${item.label}: ${item.status}`).join('\n') || '- 모든 항목 실행/검수 통과'}
`;
    safeWriteFile(getVerticalSliceStatusFile(projectPath), report);
    generatedFiles++;
    return { report, statuses, percent };
}

function calculateProjectProgress(projectPath, inputs = {}) {
    const todo = inputs.todo ?? readTextIfExists(getTodoFile(projectPath));
    const done = inputs.done ?? readTextIfExists(getDoneFile(projectPath));
    const task = calculateTaskProgress(projectPath, todo, done);
    const gameState = analyzeGameState(projectPath);
    const vertical = analyzeVerticalSliceStatus(projectPath);
    return {
        task,
        feature: { percent: gameState.featureProgress, states: gameState.states },
        vertical: { percent: vertical.percent, statuses: vertical.statuses },
        actual: { percent: getActualImplementationProgress(gameState.states, vertical.statuses) }
    };
}

function isRecommendationAllowed(projectPath, line, recommendations) {
    if (/검토\s*\d+|수직 슬라이스 범위 유지 검토/i.test(line)) return false;
    if (detectDuplicateTask(projectPath, line).similarity >= 80) return false;
    return !recommendations.some(item => jaccardSimilarity(item.line, line) >= 80);
}

const recommendationRules = [
    {
        id: 'build_error',
        priority: '🔴', tag: '[코드]',
        text: 'build_diagnostics.md의 C++/Build.cs/include 오류를 우선 수정',
        agent: '코드 마스터', output: '수정 패치와 재검증 절차',
        condition: ({ inputs }) => /Missing Module|Build\.cs|include 오류|C\+\+ 컴파일 오류/i.test(inputs.buildDiagnostics)
    },
    {
        id: 'start_area',
        priority: '🔴', tag: '[월드]',
        text: '시작 구역에서 중앙홀까지 플레이 가능한 진입 동선 배치',
        agent: '월드 빌더', output: '시작 구역 레벨 배치 명세',
        condition: ({ v }) => (v.start_area || 0) < 3
    },
    {
        id: 'first_class',
        priority: '🔴', tag: '[스토리]',
        text: '첫 수업 퀘스트 대사와 시작/완료 조건 작성',
        agent: '스토리 작가', output: '퀘스트 데이터 테이블',
        condition: ({ v, s }) => (v.first_class || 0) < 3 || (s.quest || 0) < 3
    },
    {
        id: 'first_spell',
        priority: '🔴', tag: '[코드]',
        text: '첫 주문 습득용 Magic Component와 입력 흐름 구현',
        agent: '코드 마스터', output: 'UE5 C++/Blueprint 적용 후보',
        condition: ({ v, s }) => (v.first_spell || 0) < 3 || (s.magic || 0) < 3
    },
    {
        id: 'spell_puzzle',
        priority: '🟡', tag: '[게임플레이]',
        text: '첫 주문 퍼즐용 반응형 오브젝트와 성공 조건 구현 후보 작성',
        agent: '게임플레이', output: '상호작용 퍼즐 적용 후보',
        condition: ({ v }) => (v.spell_puzzle || 0) < 3
    },
    {
        id: 'first_combat',
        priority: '🔴', tag: '[코드]',
        text: '첫 전투용 기본 적 AI와 피격 반응 구현',
        agent: '코드 마스터', output: '전투 프로토타입 코드',
        condition: ({ v, s }) => (v.first_combat || 0) < 3 || (s.combat || 0) < 3
    },
    {
        id: 'npc_dialogue',
        priority: '🟡', tag: '[스토리]',
        text: '교수 1명과 학생 NPC 2명의 첫 수업 대화 데이터 작성',
        agent: '스토리 작가', output: 'NPC 대화표',
        condition: ({ v, s }) => (v.npc_dialogue || 0) < 3 || (s.dialogue || 0) < 3
    },
    {
        id: 'first_secret',
        priority: '🟡', tag: '[게임플레이]',
        text: '첫 비밀 발견용 주문 반응 오브젝트와 퀘스트 갱신 흐름 설계',
        agent: '게임플레이', output: '상호작용 플로우',
        condition: ({ v }) => (v.first_secret || 0) < 3
    },
    {
        id: 'short_dungeon',
        priority: '🟡', tag: '[월드]',
        text: '낡은 지하서고 3개 방 구성과 퍼즐/보상 동선 설계',
        agent: '월드 빌더', output: '짧은 던전 설계 문서',
        condition: ({ v, s }) => (v.short_dungeon || 0) < 3 || (s.dungeon || 0) < 3
    },
    {
        id: 'reward_save',
        priority: '🟢', tag: '[코드]',
        text: '첫 보상 후 체크포인트용 SaveGame 최소 구조 구현',
        agent: '코드 마스터', output: '저장/로드 코드 후보',
        condition: ({ v, s }) => (v.reward_save || 0) < 3 || (s.save || 0) < 3
    },
    {
        id: 'qa_checklist',
        priority: '🟡', tag: '[QA]',
        text: '첫 주문 퍼즐과 첫 전투 재현 테스트 체크리스트 작성',
        agent: 'QA 엔지니어', output: 'QA 체크리스트',
        condition: ({ v }) => (v.qa_pass || 0) < 4
    },
    {
        id: 'failed_recovery',
        priority: '🔴', tag: '[QA]',
        text: '실패 태스크와 REJECT 결과물을 재현 절차별로 복구 계획화',
        agent: 'QA 엔지니어', output: '실패 복구 리포트',
        condition: ({ inputs }) => /REJECT|실패|<!-- 실패:/i.test(inputs.done + inputs.todo + inputs.projectReport)
    },
    {
        id: 'sprint_replan',
        priority: '🟢', tag: '[PM]',
        text: '다음 스프린트를 시작 구역-첫 수업-첫 전투 연결 목표로 재편성',
        agent: '프로젝트 매니저', output: '스프린트 계획',
        condition: () => true
    },
    // ── V48-V50: 구현 중심 강화 규칙 ────────────────────────────────
    {
        id: 'magic_component_candidate',
        priority: '🔴', tag: '[코드]',
        text: 'Magic Component C++ 적용 후보 생성 (주문 습득·시전·쿨다운)',
        agent: '코드 마스터', output: 'apply_candidates/code/magic_component.candidate.md',
        condition: ({ v, s }) => (v.first_spell || 0) < 2 && (s.magic || 0) < 2
    },
    {
        id: 'quest_state_candidate',
        priority: '🔴', tag: '[코드]',
        text: 'Quest State Manager C++ 적용 후보 생성 (시작/진행/완료 상태 관리)',
        agent: '코드 마스터', output: 'apply_candidates/code/quest_state_manager.candidate.md',
        condition: ({ v, s }) => (v.first_class || 0) < 2 && (s.quest || 0) < 2
    },
    {
        id: 'enemy_ai_candidate',
        priority: '🔴', tag: '[코드]',
        text: 'Basic Enemy AI C++ 적용 후보 생성 (탐지·추격·피격 반응)',
        agent: '코드 마스터', output: 'apply_candidates/code/basic_enemy_ai.candidate.md',
        condition: ({ v, s }) => (v.first_combat || 0) < 2 && (s.combat || 0) < 2
    },
    {
        id: 'promote_magic_to_source',
        priority: '🔴', tag: '[코드]',
        text: 'Magic Component 적용 후보를 Source에 실제 반영하고 빌드 확인',
        agent: '코드 마스터', output: 'Source/ToribatMagicSchool/Components/UMagicComponent.h 생성',
        condition: ({ v, s }) => (v.first_spell || 0) === 2 || (s.magic || 0) === 2
    },
    {
        id: 'promote_quest_to_source',
        priority: '🔴', tag: '[코드]',
        text: 'Quest State Manager 적용 후보를 Source에 실제 반영하고 빌드 확인',
        agent: '코드 마스터', output: 'Source/ToribatMagicSchool/Quest/UQuestStateManager.h 생성',
        condition: ({ v, s }) => (v.first_class || 0) === 2 || (s.quest || 0) === 2
    },
    {
        id: 'save_game_candidate',
        priority: '🟡', tag: '[코드]',
        text: 'SaveGame C++ 구조 적용 후보 생성 (체크포인트·주문·퀘스트 저장)',
        agent: '코드 마스터', output: 'apply_candidates/code/save_game.candidate.md',
        condition: ({ v, s }) => (v.reward_save || 0) < 2 && (s.save || 0) < 2
    },
    {
        id: 'dialogue_candidate',
        priority: '🟡', tag: '[코드]',
        text: 'Dialogue Component Blueprint 설계 명세 적용 후보 생성 (NPC 대화 트리거)',
        agent: '코드 마스터', output: 'apply_candidates/code/dialogue_component.candidate.md',
        condition: ({ v, s }) => (v.npc_dialogue || 0) < 2 && (s.dialogue || 0) < 2
    },
    {
        id: 'play_loop_gap',
        priority: '🟡', tag: '[QA]',
        text: '플레이 루프 미구현 단계를 play_loop_template.md 기준으로 점검하고 우선순위 확정',
        agent: 'QA 엔지니어', output: 'play_loop_template.md 갱신',
        condition: ({ v }) => SCHOOL_PLAY_LOOP_STAGES.filter(st => st.required && (v[st.key] || 0) < 3).length >= 3
    },
    {
        id: 'build_log_pass_push',
        priority: '🟡', tag: '[코드]',
        text: '빌드 성공 로그가 없는 상태3 항목에 대해 PIE 빌드 검증 절차 실행',
        agent: '코드 마스터', output: 'PIE 빌드 검증 리포트',
        condition: ({ inputs }) => !/Build Succeeded|succeeded!/i.test(inputs.buildDiagnostics || '')
    },
    // ── V54: 실제 반영 부족 우선 추천 ────────────────────────────────
    {
        id: 'promote_candidate_to_source',
        priority: '🔴', tag: '[코드]',
        text: '미반영 적용 후보를 Source에 실제 승격 — promoteCandidateToProject() 실행 후 빌드 확인',
        agent: '코드 마스터', output: 'apply_queue/applied/*.apply.md + 빌드 성공 확인',
        condition: ({ inputs }) => /미반영 후보/.test(inputs.projectReport || '') || /⬜ 미반영/.test(inputs.projectReport || '')
    },
    {
        id: 'project_inventory_missing',
        priority: '🔴', tag: '[코드]',
        text: 'project_inventory.md 기준 미구현 시스템의 코드 후보를 생성하고 승격 계획 수립',
        agent: '코드 마스터', output: 'apply_candidates/code/*.candidate.md',
        condition: ({ inputs }) => /미구현/.test(inputs.projectReport || '') && !/모든 핵심 시스템 구현됨/.test(inputs.projectReport || '')
    },
    {
        id: 'candidate_only_promote',
        priority: '🟡', tag: '[코드]',
        text: '후보만 존재하는 시스템을 Source/Content에 실제 반영하여 상태2→상태3 달성',
        agent: '코드 마스터', output: 'Source 또는 Content 실파일 + implementation_trace.md 갱신',
        condition: ({ inputs }) => /후보만 존재/.test(inputs.projectReport || '')
    }
];

function buildCommandRecommendations(projectPath, inputs, gameState, verticalStatus) {
    const recommendations = [];
    const s = Object.fromEntries((gameState?.states || []).map(item => [item.key, item.level || 0]));
    const v = Object.fromEntries((verticalStatus?.statuses || []).map(item => [item.key, item.level || 0]));
    const ctx = { inputs, s, v };

    for (const rule of recommendationRules) {
        if (!rule.condition(ctx)) continue;
        const line = `- [ ] ${rule.priority} ${rule.tag} ${rule.text}`;
        if (isRecommendationAllowed(projectPath, line, recommendations)) {
            recommendations.push({ priority: rule.priority, tag: rule.tag, text: rule.text, agent: rule.agent, output: rule.output, line });
        }
        if (recommendations.length >= 10) break;
    }

    return recommendations;
}

function generateCommandCenter(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const inputs = {
        todo: readTextIfExists(getTodoFile(projectPath)),
        done: readTextIfExists(getDoneFile(projectPath)),
        generatedTasks: readTextIfExists(getGeneratedTasksFile(projectPath)),
        pinnedKnowledge: JSON.stringify(loadPinnedKnowledge(projectPath), null, 2),
        projectStatus: readTextIfExists(getProjectStatusFile(projectPath)),
        projectReport: readTextIfExists(getProjectReportFile(projectPath)),
        buildDiagnostics: readTextIfExists(getBuildDiagnosticsFile(projectPath)),
        verticalSlicePlan: readTextIfExists(getVerticalSlicePlanFile(projectPath)),
        sprints: listSprints(projectPath).map(s => `${s.title} ${s.status} ${s.goal}`).join('\n')
    };
    if (!inputs.verticalSlicePlan) inputs.verticalSlicePlan = generateVerticalSlicePlan(projectPath);
    if (!inputs.buildDiagnostics) inputs.buildDiagnostics = analyzeBuildLogs(projectPath).report;
    const progress = calculateProjectProgress(projectPath, { todo: inputs.todo, done: inputs.done });
    const pending = progress.task.pending;
    const done = progress.task.done;
    const failed = progress.task.failed;
    const blocked = (inputs.todo.match(/막힘|blocked|차단|보류/gi) || []).length;
    const candidates = getApplyCandidateSummary(projectPath);
    const recommendations = buildCommandRecommendations(projectPath, inputs, progress.feature, progress.vertical);
    const nextSprint = recommendations.slice(0, 5);
    const report = `# 자동 개발 지휘 센터

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}

## 현재 프로젝트 진행률
- Task Progress: ${progress.task.percent}%
- Feature Progress: ${progress.feature.percent}%
- Vertical Slice Progress: ${progress.vertical.percent}%
- Actual Implementation Progress: ${progress.actual.percent}%
- 미완료 태스크: ${pending}
- 완료/기록 태스크: ${done}

## 현재 게임 상태
| 기능 | 상태 단계 | 의미 |
| --- | ---: | --- |
${progress.feature.states.map(item => `| ${item.label} | ${item.level} | ${item.status} |`).join('\n')}

## 수직 슬라이스 상태
| 항목 | 상태 단계 | 의미 |
| --- | ---: | --- |
${progress.vertical.statuses.map(item => `| ${item.label} | ${item.level} | ${item.status} |`).join('\n')}

## 가장 중요한 미완성 시스템
- Interaction Component / Magic Component / Quest State Manager / Dialogue / SaveGame
- 수직 슬라이스 첫 수업, 첫 전투, 첫 비밀 발견, 첫 던전 연결

## 막힌 작업
- 막힌 태스크: ${blocked}

## 실패 태스크
- 실패 태스크: ${failed}

## 다음 10개 추천 태스크
${recommendations.map((task, index) => `${index + 1}. ${task.line} | 담당 에이전트: ${task.agent} | 예상 산출물: ${task.output}`).join('\n')}

## 우선순위
${recommendations.map(task => `- ${task.priority}: ${task.text}`).join('\n')}

## 담당 에이전트
${Array.from(new Set(recommendations.map(task => task.agent))).map(agent => `- ${agent}`).join('\n')}

## 예상 산출물
${recommendations.map(task => `- ${task.output}`).join('\n')}

## 적용 후보
${candidates.length ? candidates.slice(0, 10).map(candidate => `- ${candidate.category} / ${candidate.review} / 품질 ${candidate.quality}: ${candidate.location}`).join('\n') : '- 적용 후보 없음'}

## 다음 스프린트 제안
${nextSprint.map(task => `- ${task.line} | ${task.agent}`).join('\n')}

## 승인 대기
아래 후보는 자동으로 todo.md에 추가하지 않는다. UI에서 승인 후 추가한다.

\`\`\`todo
${recommendations.map(task => task.line).join('\n')}
\`\`\`
`;
    safeWriteFile(getCommandCenterFile(projectPath), report);
    generatedFiles++;
    return { report, recommendations, progress, failed, blocked, candidates: candidates.length };
}

function approveCommandCenterTasks(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const commandFile = getCommandCenterFile(projectPath);
    if (!fs.existsSync(commandFile)) generateCommandCenter(projectPath);
    const content = readTextIfExists(commandFile);
    const block = content.match(/```todo\s*([\s\S]*?)```/)?.[1] || '';
    const candidates = block.split('\n').map(line => line.trim()).filter(line => /^- \[ \]/.test(line));
    const accepted = candidates.filter(line => !detectDuplicateTask(projectPath, line).duplicate);
    if (accepted.length) {
        const current = readTextIfExists(getTodoFile(projectPath)) || '# 📋 ToribatMagicSchool - 태스크 목록\n';
        safeWriteFile(getTodoFile(projectPath), `${current.trimEnd()}\n\n## 지휘 센터 승인 추가 - ${new Date().toLocaleString('ko-KR')}\n${accepted.join('\n')}\n`);
    }
    return { approvedCount: accepted.length, skippedCount: candidates.length - accepted.length };
}

function parseCommandCenterRecommendations(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const commandFile = getCommandCenterFile(projectPath);
    if (!fs.existsSync(commandFile)) generateCommandCenter(projectPath);
    const content = readTextIfExists(commandFile);
    const block = content.match(/```todo\s*([\s\S]*?)```/)?.[1] || '';
    const lines = block.split('\n').map(line => line.trim()).filter(line => /^- \[ \]/.test(line));
    return lines.map((line, index) => {
        const duplicate = detectDuplicateTask(projectPath, line);
        return {
            id: `cmd-${index + 1}`,
            line,
            text: stripTaskMarkup(line),
            duplicate: duplicate.duplicate,
            similarity: duplicate.similarity,
            status: duplicate.duplicate ? '중복 제외' : '보류'
        };
    });
}

function isMeaninglessRepeatedTask(text) {
    return /검토\s*\d+|수직 슬라이스 범위 유지 검토\s*\d*|review\s*\d+/i.test(text || '');
}

function isLinkedToMissingFeature(text, states, statuses) {
    const missingLabels = [...(states || []), ...(statuses || [])]
        .filter(item => (item.level || 0) < 3)
        .map(item => item.label)
        .join(' ');
    const domainWords = '시작 구역 첫 수업 첫 주문 주문 퍼즐 첫 전투 NPC 대화 첫 비밀 짧은 던전 보상 저장 QA Magic Component Quest Dialogue SaveGame 중앙홀 지하서고';
    const haystack = `${missingLabels} ${domainWords}`;
    return String(text || '').split(/\s+/).some(word => word.length >= 2 && haystack.includes(word));
}

function countPassEvidence(projectPath) {
    const seenReviewer = new Set();
    const seenQa = new Set();
    let reviewerPass = 0;
    let qaPass = 0;

    // 리뷰 파일: 파일 경로를 키로 중복 제거
    const reviewFiles = listMarkdownFilesRecursive(getReviewsDir(projectPath), 500);
    for (const file of reviewFiles) {
        const content = readTextIfExists(file.full);
        if (/판정:\s*PASS|Reviewer Agent:\s*PASS/i.test(content) && !seenReviewer.has(file.full)) {
            seenReviewer.add(file.full);
            reviewerPass++;
        }
        if (/QA\s*PASS|QA\s*통과|테스트\s*통과|검수\s*통과/i.test(content) && !seenQa.has(file.full)) {
            seenQa.add(file.full);
            qaPass++;
        }
    }

    // 보조 파일: 파일별 QA PASS 포함 라인을 key로 중복 제거
    const auxFiles = [
        getDoneFile(projectPath),
        getProjectReportFile(projectPath)
    ];
    for (const filePath of auxFiles) {
        const lines = readTextIfExists(filePath).split('\n');
        for (const line of lines) {
            if (/QA\s*PASS|QA\s*통과|테스트\s*통과/.test(line)) {
                const key = `${filePath}::${line.trim()}`;
                if (!seenQa.has(key)) {
                    seenQa.add(key);
                    qaPass++;
                }
            }
        }
    }

    return { reviewerPass, qaPass };
}

// ═══════════════════════════════════════════════════════════════
// V51 § 실제 적용 워크플로 — promoteCandidateToProject
// ═══════════════════════════════════════════════════════════════

function getAppliedLogDir(projectPath) {
    return path.join(getApplyQueueDir(projectPath), 'applied');
}

function getImplementationTraceFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'implementation_trace.md');
}

function getProjectInventoryFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'project_inventory.md');
}

function promoteCandidateToProject(projectPath, candidateFile, config = null) {
    const cfg = config || loadConfig();
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);

    // 1. 후보 파일 확인
    if (!candidateFile || !fs.existsSync(candidateFile)) {
        return { ok: false, reason: `후보 파일 없음: ${candidateFile}` };
    }
    const content = readTextIfExists(candidateFile);

    // 2. 대상 경로 추출 (V56 공통 파서 사용)
    const targetRel = parseTargetPath(content);
    if (!targetRel) {
        return { ok: false, reason: '후보 파일에서 대상 경로(대상 경로 / 추천 적용 위치)를 찾을 수 없음' };
    }
    const targetAbs = path.isAbsolute(targetRel) ? targetRel : path.join(projectPath, targetRel);

    // 3. 백업 생성
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupDir = path.join(getAppliedLogDir(projectPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const existingText = fs.existsSync(targetAbs) && fs.statSync(targetAbs).isFile() ? readTextIfExists(targetAbs) : null;
    let backupPath = null;
    if (existingText !== null) {
        backupPath = path.join(backupDir, `${timestamp}_${path.basename(targetAbs)}.bak`);
        fs.writeFileSync(backupPath, existingText, 'utf8');
    }

    // 4. 코드 블록 추출 — .h / .cpp 분리 지원 (V58)
    const allCodeBlocks = [...content.matchAll(/```(?:\w*\n)?([\s\S]*?)```/g)].map(m => m[1].trim());
    const proposed = allCodeBlocks[0] || content;
    const diff = makeSimpleDiff(existingText || '', proposed);

    // .cpp 블록 분리 감지 (헤더가 .h이고 두 번째 블록이 있으면 .cpp로 생성)
    const hasCppBlock = allCodeBlocks.length >= 2 && targetRel.endsWith('.h');
    const cppTargetRel = hasCppBlock ? targetRel.replace(/\.h$/, '.cpp') : null;
    const cppTargetAbs = cppTargetRel ? (path.isAbsolute(cppTargetRel) ? cppTargetRel : path.join(projectPath, cppTargetRel)) : null;
    const cppProposed = hasCppBlock ? allCodeBlocks[1] : null;

    // 5. 승인 여부 확인 — allowRealApply 없으면 dry-run만
    const applied = cfg.allowRealApply === true;

    if (applied) {
        // 6. 실제 적용 (safeWriteFile 사용)
        const dir = path.dirname(targetAbs);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        safeWriteFile(targetAbs, proposed);
        // .cpp도 있으면 함께 생성
        if (cppTargetAbs && cppProposed) {
            const cppDir = path.dirname(cppTargetAbs);
            if (!fs.existsSync(cppDir)) fs.mkdirSync(cppDir, { recursive: true });
            safeWriteFile(cppTargetAbs, cppProposed);
        }
    }

    // 7. 적용 로그 기록
    const appliedDir = getAppliedLogDir(projectPath);
    if (!fs.existsSync(appliedDir)) fs.mkdirSync(appliedDir, { recursive: true });
    const logFile = path.join(appliedDir, `${timestamp}_apply.md`);
    const logContent = `# 적용 로그

- 후보 파일: ${candidateFile}
- 적용 경로: ${targetRel}
- 적용 시각: ${new Date().toLocaleString('ko-KR')}
- 백업 위치: ${backupPath || '없음 (신규 파일)'}
- 실제 적용 여부: ${applied ? '예 (allowRealApply=true)' : '아니오 (dry-run)'}

## 변경 내용 요약
\`\`\`diff
${diff.substring(0, 2000) || '+ 신규 파일 생성'}
\`\`\`

## 적용 워크플로 준수
- 후보 → 승인 → 적용 → 추적 순서 강제
- 승인 없이 자동 적용 금지
- allowRealApply=false 시 실제 파일 수정 없음
`;
    safeWriteFile(logFile, logContent);
    generatedFiles++;

    // V59: 실제 적용 성공 시 보고서 자동 갱신
    if (applied) {
        try { generateImplementationTrace(projectPath); } catch (e) { /* 비중단 */ }
        try { generateProjectInventory(projectPath); } catch (e) { /* 비중단 */ }
        try { analyzeGameState(projectPath); } catch (e) { /* 비중단 */ }
        try { analyzeVerticalSliceStatus(projectPath); } catch (e) { /* 비중단 */ }
        try { generatePmValidation(projectPath); } catch (e) { /* 비중단 */ }
    }

    const promoteResult = {
        ok: true,
        applied,
        candidateFile,
        targetPath: targetRel,
        targetAbsPath: targetAbs,
        backupPath,
        logFile,
        diff: diff.substring(0, 500),
        cppCreated: !!(applied && cppTargetAbs && cppProposed),
        message: applied
            ? `실제 적용 완료: ${targetRel}${cppTargetAbs && cppProposed ? ' + ' + cppTargetRel : ''}`
            : `dry-run 완료 (실제 적용 미실행): ${targetRel} — allowRealApply=true 설정 후 재실행 필요`
    };
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, {
            task: `후보 적용: ${targetRel}`,
            decision: applied ? '실제 파일 적용 (allowRealApply=true)' : 'dry-run (allowRealApply=false)',
            result: path.basename(candidateFile)
        });
    } catch { /* 비중단 */ }
    return promoteResult;
}

// ═══════════════════════════════════════════════════════════════
// V52 § Source/Content 추적 엔진 — generateImplementationTrace
// ═══════════════════════════════════════════════════════════════

function generateImplementationTrace(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const candidates = getApplyCandidateSummary(projectPath);
    const rejectedFiles = listMarkdownFilesRecursive(path.join(getApplyQueueDir(projectPath), 'rejected'), 200);
    const appliedLogs = listMarkdownFilesRecursive(getAppliedLogDir(projectPath), 200)
        .filter(f => /\.apply\.md$/i.test(f.name));

    let sourceCount = 0;
    let contentCount = 0;
    let otherReflectedCount = 0;
    let unmappedCount = 0;

    const rows = candidates.map(cand => {
        const targetRel = cand.location || '';
        if (!targetRel) {
            unmappedCount++;
            return { name: path.basename(cand.file), target: '(경로 없음)', category: cand.category, status: '⬜ 미반영', reflected: false };
        }
        const targetAbs = path.isAbsolute(targetRel) ? targetRel : path.join(projectPath, targetRel);
        const exists = fs.existsSync(targetAbs);
        const inSource = /^Source[\\/]/i.test(targetRel);
        const inContent = /^Content[\\/]/i.test(targetRel);

        if (exists && inSource) sourceCount++;
        else if (exists && inContent) contentCount++;
        else if (exists) otherReflectedCount++;
        else unmappedCount++;

        const statusIcon = exists ? (inSource ? '✅ Source 반영' : inContent ? '✅ Content 반영' : '✅ 반영(기타)') : '⬜ 미반영';
        return { name: path.basename(cand.file), target: targetRel, category: cand.category, status: statusIcon, reflected: exists };
    });

    const unreflected = rows.filter(r => !r.reflected);

    const report = `# 구현 추적 보고서

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 총 후보 수: ${candidates.length}
- Source 실반영 수: ${sourceCount}
- Content 실반영 수: ${contentCount}
- 미반영 후보 수: ${unmappedCount}
- 거부된 후보 수: ${rejectedFiles.length}
- 적용 로그 수: ${appliedLogs.length}

## 후보별 반영 현황

| 후보 파일 | 대상 경로 | 분류 | 반영 상태 |
| --- | --- | --- | --- |
${rows.map(r => `| ${r.name} | ${r.target} | ${r.category} | ${r.status} |`).join('\n') || '| 없음 | - | - | - |'}

## 미반영 후보 — 우선 처리 대상
${unreflected.slice(0, 10).map(r => `- [ ] [${r.category}] ${r.name} → ${r.target}`).join('\n') || '- 미반영 후보 없음'}

## 적용 워크플로 현황
- 총 적용 로그: ${appliedLogs.length}건
- 거부된 항목: ${rejectedFiles.length}건
- 후보 → 승인 → 적용 → 추적 순서 유지 중
`;
    safeWriteFile(getImplementationTraceFile(projectPath), report);
    generatedFiles++;
    return {
        report,
        total: candidates.length,
        sourceCount,
        contentCount,
        unmappedCount,
        rejectedCount: rejectedFiles.length,
        appliedCount: appliedLogs.length,
        unreflectedItems: unreflected.map(r => r.target)
    };
}

// ═══════════════════════════════════════════════════════════════
// V53 § 실제 구현 진행률 — 상태3+ 항목만 집계
// ═══════════════════════════════════════════════════════════════

function getActualOnlyProgress(items) {
    if (!items || !items.length) return 0;
    const weights = items.map(item => {
        const lvl = Number(item.level) || 0;
        return lvl >= 3 ? getStateWeight(lvl) : 0;
    });
    return Math.round(weights.reduce((s, w) => s + w, 0) / items.length);
}

// ═══════════════════════════════════════════════════════════════
// V54 § UE5 프로젝트 인벤토리 — generateProjectInventory
// ═══════════════════════════════════════════════════════════════

const PROJECT_SYSTEMS = [
    {
        id: 'character',
        label: 'Character System',
        patterns: [/AToribatCharacter|BP_Character|PlayerCharacter|ACharacter|PlayerController/i],
        templateId: null
    },
    {
        id: 'magic',
        label: 'Magic Component',
        patterns: [/UMagicComponent|MagicComponent|BP_Magic|UMagic/i],
        templateId: 'magic_component'
    },
    {
        id: 'quest',
        label: 'Quest System',
        patterns: [/UQuestStateManager|QuestSystem|QuestManager|BP_Quest/i],
        templateId: 'quest_state_manager'
    },
    {
        id: 'save',
        label: 'Save System',
        patterns: [/UToribatSaveGame|SaveGame|SaveSlot/i],
        templateId: 'save_game'
    },
    {
        id: 'enemy',
        label: 'Enemy AI',
        patterns: [/ABasicEnemy|EnemyAI|BP_Enemy|AIController|BTTask|BehaviorTree/i],
        templateId: 'basic_enemy_ai'
    },
    {
        id: 'dialogue',
        label: 'Dialogue System',
        patterns: [/BP_DialogueComponent|DialogueSystem|FDialogueRow|BP_NPC/i],
        templateId: 'dialogue_component'
    },
    {
        id: 'levels',
        label: 'Level / Maps',
        patterns: [/\.umap|LevelStreaming|ToribatMagicSchool.*Map|MainHall|중앙홀/i],
        templateId: null
    }
];

function generateProjectInventory(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const ue = collectUEProjectEvidence(projectPath);
    const candidates = getApplyCandidateSummary(projectPath);
    const candidateText = candidates.map(c => `${c.file}\n${readTextIfExists(c.file).substring(0, 800)}`).join('\n');

    const allProjectFilePaths = [
        ...ue.sourceCodeFiles.map(f => f.full),
        ...ue.contentFiles.map(f => f.full),
        ...ue.mapFiles.map(f => f.full),
        ...ue.assetFiles.map(f => f.full)
    ].join('\n');

    const systemRows = PROJECT_SYSTEMS.map(sys => {
        const inProject = sys.patterns.some(p => p.test(allProjectFilePaths));
        const inCandidates = sys.patterns.some(p => p.test(candidateText));
        const hasTemplate = SCHOOL_CODE_TEMPLATES.some(t => t.id === sys.id);

        let statusIcon, status, next;
        if (inProject) {
            statusIcon = '✅'; status = '구현됨';
            next = 'QA PASS + Reviewer PASS 획득으로 상태4 달성';
        } else if (inCandidates) {
            statusIcon = '🗂️'; status = '후보만 존재';
            next = `promoteCandidateToProject() 실행 → Source/Content 승격 → 상태3`;
        } else if (hasTemplate) {
            statusIcon = '📋'; status = '미구현 (템플릿 있음)';
            next = `generateCodeCandidate('${sys.id}') → 후보 생성 → 승격`;
        } else {
            statusIcon = '❌'; status = '미구현';
            next = '기획 문서 작성 후 apply_candidates 생성';
        }
        return { ...sys, statusIcon, status, next, inProject, inCandidates };
    });

    const implementedCount = systemRows.filter(s => s.inProject).length;
    const candidateOnlyCount = systemRows.filter(s => !s.inProject && s.inCandidates).length;
    const missingCount = systemRows.filter(s => !s.inProject && !s.inCandidates).length;

    const report = `# UE5 프로젝트 인벤토리

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- .uproject 존재: ${ue.hasUProject ? '예' : '아니오'}
- 구현된 시스템: ${implementedCount}/${PROJECT_SYSTEMS.length}
- 후보만 존재: ${candidateOnlyCount}
- 미구현: ${missingCount}

## 게임 시스템별 구현 현황

| 시스템 | 상태 | 다음 단계 |
| --- | --- | --- |
${systemRows.map(s => `| ${s.statusIcon} ${s.label} | ${s.status} | ${s.next} |`).join('\n')}

## UE5 실체 파일 현황
- .uproject: ${ue.uprojectFiles.length}
- Source 코드 파일: ${ue.sourceCodeFiles.length}
- Content 파일: ${ue.contentFiles.length}
- Map(.umap): ${ue.mapFiles.length}
- Asset(.uasset): ${ue.assetFiles.length}

## 우선 구현 대상
${systemRows.filter(s => !s.inProject).slice(0, 5).map(s => `- [ ] ${s.statusIcon} [${s.status}] ${s.label}: ${s.next}`).join('\n') || '- 모든 핵심 시스템 구현됨'}
`;
    safeWriteFile(getProjectInventoryFile(projectPath), report);
    generatedFiles++;
    return { report, systemRows, implementedCount, candidateOnlyCount, missingCount };
}

// ═══════════════════════════════════════════════════════════════

function generateStateAudit(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const gameState = analyzeGameState(projectPath);
    const vertical = analyzeVerticalSliceStatus(projectPath);
    const allItems = [...gameState.states, ...vertical.statuses];
    const logicFindings = [];
    const previousLogic = [
        '기존 V43~V47 로직은 (Reviewer PASS 또는 QA PASS) AND (실제 파일 또는 적용 후보)로 상태4를 허용했다.',
        '이 조건은 .uproject 존재를 필수로 보지 않았다.',
        '이 조건은 QA PASS와 Reviewer PASS를 동시에 요구하지 않았다.',
        '이 조건은 적용 후보만 있어도 PASS와 결합해 상태4가 될 수 있었다.'
    ];
    if (allItems.some(item => item.qaPass && !item.reviewerPass)) logicFindings.push('QA PASS만 있는 항목은 상태4 금지 대상이다.');
    if (allItems.some(item => item.reviewerPass && !item.qaPass)) logicFindings.push('Reviewer PASS만 있는 항목은 상태4 금지 대상이다.');
    if (allItems.some(item => item.doc && item.qaPass && !item.actualImplementation)) logicFindings.push('문서 + QA PASS만 있는 항목은 상태4 금지 대상이다.');
    if (allItems.some(item => item.doc && item.reviewerPass && !item.actualImplementation)) logicFindings.push('문서 + Reviewer PASS만 있는 항목은 상태4 금지 대상이다.');
    if (allItems.some(item => item.level === 4 && !item.state4Eligible)) logicFindings.push('현재 상태4 중 새 조건을 만족하지 않는 항목이 있다.');
    if (!logicFindings.length) logicFindings.push('현재 코드 기준으로 QA 단독, Reviewer 단독, 문서+PASS 단독 상태4 승격은 차단됨.');
    const report = `# 상태 판정 엔진 감사

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 목적: PM 판단 엔진이 실제 UE5 프로젝트 근거 없이 상태를 과대평가하는지 감사

## 상태별 판정 조건
| 상태 | 판정 조건 | 실제 구현 근거 | 문서 근거 | QA 근거 | Reviewer 근거 | UE 파일 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| 상태0 | 문서, 후보, 실제 파일, PASS 근거 모두 없음 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 |
| 상태1 | 관련 문서/기획 문구만 있음 | 아니오 | 예 | 아니오 | 아니오 | 아니오 |
| 상태2 | 적용 후보가 있음 | 아니오 | 선택 | 아니오 | 아니오 | 아니오 |
| 상태3 | 실제 프로젝트 파일 근거 또는 Source/Content 승격 근거가 있음 | 예 | 선택 | 아니오 | 아니오 | 예 |
| 상태4 | .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 있음 | 예 | 선택 | 필수 | 필수 | 필수 |

## V48 감사 결과
${previousLogic.map(item => `- ${item}`).join('\n')}

## 발견된 논리 오류 패턴
${logicFindings.map(item => `- ${item}`).join('\n')}

## 현재 상태4 후보 점검
| 항목 | 상태 | .uproject | 실제 구현 | QA PASS | Reviewer PASS | 상태4 허용 |
| --- | ---: | --- | --- | --- | --- | --- |
${allItems.map(item => `| ${item.label} | ${item.level} | ${item.hasUProject ? '예' : '아니오'} | ${item.actualImplementation ? '예' : '아니오'} | ${item.qaPass ? '예' : '아니오'} | ${item.reviewerPass ? '예' : '아니오'} | ${item.state4Eligible ? '예' : '아니오'} |`).join('\n')}

## 수정된 상태4 조건
상태4는 다음 4개 조건을 모두 만족할 때만 허용한다.

1. .uproject 파일 존재
2. 실제 구현 근거 존재: Source 또는 Content 또는 .umap 또는 .uasset
3. QA PASS 존재
4. Reviewer PASS 존재

## 진행률 계산식
- 상태0 = 0
- 상태1 = 10
- 상태2 = 35
- 상태3 = 70
- 상태4 = 100
- Actual Implementation Progress = 모든 상태 항목 가중치 평균
`;
    safeWriteFile(getStateAuditFile(projectPath), report);
    generatedFiles++;
    return { report, findings: logicFindings, items: allItems };
}

function generatePmValidation(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    generateStateAudit(projectPath);
    const gameState = analyzeGameState(projectPath);
    const vertical = analyzeVerticalSliceStatus(projectPath);
    const progress = {
        actual: getActualImplementationProgress(gameState.states, vertical.statuses),
        feature: gameState.featureProgress,
        vertical: vertical.percent
    };
    const ue = collectUEProjectEvidence(projectPath);
    const passCounts = countPassEvidence(projectPath);
    const allJudgementItems = [...gameState.states, ...vertical.statuses];
    const state4Items = allJudgementItems.filter(item => item.level === 4);
    const state4MissingQa = state4Items.filter(item => !item.qaPass).length;
    const state4MissingReviewer = state4Items.filter(item => !item.reviewerPass).length;
    const state4MissingUe = state4Items.filter(item => !item.hasUProject).length;
    const state4MissingSource = state4Items.filter(item => !item.sourceMatch && !item.promotedCandidates).length;
    const state4MissingContent = state4Items.filter(item => !item.contentMatch && !item.mapMatch && !item.assetMatch && !item.promotedCandidates).length;
    if (!fs.existsSync(getCommandCenterFile(projectPath))) generateCommandCenter(projectPath);
    const recommendations = parseCommandCenterRecommendations(projectPath).slice(0, 10).map(item => {
        const repeated = isMeaninglessRepeatedTask(item.line);
        const linked = isLinkedToMissingFeature(item.line, gameState.states, vertical.statuses);
        const agent = item.line.match(/담당 에이전트:\s*([^|]+)/)?.[1]?.trim()
            || item.line.match(/\[(코드|월드|스토리|QA|게임플레이|PM)\]/)?.[1]
            || '미지정';
        return {
            ...item,
            repeated,
            linked,
            agent,
            quality: item.duplicate ? '중복' : repeated ? '오류' : linked ? '연결됨' : '확인 필요'
        };
    });
    const issues = [];
    const allStatuses = vertical.statuses;
    for (const item of allJudgementItems) {
        const evidence = item.evidence || '';
        if ((item.level || 0) >= 3 && evidence.includes('문서/기획') && !/실파일|승격|PASS/.test(evidence)) {
            issues.push({ severity: '오류', text: `${item.label}: 문서만 있는데 상태 ${item.level}로 표시됨` });
        }
        if ((item.level || 0) === 4 && !/Reviewer PASS|QA PASS/.test(evidence)) {
            issues.push({ severity: '오류', text: `${item.label}: PASS 근거 없이 상태 4로 표시됨` });
        }
        if ((item.level || 0) === 4 && !item.state4Eligible) {
            issues.push({ severity: '오류', text: `${item.label}: .uproject + 실제 구현 + QA PASS + Reviewer PASS를 모두 만족하지 않는데 상태 4로 표시됨` });
        }
        if ((item.level || 0) >= 3 && !/실파일|승격|PASS/.test(evidence)) {
            issues.push({ severity: '오류', text: `${item.label}: Source/Content 근거 없이 구현됨으로 표시됨` });
        }
    }
    for (const task of recommendations) {
        if (task.repeated) issues.push({ severity: '오류', text: `반복형 추천 태스크 감지: ${task.line}` });
    }
    const state4Count = allStatuses.filter(item => item.level === 4).length;
    if (progress.actual >= 80 && state4Count < 5) {
        issues.push({ severity: '오류', text: `Actual Implementation Progress ${progress.actual}%인데 상태 4 수직 슬라이스 항목이 ${state4Count}개뿐임` });
    }
    for (const task of recommendations) {
        if (!task.linked) issues.push({ severity: '주의', text: `실제 부족 기능 연결이 약한 추천: ${task.line}` });
    }
    // V60: apply queue 상태를 statuses에 결합
    const queueItems = getApplyQueueSummary(projectPath);
    const candidateItems = getApplyCandidateSummary(projectPath);
    const enrichedStatuses = vertical.statuses.map(item => {
        const lbl = (item.label || '').toLowerCase();
        const hasCandidate = candidateItems.some(c => (c.targetPath || c.location || c.task || '').toLowerCase().includes(lbl) || lbl.includes((c.task || '').toLowerCase().substring(0, 8)));
        const queueEntry = queueItems.find(q => (q.targetPath || q.target || '').toLowerCase().includes(lbl) || lbl.includes((q.targetPath || '').toLowerCase().substring(0, 8)));
        const queueStatus = queueEntry ? queueEntry.status : null;
        const stageLabel = item.level >= 4 ? '검수/실행 통과'
            : item.level >= 3 ? '실제 프로젝트 반영'
            : queueStatus === 'approved' ? '적용 큐 승인됨'
            : queueStatus === 'pending' ? '적용 큐 대기'
            : hasCandidate ? '후보 있음'
            : item.level >= 1 ? '문서만 있음'
            : '미착수';
        return { ...item, queueStatus, hasCandidate, stageLabel };
    });

    // V66: stale E:\ 경로 큐 파일 감지
    const staleQueueItems = queueItems.filter(q => q.stalePath);
    if (staleQueueItems.length) {
        issues.push({ severity: '주의', text: `Legacy Queue Warning: E:\\ToribatMagicSchool 경로 참조 큐 파일 ${staleQueueItems.length}개 발견 — 삭제 또는 경로 수정 필요` });
    }

    const reliability = issues.some(issue => issue.severity === '오류') ? '실패' : issues.length ? '주의' : '통과';
    const fixes = issues.length
        ? issues.map(issue => `- ${issue.severity}: ${issue.text}`).join('\n')
        : '- 현재 PM 판단은 보고된 근거 기준에서 신뢰 가능';
    const report = `# PM 판단 검증

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- PM 판단 신뢰도: ${reliability}
- 통과/실패: ${reliability === '실패' ? '실패' : '통과'}

## Actual Implementation Progress
- 현재 값: ${progress.actual}%
- 근거: 상태별 가중치 평균 (0=0, 1=10, 2=35, 3=70, 4=100)
- 상태4 조건: .uproject + 실제 구현 근거(Source/Content/.umap/.uasset) + QA PASS + Reviewer PASS 모두 필요
- Source 파일 수: ${ue.sourceFiles.length}
- Content 파일 수: ${ue.contentFiles.length}
- .umap 수: ${ue.mapFiles.length}
- .uasset 수: ${ue.assetFiles.length}
- Reviewer PASS 수: ${passCounts.reviewerPass}
- QA PASS 수: ${passCounts.qaPass}
- 상태4 항목 수: ${state4Items.length}
- 상태4 중 QA PASS 없음: ${state4MissingQa}
- 상태4 중 Reviewer PASS 없음: ${state4MissingReviewer}
- 상태4 중 UE 근거 없음: ${state4MissingUe}
- 상태4 중 Source 없음: ${state4MissingSource}
- 상태4 중 Content 없음: ${state4MissingContent}

## 상태 0~4 분류표 (V60 단계 포함)
| 수직 슬라이스 항목 | 단계 | 구현 단계 | 큐 상태 | 후보 | 의미 | 근거 |
| --- | ---: | --- | --- | --- | --- | --- |
${enrichedStatuses.map(item => `| ${item.label} | ${item.level} | ${item.stageLabel} | ${item.queueStatus || '없음'} | ${item.hasCandidate ? '있음' : '없음'} | ${item.status} | ${item.evidence} |`).join('\n')}

## Legacy Queue Warning
- stalePath(E:\\ 잔존) 큐 파일 수: ${staleQueueItems.length}${staleQueueItems.length ? '\n' + staleQueueItems.map(q => `  - ${path.basename(q.file)}`).join('\n') : ''}

## 문제 감지
${issues.length ? issues.map(issue => `- [${issue.severity}] ${issue.text}`).join('\n') : '- 감지된 문제 없음'}

## 추천 태스크 품질 검사
| 추천 태스크 | 중복 여부 | 반복 여부 | 부족 기능 연결 | 담당 에이전트 |
| --- | --- | --- | --- | --- |
${recommendations.map(item => `| ${item.line.replace(/\|/g, '/')} | ${item.duplicate ? '중복' : '정상'} | ${item.repeated ? '반복형' : '정상'} | ${item.linked ? '연결됨' : '약함'} | ${item.agent} |`).join('\n') || '| 없음 | - | - | - | - |'}

## 수정 권장 사항
${fixes}

## 현재 진행률 판단 신뢰성
${reliability === '통과' ? '현재 진행률 판단은 신뢰 가능하다.' : reliability === '주의' ? '현재 진행률 판단은 일부 주의가 필요하다.' : '현재 진행률 판단은 신뢰하기 어렵다. 위 문제를 먼저 수정해야 한다.'}
`;
    report += buildKnowledgeContextSection('quest magic worldbuilding UE5 vertical slice');
    safeWriteFile(getPmValidationFile(projectPath), report);
    generatedFiles++;
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordDecision(vp, `PM 검증 실행 — ${reliability}`, `Actual: ${progress.actual}%, 이슈 ${issues.length}건`);
        recordAgentMemory(vp, { task: 'PM 검증 보고서 생성', decision: `신뢰도: ${reliability}`, result: `진행률 ${progress.actual}%, 이슈 ${issues.length}건` });
    } catch { /* 비중단 */ }
    return {
        reliability,
        report,
        progress,
        evidence: {
            sourceFiles: ue.sourceFiles.length,
            contentFiles: ue.contentFiles.length,
            mapFiles: ue.mapFiles.length,
            assetFiles: ue.assetFiles.length,
            reviewerPass: passCounts.reviewerPass,
            qaPass: passCounts.qaPass,
            state4Count: state4Items.length,
            state4MissingQa,
            state4MissingReviewer,
            state4MissingUe,
            state4MissingSource,
            state4MissingContent
        },
        statuses: enrichedStatuses,
        issues,
        recommendations
    };
}

function approveSelectedCommandTasks(projectPath, selectedIds = []) {
    const candidates = parseCommandCenterRecommendations(projectPath);
    const selected = selectedIds.length ? candidates.filter(item => selectedIds.includes(item.id)) : [];
    const accepted = selected.filter(item => !item.duplicate);
    const skipped = selected.filter(item => item.duplicate);
    if (accepted.length) {
        const current = readTextIfExists(getTodoFile(projectPath)) || '# 📋 ToribatMagicSchool - 태스크 목록\n';
        safeWriteFile(getTodoFile(projectPath), `${current.trimEnd()}\n\n## 지휘 센터 선택 승인 - ${new Date().toLocaleString('ko-KR')}\n${accepted.map(item => item.line).join('\n')}\n`);
        fs.appendFileSync(getGeneratedTasksFile(projectPath), `\n## 지휘 센터 선택 승인 기록 - ${new Date().toLocaleString('ko-KR')}\n${accepted.map(item => `- [x] <!-- status:approved; source:command_center --> ${item.line.replace(/^- \[ \]\s*/, '')}`).join('\n')}\n`, 'utf8');
    }
    return {
        approvedCount: accepted.length,
        skippedCount: skipped.length,
        statuses: candidates.map(item => ({
            ...item,
            status: selectedIds.includes(item.id) ? (item.duplicate ? '중복 제외' : '추가됨') : '보류'
        }))
    };
}

function classifyPatchCandidate(issueText) {
    if (/Blueprint|K2Node|BP_|블루프린트/i.test(issueText)) return 'blueprint';
    if (/Build\.cs|Missing Module|module|PublicDependency|PrivateDependency|uproject/i.test(issueText)) return 'build';
    if (/Config|\.ini|DefaultEngine|DefaultGame/i.test(issueText)) return 'config';
    return 'code';
}

function guessPatchTargetFile(category, issueText) {
    const pathMatch = String(issueText || '').match(/(?:Source|Config|Plugins|Content)[^\s:'")]+/i);
    if (pathMatch) return pathMatch[0].replace(/\\/g, '/');
    const defaults = {
        code: 'Source/ToribatMagicSchool/',
        build: 'Source/ToribatMagicSchool/ToribatMagicSchool.Build.cs',
        config: 'Config/DefaultEngine.ini',
        blueprint: 'Content/ToribatMagicSchool/Blueprints/'
    };
    return defaults[category] || defaults.code;
}

function generatePatchCandidates(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const diagnostics = readTextIfExists(getBuildDiagnosticsFile(projectPath)) || analyzeBuildLogs(projectPath).report;
    const issueLines = diagnostics.split('\n').filter(line => /^\- \[(Error|Fatal|Warning)\]/.test(line) || /C\+\+|Blueprint|Missing Module|Build\.cs|include/i.test(line)).slice(0, 20);
    const issues = issueLines.length ? issueLines : ['- [Warning] 로그 기반 오류가 없어 빌드 로그 확보 절차 후보 생성'];
    const created = [];
    for (const [index, issue] of issues.entries()) {
        const category = classifyPatchCandidate(issue);
        const dir = path.join(getPatchCandidatesDir(projectPath), category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const target = guessPatchTargetFile(category, issue);
        const risk = /Fatal|Missing Module|Build\.cs|C\+\+/i.test(issue) ? '높음' : /Warning/i.test(issue) ? '낮음' : '중간';
        const prompt = `ToribatMagicSchool UE5 프로젝트에서 다음 빌드 오류를 최소 수정으로 해결해라.
프로젝트 루트: ${projectPath}
오류 원문: ${issue}
수정 대상 파일: ${target}
규칙:
1. 기존 파일을 먼저 읽고 작은 범위로 수정한다.
2. UE5 직접 실행은 하지 않는다.
3. Build.cs/include/module 오류를 우선 해결한다.
4. 변경 파일과 검증 절차를 보고한다.`;
        const file = path.join(dir, `${timestamp}_patch_${index + 1}.patch.md`);
        fs.writeFileSync(file, `# 패치 후보

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 분류: ${category}
- 위험도: ${risk}

## 오류 원문
${issue}

## 원인 추정
${classifyBuildIssue(issue).cause}

## 수정 대상 파일
${target}

## 수정 전략
- 기존 파일을 읽고 누락된 모듈, include 경로, Blueprint 참조, Config 값을 최소 범위로 보정한다.
- 수직 슬라이스 범위를 벗어나는 대형 구조 변경은 금지한다.

## Claude Code용 프롬프트
\`\`\`text
${prompt}
\`\`\`

## 적용 전 확인사항
- 적용 후보가 현재 스프린트 목표와 연결되는지 확인
- Reviewer Agent PASS 또는 REVIEW 이상인지 확인
- 실제 파일 수정 전 apply_queue dry-run 확인
` + buildKnowledgeContextSection(category + ' ' + target), 'utf8');
        created.push({ file, category, risk, target, prompt });
    }
    generatedFiles += created.length;
    return created;
}

function getPatchCandidateSummary(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    return listMarkdownFilesRecursive(getPatchCandidatesDir(projectPath), 200).map(file => {
        const content = readTextIfExists(file.full);
        return {
            file: file.full,
            category: path.basename(path.dirname(file.full)),
            risk: content.match(/- 위험도:\s*(.+)/)?.[1]?.trim() || '중간',
            target: content.match(/## 수정 대상 파일\s*\n(.+)/)?.[1]?.trim() || '',
            prompt: content.match(/```text\s*([\s\S]*?)```/)?.[1]?.trim() || '',
            mtime: file.mtime
        };
    });
}

function collectTraceability(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const outputs = listMarkdownFilesRecursive(path.join(projectPath, 'tasks', 'outputs'), 200);
    const reviews = getReviewSummary(projectPath);
    const candidates = getApplyCandidateSummary(projectPath);
    const patches = getPatchCandidateSummary(projectPath);
    const sprints = listSprints(projectPath);
    const rows = outputs.slice(0, 80).map(output => {
        const name = path.basename(output.full);
        const content = readTextIfExists(output.full);
        const task = content.match(/^#\s*(.+)$/m)?.[1] || name;
        const review = reviews.find(item => content.includes(path.basename(item.file)) || item.task.includes(task.substring(0, 24))) || null;
        const candidate = candidates.find(item => item.task.includes(task.substring(0, 24)) || item.file.includes(name.substring(0, 12))) || null;
        const patch = patches.find(item => item.target && content.includes(item.target)) || null;
        const sprint = sprints.find(item => item.goal.includes(task.substring(0, 16)) || readTextIfExists(item.file).includes(task.substring(0, 24))) || null;
        return {
            output: output.full,
            task,
            review: review ? `${review.reviewer || review.category} ${review.decision}` : '연결 없음',
            candidate: candidate ? `${candidate.category} ${candidate.review}` : '연결 없음',
            buildIssue: patch ? `${patch.category} / ${patch.risk}` : '빌드 오류 없음',
            sprint: sprint ? sprint.title : '미포함',
            status: review?.decision === 'PASS' ? '추적 정상' : review ? '검토 필요' : '리뷰 미연결'
        };
    });
    const report = `# 통합 추적

- 생성 시각: ${new Date().toLocaleString('ko-KR')}

| 결과물 파일 | Reviewer 결과 | 적용 후보 | 관련 빌드 오류 | 관련 태스크 | 관련 스프린트 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
${rows.length ? rows.map(row => `| ${path.relative(projectPath, row.output).replace(/\\/g, '/')} | ${row.review} | ${row.candidate} | ${row.buildIssue} | ${row.task.replace(/\|/g, '/')} | ${row.sprint} | ${row.status} |`).join('\n') : '| 결과물 없음 | - | - | - | - | - | - |'}
`;
    fs.writeFileSync(getTraceabilityFile(projectPath), report, 'utf8');
    generatedFiles++;
    return { rows, report };
}

// ── V56: targetPath 공통 파서 ─────────────────────────────────────────────────
// 지원 표기: 대상 경로 / 추천 적용 위치 / Target Path / targetPath / 적용 위치 / 추천 적용 경로
function parseTargetPath(text) {
    const raw = (
        String(text || '')
            .match(/(?:대상 경로|추천 적용 위치|Target Path|targetPath|적용 위치|추천 적용 경로)\s*[:：]\s*([^\n\r]+)/i)
    )?.[1]?.trim();
    return raw || '';
}

function makeSimpleDiff(oldText, newText) {
    const oldLines = String(oldText || '').split(/\r?\n/);
    const newLines = String(newText || '').split(/\r?\n/);
    const max = Math.max(oldLines.length, newLines.length);
    const diff = [];
    for (let i = 0; i < max; i++) {
        if (oldLines[i] === newLines[i]) {
            if (oldLines[i] !== undefined) diff.push(` ${oldLines[i]}`);
        } else {
            if (oldLines[i] !== undefined) diff.push(`-${oldLines[i]}`);
            if (newLines[i] !== undefined) diff.push(`+${newLines[i]}`);
        }
    }
    return diff.join('\n');
}

function registerApplyCandidateToQueue(projectPath, candidateFile = '') {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const candidates = getApplyCandidateSummary(projectPath);
    const selected = candidateFile
        ? candidates.find(item => item.file === candidateFile || item.file.endsWith(candidateFile))
        : candidates[0];
    if (!selected) return { registered: false, reason: '적용 후보 없음' };

    // V56: 공통 파서로 targetPath 안정적 추출
    const candidateContent = readTextIfExists(selected.file);
    const targetRel = parseTargetPath(candidateContent) || selected.targetPath || selected.location || '';
    const targetAbsPath = targetRel ? (path.isAbsolute(targetRel) ? targetRel : path.join(projectPath, targetRel)) : '';
    const existing = targetAbsPath && fs.existsSync(targetAbsPath) && fs.statSync(targetAbsPath).isFile()
        ? readTextIfExists(targetAbsPath) : '';

    // 코드 블록 본문 추출
    const codeBody = candidateContent.match(/```(?:\w*\n)?([\s\S]*?)```/)?.[1]?.trim() || '';
    const proposed = codeBody || candidateContent.substring(0, 1800);
    const diff = makeSimpleDiff(existing, proposed);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const pendingDir = path.join(getApplyQueueDir(projectPath), 'pending');
    if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });
    const file = path.join(pendingDir, `${timestamp}_${path.basename(selected.file).replace(/\.candidate\.md$/i, '')}.apply.md`);

    safeWriteFile(file, `# 적용 큐 항목

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 상태: pending
- 적용 후보: ${selected.file}
- 대상 경로: ${targetRel}
- 추천 적용 위치: ${targetRel}
- 기존 파일 존재: ${existing ? '예' : '아니오'}
- allowRealApply: false
- dry-run: true

## 코드 본문
\`\`\`
${proposed.substring(0, 1800)}
\`\`\`

## 변경 Diff
\`\`\`diff
${diff || '+ 신규 파일 후보 또는 비교 대상 없음'}
\`\`\`

## 승인 전 확인
- 사용자 승인 전 실제 파일 수정 금지
- allowRealApply=true일 때만 실제 쓰기 허용
`);
    generatedFiles++;
    return { registered: true, file, targetPath: targetRel, diff };
}

function getApplyQueueSummary(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const statuses = ['pending', 'approved', 'rejected', 'applied'];
    return statuses.flatMap(status => listMarkdownFilesRecursive(path.join(getApplyQueueDir(projectPath), status), 200).map(file => {
        const content = readTextIfExists(file.full);
        const target = parseTargetPath(content);  // V56: 공통 파서 사용
        const candidateFile = content.match(/- 적용 후보:\s*(.+)/)?.[1]?.trim() || '';
        const stalePath = /E:\\ToribatMagicSchool|E:\/ToribatMagicSchool/i.test(content);
        return {
            file: file.full,
            status,
            target,
            targetPath: target,
            candidateFile,
            hasExisting: /- 기존 파일 존재:\s*예/.test(content),
            diff: content.match(/```diff\s*([\s\S]*?)```/)?.[1]?.trim() || '',
            mtime: file.mtime,
            stalePath
        };
    }));
}

function moveApplyQueueItem(projectPath, queueFile, nextStatus) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const item = getApplyQueueSummary(projectPath).find(entry => entry.file === queueFile || entry.file.endsWith(queueFile));
    if (!item) return { moved: false, reason: '큐 항목 없음' };
    if (nextStatus === 'approved') {
        const review = findApplyReviewForQueue(projectPath, item.file);
        if (!review || review.decision !== 'PASS') {
            return { moved: false, reason: 'Apply Review PASS 필요', reviewDecision: review?.decision || 'NONE' };
        }
    }
    const destDir = path.join(getApplyQueueDir(projectPath), nextStatus);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(item.file));
    // V57: 이동 시 상태 헤더 갱신하여 기록
    const origContent = readTextIfExists(item.file);
    const timestamp = new Date().toLocaleString('ko-KR');
    const updatedContent = origContent
        .replace(/^- 상태: .+$/m, `- 상태: ${nextStatus}`)
        + `\n\n---\n- ${nextStatus === 'approved' ? '승인' : nextStatus === 'rejected' ? '거절' : '이동'} 시각: ${timestamp}\n- 상태: ${nextStatus}\n- 추천 적용 위치: ${item.targetPath || item.target || ''}\n- allowRealApply: false\n- 실제 쓰기 여부: 아직 미실행\n`;
    safeWriteFile(dest, updatedContent);
    fs.unlinkSync(item.file);
    return { moved: true, file: dest, status: nextStatus, targetPath: item.targetPath || item.target || '' };
}

function runApplyDryRun(projectPath, queueFile) {
    const config = loadConfig();
    const item = getApplyQueueSummary(projectPath).find(entry => entry.file === queueFile || entry.file.endsWith(queueFile)) || getApplyQueueSummary(projectPath)[0];
    if (!item) return { ok: false, message: 'dry-run 대상 없음' };
    return {
        ok: true,
        allowRealApply: config.allowRealApply === true,
        dryRun: true,
        message: config.allowRealApply === true ? '실제 적용 가능 설정이지만 현재 실행은 dry-run입니다.' : 'allowRealApply=false 이므로 실제 파일 수정 없이 dry-run만 수행했습니다.',
        diff: item.diff
    };
}

// ── V79: Apply Review Workflow ──────────────────────────────────────────────
function getApplyReviewsDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'apply_reviews');
}

function parseApplyReviewDecision(content) {
    const decision = String(content || '').match(/- 판정:\s*(PASS|REVIEW|REJECT)/)?.[1];
    return decision || 'REVIEW';
}

function findApplyReviewForQueue(projectPath, queueFile) {
    const queueBase = path.basename(queueFile || '');
    if (!queueBase) return null;
    const reviews = listMarkdownFilesRecursive(getApplyReviewsDir(projectPath), 300);
    return reviews
        .map(file => {
            const content = readTextIfExists(file.full);
            const linkedQueue = content.match(/- 적용 큐:\s*(.+)/)?.[1]?.trim() || '';
            return {
                file: file.full,
                queueFile: linkedQueue,
                decision: parseApplyReviewDecision(content),
                score: Number(content.match(/- 점수:\s*(\d+)\/100/)?.[1] || 0),
                mtime: file.mtime
            };
        })
        .find(review => review.queueFile === queueFile || review.queueFile.endsWith(queueBase) || path.basename(review.queueFile) === queueBase) || null;
}

function createApplyReview(projectPath, queueFile = '') {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const item = getApplyQueueSummary(projectPath).find(entry => entry.file === queueFile || entry.file.endsWith(queueFile)) || getApplyQueueSummary(projectPath)[0];
    if (!item) return { ok: false, error: '적용 리뷰 대상 큐 항목 없음' };

    const content = readTextIfExists(item.file);
    const hasTarget = !!(item.targetPath || item.target);
    const hasDiff = !!(item.diff && item.diff.trim());
    const hasCandidate = !!(item.candidateFile && (fs.existsSync(item.candidateFile) || item.candidateFile.includes('apply_candidates')));
    const dryRunOnly = /dry-run:\s*true/i.test(content) && /allowRealApply:\s*false/i.test(content);
    const stalePath = item.stalePath === true;
    const hasUnsafeWrite = /allowRealApply:\s*true/i.test(content) || /실제 쓰기 여부:\s*(?!아직 미실행)/i.test(content);
    const score = [hasTarget, hasDiff, hasCandidate, dryRunOnly, !stalePath, !hasUnsafeWrite].filter(Boolean).length * 15 + 10;
    const decision = hasUnsafeWrite || stalePath || !hasTarget ? 'REJECT' : score >= 85 ? 'PASS' : 'REVIEW';
    const reasons = [];
    if (!hasTarget) reasons.push('대상 경로 없음');
    if (!hasDiff) reasons.push('diff 없음');
    if (!hasCandidate) reasons.push('적용 후보 연결 약함');
    if (!dryRunOnly) reasons.push('dry-run/allowRealApply 안전 표기 확인 필요');
    if (stalePath) reasons.push('이전 기본 경로가 남아 있음');
    if (hasUnsafeWrite) reasons.push('실제 쓰기 가능 표기 감지');
    if (!reasons.length) reasons.push('대상 경로, diff, 후보 연결, dry-run 안전장치 확인');

    const dir = getApplyReviewsDir(projectPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const file = path.join(dir, `${timestamp}_${path.basename(item.file).replace(/\.apply\.md$/i, '')}.apply-review.md`);
    const md = `# Apply Review

- 생성일: ${new Date().toLocaleString('ko-KR')}
- 적용 큐: ${item.file}
- 대상 경로: ${item.targetPath || item.target || ''}
- 적용 후보: ${item.candidateFile || ''}
- 판정: ${decision}
- 점수: ${score}/100
- dry-run 확인: ${dryRunOnly ? '예' : '아니오'}
- allowRealApply required: true
- actual content copy: false

## 검토 사유
${reasons.map(reason => `- ${reason}`).join('\n')}

## 승인 조건
- PASS 판정만 자동 승인 전 단계로 이동할 수 있다.
- REVIEW는 보완 후 재검토한다.
- REJECT는 적용 큐에서 거절한다.
`;
    safeWriteFile(file, md);
    return { ok: true, file, decision, score, reasons, queueFile: item.file, targetPath: item.targetPath || item.target || '' };
}

function getApplyReviewSummary(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    return listMarkdownFilesRecursive(getApplyReviewsDir(projectPath), 300).map(file => {
        const content = readTextIfExists(file.full);
        return {
            file: file.full,
            queueFile: content.match(/- 적용 큐:\s*(.+)/)?.[1]?.trim() || '',
            targetPath: content.match(/- 대상 경로:\s*(.+)/)?.[1]?.trim() || '',
            decision: parseApplyReviewDecision(content),
            score: Number(content.match(/- 점수:\s*(\d+)\/100/)?.[1] || 0),
            mtime: file.mtime
        };
    });
}

function generateApplyReviewWorkflowReport(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const queue = getApplyQueueSummary(projectPath);
    const reviews = getApplyReviewSummary(projectPath);
    const pass = reviews.filter(r => r.decision === 'PASS').length;
    const review = reviews.filter(r => r.decision === 'REVIEW').length;
    const reject = reviews.filter(r => r.decision === 'REJECT').length;
    const unreviewed = queue.filter(item => !findApplyReviewForQueue(projectPath, item.file));
    const report = `# V79 Apply Review Workflow

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 적용 큐 항목: ${queue.length}
- Apply Review: ${reviews.length}
- PASS: ${pass}
- REVIEW: ${review}
- REJECT: ${reject}
- 미검토 큐: ${unreviewed.length}

## 큐 상태
| 상태 | 대상 경로 | Apply Review | 점수 |
| --- | --- | --- | --- |
${queue.length ? queue.map(item => {
    const r = findApplyReviewForQueue(projectPath, item.file);
    return `| ${item.status} | ${(item.targetPath || item.target || '').replace(/\|/g, '/')} | ${r ? r.decision : '미검토'} | ${r ? `${r.score}/100` : '-'} |`;
}).join('\n') : '| 큐 없음 | - | - | - |'}

## 안전 원칙
- Apply Review PASS 없이는 승인 이동을 권장하지 않는다.
- dry-run은 실제 파일을 수정하지 않는다.
- 실제 적용은 allowRealApply=true 사용자 설정 이후 별도 단계에서만 허용한다.
`;
    const file = path.join(projectPath, 'reports', 'apply_review_workflow.md');
    safeWriteFile(file, report);
    return { ok: true, file, report, totalQueue: queue.length, reviewCount: reviews.length, pass, review, reject, unreviewed: unreviewed.length };
}

// ── V80: UE5 Import Manifest System ─────────────────────────────────────────
function getUE5ImportManifestDir(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'import_manifests');
}

function getUE5ImportManifestReportFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'ue5_import_manifest_report.md');
}

function normalizeProjectPath(projectPath, maybePath) {
    if (!maybePath) return '';
    const clean = String(maybePath).trim().replace(/^["']|["']$/g, '');
    return path.isAbsolute(clean) ? clean : path.join(projectPath || DEFAULT_PROJECT_PATH, clean);
}

function findCandidatePath(projectPath, candidateFile) {
    const direct = normalizeProjectPath(projectPath, candidateFile);
    if (direct && fs.existsSync(direct)) return direct;
    const base = path.basename(candidateFile || '');
    if (!base) return direct || '';
    const roots = [
        path.join(getApplyCandidatesDir(projectPath), 'art'),
        path.join(getApplyCandidatesDir(projectPath), 'world')
    ];
    for (const root of roots) {
        const found = listMarkdownFilesRecursive(root, 300).find(file => file.name === base || file.full.endsWith(candidateFile));
        if (found) return found.full;
    }
    return direct || candidateFile || '';
}

function findInspectionPath(projectPath, inspectionFile) {
    const direct = normalizeProjectPath(projectPath, inspectionFile);
    if (direct && fs.existsSync(direct)) return direct;
    const base = path.basename(inspectionFile || '');
    if (!base) return direct || '';
    const found = listMarkdownFilesRecursive(get3DInspectionDir(projectPath), 300).find(file => file.name === base);
    return found ? found.full : direct || inspectionFile || '';
}

function readKeyValue(content, keys) {
    for (const key of keys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = String(content || '').match(new RegExp(`-\\s*${escaped}\\s*[:：]\\s*(.+)`, 'i'));
        if (match) return match[1].trim();
    }
    return '';
}

function truthyText(value) {
    return /^(true|yes|예|필요|needed|required)$/i.test(String(value || '').trim());
}

function classifyImportAssetCategory(text) {
    const low = String(text || '').toLowerCase();
    if (/architecture|building|건물|구조물|modular/.test(low)) return 'architecture';
    if (/environment|world|exterior|interior|환경|배경|월드/.test(low)) return 'environment';
    if (/prop|소품|object/.test(low)) return 'prop';
    if (/world/.test(low)) return 'world';
    return 'art';
}

function extractImportFieldsFromCandidate(content) {
    const title = String(content || '').match(/^#\s*(.+)$/m)?.[1]?.trim() || '';
    const sourceModelFile = readKeyValue(content, ['source model file', 'sourceModelFile', 'sourceFile', '파일', '원본 모델', '출처 모델']);
    const sourceInspection = readKeyValue(content, ['inspection file', 'sourceInspection', '검사 파일', 'inspection']);
    const recommendedImportPath = readKeyValue(content, [
        'recommended UE import path',
        'UE5 추천 임포트 경로',
        'ueImportPath',
        '추천 적용 위치',
        '추천 적용 경로',
        '대상 경로'
    ]);
    const assetName = readKeyValue(content, ['assetName', 'asset name', 'segmentLabel', 'segmentName']) ||
        path.basename(sourceModelFile || title || 'unknown', path.extname(sourceModelFile || title || 'unknown'));
    const extRaw = (readKeyValue(content, ['extension', 'outputFormat']) || path.extname(sourceModelFile)).toLowerCase().replace(/^\*?/, '');
    const extension = extRaw ? (extRaw.startsWith('.') ? extRaw : `.${extRaw}`) : '';
    const inspectionVerdict = readKeyValue(content, ['verdict', 'inspectionVerdict', '검사 결과']) || 'REVIEW';
    const applyReviewVerdict = readKeyValue(content, ['applyReviewVerdict', 'Apply Review', '판정']) || '';
    const fileSizeMB = Number(readKeyValue(content, ['file size', 'fileSizeMB', '파일 크기']).replace(/[^\d.]/g, '') || 0);
    const triangleCount = Number(readKeyValue(content, ['triangle count', 'triangleCount', 'targetPolyBudget', 'poly budget']).replace(/[^\d]/g, '') || 0);
    const materialCount = Number(readKeyValue(content, ['material count', 'materialCount']).replace(/[^\d]/g, '') || 0);
    const combined = `${title}\n${content}\n${recommendedImportPath}\n${sourceModelFile}`;
    return {
        sourceModelFile,
        sourceInspection,
        assetName,
        fileSizeMB,
        extension,
        triangleCount,
        materialCount,
        inspectionVerdict,
        applyReviewVerdict,
        recommendedImportPath,
        ueContentPath: recommendedImportPath,
        assetCategory: classifyImportAssetCategory(combined),
        collisionNeeded: truthyText(readKeyValue(content, ['collisionNeeded', 'collision', 'collision 필요'])),
        lodNeeded: truthyText(readKeyValue(content, ['lodNeeded', 'lodRequired', 'LOD 필요'])),
        naniteRecommended: truthyText(readKeyValue(content, ['naniteRecommended', 'Nanite 추천'])),
        materialSetupNeeded: /material setup|머티리얼|material/i.test(content || ''),
        textureCheckNeeded: /texture|텍스처/i.test(content || ''),
        scaleCheckNeeded: !/scaleChecked:\s*true/i.test(content || ''),
        pivotCheckNeeded: !/pivotChecked:\s*true/i.test(content || '')
    };
}

function readApprovedApplyCandidate(projectPath, candidateFile) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const queue = getApplyQueueSummary(projectPath).find(item =>
        item.status === 'approved' && (
            item.file === candidateFile ||
            item.file.endsWith(candidateFile || '') ||
            item.candidateFile === candidateFile ||
            item.candidateFile.endsWith(candidateFile || '')
        )
    );
    const candidatePath = findCandidatePath(projectPath, queue?.candidateFile || candidateFile || '');
    const candidateContent = readTextIfExists(candidatePath);
    const fields = extractImportFieldsFromCandidate(candidateContent);
    const review = queue ? findApplyReviewForQueue(projectPath, queue.file) : null;
    fields.applyReviewVerdict = review?.decision || fields.applyReviewVerdict || 'NONE';
    const inspectionPath = findInspectionPath(projectPath, fields.sourceInspection);
    const inspection = inspectionPath && fs.existsSync(inspectionPath)
        ? read3DInspectionRecord(projectPath, path.basename(inspectionPath))
        : { ok: false, error: 'inspection 없음' };
    if (inspection.ok) {
        fields.sourceInspection = inspectionPath;
        fields.sourceModelFile = fields.sourceModelFile || inspection.sourceFile || inspection.filePath || '';
        fields.assetName = fields.assetName || inspection.assetName || '';
        fields.fileSizeMB = fields.fileSizeMB || inspection.fileSizeMB || 0;
        fields.extension = fields.extension || `.${inspection.extension || ''}`;
        fields.triangleCount = fields.triangleCount || inspection.triangleCount || 0;
        fields.materialCount = fields.materialCount || inspection.materialCount || 0;
        fields.inspectionVerdict = inspection.verdict || fields.inspectionVerdict;
        fields.recommendedImportPath = fields.recommendedImportPath || inspection.ueImportPath || '';
        fields.ueContentPath = fields.ueContentPath || fields.recommendedImportPath;
        fields.collisionNeeded = fields.collisionNeeded || inspection.collisionNeeded;
        fields.lodNeeded = fields.lodNeeded || inspection.lodNeeded;
        fields.naniteRecommended = fields.naniteRecommended || inspection.naniteRecommended;
        fields.scaleCheckNeeded = fields.scaleCheckNeeded && !inspection.scaleChecked;
        fields.pivotCheckNeeded = fields.pivotCheckNeeded && !inspection.pivotChecked;
    }
    return {
        ok: !!(queue && candidateContent),
        queue,
        candidateFile: candidatePath,
        content: candidateContent,
        fields,
        inspection: inspection.ok ? inspection : null,
        sourceInspection: inspectionPath
    };
}

function listApprovedApplyCandidates(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    return getApplyQueueSummary(projectPath)
        .filter(item => item.status === 'approved')
        .map(item => readApprovedApplyCandidate(projectPath, item.file));
}

function evaluateUE5ImportReadiness(candidate, inspection) {
    const fields = candidate?.fields || candidate || {};
    const sourceModel = normalizeProjectPath(candidate?.projectPath || DEFAULT_PROJECT_PATH, fields.sourceModelFile);
    const sourceExists = !!(sourceModel && fs.existsSync(sourceModel));
    const ext = (fields.extension || path.extname(fields.sourceModelFile || '')).toLowerCase();
    const supported = ['.glb', '.gltf', '.obj', '.fbx'].includes(ext);
    const blockReasons = [];
    if (fields.applyReviewVerdict !== 'PASS') blockReasons.push(fields.applyReviewVerdict === 'NONE' ? 'apply review 없음' : 'apply review PASS 아님');
    if ((inspection?.verdict || fields.inspectionVerdict) === 'REJECT') blockReasons.push('inspection REJECT');
    if (!['PASS', 'REVIEW'].includes(inspection?.verdict || fields.inspectionVerdict || '')) blockReasons.push('inspection PASS/REVIEW 아님');
    if (!sourceExists) blockReasons.push('source model 없음');
    if (!fields.recommendedImportPath) blockReasons.push('import path 없음');
    if (!supported) blockReasons.push('extension 미지원');
    const warnings = [];
    if (fields.lodNeeded) warnings.push('LOD 필요');
    if (fields.collisionNeeded) warnings.push('collision 필요');
    if (fields.naniteRecommended) warnings.push('Nanite 추천');
    if (fields.materialSetupNeeded) warnings.push('material setup 필요');
    if (fields.textureCheckNeeded) warnings.push('texture check 필요');
    if (fields.scaleCheckNeeded) warnings.push('scale 확인 필요');
    if (fields.pivotCheckNeeded) warnings.push('pivot 확인 필요');
    return {
        importStatus: blockReasons.length ? 'BLOCKED' : 'READY_FOR_IMPORT',
        manifestMode: 'MANIFEST_ONLY',
        blockReasons,
        warnings,
        sourceExists,
        supportedExtension: supported
    };
}

function createUE5ImportManifest(projectPath, candidateFile) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const approved = readApprovedApplyCandidate(projectPath, candidateFile || '');
    if (!approved.queue) return { ok: false, error: 'approved candidate만 Manifest 대상이 됩니다.' };
    const readiness = evaluateUE5ImportReadiness({ ...approved, projectPath }, approved.inspection);
    const fields = approved.fields;
    const dir = getUE5ImportManifestDir(projectPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const manifestId = `ue5-import-${now.toISOString().replace(/[-:.TZ]/g, '').substring(0, 14)}-${path.basename(approved.candidateFile || 'candidate').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 36)}`;
    const fileName = `${manifestId}.ue5_import_manifest.md`;
    const file = path.join(dir, fileName);
    const md = `# UE5 Import Manifest

- manifestId: ${manifestId}
- createdAt: ${now.toISOString()}
- sourceCandidate: ${approved.candidateFile || ''}
- sourceInspection: ${fields.sourceInspection || approved.sourceInspection || ''}
- sourceModelFile: ${fields.sourceModelFile || ''}
- assetName: ${fields.assetName || ''}
- fileSizeMB: ${fields.fileSizeMB || 0}
- extension: ${fields.extension || ''}
- triangleCount: ${fields.triangleCount || 0}
- materialCount: ${fields.materialCount || 0}
- inspectionVerdict: ${fields.inspectionVerdict || 'REVIEW'}
- applyReviewVerdict: ${fields.applyReviewVerdict || 'NONE'}
- recommendedImportPath: ${fields.recommendedImportPath || ''}
- ueContentPath: ${fields.ueContentPath || fields.recommendedImportPath || ''}
- assetCategory: ${fields.assetCategory || 'art'}
- collisionNeeded: ${fields.collisionNeeded ? 'true' : 'false'}
- lodNeeded: ${fields.lodNeeded ? 'true' : 'false'}
- naniteRecommended: ${fields.naniteRecommended ? 'true' : 'false'}
- materialSetupNeeded: ${fields.materialSetupNeeded ? 'true' : 'false'}
- textureCheckNeeded: ${fields.textureCheckNeeded ? 'true' : 'false'}
- scaleCheckNeeded: ${fields.scaleCheckNeeded ? 'true' : 'false'}
- pivotCheckNeeded: ${fields.pivotCheckNeeded ? 'true' : 'false'}
- manifestMode: MANIFEST_ONLY
- importStatus: ${readiness.importStatus}
- blockReasons: ${readiness.blockReasons.length ? readiness.blockReasons.join(' / ') : '없음'}
- notes: ${readiness.warnings.length ? readiness.warnings.join(' / ') : '추가 경고 없음'}

## Import Checklist
${readiness.warnings.length ? readiness.warnings.map(w => `- [ ] ${w}`).join('\n') : '- [x] 경고 체크리스트 없음'}

## Safety
- actual UE5 Content copy: false
- .uasset generation: false
- Unreal Editor auto launch: false
- allowRealApply=false 유지
`;
    safeWriteFile(file, md);
    return { ok: true, file, fileName, manifestId, importStatus: readiness.importStatus, warnings: readiness.warnings, blockReasons: readiness.blockReasons };
}

function createUE5ImportManifestsFromApproved(projectPath) {
    const approved = listApprovedApplyCandidates(projectPath);
    const results = approved.map(item => createUE5ImportManifest(projectPath, item.queue?.file || item.candidateFile || ''));
    const readyCount = results.filter(r => r.ok && r.importStatus === 'READY_FOR_IMPORT').length;
    const blockedCount = results.filter(r => !r.ok || r.importStatus === 'BLOCKED').length;
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, {
            task: 'UE5 Import Manifest 생성',
            decision: `READY_FOR_IMPORT ${readyCount} / BLOCKED ${blockedCount}`,
            result: results.flatMap(r => r.blockReasons || []).slice(0, 5).join(' | ') || 'block reason 없음'
        });
        recordDecision(vp, 'UE5 실제 복사 전 Import Manifest를 먼저 생성한다', 'V80 manifest-only workflow');
        recordDecision(vp, 'allowRealApply=false 상태에서는 Manifest만 생성한다', 'Content 복사와 .uasset 생성 금지');
        recordDecision(vp, 'approved candidate만 Manifest 대상이 된다', 'Apply Review PASS 및 approved queue 이후 단계');
    } catch { /* 비중단 */ }
    return { ok: true, total: results.length, readyCount, blockedCount, results };
}

function readUE5ImportManifests(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    return listMarkdownFilesRecursive(getUE5ImportManifestDir(projectPath), 300).map(file => {
        const content = readTextIfExists(file.full);
        return {
            file: file.full,
            manifestId: readKeyValue(content, ['manifestId']),
            assetName: readKeyValue(content, ['assetName']),
            importStatus: readKeyValue(content, ['importStatus']) || 'MANIFEST_ONLY',
            blockReasons: readKeyValue(content, ['blockReasons']),
            notes: readKeyValue(content, ['notes']),
            mtime: file.mtime
        };
    });
}

function generateUE5ImportManifestReport(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const approved = listApprovedApplyCandidates(projectPath);
    const manifests = readUE5ImportManifests(projectPath);
    const ready = manifests.filter(m => m.importStatus === 'READY_FOR_IMPORT');
    const blocked = manifests.filter(m => m.importStatus === 'BLOCKED');
    const warning = manifests.filter(m => m.notes && m.notes !== '추가 경고 없음').length;
    const blockReasons = blocked.flatMap(m => String(m.blockReasons || '').split('/').map(s => s.trim()).filter(Boolean));
    const report = `# UE5 Import Manifest Report

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- approved candidate 수: ${approved.length}
- manifest 수: ${manifests.length}
- READY_FOR_IMPORT 수: ${ready.length}
- BLOCKED 수: ${blocked.length}
- WARNING 수: ${warning}

## 최근 Manifest
| 상태 | 에셋 | Manifest | Block Reasons |
| --- | --- | --- | --- |
${manifests.length ? manifests.slice(0, 30).map(m => `| ${m.importStatus} | ${(m.assetName || '').replace(/\|/g, '/')} | ${path.basename(m.file)} | ${(m.blockReasons || '').replace(/\|/g, '/')} |`).join('\n') : '| 없음 | - | - | - |'}

## 주요 Block Reason
${blockReasons.length ? Array.from(new Set(blockReasons)).map(r => `- ${r}`).join('\n') : '- 없음'}

## Safety
- 실제 UE5 Content 복사 없음
- 실제 .uasset 생성 없음
- UE5 Editor 자동 실행 없음
- MANIFEST_ONLY 단계
`;
    const file = getUE5ImportManifestReportFile(projectPath);
    safeWriteFile(file, report);
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, {
            task: 'UE5 Import Manifest Report 생성',
            decision: `READY_FOR_IMPORT ${ready.length} / BLOCKED ${blocked.length}`,
            result: blockReasons.slice(0, 5).join(' | ') || 'block reason 없음'
        });
    } catch { /* 비중단 */ }
    return { ok: true, file, report, approvedCount: approved.length, manifestCount: manifests.length, readyCount: ready.length, blockedCount: blocked.length, warningCount: warning };
}

function getAgentHandoffPlan(taskLine, quality) {
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]', text: taskLine };
    const tag = parsed.tag || '[전체]';
    const text = parsed.text || cleanTaskText(taskLine);
    const low = `${tag} ${text}`.toLowerCase();
    const suffix = `(원본: ${text.replace(/\s+/g, ' ').substring(0, 90)}, 품질 ${quality.score}/100)`;

    if (tag.includes('PM')) return [];

    if (tag.includes('스토리') || /스토리|대사|서사|npc|교수|학생/.test(low)) {
        return [
            { from: 'story', to: 'game', priority: '🟡', tag: '[게임플레이]', text: `스토리 결과를 실제 퀘스트 목표, 트리거, 상호작용 흐름으로 구현 설계 ${suffix}` },
            { from: 'story', to: 'qa', priority: '🟢', tag: '[QA]', text: `스토리 결과의 퀘스트 조건, 대사 분기, 동선 누락을 검수 ${suffix}` }
        ];
    }
    if (tag.includes('게임플레이') || tag.includes('코드') || /게임플레이|전투|퀘스트|상호작용|마법|주문|blueprint|c\+\+/.test(low)) {
        return [
            { from: 'game', to: 'qa', priority: '🔴', tag: '[QA]', text: `게임플레이 완료 결과를 재현 절차, 통과 기준, 실패 케이스로 QA 검수 ${suffix}` }
        ];
    }
    if (tag.includes('QA') || /qa|검수|테스트|버그/.test(low)) {
        return [
            { from: 'qa', to: 'pm', priority: '🟡', tag: '[PM]', text: `QA 결과를 PM이 검토하고 다음 스프린트 우선순위와 승인 여부 결정 ${suffix}` }
        ];
    }
    if (tag.includes('월드') || /월드|레벨|맵|공간|던전|교실|복도/.test(low)) {
        return [
            { from: 'world', to: 'game', priority: '🟡', tag: '[게임플레이]', text: `월드 구조에 맞춰 이동, 상호작용, 퍼즐 진입 흐름을 설계 ${suffix}` },
            { from: 'world', to: 'qa', priority: '🟢', tag: '[QA]', text: `월드 동선, 충돌, NavMesh, 성능 기준을 검수 ${suffix}` }
        ];
    }
    return [
        { from: 'agent', to: 'pm', priority: '🟢', tag: '[PM]', text: `완료 산출물을 PM이 검토하고 후속 태스크 승인 여부 결정 ${suffix}` }
    ];
}

function appendGeneratedTasks(config, taskLine, result, quality) {
    if (!quality.passed) return [];
    ensureProjectFolders(config.projectPath);
    const generated = getAgentHandoffPlan(taskLine, quality).map(task => {
        const fullText = `${task.priority} ${task.tag} ${task.text}`;
        return { ...task, duplicate: detectDuplicateTask(config.projectPath, fullText) };
    });
    const file = getGeneratedTasksFile(config.projectPath);
    const idBase = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(0, 14);
    const cleanTask = cleanTaskText(taskLine);
    const resultHint = (result || '').replace(/\s+/g, ' ').substring(0, 180);
    const accepted = generated.filter(task => !task.duplicate.duplicate);
    const blocked = generated.filter(task => task.duplicate.duplicate);
    const block = [
        `\n## ${new Date().toLocaleString('ko-KR')} | ${cleanTask}`,
        `- 원본 품질 점수: ${quality.score}/100`,
        `- 승인 상태: pending`,
        `- 결과 요약: ${resultHint || '저장된 결과물 참조'}`,
        blocked.length ? `- 중복 생성 중단: ${blocked.length}개` : '- 중복 생성 중단: 0개',
        '',
        ...accepted.map((task, index) => {
            const id = `${idBase}-${index + 1}`;
            const duplicateNote = task.duplicate.warning ? ` <!-- duplicate:${task.duplicate.similarity}%; recommendation:${task.duplicate.recommendation} -->` : '';
            return `- [ ] <!-- id:${id}; status:pending; from:${task.from}; to:${task.to} --> ${task.priority} ${task.tag} ${task.text}${duplicateNote}`;
        }),
        ...blocked.map(task => `- [!] <!-- status:duplicate; duplicate:${task.duplicate.similarity}% --> ${task.priority} ${task.tag} ${task.text} | 추천: 기존 태스크 활용, 생성 중단`),
        ''
    ].join('\n');
    fs.appendFileSync(file, block, 'utf8');
    generatedFiles++;
    sendLog(`에이전트 후속 태스크 ${accepted.length}개 생성, 중복 ${blocked.length}개 차단`, 'success');
    return accepted;
}

function approveGeneratedTasks(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const generatedFile = getGeneratedTasksFile(projectPath);
    const todoFile = getTodoFile(projectPath);
    const generatedContent = fs.existsSync(generatedFile) ? fs.readFileSync(generatedFile, 'utf8') : '';
    const lines = generatedContent.split('\n');
    const approvedLines = [];
    let approvedCount = 0;
    const updated = lines.map(line => {
        if (!/status:pending/.test(line) || !/^- \[ \]/.test(line.trim())) return line;
        const todoLine = line
            .replace(/<!--.*?-->\s*/, '')
            .replace(/^- \[ \]/, '- [ ]')
            .trim();
        approvedLines.push(`${todoLine}  <!-- PM 승인: generated_tasks.md -->`);
        approvedCount++;
        return line.replace('status:pending', 'status:approved').replace('- [ ]', '- [x]');
    }).join('\n');

    if (approvedCount > 0) {
        const currentTodo = fs.existsSync(todoFile) ? fs.readFileSync(todoFile, 'utf8') : '# 📋 ToribatMagicSchool - 태스크 목록\n';
        const section = `\n\n## PM 승인 자동 추가 - ${new Date().toLocaleString('ko-KR')}\n${approvedLines.join('\n')}\n`;
        fs.writeFileSync(todoFile, currentTodo.trimEnd() + section, 'utf8');
        fs.writeFileSync(generatedFile, updated, 'utf8');
        generatedFiles++;
    }
    return { approvedCount, generatedFile, todoFile };
}

function listFilesSafe(dir, limit = 500) {
    const results = [];
    function walk(current) {
        if (results.length >= limit) return;
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= limit) return;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) {
                let stat = { size: 0 };
                try { stat = fs.statSync(full); } catch {}
                results.push({ full, size: stat.size, ext: path.extname(entry.name).toLowerCase() });
            }
        }
    }
    if (fs.existsSync(dir)) walk(dir);
    return results;
}

function summarizeProjectArea(projectPath, area) {
    const dir = path.join(projectPath, area);
    let exists = false;
    let files = [];
    let source = 'fs';
    try {
        const mcpConfig = mcpAdapter.loadMcpConfig(path.resolve(__dirname, '..'));
        if (mcpAdapter.isFilesystemMcpEnabled(mcpConfig) && mcpAdapter.isWithinAllowedRoots(dir, mcpConfig)) {
            files = mcpAdapter.listProjectFiles(projectPath, area, { limit: 700, baseDir: path.resolve(__dirname, '..') });
            exists = fs.existsSync(dir);
            source = 'mcp-adapter';
        } else {
            exists = fs.existsSync(dir);
            files = exists ? listFilesSafe(dir, 700) : [];
        }
    } catch (e) {
        sendLog(`MCP 어댑터 스캔 폴백(${area}): ${e.message}`, 'warn');
        exists = fs.existsSync(dir);
        files = exists ? listFilesSafe(dir, 700) : [];
        source = 'fs-fallback';
    }
    const byExt = {};
    for (const file of files) byExt[file.ext || '(none)'] = (byExt[file.ext || '(none)'] || 0) + 1;
    return { area, exists, fileCount: files.length, totalSize: files.reduce((sum, file) => sum + file.size, 0), byExt, source };
}

function analyzeProject(config) {
    const projectPath = config.projectPath || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    const areas = ['Source', 'Content', 'Config', 'Plugins'].map(area => summarizeProjectArea(projectPath, area));
    const todoFile = getTodoFile(projectPath);
    const doneFile = getDoneFile(projectPath);
    const todoContent = fs.existsSync(todoFile) ? fs.readFileSync(todoFile, 'utf8') : '';
    const doneContent = fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf8') : '';
    const pending = (todoContent.match(/^- \[ \]/gm) || []).length;
    const doing = (todoContent.match(/^- \[\/\]/gm) || []).length;
    const doneInTodo = (todoContent.match(/^- \[x\]/gmi) || []).length;
    const doneLog = (doneContent.match(/^- \[[x!]\]/gm) || []).length;
    const generatedContent = fs.existsSync(getGeneratedTasksFile(projectPath)) ? fs.readFileSync(getGeneratedTasksFile(projectPath), 'utf8') : '';
    const reviewSummary = getReviewSummary(projectPath);
    const candidateSummary = getApplyCandidateSummary(projectPath);
    const passCount = reviewSummary.filter(item => item.decision === 'PASS').length;
    const rejectCount = reviewSummary.filter(item => item.decision === 'REJECT').length;
    const duplicateCount = (generatedContent.match(/status:duplicate|duplicate:\d+%/g) || []).length;
    const sprintSummary = getSprintReportSummary(projectPath, todoContent);
    const implemented = [];
    const missing = [];
    const risks = [];

    for (const area of areas) {
        if (area.exists && area.fileCount > 0) implemented.push(`${area.area}: ${area.fileCount}개 파일 감지`);
        else missing.push(`${area.area}: 폴더 또는 파일 없음`);
    }
    if (pending > 20) risks.push(`미완료 태스크가 ${pending}개로 많아 PM 우선순위 정리가 필요`);
    if (doing > 0) risks.push(`진행 중 표시 태스크 ${doing}개가 남아 있어 중단/실패 복구 확인 필요`);
    if (!areas.find(a => a.area === 'Config')?.exists) risks.push('Config 폴더가 없어 UE 프로젝트 설정 확인 불가');
    if (!risks.length) risks.push('현재 정적 분석 기준의 치명 위험은 낮음');

    const totalTasks = pending + doing + doneInTodo + doneLog;
    const progress = totalTasks ? Math.round(((doneInTodo + doneLog) / totalTasks) * 100) : 0;
    const recommendations = [
        '- [ ] 🔴 [PM] generated_tasks.md의 pending 항목을 검토하고 todo.md에 승인 반영',
        '- [ ] 🟡 [QA] Source/Content/Config/Plugins 누락 영역별 수동 확인 체크리스트 작성',
        '- [ ] 🟡 [게임플레이] 20~40분 수직 슬라이스 기준 핵심 플레이 루프 1개 완성',
        '- [ ] 🟢 [스토리] Pinned Knowledge와 메인 퀘스트 데이터 일치 여부 검수'
    ];
    const report = `# 프로젝트 자동 분석 보고서

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- 진행률: ${progress}%

## 현재 구현 기능
${implemented.length ? implemented.map(item => `- ${item}`).join('\n') : '- 감지된 구현 파일 없음'}

## 누락 기능
${missing.length ? missing.map(item => `- ${item}`).join('\n') : '- 핵심 폴더는 모두 감지됨'}

## 위험 요소
${risks.map(item => `- ${item}`).join('\n')}

## 추천 작업
${recommendations.join('\n')}

## 스캔 상세
| 영역 | 존재 | 파일 수 | 총 크기 |
| --- | --- | ---: | ---: |
${areas.map(area => `| ${area.area} | ${area.exists ? '예' : '아니오'} | ${area.fileCount} | ${area.totalSize} bytes (${area.source}) |`).join('\n')}

## 태스크 상태
- 미완료: ${pending}
- 진행 중: ${doing}
- todo.md 완료: ${doneInTodo}
- done.md 로그: ${doneLog}

## PM 확장 지표
- 적용 후보 수: ${candidateSummary.length}
- PASS 결과물 수: ${passCount}
- REJECT 결과물 수: ${rejectCount}
- 중복 태스크 수: ${duplicateCount}

## PM 스프린트 정보
- 현재 스프린트: ${sprintSummary.currentSprint}
- 다음 스프린트 후보:
${sprintSummary.nextCandidates.length ? sprintSummary.nextCandidates.map(task => `  - ${task.priority}: ${task.text} (${task.agent})`).join('\n') : '  - 후보 없음'}
- 막힌 태스크: ${sprintSummary.blockedTasks}
- 실패 태스크 수: ${sprintSummary.failedTasks}
`;
    fs.writeFileSync(getProjectStatusFile(projectPath), report, 'utf8');
    fs.writeFileSync(getProjectReportFile(projectPath), report.replace('# 프로젝트 자동 분석 보고서', '# PM 프로젝트 보고서'), 'utf8');
    generatedFiles++;
    return { report, progress, areas, pending, doing, doneInTodo, doneLog, candidateCount: candidateSummary.length, passCount, rejectCount, duplicateCount, sprintSummary };
}

async function callAiByType(aiType, prompt, config) {
    if (aiType === 'claude_code') return callClaudeCode(prompt, config);
    if (aiType === 'local_ai') {
        const result = await callLocalAI(prompt, config);
        if (/Local AI 비활성화|Local AI 오류|Local AI 연결 오류|Local AI 응답 없음/i.test(result || '') && config.localAiFallbackPaid) {
            sendLog('Local AI 실패 — 유료 API 폴백 허용됨, Claude/OpenAI로 재시도합니다.', 'warn');
            return callClaudeApi(prompt, config);
        }
        return result;
    }
    if (aiType === 'claude_api') return callClaudeApi(prompt, config);
    return callChatGPT(prompt, config);
}

function buildPrompt(taskLine, aiType, config) {
    const cleanTask = cleanTaskText(taskLine);
    const isCodeTask = aiType === 'claude_code';
    const qualityBrief = getProjectQualityBrief();
    const deliverableRules = getDeliverableRules(taskLine, aiType);
    const qualityGate = getResultQualityGateText();
    const pinnedKnowledge = getPinnedKnowledgePrompt(config.projectPath);

    if (isCodeTask) {
        return `너는 ToribatMagicSchool UE5.4+ 프로젝트를 직접 수정하는 Claude Code 개발자다.

프로젝트 루트: ${config.projectPath}
태스크: ${cleanTask}

${pinnedKnowledge}

${qualityBrief}

${deliverableRules}

Claude Code 실행 규칙:
1. 필요한 파일을 실제로 생성하거나 수정해라. 단순히 코드 예시만 답하지 마라.
2. UE5.4+ 기준 C++/Blueprint 호환 구조로 작성해라.
3. 한국어 주석을 사용해라.
4. 기존 파일이 있으면 먼저 읽고, 충돌을 최소화해라.
5. 생성/수정한 파일 목록과 핵심 변경점을 마지막에 요약해라.
6. 위험한 삭제, 대규모 구조 변경, API 키 노출은 하지 마라.
7. 빌드가 필요하면 사용자가 실행할 명령만 안내하고, 현재 가능한 정적 점검을 수행해라.
8. 사용자가 비주얼/아트는 직접 담당하므로 코드와 게임플레이 구현에 집중해라.

${qualityGate}

지금 이 태스크를 완료해라.`;
    }

    return `너는 ToribatMagicSchool 게임 개발 AI 직원이다.

프로젝트 루트: ${config.projectPath}
태스크: ${cleanTask}

${pinnedKnowledge}

${qualityBrief}

${deliverableRules}

작성 규칙:
1. 바로 저장 가능한 완성본으로 작성해라.
2. UE5.4+ 기준으로 작성해라.
3. 한국어로 작성하고, 코드가 있으면 주석도 한국어로 작성해라.
4. 애매한 부분은 최선의 판단으로 결정해라.
5. 반드시 실제 적용 방법과 테스트 기준을 포함해라.
6. 마지막에는 todo.md에 바로 붙여넣을 수 있는 다음 태스크 3개를 제안해라.
7. 목표, 적용 위치, 실제 산출물, 구현 방법, 테스트 방법, 다음 태스크 제목을 그대로 사용해라.

${qualityGate}

지금 이 태스크 결과물을 작성해라.`;
}

async function executeTask(taskLine, agentIndex, config) {
    const aiType = routeTask(taskLine);
    const aiNames = {
        claude_code: 'Claude Code',
        claude_api: 'Claude API',
        chatgpt: 'ChatGPT',
        local_ai: 'Local AI'
    };
    const cleanTask = cleanTaskText(taskLine);

    sendToRenderer('agent-update', {
        index: agentIndex,
        state: 'working',
        task: cleanTask.substring(0, 60),
        ai: aiNames[aiType],
        progress: 20
    });
    sendLog(`[${aiNames[aiType]}] 시작: ${cleanTask.substring(0, 80)}`, 'info');

    const prompt = buildPrompt(taskLine, aiType, config);

    sendToRenderer('agent-update', {
        index: agentIndex,
        state: 'working',
        task: cleanTask.substring(0, 60),
        ai: aiNames[aiType],
        progress: 50
    });

    let result = await callAiByType(aiType, prompt, config);
    let quality = evaluateResultQuality(result, taskLine, aiType);
    sendLog(`품질 점수 [${aiNames[aiType]}]: ${quality.score}/100`, quality.passed ? 'success' : 'warn');

    // 코드 직접 수정 태스크는 중복 수정 위험이 있어서 자동 재작성하지 않는다.
    // 문서/QA/스토리/월드 태스크는 1회 자동 재작성해 품질을 끌어올린다.
    if (aiType !== 'claude_code' && !quality.passed && !/오류|error|ECONNREFUSED|키 없음|시간 초과/i.test(result || '')) {
        sendToRenderer('agent-update', {
            index: agentIndex,
            state: 'working',
            task: '품질 미달 → 자동 재작성 중',
            ai: aiNames[aiType],
            progress: 75
        });
        sendLog(`품질 미달 — 자동 재작성 1회 실행: ${quality.reasons.join(', ')}`, 'warn');
        const rewritePrompt = buildQualityRewritePrompt(prompt, result, quality);
        const rewritten = await callAiByType(aiType, rewritePrompt, config);
        const rewrittenQuality = evaluateResultQuality(rewritten, taskLine, aiType);
        sendLog(`재작성 품질 점수 [${aiNames[aiType]}]: ${rewrittenQuality.score}/100`, rewrittenQuality.passed ? 'success' : 'warn');
        result = rewritten;
        quality = rewrittenQuality;
    }

    let review = runReviewerAgent(config, taskLine, result, quality, aiNames[aiType], 1);
    sendLog(`Reviewer Agent 판정: ${review.decision} (${review.score}/100)`, review.decision === 'PASS' ? 'success' : review.decision === 'REVIEW' ? 'warn' : 'error');

    if (aiType !== 'claude_code' && review.decision !== 'PASS' && !/오류|error|ECONNREFUSED|키 없음|시간 초과/i.test(result || '')) {
        sendToRenderer('agent-update', {
            index: agentIndex,
            state: 'working',
            task: `Reviewer ${review.decision} → 재작성`,
            ai: aiNames[aiType],
            progress: 85
        });
        const reviewerRewritePrompt = buildQualityRewritePrompt(prompt, result, {
            score: review.score,
            reasons: review.reasons
        });
        const rewritten = await callAiByType(aiType, reviewerRewritePrompt, config);
        const rewrittenQuality = evaluateResultQuality(rewritten, taskLine, aiType);
        const rewrittenReview = runReviewerAgent(config, taskLine, rewritten, rewrittenQuality, aiNames[aiType], 2);
        sendLog(`Reviewer Agent 재검수: ${rewrittenReview.decision} (${rewrittenReview.score}/100)`, rewrittenReview.decision === 'PASS' ? 'success' : 'warn');
        result = rewritten;
        quality = rewrittenQuality;
        review = rewrittenReview;
    }

    const failed = !quality.passed || review.decision !== 'PASS';
    let outputFile = '';

    try {
        const subdir = getOutputSubdir(taskLine);
        const outputDir = path.join(config.projectPath, 'tasks', 'outputs', subdir);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const safeTask = cleanTask.replace(/[^\w가-힣]/g, '_').substring(0, 42);
        outputFile = path.join(outputDir, `${timestamp}_${safeTask}.md`);
        fs.writeFileSync(outputFile,
            `# ${cleanTask}\n\n- AI: ${aiNames[aiType]}\n- 날짜: ${new Date().toLocaleString('ko-KR')}\n- 품질 점수: ${quality.score}/100\n- Reviewer Agent: ${review.decision} (${review.score}/100)\n- 리뷰 파일: ${path.relative(config.projectPath, review.file).replace(/\\/g, '/')}\n- 상태: ${failed ? '실패 또는 품질 확인 필요' : '완료'}\n- 품질 사유: ${quality.reasons.join(' / ')}\n\n---\n\n${result}`,
            'utf8'
        );
        generatedFiles++;

        const doneFile = getDoneFile(config.projectPath);
        fs.appendFileSync(doneFile,
            `\n- [${failed ? '!' : 'x'}] ${new Date().toLocaleString('ko-KR')} | ${aiNames[aiType]} | 품질 ${quality.score}/100 | 리뷰 ${review.decision} ${review.score}/100 | ${cleanTask} | outputs/${subdir}/${path.basename(outputFile)}`,
            'utf8'
        );
    } catch (e) {
        sendLog(`파일 저장 오류: ${e.message}`, 'warn');
    }

    try {
        const candidate = saveApplyCandidate(config, taskLine, result, quality, review, aiNames[aiType], outputFile);
        sendToRenderer('apply-candidates-update', { category: candidate.category });
        sendLog(`적용 후보 저장: apply_candidates/${candidate.category}`, review.decision === 'PASS' ? 'success' : 'info');
    } catch (e) {
        sendLog(`적용 후보 저장 오류: ${e.message}`, 'warn');
    }

    if (failed) {
        markTaskFailed(config, taskLine, `Reviewer Agent ${review.decision}: ${review.score}/100, 품질 ${quality.score}/100`);
        sendToRenderer('agent-update', { index: agentIndex, state: 'idle', task: `검수 ${review.decision} ${review.score}/100`, ai: aiNames[aiType], progress: 0 });
        sendLog(`⚠ 실패 또는 품질 확인 필요 [${aiNames[aiType]}]: ${cleanTask.substring(0, 60)} (${review.decision} ${review.score}/100)`, 'warn');
    } else {
        markTaskDone(config, taskLine);
        completedTasks++;
        try {
            const generated = appendGeneratedTasks(config, taskLine, result, quality);
            if (generated.length) sendToRenderer('generated-tasks-update', { count: generated.length });
            const parsed = parseTaskLine(taskLine) || { tag: '[전체]' };
            if ((parsed.tag || '').includes('PM') && /승인|검토|generated_tasks/i.test(parsed.text || '')) {
                const approval = approveGeneratedTasks(config.projectPath);
                if (approval.approvedCount) {
                    sendLog(`PM 검토 태스크 완료 — 생성 태스크 ${approval.approvedCount}개 todo.md 자동 추가`, 'success');
                }
            }
        } catch (e) {
            sendLog(`후속 태스크 생성 오류: ${e.message}`, 'warn');
        }
        sendToRenderer('agent-update', { index: agentIndex, state: 'done', task: `완료 ✓ 품질 ${quality.score}/100`, ai: aiNames[aiType], progress: 100 });
        sendLog(`✓ 완료 [${aiNames[aiType]}]: ${cleanTask.substring(0, 60)} (${quality.score}/100)`, 'success');
    }

    sendToRenderer('stats-update', { completedTasks, generatedFiles });
    updateTrayMenu();
    return result;
}


function getEnabledAgentIndices(config) {
    const enabled = normalizeEnabledAgents(config.enabledAgents);
    const indices = [];
    AGENT_KEYS.forEach((key, index) => {
        if (enabled[key]) indices.push(index);
    });
    return indices;
}

function getAgentKeyForTask(taskLine) {
    const parsed = parseTaskLine(taskLine) || { tag: '[전체]' };
    const tag = parsed.tag || '[전체]';
    const text = (parsed.text || '').toLowerCase();

    if (tag.includes('코드')) return 'code';
    if (tag.includes('월드')) return 'world';
    if (tag.includes('아트')) return 'art';
    if (tag.includes('스토리')) return 'story';
    if (tag.includes('QA')) return 'qa';

    if (text.includes('렌더') || text.includes('lumen') || text.includes('niagara')) return 'render';
    if (text.includes('던전') || text.includes('퍼즐')) return 'dungeon';
    if (text.includes('사운드') || text.includes('음악') || text.includes('효과음')) return 'sound';
    if (text.includes('밸런스') || text.includes('수치') || text.includes('성장')) return 'balance';
    if (text.includes('마법') || text.includes('주문') || text.includes('속성')) return 'magic';
    if (text.includes('자동화') || text.includes('라우팅') || text.includes('로컬 ai')) return 'ai';
    if (text.includes('전투') || text.includes('퀘스트') || text.includes('게임플레이')) return 'game';

    return 'pm';
}

function isTaskAllowedByEnabledAgents(taskLine, config) {
    const enabled = normalizeEnabledAgents(config.enabledAgents);
    const key = getAgentKeyForTask(taskLine);
    return enabled[key] !== false;
}

function getNextTasks(config, count = 4) {
    const todoFile = getTodoFile(config.projectPath);
    if (!fs.existsSync(todoFile)) {
        sendLog(`todo.md 없음: ${todoFile}`, 'error');
        return [];
    }
    const content = fs.readFileSync(todoFile, 'utf8');
    const lines = content.split('\n');
    const allPending = lines.filter(l => /^\s*- \[ \]/.test(l) && l.trim().length > 8);
    const pending = allPending.filter(l => isTaskAllowedByEnabledAgents(l, config));
    const skipped = allPending.length - pending.length;
    const inProgress = lines.filter(l => /^\s*- \[\/\]/.test(l)).length;
    sendLog(`미완료 ${pending.length}개, 진행 중 ${inProgress}개 발견${skipped ? `, 비활성 에이전트 태스크 ${skipped}개 보류` : ''}`, 'info');
    return pending.slice(0, count);
}

async function runAgentCycle(config) {
    if (!isRunning) return;
    cycleCount++;
    sendLog(`=== 사이클 #${cycleCount} 시작 ===`, 'cycle');
    sendToRenderer('cycle-update', { cycle: cycleCount });

    const enabledAgentIndices = getEnabledAgentIndices(config);
    if (enabledAgentIndices.length === 0) {
        sendLog('활성화된 에이전트가 없습니다. 설정에서 최소 1명을 ON으로 바꿔주세요.', 'error');
        stopAgents(false);
        return;
    }

    const maxParallel = Math.max(1, Math.min(enabledAgentIndices.length, Number(config.maxParallelTasks || 2)));
    const tasks = getNextTasks(config, maxParallel);

    if (tasks.length === 0) {
        sendLog('✅ 실행할 미완료 태스크가 없습니다. 태스크 탭에서 새 태스크를 추가하세요.', 'success');
        sendToRenderer('all-done', {});
        stopAgents(false);
        return;
    }

    try {
        markTasksInProgress(config, tasks);
    } catch (e) {
        sendLog(`진행 상태 표시 실패: ${e.message}`, 'error');
        stopAgents(false);
        return;
    }

    sendLog(`${tasks.length}개 태스크를 병렬 실행합니다`, 'info');
    await Promise.all(tasks.map((task, i) => executeTask(task, enabledAgentIndices[i % enabledAgentIndices.length], config)));

    sendLog(`사이클 #${cycleCount} 완료 — ${config.intervalSeconds}초 후 다음 사이클`, 'info');
    if (isRunning) {
        runningTimer = setTimeout(() => runAgentCycle(loadConfig()), config.intervalSeconds * 1000);
    }
}

function startAgents() {
    if (isRunning) return;
    const config = loadConfig();
    ensureProjectFolders(config.projectPath);
    try {
        const analysis = analyzeProject(config);
        sendLog(`프로젝트 자동 분석 완료: reports/project_status.md (${analysis.progress}%)`, 'success');
    } catch (e) {
        sendLog(`프로젝트 자동 분석 실패: ${e.message}`, 'warn');
    }

    isRunning = true;
    sendLog('=== ToribatAgent V60 시작 ===', 'success');
    sendLog(`프로젝트: ${config.projectPath}`, 'info');
    sendLog(`OpenAI 키: ${config.openaiKey ? '✓ 있음' : '✗ 없음'}`, config.openaiKey ? 'info' : 'warn');
    sendLog(`Anthropic 키: ${config.anthropicKey ? '✓ 있음' : '✗ 없음'}`, config.anthropicKey ? 'info' : 'warn');
    sendLog(`Local AI: ${config.localAiEnabled ? '✓ 사용' : '✗ 미사용'} (${config.localAiBaseUrl || 'http://127.0.0.1:1234/v1'} / ${config.localAiModel || 'qwen2.5-vl-3b-instruct'})`, config.localAiEnabled ? 'info' : 'warn');
    sendLog(`동시 실행: 최대 ${config.maxParallelTasks || 2}개`, 'info');
    sendLog(`활성 에이전트: ${getEnabledAgentIndices(config).length}명`, 'info');

    sendToRenderer('status-change', { running: true });
    updateTrayMenu();
    try { new Notification({ title: '🧙 ToribatAgent V60', body: `프로젝트: ${config.projectPath}` }).show(); } catch {}
    runAgentCycle(config);
}

function stopAgents(showLog = true) {
    isRunning = false;
    if (runningTimer) {
        clearTimeout(runningTimer);
        runningTimer = null;
    }
    if (showLog) sendLog('AI 팀 중지됨', 'warn');
    sendToRenderer('status-change', { running: false });
    updateTrayMenu();
}

function sendToRenderer(channel, data) {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
    } catch {}
}

function sendLog(msg, type = '') {
    const time = new Date().toLocaleTimeString('ko-KR');
    console.log(`[${time}] ${msg}`);
    sendToRenderer('log', { msg, type, time });
}

// ═══════════════════════════════════════════════════════════════
// V62 § Existing Project Scanner — scanExistingProject()
// ═══════════════════════════════════════════════════════════════

function getExistingProjectInventoryFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', 'existing_project_inventory.md');
}

const KNOWN_SYSTEMS = [
    { id: 'magic',     label: 'Magic System',     patterns: [/MagicComponent|UMagic|SpellSystem|SpellCast/i] },
    { id: 'quest',     label: 'Quest System',      patterns: [/QuestManager|QuestSystem|UQuest|QuestState/i] },
    { id: 'dialogue',  label: 'Dialogue System',   patterns: [/DialogueSystem|DialogueComponent|UDialogue|FDialogue/i] },
    { id: 'save',      label: 'Save System',        patterns: [/SaveGame|SaveLoad|USaveGame|TMSSave/i] },
    { id: 'character', label: 'Character System',   patterns: [/ToribatCharacter|ACharacter|PlayerCharacter|APlayer/i] },
    { id: 'enemy',     label: 'Enemy AI',           patterns: [/ABasicEnemy|EnemyAI|AIController|BehaviorTree/i] },
    { id: 'inventory', label: 'Inventory System',   patterns: [/InventoryComponent|UInventory|FInventory/i] },
    { id: 'minimap',   label: 'Minimap System',     patterns: [/MinimapSubsystem|MinimapWidget|MinimapTracker/i] },
    { id: 'daynight',  label: 'Day/Night Cycle',    patterns: [/DayNightCycle|DayNight|UDayNight/i] }
];

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

function extractFunctionsFromHeader(fileContent) {
    const funcs = [];
    const re = /UFUNCTION[^)]*\)\s*\n?\s*(?:virtual\s+)?[\w:<>*&\s]+\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(fileContent)) !== null) {
        if (m[1] && !['public', 'private', 'protected'].includes(m[1])) {
            funcs.push(m[1]);
        }
    }
    return [...new Set(funcs)];
}

function scanExistingProject(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const ue = collectUEProjectEvidence(projectPath);

    const sourceDetails = [];
    for (const file of ue.sourceCodeFiles) {
        if (!/\.(h|hpp)$/i.test(file.full)) continue;
        let content = '';
        try { content = fs.readFileSync(file.full, 'utf8'); } catch { continue; }
        const classes = extractClassesFromSource(content);
        const functions = extractFunctionsFromHeader(content);
        const rel = path.relative(projectPath, file.full).replace(/\\/g, '/');
        sourceDetails.push({ file: rel, classes, functions, size: file.size });
    }

    const allClassNames = sourceDetails.flatMap(d => d.classes);
    const allFilePaths = ue.sourceCodeFiles.map(f => f.full).join('\n');

    const systemRows = KNOWN_SYSTEMS.map(sys => {
        const matchedFiles = sourceDetails.filter(d =>
            sys.patterns.some(p => p.test(d.classes.join(' ')) || p.test(d.file))
        );
        const exists = matchedFiles.length > 0;
        return {
            ...sys,
            exists,
            files: matchedFiles.map(d => d.file),
            classes: matchedFiles.flatMap(d => d.classes.filter(c => sys.patterns.some(p => p.test(c))))
        };
    });

    const blueprintFiles = ue.contentFiles.filter(f => /\.uasset$/i.test(f.full));
    const mapFiles = ue.mapFiles;

    const implementedSystems = systemRows.filter(s => s.exists);
    const missingSystems = systemRows.filter(s => !s.exists);

    const report = `# 기존 프로젝트 인벤토리 (Existing Project Inventory)

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 프로젝트 경로: ${projectPath}
- .uproject 존재: ${ue.hasUProject ? '예' : '아니오'}
- 헤더 파일 수: ${ue.sourceCodeFiles.filter(f => /\.h$/i.test(f.full)).length}
- 소스 파일 수: ${ue.sourceCodeFiles.filter(f => /\.cpp$/i.test(f.full)).length}
- 블루프린트 (.uasset): ${blueprintFiles.length}
- 맵 (.umap): ${mapFiles.length}

## 감지된 클래스 목록

${sourceDetails.map(d =>
    d.classes.length ? `### ${d.file}\n${d.classes.map(c => `- \`${c}\``).join('\n')}` : ''
).filter(Boolean).join('\n\n')}

## 시스템별 구현 현황

| 시스템 | 상태 | 파일 | 클래스 |
| --- | --- | --- | --- |
${systemRows.map(s =>
    `| ${s.label} | ${s.exists ? '✅ 구현됨' : '❌ 없음'} | ${s.files.join(', ') || '-'} | ${s.classes.join(', ') || '-'} |`
).join('\n')}

## 구현된 시스템 (${implementedSystems.length}개) — 확장 우선 대상

${implementedSystems.map(s => `- **${s.label}**: ${s.files.join(', ')} → 클래스: ${s.classes.join(', ')}`).join('\n') || '- 없음'}

## 미구현 시스템 (${missingSystems.length}개) — 신규 생성 허용

${missingSystems.map(s => `- **${s.label}**: 신규 생성 허용`).join('\n') || '- 없음'}

## 확장 가이드
- 구현된 시스템에 기능 추가 시: 확장 후보(Extension Candidate)를 생성하라
- 미구현 시스템: 신규 apply_candidate를 생성해도 된다
- 동일 클래스를 새로 만드는 것은 REJECT 처리된다
`;
    safeWriteFile(getExistingProjectInventoryFile(projectPath), report);
    generatedFiles++;
    return { report, sourceDetails, systemRows, implementedSystems, missingSystems, allClassNames, blueprintCount: blueprintFiles.length, mapCount: mapFiles.length };
}

// ═══════════════════════════════════════════════════════════════
// V63 § Source Awareness Engine — findExistingImplementation()
// ═══════════════════════════════════════════════════════════════

function findExistingImplementation(projectPath, systemName) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const ue = collectUEProjectEvidence(projectPath);
    const searchRe = new RegExp(systemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const matchedFiles = [];
    const matchedClasses = [];

    for (const file of ue.sourceCodeFiles) {
        if (!searchRe.test(file.full)) continue;
        let content = '';
        try { content = fs.readFileSync(file.full, 'utf8'); } catch { continue; }
        const classes = extractClassesFromSource(content);
        const functions = extractFunctionsFromHeader(content);
        matchedFiles.push({
            file: path.relative(projectPath, file.full).replace(/\\/g, '/'),
            abs: file.full,
            classes,
            functions
        });
        matchedClasses.push(...classes);
    }

    // 파일명 매치 없으면 클래스 내용에서도 검색
    if (!matchedFiles.length) {
        for (const file of ue.sourceCodeFiles) {
            if (!/\.(h|hpp)$/i.test(file.full)) continue;
            let content = '';
            try { content = fs.readFileSync(file.full, 'utf8'); } catch { continue; }
            if (!searchRe.test(content)) continue;
            const classes = extractClassesFromSource(content);
            const functions = extractFunctionsFromHeader(content);
            matchedFiles.push({
                file: path.relative(projectPath, file.full).replace(/\\/g, '/'),
                abs: file.full,
                classes,
                functions
            });
            matchedClasses.push(...classes);
        }
    }

    const found = matchedFiles.length > 0;
    return {
        found,
        systemName,
        files: matchedFiles,
        classes: [...new Set(matchedClasses)],
        recommendation: found ? 'extend' : 'create',
        message: found
            ? `기존 구현 발견: ${matchedFiles.map(f => f.file).join(', ')} — 신규 생성 금지, 확장 후보를 생성하라`
            : `기존 구현 없음 — 신규 생성 허용`
    };
}

// ═══════════════════════════════════════════════════════════════
// V64 § Duplicate Prevention Gate — validateCandidateAgainstProject()
// ═══════════════════════════════════════════════════════════════

function validateCandidateAgainstProject(projectPath, candidateFile) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);

    if (!candidateFile || !fs.existsSync(candidateFile)) {
        return { decision: 'REJECT', reason: '후보 파일 없음', conflicts: [], existingFiles: [] };
    }

    const content = readTextIfExists(candidateFile);
    const targetRel = parseTargetPath(content);

    // 1. 후보 내 클래스명 추출
    const candidateClasses = extractClassesFromSource(content);
    const targetBasename = targetRel ? path.basename(targetRel, path.extname(targetRel)) : '';

    // 2. 프로젝트 Source 전체에서 충돌 검사
    const ue = collectUEProjectEvidence(projectPath);
    const conflicts = [];
    const existingFiles = [];

    for (const file of ue.sourceCodeFiles) {
        let fileContent = '';
        try { fileContent = fs.readFileSync(file.full, 'utf8'); } catch { continue; }
        const fileClasses = extractClassesFromSource(fileContent);
        const fileRel = path.relative(projectPath, file.full).replace(/\\/g, '/');

        // 동일 클래스명 충돌
        const classConflicts = candidateClasses.filter(c => fileClasses.includes(c));
        if (classConflicts.length) {
            conflicts.push({ type: 'DUPLICATE_CLASS', file: fileRel, classes: classConflicts });
            existingFiles.push(fileRel);
        }

        // 대상 경로 파일이 이미 존재
        if (targetRel) {
            const targetAbs = path.isAbsolute(targetRel) ? targetRel : path.join(projectPath, targetRel);
            if (file.full.toLowerCase() === targetAbs.toLowerCase()) {
                conflicts.push({ type: 'FILE_EXISTS', file: fileRel, classes: fileClasses });
                if (!existingFiles.includes(fileRel)) existingFiles.push(fileRel);
            }
        }
    }

    // 3. 시스템 의미 충돌 검사 (파일명 키워드 → 기존 구현 파일 존재 여부)
    const SYSTEM_CONFLICT_MAP = [
        { keywords: ['dialogue', 'dialog'],         existing: ['DialogueSystem', 'DialogueComponent'] },
        { keywords: ['quest', 'queststate'],         existing: ['QuestManager', 'QuestSystem'] },
        { keywords: ['magic', 'spell'],              existing: ['MagicComponent'] },
        { keywords: ['save', 'savegame'],            existing: ['SaveLoadSubsystem', 'TMSSaveGame'] },
        { keywords: ['inventory'],                   existing: ['InventoryComponent'] },
        { keywords: ['minimap'],                     existing: ['MinimapSubsystem', 'MinimapWidget', 'MinimapTracker'] },
        { keywords: ['daynight', 'day_night', 'daynightcycle'], existing: ['DayNightCycleManager'] }
    ];
    const candidateBasename = path.basename(candidateFile || '').toLowerCase();
    const semanticConflicts = [];
    for (const rule of SYSTEM_CONFLICT_MAP) {
        const keywordMatch = rule.keywords.some(kw => candidateBasename.includes(kw));
        if (!keywordMatch) continue;
        for (const file of ue.sourceCodeFiles) {
            const fileRel = path.relative(projectPath, file.full).replace(/\\/g, '/');
            if (rule.existing.some(ex => fileRel.toLowerCase().includes(ex.toLowerCase()))) {
                semanticConflicts.push({ type: 'SYSTEM_EXISTS', file: fileRel, keyword: rule.keywords[0] });
                if (!existingFiles.includes(fileRel)) existingFiles.push(fileRel);
            }
        }
    }

    let decision, reason;
    if (conflicts.some(c => c.type === 'DUPLICATE_CLASS')) {
        decision = 'REJECT';
        const dupes = conflicts.filter(c => c.type === 'DUPLICATE_CLASS').flatMap(c => c.classes).join(', ');
        reason = `동일 클래스 이미 존재: ${dupes} — 확장 후보(Extension Candidate)로 전환 필요`;
    } else if (conflicts.some(c => c.type === 'FILE_EXISTS')) {
        decision = 'REVIEW';
        reason = `대상 파일 이미 존재: ${targetRel} — 내용 검토 후 병합 또는 덮어쓰기 결정 필요`;
    } else if (semanticConflicts.length) {
        decision = 'REVIEW';
        const files = [...new Set(semanticConflicts.map(c => c.file))].join(', ');
        reason = `동일 시스템 구현 이미 존재: ${files} — 신규 생성 금지, 확장 후보로 전환 검토 필요`;
        conflicts.push(...semanticConflicts);
    } else {
        return { decision: 'PASS', reason: '충돌 없음 — 신규 생성 허용', conflicts, existingFiles, candidateFile, targetRel, candidateClasses, semanticConflicts };
    }

    return { decision, reason, conflicts, existingFiles, candidateFile, targetRel, candidateClasses, semanticConflicts };
}

// ═══════════════════════════════════════════════════════════════
// V65 § Safe Extension Workflow — generateExtensionCandidate()
// ═══════════════════════════════════════════════════════════════

function generateExtensionCandidate(projectPath, systemName, extensionSpec = {}) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const existing = findExistingImplementation(projectPath, systemName);

    if (!existing.found) {
        return { ok: false, reason: `기존 구현 없음 — 신규 후보를 생성하라`, systemName };
    }

    const primaryFile = existing.files[0];
    let existingContent = '';
    try { existingContent = fs.readFileSync(primaryFile.abs, 'utf8'); } catch {}
    const existingClasses = primaryFile.classes.join(', ');
    const existingFunctions = primaryFile.functions.join(', ');

    const addFunctions = extensionSpec.addFunctions || [];
    const addMembers = extensionSpec.addMembers || [];
    const description = extensionSpec.description || `${systemName} 기능 확장`;

    const diff = addFunctions.map(f => `+    UFUNCTION(BlueprintCallable) void ${f}();`).join('\n') +
                 (addMembers.length ? '\n' + addMembers.map(m => `+    ${m}`).join('\n') : '');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${timestamp}_${systemName}_Extension.candidate.md`;
    const dir = path.join(getApplyCandidatesDir(projectPath), 'code');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);

    const content = `# 확장 후보 — ${systemName} Extension

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 유형: Extension (신규 생성 아님)
- 대상 시스템: ${systemName}
- 기존 파일: ${primaryFile.file}
- 기존 클래스: ${existingClasses}
- 설명: ${description}

## 기존 구현 요약

기존 파일: \`${primaryFile.file}\`
기존 UFUNCTION: ${existingFunctions || '(없음)'}

## 추가할 함수

${addFunctions.length ? addFunctions.map(f => `- \`${f}()\``).join('\n') : '- (extensionSpec에서 지정 필요)'}

## 추가할 멤버

${addMembers.length ? addMembers.map(m => `- \`${m}\``).join('\n') : '- (extensionSpec에서 지정 필요)'}

## 변경 Diff

\`\`\`diff
// ${primaryFile.file} 에 추가
${diff || '// 추가할 내용을 extensionSpec으로 지정하라'}
\`\`\`

## 영향 범위

- 기존 클래스 수정 (${existingClasses}) — 기존 기능에 영향 없도록 추가 전용으로 작성
- 기존 .cpp에 구현 추가 필요

## 테스트 방법

1. 기존 기능이 그대로 동작하는지 PIE에서 확인
2. 추가된 함수가 Blueprint에서 호출 가능한지 확인
3. 컴파일 오류 없는지 확인

## 적용 방법

1. 기존 파일 \`${primaryFile.file}\`을 읽고 public 섹션에 추가 함수를 삽입한다
2. 대응하는 .cpp 파일에 함수 본문을 추가한다
3. allowRealApply=true 후 promoteCandidateToProject() 실행

## 상태
- 현재: 상태2 — 확장 후보
- 상태3 조건: 기존 파일에 실제 추가 적용
- 상태4 조건: PIE 실행 확인 + Reviewer PASS + QA PASS
`;
    safeWriteFile(filePath, content);
    generatedFiles++;
    return { ok: true, filePath, systemName, existingFile: primaryFile.file, existingClasses, diff };
}

// ═══════════════════════════════════════════════════════════════
// V69 § Asset Segmentation Rules
// ═══════════════════════════════════════════════════════════════

const ASSET_SEGMENTATION_RULES_CONTENT = `# 에셋 분해 규칙 (Asset Segmentation Rules)
# ToribatAgent V69 — Image-to-3D Pipeline

## 핵심 원칙

> 마법학교 내부/외부 전체를 하나의 3D 모델로 만들지 마라.
> 이미지는 재사용 가능한 에셋 단위로 분해해야 한다.

## 분해 규칙

| 대상 | 규칙 | 이유 |
| --- | --- | --- |
| 큰 공간(홀/복도/교실) | 통짜 모델 금지 | 수정 어려움, LOD/충돌 불가 |
| 바닥 | 타일/패턴 모듈 단위 | 반복 배치로 공간 조립 |
| 벽면 | 벽면 패널 모듈 | 재사용 + 높이 조절 가능 |
| 기둥 | 독립 에셋 | 위치 자유 배치 |
| 아치/문틀 | 독립 에셋 | 다양한 문 조합 가능 |
| 문/창문 | 독립 에셋 + 애니메이션 대비 | 개폐 로직 분리 |
| 계단 | 세그먼트 단위 (3~5칸) | 길이 조합 가능 |
| 책장/책상 | 소품(prop) | 인테리어 자유 배치 |
| 촛대/조명 | 소품(prop) | VFX 소켓 분리 |
| 천장 보 | 독립 구조물 | 높이/방향 자유 |
| 난간 | 모듈 단위 | 길이 조합 가능 |
| 장식 조각 | 선택적 소품 | 성능 예산 여유 시 추가 |
| 마법 장치 | 독립 소품 + 소켓 | VFX/애니 분리 |
| 캐릭터/생물 | 별도 캐릭터 파이프라인 | 스켈레탈 메시 분리 |
| VFX/파티클 | 메시와 완전 분리 | 나이아가라 시스템 사용 |
| 대형 영웅 에셋 | floor/wall/pillar/door/window/ceiling/prop 6분류 | 관리 가능한 단위 |

## 카테고리 분류

- **structural**: floor, wall, ceiling, pillar, arch, stair
- **door_window**: door, window, gate, porthole
- **prop**: bookshelf, desk, candlestick, bench, crate, torch
- **device**: magic_device, lever, switch, puzzle_object
- **exterior**: facade, tower, courtyard_wall, gate_arch
- **decoration**: mural, rune_carving, tapestry, banner

## 성능 기준

| 에셋 유형 | 권장 폴리곤 수 | 텍스처 | LOD | Nanite |
| --- | --- | --- | --- | --- |
| 소품(prop) | 500~5,000 tris | 1K~2K | 불필요 | 불필요 |
| 중형 구조물 | 5,000~25,000 tris | 2K | 권장 | 선택 |
| 대형 구조물 | 25,000~80,000 tris | 2K~4K | 필수 | 권장 |
| 대형 영웅 에셋 | 80,000 tris 이하 | 4K 허용 | 필수 | 권장 |

## 경고/거부 기준

| 조건 | 판정 |
| --- | --- |
| 100,000 tris 초과 예상 | WARNING |
| 200,000 tris 초과 예상 | REJECT 후보 |
| 내부 전체를 하나의 모델로 생성 | REJECT |
| 배경/카메라가 메시에 포함 | REJECT |
| 텍스처 없음 | REVIEW |
| 너무 단순 (100 tris 미만) | REVIEW |
| negativePrompt 없음 | REJECT |
| poly budget 없음 | REVIEW |
| 4K 텍스처 남발 (소품에 4K) | WARNING |

## negativePrompt 필수 문구

3D 생성 프롬프트에 반드시 포함해야 할 문구:

> entire room, full building, full interior, full school, character, person, excessive ornaments, ultra high poly, broken geometry, merged walls, baked camera angle, background scenery, sky, landscape

## UE5 임포트 기준

- 권장 출력 형식: .fbx (UE5 호환), .glb (게임툴 호환), .obj (범용)
- 최우선: .fbx
- Pivot: 에셋 하단 중앙 기준
- 스케일: 1 UE unit = 1 cm 기준
- 충돌: UCX_ 접두사 단순 충돌 메시 별도 제공
- 머티리얼: PBR (BaseColor, Normal, ORM 채널)
`;

function ensureAssetSegmentationRules(projectPath) {
    const f = getAssetSegmentationRulesFile(projectPath);
    if (!fs.existsSync(f)) {
        safeWriteFile(f, ASSET_SEGMENTATION_RULES_CONTENT);
    }
}

// ═══════════════════════════════════════════════════════════════
// V67 § Image Asset Intake — scanAssetInputImages()
// ═══════════════════════════════════════════════════════════════

const IMAGE_TYPE_RULES = [
    { keywords: ['interior', 'inside', 'hall', 'room', 'classroom', 'corridor', 'indoor', '내부', '홀', '교실', '복도'], type: 'interior' },
    { keywords: ['exterior', 'outside', 'facade', 'courtyard', 'tower', 'gate', '외부', '외관', '안뜰', '탑'], type: 'exterior' },
    { keywords: ['prop', 'object', 'item', 'furniture', 'desk', 'chair', 'shelf', 'candle', '소품', '가구'], type: 'prop' },
    { keywords: ['character', 'person', 'npc', 'wizard', 'student', '캐릭터', '인물', '학생', '마법사'], type: 'character' },
    { keywords: ['creature', 'monster', 'beast', 'animal', '생물', '몬스터'], type: 'creature' }
];

function detectImageType(filename) {
    const lower = filename.toLowerCase();
    for (const rule of IMAGE_TYPE_RULES) {
        if (rule.keywords.some(kw => lower.includes(kw))) return rule.type;
    }
    return 'unknown';
}

function needsDecomposition(imageType) {
    return ['interior', 'exterior'].includes(imageType);
}

function scanAssetInputImages(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    ensureAssetSegmentationRules(projectPath);
    const imagesDir = path.join(getAssetInputsDir(projectPath), 'images');
    const analyzedDir = getAssetAnalyzedDir(projectPath);

    let allFiles = [];
    try { allFiles = fs.readdirSync(imagesDir); } catch { allFiles = []; }

    const supported = allFiles.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    const results = [];

    for (const filename of supported) {
        const imagePath = path.join(imagesDir, filename);
        const baseName = path.basename(filename, path.extname(filename));
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const imageType = detectImageType(filename);
        const decompose = needsDecomposition(imageType);
        const outFile = path.join(analyzedDir, `${baseName}.intake.md`);

        let stat = null;
        try { stat = fs.statSync(imagePath); } catch {}

        const content = `# Image Intake — ${filename}

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 원본 이미지 경로: ${imagePath}
- 파일명: ${filename}
- 확장자: ${ext}
- 파일 크기: ${stat ? Math.round(stat.size / 1024) + ' KB' : '알 수 없음'}
- 이미지 종류: ${imageType}
- 분해 필요: ${decompose ? '예 (interior/exterior → 에셋 단위 분해 필수)' : '아니오'}
- 목표: UE5 재사용 가능한 에셋 단위 3D 모델 생성
- 게임 내 사용 위치: ToribatMagicSchool/${imageType === 'interior' ? 'Content/Meshes/Interior' : imageType === 'exterior' ? 'Content/Meshes/Exterior' : imageType === 'prop' ? 'Content/Meshes/Props' : 'Content/Meshes/Misc'}
- 처리 상태: intake_registered
- dryRun: true
- 주의: ${decompose ? '전체 이미지를 하나의 3D 모델로 만들지 마라. 반드시 에셋 단위로 분해할 것.' : '단일 에셋 이미지 — 직접 3D 생성 가능'}
`;
        safeWriteFile(outFile, content);
        generatedFiles++;
        results.push({ filename, imagePath, imageType, decompose, intakeFile: outFile });
    }

    sendLog(`Image Intake: ${supported.length}개 이미지 등록 (분해 필요: ${results.filter(r => r.decompose).length}개)`, 'success');
    return { images: results, count: supported.length, imagesDir };
}

// ═══════════════════════════════════════════════════════════════
// V68 § Image Decomposition Planner — generateImageDecompositionPlan()
// ═══════════════════════════════════════════════════════════════

const DECOMPOSITION_PRESETS = {
    interior: {
        description: '마법학교 내부 공간 이미지',
        wholeModelForbiddenReason: '내부 전체를 하나의 메시로 만들면 수정 불가, LOD 관리 불가, UE5 레벨 제작 부적합, 성능 악화',
        segments: [
            { id: 'floor_tile_module',  label: '바닥 타일 모듈',    category: 'structural', priority: 1, tool: 'Blender', format: 'fbx', polyBudget: 200,    texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'wall_panel_module',  label: '벽면 패널 모듈',    category: 'structural', priority: 2, tool: 'Blender', format: 'fbx', polyBudget: 500,    texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'stone_pillar',       label: '석조 기둥',          category: 'structural', priority: 3, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 3000, texture: '2K', lod: true,  nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'arch_module',        label: '아치 모듈',          category: 'structural', priority: 4, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 4000, texture: '2K', lod: true,  nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'wooden_door',        label: '목재 문',            category: 'door_window', priority: 5, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 2000, texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'stained_window',     label: '스테인드 창문',      category: 'door_window', priority: 6, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 1500, texture: '2K', lod: false, nanite: false, collision: false, reuse: '높음', performanceRisk: '낮음' },
            { id: 'ceiling_beam',       label: '천장 보',            category: 'structural', priority: 7, tool: 'Blender', format: 'fbx', polyBudget: 800,   texture: '2K', lod: false, nanite: false, collision: false, reuse: '중간', performanceRisk: '낮음' },
            { id: 'torch_holder',       label: '촛대/횃불대',        category: 'prop',       priority: 8, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 1000, texture: '1K', lod: false, nanite: false, collision: false, reuse: '높음', performanceRisk: '낮음' },
            { id: 'stair_segment',      label: '계단 세그먼트',      category: 'structural', priority: 9, tool: 'Blender', format: 'fbx', polyBudget: 600,   texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'bookshelf',          label: '책장',               category: 'prop',       priority: 10, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 3000, texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'stone_bench',        label: '석조 벤치',          category: 'prop',       priority: 11, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 1500, texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'magic_device',       label: '마법 장치',          category: 'device',     priority: 12, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 4000, texture: '2K', lod: false, nanite: false, collision: true,  reuse: '중간', performanceRisk: '중간' }
        ]
    },
    exterior: {
        description: '마법학교 외부/외관 이미지',
        wholeModelForbiddenReason: '외관 전체를 하나의 메시로 만들면 내부 레벨 제작 불가, 조명/머티리얼 관리 불가',
        segments: [
            { id: 'facade_wall',        label: '외벽 패널',          category: 'exterior',   priority: 1, tool: 'Blender',   format: 'fbx', polyBudget: 1000, texture: '2K', lod: true,  nanite: true,  collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'tower_section',      label: '탑 섹션',            category: 'exterior',   priority: 2, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 8000, texture: '2K', lod: true,  nanite: true,  collision: true,  reuse: '중간', performanceRisk: '중간' },
            { id: 'gate_arch',          label: '정문 아치',          category: 'exterior',   priority: 3, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 5000, texture: '2K', lod: true,  nanite: false, collision: true,  reuse: '중간', performanceRisk: '낮음' },
            { id: 'courtyard_floor',    label: '안뜰 바닥',          category: 'structural', priority: 4, tool: 'Blender',   format: 'fbx', polyBudget: 300,  texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' },
            { id: 'decorative_trim',    label: '장식 트림',          category: 'decoration', priority: 5, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 2000, texture: '2K', lod: false, nanite: false, collision: false, reuse: '높음', performanceRisk: '낮음' }
        ]
    },
    prop: {
        description: '단일 소품/오브젝트 이미지',
        wholeModelForbiddenReason: '해당 없음 (단일 소품은 직접 생성 허용)',
        segments: [
            { id: 'prop_main',          label: '소품 본체',          category: 'prop',       priority: 1, tool: 'Hunyuan3D', format: 'fbx', polyBudget: 3000, texture: '2K', lod: false, nanite: false, collision: true,  reuse: '높음', performanceRisk: '낮음' }
        ]
    },
    unknown: {
        description: '유형 불명 이미지 (수동 분류 필요)',
        wholeModelForbiddenReason: '유형 불명 — 분해 전 사용자 분류 필요',
        segments: [
            { id: 'unknown_asset',      label: '미분류 에셋',        category: 'misc',       priority: 1, tool: 'Manual Blender', format: 'fbx', polyBudget: 5000, texture: '2K', lod: false, nanite: false, collision: true, reuse: '낮음', performanceRisk: '미확인' }
        ]
    }
};

function generateImageDecompositionPlan(projectPath, intakeFile) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    ensureAssetSegmentationRules(projectPath);

    if (!intakeFile || !fs.existsSync(intakeFile)) {
        return { ok: false, reason: 'intake 파일 없음' };
    }

    const intakeContent = fs.readFileSync(intakeFile, 'utf8');
    const imageTypeMatch = intakeContent.match(/이미지 종류:\s*(\w+)/);
    const imageType = imageTypeMatch ? imageTypeMatch[1] : 'unknown';
    const filenameMatch = intakeContent.match(/파일명:\s*(.+)/);
    const filename = filenameMatch ? filenameMatch[1].trim() : path.basename(intakeFile, '.intake.md');
    const baseName = path.basename(filename, path.extname(filename));

    const preset = DECOMPOSITION_PRESETS[imageType] || DECOMPOSITION_PRESETS.unknown;
    const plansDir = getAssetDecompositionPlansDir(projectPath);
    if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
    const outFile = path.join(plansDir, `${baseName}.decomposition.md`);

    const segTable = preset.segments.map(s =>
        `| ${s.priority} | \`${s.id}\` | ${s.label} | ${s.category} | ${s.tool} | ${s.format} | ${s.polyBudget.toLocaleString()} | ${s.texture} | ${s.lod ? '필요' : '-'} | ${s.nanite ? '권장' : '-'} | ${s.collision ? '필요' : '-'} | ${s.reuse} | ${s.performanceRisk} |`
    ).join('\n');

    const content = `# 이미지 분해 계획 (Decomposition Plan)

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 원본 intake: ${intakeFile}
- 파일명: ${filename}
- 이미지 유형: ${imageType}
- 설명: ${preset.description}
- dryRun: true

## 통짜 모델링 금지 사유

> **${preset.wholeModelForbiddenReason}**

이미지 전체를 하나의 3D 모델로 생성하는 것은 금지됩니다.
아래 에셋 단위로 분해하여 각각 별도 3D 모델로 생성해야 합니다.

## 분해할 에셋 목록 (${preset.segments.length}개)

| 우선순위 | ID | 이름 | 카테고리 | 권장 툴 | 출력 형식 | Poly Budget | 텍스처 | LOD | Nanite | 충돌 | 재사용 | 성능 위험 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${segTable}

## 권장 모델링 툴

- **Hunyuan3D**: 유기적 형태, 석조물, 소품 — image-to-3D 생성
- **TRELLIS**: 고품질 구조물, 복잡한 형태 — image-to-3D 생성
- **Blender**: 반복 모듈, 타일, 기하학적 구조물 — 수동/스크립트 모델링
- **Manual Blender**: 유형 불명 또는 특수 요구사항

## UE5 배치 방식

- 분해된 에셋을 UE5 레벨에서 인스턴스로 배치
- 반복 구조물은 ISM(Instanced Static Mesh) 사용
- 소품은 개별 배치
- 문/창문은 Blueprint 액터로 래핑 (개폐 애니메이션)

## 처리 우선순위

1~4: 공간 구조 (바닥/벽/기둥/아치) 먼저
5~8: 개구부 및 조명 요소
9~12: 소품 및 장식 요소 (성능 예산 여유 시)

## 다음 단계

이 계획을 기반으로 generateSegment3DJobs() 를 실행하여
각 에셋별 3D 생성 Job을 만든다.
`;
    safeWriteFile(outFile, content);
    generatedFiles++;
    return { ok: true, outFile, imageType, segmentCount: preset.segments.length, segments: preset.segments, baseName };
}

// ═══════════════════════════════════════════════════════════════
// V70 § Segment-to-3D Job Generator — generateSegment3DJobs()
// ═══════════════════════════════════════════════════════════════

const NEGATIVE_PROMPT_BASE = 'entire room, full building, full interior, full school exterior, character, person, excessive ornaments, ultra high poly, broken geometry, merged walls, baked camera angle, background scenery, sky, landscape, multiple objects merged together';

function buildPositivePrompt(segment, imageType) {
    const stylePrefix = 'A game-ready modular asset for a cozy magical school';
    const stylePostfix = 'clean silhouette, separate mesh, PBR material, neutral pose, no background, studio lighting, UE5 ready';
    const catPrompts = {
        structural: `${stylePrefix} — ${segment.label}, stone or wood material, ${stylePostfix}`,
        door_window: `${stylePrefix} — ${segment.label}, aged wood or stained glass, ${stylePostfix}`,
        prop: `${stylePrefix} — ${segment.label}, detailed but game-optimized, ${stylePostfix}`,
        device: `${stylePrefix} — ${segment.label}, magical glowing runes, ${stylePostfix}`,
        exterior: `${stylePrefix} exterior — ${segment.label}, weathered stone, ${stylePostfix}`,
        decoration: `${stylePrefix} — ${segment.label}, decorative relief, ${stylePostfix}`,
        misc: `${stylePrefix} — ${segment.label}, ${stylePostfix}`
    };
    return catPrompts[segment.category] || catPrompts.misc;
}

function generateSegment3DJobs(projectPath, decompositionFile) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);

    if (!decompositionFile || !fs.existsSync(decompositionFile)) {
        return { ok: false, reason: 'decomposition 파일 없음' };
    }

    const decomContent = fs.readFileSync(decompositionFile, 'utf8');
    const imageTypeMatch = decomContent.match(/이미지 유형:\s*(\w+)/);
    const imageType = imageTypeMatch ? imageTypeMatch[1] : 'unknown';
    const filenameMatch = decomContent.match(/파일명:\s*(.+)/);
    const filename = filenameMatch ? filenameMatch[1].trim() : '';
    const baseName = path.basename(filename, path.extname(filename)) || path.basename(decompositionFile, '.decomposition.md');

    const preset = DECOMPOSITION_PRESETS[imageType] || DECOMPOSITION_PRESETS.unknown;
    const pendingDir = path.join(getAssetGenerationQueueDir(projectPath), 'pending');
    if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });

    const jobs = [];
    for (const seg of preset.segments) {
        const jobFile = path.join(pendingDir, `${baseName}_${seg.id}.job.md`);
        const ueImportPath = `Content/Meshes/${seg.category === 'prop' ? 'Props' : seg.category === 'exterior' ? 'Exterior' : 'Interior'}/${seg.id}`;
        const positivePrompt = buildPositivePrompt(seg, imageType);

        const content = `# 3D 생성 Job — ${seg.label}

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- assetId: ${baseName}_${seg.id}
- sourceImage: asset_inputs/images/${filename}
- segmentName: ${seg.id}
- segmentLabel: ${seg.label}
- category: ${seg.category}
- status: pending
- dryRun: true

## 생성 파라미터

- prompt: ${positivePrompt}
- negativePrompt: ${NEGATIVE_PROMPT_BASE}
- outputFormat: ${seg.format}
- targetPolyBudget: ${seg.polyBudget}
- textureBudget: ${seg.texture}
- recommendedTool: ${seg.tool}

## UE5 설정

- ueImportPath: ${ueImportPath}
- collision: ${seg.collision ? '필요 (UCX_ 메시 포함)' : '불필요'}
- lodRequired: ${seg.lod ? '예' : '아니오'}
- naniteRecommended: ${seg.nanite ? '예' : '아니오'}
- priority: ${seg.priority}
- reusability: ${seg.reuse}
- performanceRisk: ${seg.performanceRisk}

## 실행 조건

- 실제 3D 생성 툴(Hunyuan3D/TRELLIS/Blender) 설치 필요
- 미설치 시 dry-run 유지 (이 파일은 생성됨)
- 실행 허용: config.allow3DGeneration === true 일 때만

## 주의

negativePrompt에 반드시 포함:
- entire room / full building / full interior / full school

이 job은 ${seg.label} 단독 에셋 생성을 위한 것입니다.
전체 방/건물/학교를 생성하지 마십시오.
`;
        safeWriteFile(jobFile, content);
        generatedFiles++;
        jobs.push({ jobFile, segmentId: seg.id, label: seg.label, tool: seg.tool, polyBudget: seg.polyBudget });
    }

    sendLog(`3D Job 생성: ${jobs.length}개 segment job (${baseName})`, 'success');
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, { task: `3D Job 생성: ${baseName}`, decision: `${jobs.length}개 segment job`, result: 'asset_generation_queue/pending' });
    } catch { /* 비중단 */ }
    return { ok: true, baseName, jobs, jobCount: jobs.length };
}

// ═══════════════════════════════════════════════════════════════
// V71 § Quality Gate — runAssetQualityGate()
// ═══════════════════════════════════════════════════════════════

function runAssetQualityGate(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    const pendingDir = path.join(getAssetGenerationQueueDir(projectPath), 'pending');
    const generatedDir = getGeneratedAssetsDir(projectPath);

    const jobFiles = fs.existsSync(pendingDir) ? fs.readdirSync(pendingDir).filter(f => f.endsWith('.job.md')).map(f => path.join(pendingDir, f)) : [];
    const assetFiles = fs.existsSync(generatedDir) ? fs.readdirSync(generatedDir).filter(f => /\.(glb|obj|fbx)$/i.test(f)).map(f => path.join(generatedDir, f)) : [];

    const results = [];

    // Job 파일 검사
    for (const jobFile of jobFiles) {
        const content = fs.readFileSync(jobFile, 'utf8');
        const checks = [];
        let decision = 'PASS';

        const hasNegativePrompt = /negativePrompt:/i.test(content);
        const hasPolyBudget = /targetPolyBudget:/i.test(content);
        const hasUEPath = /ueImportPath:/i.test(content);
        const hasEntireRoomForbidden = /entire room|full building|full interior/i.test(content);
        const hasFormat = /outputFormat:/i.test(content);

        const polyMatch = content.match(/targetPolyBudget:\s*(\d+)/);
        const polyBudget = polyMatch ? parseInt(polyMatch[1]) : 0;

        if (!hasNegativePrompt) { checks.push('negativePrompt 없음'); decision = 'REJECT'; }
        if (!hasPolyBudget)     { checks.push('poly budget 없음'); if (decision !== 'REJECT') decision = 'REVIEW'; }
        if (!hasUEPath)         { checks.push('UE5 임포트 경로 없음'); if (decision !== 'REJECT') decision = 'REVIEW'; }
        if (!hasEntireRoomForbidden) { checks.push('통짜 모델 금지 문구 없음'); decision = 'REJECT'; }
        if (!hasFormat)         { checks.push('출력 형식 미지정'); if (decision !== 'REJECT') decision = 'REVIEW'; }
        if (polyBudget > 200000) { checks.push(`poly budget 과도: ${polyBudget.toLocaleString()} tris`); decision = 'REJECT'; }
        else if (polyBudget > 100000) { checks.push(`poly budget 경고: ${polyBudget.toLocaleString()} tris`); if (decision !== 'REJECT') decision = 'REVIEW'; }
        if (polyBudget > 0 && polyBudget < 100) { checks.push(`poly budget 너무 단순: ${polyBudget} tris`); if (decision !== 'REJECT') decision = 'REVIEW'; }

        if (checks.length === 0) checks.push('모든 기준 통과');
        results.push({ type: 'job', file: path.basename(jobFile), decision, checks });
    }

    // 실제 생성 에셋 파일 검사 (있을 경우)
    for (const assetFile of assetFiles) {
        const stat = fs.statSync(assetFile);
        const checks = [];
        let decision = 'PASS';
        const sizeMB = stat.size / (1024 * 1024);

        if (sizeMB > 100)  { checks.push(`파일 크기 과도: ${sizeMB.toFixed(1)} MB`); decision = 'REJECT'; }
        else if (sizeMB > 50) { checks.push(`파일 크기 경고: ${sizeMB.toFixed(1)} MB`); decision = 'REVIEW'; }
        else if (stat.size === 0) { checks.push('빈 파일'); decision = 'REJECT'; }
        else checks.push(`파일 크기 정상: ${sizeMB.toFixed(2)} MB`);

        results.push({ type: 'asset', file: path.basename(assetFile), decision, checks });
    }

    const passCount   = results.filter(r => r.decision === 'PASS').length;
    const reviewCount = results.filter(r => r.decision === 'REVIEW').length;
    const rejectCount = results.filter(r => r.decision === 'REJECT').length;

    const report = `# 에셋 품질 보고서 (Asset Quality Report)

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 검사 항목: ${results.length}개 (Job ${jobFiles.length}개 + 생성 에셋 ${assetFiles.length}개)
- PASS: ${passCount} / REVIEW: ${reviewCount} / REJECT: ${rejectCount}

## 검사 결과

| 파일 | 유형 | 판정 | 사유 |
| --- | --- | --- | --- |
${results.map(r => `| ${r.file} | ${r.type} | **${r.decision}** | ${r.checks.join('; ')} |`).join('\n') || '| 없음 | - | - | - |'}

## 판정 기준

| 조건 | 판정 |
| --- | --- |
| negativePrompt 없음 | REJECT |
| 통짜 모델 금지 문구 없음 | REJECT |
| 200,000 tris 초과 | REJECT |
| 파일 크기 100MB 초과 | REJECT |
| poly budget 없음 | REVIEW |
| 100,000 tris 초과 | REVIEW |
| 100 tris 미만 | REVIEW |
| UE5 임포트 경로 없음 | REVIEW |
| 파일 크기 50MB 초과 | REVIEW |
| 모두 통과 | PASS |
`;
    safeWriteFile(getAssetQualityReportFile(projectPath), report);
    generatedFiles++;
    return { passCount, reviewCount, rejectCount, results, report };
}

// ═══════════════════════════════════════════════════════════════
// V72 § Image-to-3D Dry Run — runImageTo3DDryRun()
// ═══════════════════════════════════════════════════════════════

function runImageTo3DDryRun(projectPath) {
    ensureProjectFolders(projectPath || DEFAULT_PROJECT_PATH);
    ensureAssetSegmentationRules(projectPath);
    sendLog('Image-to-3D dry-run 시작...', 'info');

    // 1. 이미지 스캔 + intake 생성
    const intake = scanAssetInputImages(projectPath);

    // 2. 각 intake 파일에 대해 decomposition plan 생성
    const plans = [];
    const analyzedDir = getAssetAnalyzedDir(projectPath);
    let intakeFiles = [];
    try { intakeFiles = fs.readdirSync(analyzedDir).filter(f => f.endsWith('.intake.md')).map(f => path.join(analyzedDir, f)); } catch {}

    for (const intakeFile of intakeFiles) {
        const plan = generateImageDecompositionPlan(projectPath, intakeFile);
        if (plan.ok) plans.push(plan);
    }

    // 3. 각 decomposition plan에 대해 segment jobs 생성
    const allJobs = [];
    const plansDir = getAssetDecompositionPlansDir(projectPath);
    let decompositionFiles = [];
    try { decompositionFiles = fs.readdirSync(plansDir).filter(f => f.endsWith('.decomposition.md')).map(f => path.join(plansDir, f)); } catch {}

    for (const decomFile of decompositionFiles) {
        const result = generateSegment3DJobs(projectPath, decomFile);
        if (result.ok) allJobs.push(...result.jobs);
    }

    // 4. Quality Gate 실행
    const qualityResult = runAssetQualityGate(projectPath);

    // 5. PASS job → apply_candidates/world 승격 후보 생성
    const worldCandidatesDir = path.join(getApplyCandidatesDir(projectPath), 'world');
    if (!fs.existsSync(worldCandidatesDir)) fs.mkdirSync(worldCandidatesDir, { recursive: true });

    const promotedCandidates = [];
    const pendingDir = path.join(getAssetGenerationQueueDir(projectPath), 'pending');
    let jobFiles = [];
    try { jobFiles = fs.readdirSync(pendingDir).filter(f => f.endsWith('.job.md')); } catch {}

    for (const jobFile of jobFiles) {
        const jobPath = path.join(pendingDir, jobFile);
        const jobContent = fs.readFileSync(jobPath, 'utf8');
        const qr = qualityResult.results.find(r => r.file === jobFile);
        if (qr && qr.decision === 'REJECT') continue; // REJECT는 승격 불가

        const segIdMatch = jobContent.match(/segmentName:\s*(\S+)/);
        const segLabelMatch = jobContent.match(/segmentLabel:\s*(.+)/);
        const sourceMatch = jobContent.match(/sourceImage:\s*(.+)/);
        const uePathMatch = jobContent.match(/ueImportPath:\s*(.+)/);
        const polyMatch = jobContent.match(/targetPolyBudget:\s*(\d+)/);
        const formatMatch = jobContent.match(/outputFormat:\s*(\S+)/);
        const lodMatch = jobContent.match(/lodRequired:\s*(\S+)/);
        const naniteMatch = jobContent.match(/naniteRecommended:\s*(\S+)/);
        const collisionMatch = jobContent.match(/collision:\s*(.+)/);

        const segId = segIdMatch ? segIdMatch[1].trim() : jobFile.replace('.job.md', '');
        const segLabel = segLabelMatch ? segLabelMatch[1].trim() : segId;
        const candidateFile = path.join(worldCandidatesDir, `${segId}_import.candidate.md`);

        const candidateContent = `# 3D 에셋 임포트 후보 — ${segLabel}

- 생성 시각: ${new Date().toLocaleString('ko-KR')}
- 분류: world
- 원본 이미지: ${sourceMatch ? sourceMatch[1].trim() : '알 수 없음'}
- 분해된 파트: ${segId}
- 파트 이름: ${segLabel}
- 3D 결과물 예상 경로: generated_assets/${segId}.${formatMatch ? formatMatch[1].trim() : 'fbx'}
- UE5 추천 임포트 경로: ${uePathMatch ? uePathMatch[1].trim() : 'Content/Meshes/World'}
- 권장 스케일: 1.0 (1 UE unit = 1 cm)
- 권장 Poly Budget: ${polyMatch ? polyMatch[1] : '미지정'} tris
- 충돌 설정: ${collisionMatch ? collisionMatch[1].trim() : '필요'}
- LOD 필요 여부: ${lodMatch ? lodMatch[1].trim() : '아니오'}
- Nanite 권장: ${naniteMatch ? naniteMatch[1].trim() : '아니오'}
- 머티리얼 기준: PBR (BaseColor, Normal, ORM)
- 실제 모델 파일 존재: 아니오 (dry-run — 3D 생성 미실행)
- 실제 적용 여부: false
- allowRealApply 필요: true (Content 복사 시)
- 품질 검사 결과: ${qr ? qr.decision : 'PASS'}
- dryRun: true

## 적용 방법

1. 3D 생성 툴(${jobContent.match(/recommendedTool:\s*(.+)/)?.[1]?.trim() || 'Hunyuan3D'})으로 위 job 파일 기준 에셋 생성
2. 결과물을 generated_assets/${segId}.fbx 로 저장
3. allowRealApply=true 설정 후 promoteCandidateToProject() 실행
4. UE5에서 ${uePathMatch ? uePathMatch[1].trim() : 'Content/Meshes/World'}/ 에 임포트

## 주의

- 실제 UE5 Content 복사는 allowRealApply=true일 때만 허용
- 현재 dry-run 상태 — 실제 파일 생성/복사 없음
`;
        safeWriteFile(candidateFile, candidateContent + buildKnowledgeContextSection('3D asset world ' + segLabel));
        generatedFiles++;
        promotedCandidates.push({ candidateFile, segId, decision: qr ? qr.decision : 'PASS' });
    }

    const summary = {
        ok: true,
        dryRun: true,
        imageCount: intake.count,
        intakeCount: intakeFiles.length,
        planCount: plans.length,
        jobCount: allJobs.length,
        qualityPass: qualityResult.passCount,
        qualityReview: qualityResult.reviewCount,
        qualityReject: qualityResult.rejectCount,
        candidateCount: promotedCandidates.length
    };
    sendLog(`Image-to-3D dry-run 완료: 이미지 ${intake.count}개 → Job ${allJobs.length}개 → 후보 ${promotedCandidates.length}개`, 'success');
    return summary;
}

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('start-agents', () => startAgents());
ipcMain.handle('stop-agents', () => stopAgents());
ipcMain.handle('get-status', () => ({ isRunning, cycleCount, completedTasks, generatedFiles }));
ipcMain.handle('open-project', (_, p) => shell.openPath(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('read-todo', (_, p) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    const f = getTodoFile(projectPath);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '# todo.md\n\n- [ ] 🔴 [전체] 첫 번째 태스크를 입력하세요\n';
});
ipcMain.handle('read-done', (_, p) => {
    const f = getDoneFile(p || DEFAULT_PROJECT_PATH);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('save-todo', (_, p, content) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    safeWriteFile(getTodoFile(projectPath), content);
    return true;
});
ipcMain.handle('read-generated-tasks', (_, p) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    const f = getGeneratedTasksFile(projectPath);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('approve-generated-tasks', (_, p) => {
    const result = approveGeneratedTasks(p || DEFAULT_PROJECT_PATH);
    sendLog(`PM 승인 처리: ${result.approvedCount}개 todo.md 추가`, result.approvedCount ? 'success' : 'info');
    return result;
});
ipcMain.handle('analyze-project', (_, p) => {
    const config = { ...loadConfig(), projectPath: p || loadConfig().projectPath || DEFAULT_PROJECT_PATH };
    const result = analyzeProject(config);
    sendLog(`프로젝트 자동 분석 갱신: reports/project_status.md (${result.progress}%)`, 'success');
    return result.report;
});
ipcMain.handle('read-project-report', (_, p) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    const reportFile = getProjectReportFile(projectPath);
    const statusFile = getProjectStatusFile(projectPath);
    const f = fs.existsSync(reportFile) ? reportFile : statusFile;
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('read-pinned-knowledge', (_, p) => loadPinnedKnowledge(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('save-pinned-knowledge', (_, p, items) => savePinnedKnowledge(p || DEFAULT_PROJECT_PATH, items));
ipcMain.handle('detect-duplicate-task', (_, p, text) => detectDuplicateTask(p || DEFAULT_PROJECT_PATH, text || ''));
ipcMain.handle('read-review-summary', (_, p) => getReviewSummary(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('read-apply-candidates', (_, p) => getApplyCandidateSummary(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('list-sprints', (_, p) => listSprints(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('read-current-sprint', (_, p) => readCurrentSprint(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('create-sprint', (_, p, selectedTasks) => {
    const sprint = createSprint(p || DEFAULT_PROJECT_PATH, selectedTasks || []);
    sendLog(`PM 스프린트 생성: sprint_${String(sprint.id).padStart(3, '0')}.md`, 'success');
    return sprint;
});
ipcMain.handle('analyze-build-logs', (_, p) => {
    const result = analyzeBuildLogs(p || DEFAULT_PROJECT_PATH);
    sendLog(`빌드 로그 분석 완료: ${result.issues.length}개 이슈`, result.issues.length ? 'warn' : 'success');
    return result.report;
});
ipcMain.handle('read-build-diagnostics', (_, p) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    return readTextIfExists(getBuildDiagnosticsFile(projectPath));
});
ipcMain.handle('generate-vertical-slice-plan', (_, p) => {
    const report = generateVerticalSlicePlan(p || DEFAULT_PROJECT_PATH);
    sendLog('수직 슬라이스 마스터 플랜 생성 완료', 'success');
    return report;
});
ipcMain.handle('read-vertical-slice-plan', (_, p) => {
    const projectPath = p || DEFAULT_PROJECT_PATH;
    ensureProjectFolders(projectPath);
    return readTextIfExists(getVerticalSlicePlanFile(projectPath));
});
ipcMain.handle('generate-vertical-slice-status', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = analyzeVerticalSliceStatus(projectPath);
    sendLog(`수직 슬라이스 달성률 분석 완료: ${result.percent}%`, 'success');
    return result.report;
});
ipcMain.handle('read-vertical-slice-status', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    ensureProjectFolders(projectPath);
    return readTextIfExists(getVerticalSliceStatusFile(projectPath));
});
ipcMain.handle('generate-game-state', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = analyzeGameState(projectPath);
    sendLog(`게임 상태 분석 완료: 기능 진행률 ${result.featureProgress}%`, 'success');
    return result.report;
});
ipcMain.handle('read-game-state', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    ensureProjectFolders(projectPath);
    return readTextIfExists(getGameStateFile(projectPath));
});
ipcMain.handle('generate-command-center', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generateCommandCenter(projectPath);
    sendLog(`지휘 센터 분석 완료: 추천 ${result.recommendations.length}개`, 'success');
    return result.report;
});
ipcMain.handle('read-command-center', (_, p) => {
    const file = resolveReadableReportFile(p || DEFAULT_PROJECT_PATH, 'command_center.md');
    return readTextIfExists(file);
});
ipcMain.handle('generate-pm-validation', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generatePmValidation(projectPath);
    sendLog(`PM 판단 검증 완료: ${result.reliability}`, result.reliability === '통과' ? 'success' : result.reliability === '주의' ? 'warn' : 'error');
    return result;
});
ipcMain.handle('read-pm-validation', (_, p) => {
    const file = resolveReadableReportFile(p || DEFAULT_PROJECT_PATH, 'pm_validation.md');
    return readTextIfExists(file);
});
ipcMain.handle('approve-command-center-tasks', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = approveCommandCenterTasks(projectPath);
    sendLog(`지휘 센터 후보 승인: ${result.approvedCount}개 추가, ${result.skippedCount}개 중복 제외`, 'success');
    return result;
});
ipcMain.handle('parse-command-recommendations', (_, p) => parseCommandCenterRecommendations(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('approve-selected-command-tasks', (_, p, ids) => approveSelectedCommandTasks(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), ids || []));
ipcMain.handle('generate-patch-candidates', (_, p) => generatePatchCandidates(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-patch-candidates', (_, p) => getPatchCandidateSummary(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('generate-traceability', (_, p) => collectTraceability(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-traceability', (_, p) => {
    const file = resolveReadableReportFile(p || DEFAULT_PROJECT_PATH, 'traceability.md');
    return readTextIfExists(file);
});
ipcMain.handle('generate-play-loop-template', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generatePlayLoopTemplate(projectPath);
    sendLog(`플레이 루프 템플릿 생성: ${result.implemented}/${result.total}단계 구현, 추정 플레이시간 ${result.estimatedPlayable}분`, 'success');
    return result.report;
});
ipcMain.handle('read-play-loop-template', (_, p) => {
    const file = resolveReadableReportFile(p || DEFAULT_PROJECT_PATH, 'play_loop_template.md');
    return readTextIfExists(file);
});
ipcMain.handle('generate-code-candidates', (_, p) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const results = generateAllCodeCandidates(projectPath);
    sendLog(`코드/BP 적용 후보 생성: ${results.length}개`, 'success');
    return results;
});
ipcMain.handle('generate-code-candidate', (_, p, templateId) => {
    const projectPath = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generateCodeApplyCandidate(projectPath, templateId);
    if (result) sendLog(`코드 적용 후보 생성: ${result.targetPath}`, 'success');
    return result;
});
ipcMain.handle('list-code-templates', () => SCHOOL_CODE_TEMPLATES.map(({ id, label, category, description, targetPath }) => ({ id, label, category, description, targetPath })));
ipcMain.handle('register-apply-candidate', (_, p, candidateFile) => registerApplyCandidateToQueue(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), candidateFile || ''));
ipcMain.handle('read-apply-queue', (_, p) => getApplyQueueSummary(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('create-apply-review', (_, p, queueFile) => createApplyReview(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), queueFile || ''));
ipcMain.handle('read-apply-reviews', (_, p) => getApplyReviewSummary(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('generate-apply-review-workflow-report', (_, p) => generateApplyReviewWorkflowReport(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('list-approved-apply-candidates', (_, p) => listApprovedApplyCandidates(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('create-ue5-import-manifest', (_, p, candidateFile) => createUE5ImportManifest(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), candidateFile || ''));
ipcMain.handle('create-ue5-import-manifests-from-approved', (_, p) => createUE5ImportManifestsFromApproved(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-ue5-import-manifests', (_, p) => readUE5ImportManifests(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('generate-ue5-import-manifest-report', (_, p) => generateUE5ImportManifestReport(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('approve-apply-queue', (_, p, queueFile) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    return moveApplyQueueItem(pp, queueFile || '', 'approved');
});
ipcMain.handle('reject-apply-queue', (_, p, queueFile) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    return moveApplyQueueItem(pp, queueFile || '', 'rejected');
});
ipcMain.handle('run-apply-dry-run', (_, p, queueFile) => runApplyDryRun(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), queueFile || ''));
// ── V51-V54 IPC 핸들러 ─────────────────────────────────────────────────────
ipcMain.handle('promote-candidate-to-project', (_, p, candidateFile) => promoteCandidateToProject(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), candidateFile || ''));
ipcMain.handle('generate-implementation-trace', (_, p) => generateImplementationTrace(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-implementation-trace', (_, p) => {
    const f = getImplementationTraceFile(getWritableProjectPath(p || DEFAULT_PROJECT_PATH));
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('generate-project-inventory', (_, p) => generateProjectInventory(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-project-inventory', (_, p) => {
    const f = getProjectInventoryFile(getWritableProjectPath(p || DEFAULT_PROJECT_PATH));
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('get-actual-only-progress', async (_, p) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generateProjectInventory(pp);
    const items = (result.systemRows || []).map(r => ({
        level: r.inProject ? 3 : (r.inCandidates ? 2 : 0)
    }));
    if (!items.length) return 0;
    return getActualOnlyProgress(items);
});
// ── V67-V72 IPC 핸들러: Image-to-3D Pipeline ─────────────────────────────────
ipcMain.handle('scan-asset-input-images', (_, p) => scanAssetInputImages(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('generate-image-decomposition-plan', (_, p, intakeFile) => generateImageDecompositionPlan(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), intakeFile || ''));
ipcMain.handle('generate-segment-3d-jobs', (_, p, decompositionFile) => generateSegment3DJobs(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), decompositionFile || ''));
ipcMain.handle('run-asset-quality-gate', (_, p) => runAssetQualityGate(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('run-image-to-3d-dry-run', (_, p) => runImageTo3DDryRun(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('open-asset-images-folder', (_, p) => shell.openPath(path.join(getWritableProjectPath(p || DEFAULT_PROJECT_PATH), 'asset_inputs', 'images')));
ipcMain.handle('read-asset-quality-report', (_, p) => {
    const f = getAssetQualityReportFile(getWritableProjectPath(p || DEFAULT_PROJECT_PATH));
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('get-asset-pipeline-summary', (_, p) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    ensureProjectFolders(pp);
    const imagesDir = path.join(getAssetInputsDir(pp), 'images');
    const analyzedDir = getAssetAnalyzedDir(pp);
    const plansDir = getAssetDecompositionPlansDir(pp);
    const pendingDir = path.join(getAssetGenerationQueueDir(pp), 'pending');
    const generatedDir = getGeneratedAssetsDir(pp);
    const worldCandidatesDir = path.join(getApplyCandidatesDir(pp), 'world');
    const safeCount = (dir, ext) => { try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length; } catch { return 0; } };
    const qr = (() => { const f = getAssetQualityReportFile(pp); if (!fs.existsSync(f)) return { passCount: 0, reviewCount: 0, rejectCount: 0 }; const t = fs.readFileSync(f, 'utf8'); const m = t.match(/PASS:\s*(\d+).*?REVIEW:\s*(\d+).*?REJECT:\s*(\d+)/s); return m ? { passCount: +m[1], reviewCount: +m[2], rejectCount: +m[3] } : { passCount: 0, reviewCount: 0, rejectCount: 0 }; })();
    return {
        imageCount:     safeCount(imagesDir, '.png') + safeCount(imagesDir, '.jpg') + safeCount(imagesDir, '.jpeg') + safeCount(imagesDir, '.webp'),
        intakeCount:    safeCount(analyzedDir, '.intake.md'),
        planCount:      safeCount(plansDir, '.decomposition.md'),
        jobCount:       safeCount(pendingDir, '.job.md'),
        generatedCount: safeCount(generatedDir, '.fbx') + safeCount(generatedDir, '.glb') + safeCount(generatedDir, '.obj'),
        candidateCount: safeCount(worldCandidatesDir, '.candidate.md'),
        ...qr
    };
});
// ── V62-V65 IPC 핸들러 ────────────────────────────────────────────────────────
ipcMain.handle('scan-existing-project', (_, p) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = scanExistingProject(pp);
    sendLog(`기존 프로젝트 스캔 완료: 시스템 ${result.implementedSystems.length}개 감지, 클래스 ${result.allClassNames.length}개`, 'success');
    return result;
});
ipcMain.handle('read-existing-project-inventory', (_, p) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const f = getExistingProjectInventoryFile(pp);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('find-existing-implementation', (_, p, systemName) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    return findExistingImplementation(pp, systemName || '');
});
ipcMain.handle('validate-candidate-against-project', (_, p, candidateFile) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    return validateCandidateAgainstProject(pp, candidateFile || '');
});
ipcMain.handle('generate-extension-candidate', (_, p, systemName, spec) => {
    const pp = getWritableProjectPath(p || DEFAULT_PROJECT_PATH);
    const result = generateExtensionCandidate(pp, systemName || '', spec || {});
    if (result.ok) sendLog(`확장 후보 생성: ${result.systemName} → ${result.existingFile}`, 'success');
    else sendLog(`확장 후보 생성 실패: ${result.reason}`, 'warn');
    return result;
});

// ═══════════════════════════════════════════════════════════════
// V73 § Knowledge Agent — Obsidian Vault 연동
// ═══════════════════════════════════════════════════════════════

const VAULT_ALLOWED_FOLDERS = ['Projects', 'Knowledge', 'Worldbuilding', 'UE5', '3DAssets', 'Tasks'];
const VAULT_DEFAULT_FOLDER = 'Knowledge';

function assertVaultPath(vaultPath, notePath) {
    const rel = path.relative(vaultPath, path.resolve(vaultPath, notePath));
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`경로 이탈 감지: ${notePath}`);
    }
}

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
                    // YAML array: [ue5, worldbuilding, quest] — no quotes
                    tags.push(...raw.slice(1, -1).split(',').map(t => t.trim()).filter(Boolean));
                }
            } else {
                tags.push(...raw.split(',').map(t => t.trim()).filter(Boolean));
            }
        }
        const tagList = fmMatch[1].match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
        if (tagList && !tagLine) {
            tags.push(...tagList[1].split('\n').map(l => l.replace(/^\s+-\s+/, '').trim()).filter(Boolean));
        }
    }
    const links = [];
    const linkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let lm;
    while ((lm = linkRe.exec(content)) !== null) links.push(lm[1].trim());
    return { title, tags: [...new Set(tags)], links: [...new Set(links)] };
}

function getVaultStatus(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const exists = fs.existsSync(vp);
    if (!exists) return { exists: false, vaultPath: vp, warning: 'Vault 경로가 존재하지 않습니다. 설정에서 경로를 확인하세요.', noteCount: 0, folderCount: 0 };
    let noteCount = 0, folderCount = 0;
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.isDirectory()) { folderCount++; walk(path.join(dir, e.name)); }
            else if (e.name.endsWith('.md')) noteCount++;
        }
    }
    walk(vp);
    return { exists: true, vaultPath: vp, noteCount, folderCount, warning: null };
}

function scanVault(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!fs.existsSync(vp)) return { ok: false, error: 'Vault 없음', index: [] };
    const index = [];
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.md')) continue;
            const rel = path.relative(vp, full).replace(/\\/g, '/');
            let content = '';
            try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
            const meta = extractVaultMeta(content, rel);
            const stat = fs.statSync(full);
            index.push({ path: rel, title: meta.title, tags: meta.tags, links: meta.links, mtime: stat.mtimeMs, size: stat.size });
        }
    }
    walk(vp);
    index.sort((a, b) => b.mtime - a.mtime);
    return { ok: true, index, noteCount: index.length };
}

function searchVault(vaultPath, query) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!query || !query.trim()) return { ok: false, error: '검색어 없음', results: [] };
    const q = query.toLowerCase().trim();
    const { ok, index } = scanVault(vp);
    if (!ok) return { ok: false, error: 'Vault 없음', results: [] };
    const results = [];
    for (const note of index) {
        const titleMatch = note.title.toLowerCase().includes(q);
        const tagMatch = note.tags.some(t => t.toLowerCase().includes(q));
        let contentMatch = false, snippet = '';
        try {
            const content = fs.readFileSync(path.join(vp, note.path), 'utf8');
            const idx = content.toLowerCase().indexOf(q);
            if (idx !== -1) {
                contentMatch = true;
                snippet = content.slice(Math.max(0, idx - 60), idx + 120).replace(/\n/g, ' ').trim();
            }
        } catch {}
        if (titleMatch || tagMatch || contentMatch) {
            const score = (titleMatch ? 3 : 0) + (tagMatch ? 2 : 0) + (contentMatch ? 1 : 0);
            results.push({ ...note, score, snippet, titleMatch, tagMatch, contentMatch });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return { ok: true, query, results, total: results.length };
}

function readVaultNote(vaultPath, notePath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    assertVaultPath(vp, notePath);
    const full = path.join(vp, notePath);
    if (!fs.existsSync(full)) return { ok: false, error: '노트 없음', path: notePath };
    const content = fs.readFileSync(full, 'utf8');
    const meta = extractVaultMeta(content, notePath);
    const stat = fs.statSync(full);
    return { ok: true, path: notePath, content, title: meta.title, tags: meta.tags, links: meta.links, mtime: stat.mtimeMs };
}

function getRelatedNotes(vaultPath, topic) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!topic) return { ok: false, results: [] };
    const { ok, index } = scanVault(vp);
    if (!ok) return { ok: false, results: [] };
    const q = topic.toLowerCase().trim();
    const scored = index.map(note => {
        let score = 0;
        if (note.title.toLowerCase().includes(q)) score += 4;
        if (note.tags.some(t => t.toLowerCase().includes(q))) score += 3;
        if (note.links.some(l => l.toLowerCase().includes(q))) score += 2;
        return { ...note, score };
    }).filter(n => n.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
    return { ok: true, topic, results: scored };
}

function createVaultNote(vaultPath, folder, title, content, tags) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!fs.existsSync(vp)) return { ok: false, error: 'Vault 없음' };

    const targetFolder = folder && folder.trim() ? folder.trim() : VAULT_DEFAULT_FOLDER;
    const isAllowed = VAULT_ALLOWED_FOLDERS.includes(targetFolder);
    const warning = isAllowed ? null : `루트 또는 비허용 폴더 저장 — REVIEW 권장 폴더: ${VAULT_ALLOWED_FOLDERS.join(', ')}`;

    const safeTitle = (title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_');
    const relPath = isAllowed ? `${targetFolder}/${safeTitle}.md` : `${safeTitle}.md`;
    assertVaultPath(vp, relPath);
    const full = path.join(vp, relPath);

    if (fs.existsSync(full)) return { ok: false, error: '중복 노트', path: relPath };

    const tagArr = Array.isArray(tags) ? tags : (tags ? [tags] : []);
    const fm = tagArr.length ? `---\ntags: [${tagArr.join(', ')}]\n---\n\n` : '';
    const body = `${fm}# ${safeTitle}\n\n${content || ''}`;

    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, body, 'utf8');
    return { ok: true, path: relPath, title: safeTitle, tags: tagArr, warning };
}

function updateVaultNote(vaultPath, notePath, content, overwrite) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    assertVaultPath(vp, notePath);
    const full = path.join(vp, notePath);
    if (!fs.existsSync(full)) return { ok: false, error: '노트 없음', path: notePath };

    if (overwrite === true) {
        fs.writeFileSync(full, content || '', 'utf8');
        return { ok: true, path: notePath, mode: 'overwrite' };
    }
    const existing = fs.readFileSync(full, 'utf8');
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const appended = `${existing}\n\n<!-- appended ${timestamp} -->\n${content || ''}`;
    fs.writeFileSync(full, appended, 'utf8');
    return { ok: true, path: notePath, mode: 'append' };
}

function getRecentNotes(vaultPath, limit) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const { ok, index } = scanVault(vp);
    if (!ok) return { ok: false, notes: [] };
    const n = Math.min(Number(limit) || 10, 50);
    return { ok: true, notes: index.slice(0, n) };
}

function getVaultSummary(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const status = getVaultStatus(vp);
    if (!status.exists) return { ok: false, warning: status.warning };
    const { ok, index } = scanVault(vp);
    if (!ok) return { ok: false, warning: 'Vault 스캔 실패' };
    const allTags = {};
    const allLinks = {};
    for (const note of index) {
        for (const t of note.tags) allTags[t] = (allTags[t] || 0) + 1;
        for (const l of note.links) allLinks[l] = (allLinks[l] || 0) + 1;
    }
    const topTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));
    const topLinks = Object.entries(allLinks).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([link, count]) => ({ link, count }));
    const recent = index.slice(0, 5);
    return {
        ok: true, vaultPath: vp,
        noteCount: index.length,
        folderCount: status.folderCount,
        tagCount: Object.keys(allTags).length,
        linkCount: Object.keys(allLinks).length,
        topTags, topLinks, recent,
        allowedFolders: VAULT_ALLOWED_FOLDERS
    };
}

// ═══════════════════════════════════════════════════════════════
// V74 § Knowledge Agent — 자동 기억 시스템
// ═══════════════════════════════════════════════════════════════

function getAgentMemoryFile(vaultPath) {
    return path.join(vaultPath || DEFAULT_VAULT_PATH, 'Knowledge', 'Agent Memory.md');
}
function getProjectDecisionsFile(vaultPath) {
    return path.join(vaultPath || DEFAULT_VAULT_PATH, 'Knowledge', 'Project Decisions.md');
}
function getKnowledgeSummaryFile(vaultPath) {
    return path.join(vaultPath || DEFAULT_VAULT_PATH, 'Knowledge', 'knowledge_summary.md');
}

function ensureVaultFolder(vaultPath, folder) {
    const dir = path.join(vaultPath || DEFAULT_VAULT_PATH, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildKnowledgeContext(vaultPath, query) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const empty = { ok: false, query, refs: [], tags: [], links: [], summary: 'Vault 없음 또는 검색 실패', noteCount: 0 };
    try {
        if (!query || !query.trim()) return empty;
        const sr = searchVault(vp, query);
        if (!sr.ok || !sr.results.length) {
            // 쿼리를 단어별로 분해해 재시도
            const words = query.trim().split(/\s+/).filter(w => w.length >= 2);
            const combined = [];
            for (const w of words) {
                const r = searchVault(vp, w);
                if (r.ok) combined.push(...r.results);
            }
            const seen = new Set();
            const deduped = combined.filter(n => { if (seen.has(n.path)) return false; seen.add(n.path); return true; });
            deduped.sort((a, b) => (b.score || 0) - (a.score || 0));
            const refs = deduped.slice(0, 5).map(n => ({ path: n.path, title: n.title, score: n.score || 0, tags: n.tags, links: n.links }));
            const allTags = [...new Set(refs.flatMap(r => r.tags))];
            const allLinks = [...new Set(refs.flatMap(r => r.links))];
            return { ok: refs.length > 0, query, refs, tags: allTags, links: allLinks, summary: `관련 문서 ${refs.length}개 (단어 분해 검색)`, noteCount: refs.length };
        }
        const top = sr.results.slice(0, 5);
        const refs = top.map(n => ({ path: n.path, title: n.title, score: n.score, tags: n.tags, links: n.links, snippet: n.snippet || '' }));
        const allTags = [...new Set(refs.flatMap(r => r.tags))];
        const allLinks = [...new Set(refs.flatMap(r => r.links))];
        const summary = `관련 문서 ${refs.length}개 발견. 주요 태그: ${allTags.slice(0, 5).join(', ') || '없음'}. 주요 링크: ${allLinks.slice(0, 5).join(', ') || '없음'}.`;
        return { ok: true, query, refs, tags: allTags, links: allLinks, summary, noteCount: refs.length };
    } catch (e) {
        return { ...empty, error: e.message };
    }
}

function recordAgentMemory(vaultPath, entry) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!fs.existsSync(vp)) return { ok: false, error: 'Vault 없음' };
    ensureVaultFolder(vp, 'Knowledge');
    const file = getAgentMemoryFile(vp);
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const block = `\n## ${timestamp}\n\n**작업:** ${entry.task || '—'}\n**사용 문서:** ${(entry.refs || []).join(', ') || '없음'}\n**결정 사항:** ${entry.decision || '—'}\n**결과:** ${entry.result || '—'}\n\n---\n`;
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `# Agent Memory\n\nToribatAgent 자동 기억 저장소. 삭제 금지.\n\n---\n${block}`, 'utf8');
    } else {
        fs.appendFileSync(file, block, 'utf8');
    }
    return { ok: true, file: path.relative(vp, file), timestamp };
}

function recordDecision(vaultPath, decision, detail) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!fs.existsSync(vp)) return { ok: false, error: 'Vault 없음' };
    ensureVaultFolder(vp, 'Knowledge');
    const file = getProjectDecisionsFile(vp);
    // 중복 방지: 동일 결정 텍스트가 이미 있으면 스킵
    if (fs.existsSync(file)) {
        const existing = fs.readFileSync(file, 'utf8');
        if (existing.includes(decision.trim())) return { ok: false, reason: '중복 결정', decision };
    }
    const timestamp = new Date().toISOString().slice(0, 10);
    const block = `\n## ${decision}\n\n- 날짜: ${timestamp}\n- 상세: ${detail || '—'}\n\n---\n`;
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `# Project Decisions\n\nToribatAgent 프로젝트 주요 결정 기록. 삭제 금지.\n\n---\n${block}`, 'utf8');
    } else {
        fs.appendFileSync(file, block, 'utf8');
    }
    return { ok: true, file: path.relative(vp, file), decision };
}

function getAgentMemory(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const file = getAgentMemoryFile(vp);
    if (!fs.existsSync(file)) return { ok: false, content: '', error: '기억 파일 없음' };
    return { ok: true, content: fs.readFileSync(file, 'utf8') };
}

function getProjectDecisions(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    const file = getProjectDecisionsFile(vp);
    if (!fs.existsSync(file)) return { ok: false, content: '', error: '결정 파일 없음' };
    return { ok: true, content: fs.readFileSync(file, 'utf8') };
}

function generateKnowledgeSummary(vaultPath) {
    const vp = vaultPath || DEFAULT_VAULT_PATH;
    if (!fs.existsSync(vp)) return { ok: false, error: 'Vault 없음' };
    ensureVaultFolder(vp, 'Knowledge');
    const summary = getVaultSummary(vp);
    if (!summary.ok) return { ok: false, error: 'Vault 요약 실패' };
    const memory = getAgentMemory(vp);
    const decisions = getProjectDecisions(vp);
    const recentWork = (memory.content || '').split('## ').filter(s => s.trim()).slice(-5)
        .map(s => '- ' + s.split('\n')[0].trim()).join('\n') || '없음';
    const decisionList = (decisions.content || '').split('## ').filter(s => s.trim() && !s.startsWith('Project'))
        .map(s => '- ' + s.split('\n')[0].trim()).join('\n') || '없음';
    const topProjects = (summary.topLinks || []).slice(0, 5).map(l => `- [[${l.link}]]`).join('\n') || '없음';
    const topTags = (summary.topTags || []).slice(0, 10).map(t => `#${t.tag}`).join(' ') || '없음';
    const ts = new Date().toLocaleString('ko-KR');
    const content = `# Knowledge Summary\n\n생성: ${ts}\n\n## 주요 프로젝트\n${topProjects}\n\n## 주요 태그\n${topTags}\n\n## 주요 결정\n${decisionList}\n\n## 최근 작업\n${recentWork}\n\n## Vault 통계\n- 노트 수: ${summary.noteCount}\n- 폴더 수: ${summary.folderCount}\n- 태그 수: ${summary.tagCount}\n- 링크 수: ${summary.linkCount}\n`;
    const file = getKnowledgeSummaryFile(vp);
    fs.writeFileSync(file, content, 'utf8');
    return { ok: true, file: path.relative(vp, file), content };
}

function buildKnowledgeContextSection(query) {
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        const ctx = buildKnowledgeContext(vp, query);
        if (!ctx.ok || !ctx.refs.length) return '';
        const refLines = ctx.refs.map(r => `  - [${r.title}](${r.path}) — score ${r.score}`).join('\n');
        return `\n## Knowledge References\n\n- 검색 쿼리: ${ctx.query}\n- 참고 문서 수: ${ctx.refs.length}\n- 참고 태그: ${ctx.tags.slice(0, 8).join(', ') || '없음'}\n- 관련 링크: ${ctx.links.slice(0, 8).join(', ') || '없음'}\n\n### 참고 문서\n${refLines}\n\n### 요약\n${ctx.summary}\n`;
    } catch { return ''; }
}

// ── V73 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('vault-status',      (_, p) => getVaultStatus(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));
ipcMain.handle('scan-vault',        (_, p) => scanVault(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));
ipcMain.handle('search-vault',      (_, p, query) => searchVault(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, query || ''));
ipcMain.handle('read-vault-note',   (_, p, notePath) => readVaultNote(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, notePath || ''));
ipcMain.handle('get-related-notes', (_, p, topic) => getRelatedNotes(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, topic || ''));
ipcMain.handle('create-vault-note', (_, p, folder, title, content, tags) => createVaultNote(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, folder, title, content, tags));
ipcMain.handle('update-vault-note', (_, p, notePath, content, overwrite) => updateVaultNote(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, notePath, content, overwrite));
ipcMain.handle('get-recent-notes',  (_, p, limit) => getRecentNotes(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, limit));
ipcMain.handle('get-vault-summary', (_, p) => getVaultSummary(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));

// ── V75 3D Inspector — 읽기 전용 에셋 뷰어 ──────────────────────
/**
 * generated_assets 디렉토리에서 GLB/GLTF/OBJ 파일 목록 반환
 */
function listGeneratedAssets(projectPath) {
    const dir = getGeneratedAssetsDir(projectPath);
    if (!fs.existsSync(dir)) return { ok: true, files: [] };
    try {
        const files = fs.readdirSync(dir)
            .filter(f => /\.(glb|gltf|obj)$/i.test(f))
            .map(f => {
                const full = path.join(dir, f);
                const st = fs.statSync(full);
                return { name: f, path: full, ext: path.extname(f).toLowerCase().slice(1), size: st.size, mtime: st.mtime.toISOString() };
            });
        return { ok: true, files };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * 3D 파일 읽기 — generated_assets 범위 외 경로 차단 (읽기 전용)
 */
function read3dFile(filePath, projectPath) {
    const allowedDir = path.resolve(getGeneratedAssetsDir(projectPath || DEFAULT_PROJECT_PATH));
    const resolved   = path.resolve(filePath || '');
    if (!resolved.startsWith(allowedDir + path.sep) && resolved !== allowedDir) {
        return { ok: false, error: 'generated_assets 외부 경로 접근 차단' };
    }
    if (!fs.existsSync(resolved)) return { ok: false, error: '파일 없음' };
    const ext = path.extname(resolved).toLowerCase().slice(1);
    if (!['glb', 'gltf', 'obj'].includes(ext)) {
        return { ok: false, error: `지원하지 않는 형식: ${ext} (지원: glb, gltf, obj)` };
    }
    try {
        const stat = fs.statSync(resolved);
        const data = fs.readFileSync(resolved).toString('base64');
        return { ok: true, name: path.basename(resolved), ext, size: stat.size, mtime: stat.mtime.toISOString(), data };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ══════════════════════════════════════════════════════════════
// V78 — 3D Inspector 판정 시스템 + Apply Candidate 연결
// ══════════════════════════════════════════════════════════════

function get3DInspectionDir(projectPath) {
    return path.join(projectPath, 'inspections', '3d_assets');
}
function get3DInspectionReportPath(projectPath) {
    return path.join(projectPath, 'reports', '3d_inspection_report.md');
}

function create3DInspectionRecord(projectPath, inspectionData) {
    const inspDir = get3DInspectionDir(projectPath);
    if (!fs.existsSync(inspDir)) fs.mkdirSync(inspDir, { recursive: true });
    const verdict = inspectionData.verdict || 'REVIEW';
    if (!['PASS', 'REVIEW', 'REJECT'].includes(verdict))
        return { ok: false, error: '유효하지 않은 verdict: ' + verdict };
    const assetName = (inspectionData.assetName || 'unknown').replace(/[^a-zA-Z0-9_\-.가-힣]/g, '_');
    const fileName  = assetName + '.inspection.md';
    const filePath  = path.join(inspDir, fileName);
    const now = new Date().toISOString();
    const lines = [
        `# 3D Asset Inspection: ${assetName}`, '',
        '## 기본 정보',
        `- assetName: ${assetName}`,
        `- sourceFile: ${inspectionData.sourceFile || ''}`,
        `- filePath: ${inspectionData.filePath || ''}`,
        `- fileSizeMB: ${inspectionData.fileSizeMB || 0}`,
        `- extension: ${inspectionData.extension || ''}`, '',
        '## 모델 정보',
        `- triangleCount: ${inspectionData.triangleCount || 0}`,
        `- vertexCount: ${inspectionData.vertexCount || 0}`,
        `- materialCount: ${inspectionData.materialCount || 0}`,
        `- textureDetected: ${inspectionData.textureDetected ? 'true' : 'false'}`, '',
        '## 검사 항목',
        `- wireframeChecked: ${inspectionData.wireframeChecked ? 'true' : 'false'}`,
        `- scaleChecked: ${inspectionData.scaleChecked ? 'true' : 'false'}`,
        `- pivotChecked: ${inspectionData.pivotChecked ? 'true' : 'false'}`,
        `- collisionNeeded: ${inspectionData.collisionNeeded ? 'true' : 'false'}`,
        `- lodNeeded: ${inspectionData.lodNeeded ? 'true' : 'false'}`,
        `- naniteRecommended: ${inspectionData.naniteRecommended ? 'true' : 'false'}`, '',
        '## UE5 임포트',
        `- ueImportPath: ${inspectionData.ueImportPath || ''}`, '',
        '## 판정 결과',
        `- verdict: ${verdict}`,
        `- reason: ${inspectionData.reason || ''}`, '',
        '## 기타',
        `- inspectedAt: ${now}`,
        `- inspectedBy: ${inspectionData.inspectedBy || 'ToribatAgent-V78'}`,
        `- notes: ${inspectionData.notes || ''}`,
    ];
    try {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        return { ok: true, filePath, fileName, assetName, verdict };
    } catch (e) { return { ok: false, error: e.message }; }
}

function list3DInspectionRecords(projectPath) {
    const inspDir = get3DInspectionDir(projectPath);
    if (!fs.existsSync(inspDir)) return { ok: true, records: [] };
    try {
        const records = fs.readdirSync(inspDir)
            .filter(f => f.endsWith('.inspection.md'))
            .map(f => {
                const fp = path.join(inspDir, f);
                const c  = fs.readFileSync(fp, 'utf8');
                const g  = (key) => { const m = c.match(new RegExp(`- ${key}: (.+)`)); return m ? m[1].trim() : ''; };
                return {
                    fileName: f, filePath: fp,
                    verdict:     g('verdict') || 'REVIEW',
                    assetName:   g('assetName'),
                    reason:      g('reason'),
                    fileSizeMB:  parseFloat(g('fileSizeMB')) || 0,
                    inspectedAt: g('inspectedAt')
                };
            })
            .sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt));
        return { ok: true, records };
    } catch (e) { return { ok: false, error: e.message, records: [] }; }
}

function read3DInspectionRecord(projectPath, inspectionFile) {
    const filePath = path.join(get3DInspectionDir(projectPath), path.basename(inspectionFile));
    if (!fs.existsSync(filePath)) return { ok: false, error: '검사 파일 없음: ' + inspectionFile };
    try {
        const c = fs.readFileSync(filePath, 'utf8');
        const g = (key) => { const m = c.match(new RegExp(`- ${key}: (.+)`)); return m ? m[1].trim() : ''; };
        return {
            ok: true, fileName: path.basename(filePath),
            assetName: g('assetName'), sourceFile: g('sourceFile'), filePath: g('filePath'),
            fileSizeMB: parseFloat(g('fileSizeMB')) || 0, extension: g('extension'),
            triangleCount: parseInt(g('triangleCount')) || 0, vertexCount: parseInt(g('vertexCount')) || 0,
            materialCount: parseInt(g('materialCount')) || 0, textureDetected: g('textureDetected') === 'true',
            wireframeChecked: g('wireframeChecked') === 'true', scaleChecked: g('scaleChecked') === 'true',
            pivotChecked: g('pivotChecked') === 'true', collisionNeeded: g('collisionNeeded') === 'true',
            lodNeeded: g('lodNeeded') === 'true', naniteRecommended: g('naniteRecommended') === 'true',
            ueImportPath: g('ueImportPath'), verdict: g('verdict'), reason: g('reason'),
            inspectedAt: g('inspectedAt'), inspectedBy: g('inspectedBy'), notes: g('notes'), raw: c
        };
    } catch (e) { return { ok: false, error: e.message }; }
}

function get3DInspectionSummary(projectPath) {
    const { records } = list3DInspectionRecords(projectPath);
    const counts = { PASS: 0, REVIEW: 0, REJECT: 0 };
    (records || []).forEach(r => { if (counts[r.verdict] !== undefined) counts[r.verdict]++; });
    return { ok: true, total: (records || []).length, ...counts, recent: (records || []).slice(0, 5) };
}

function generate3DInspectionReport(projectPath) {
    const { records } = list3DInspectionRecords(projectPath);
    const all      = records || [];
    const pass     = all.filter(r => r.verdict === 'PASS');
    const review   = all.filter(r => r.verdict === 'REVIEW');
    const reject   = all.filter(r => r.verdict === 'REJECT');
    const detailed = all.map(r => { const d = read3DInspectionRecord(projectPath, r.fileName); return d.ok ? d : r; });
    const bigFiles   = detailed.filter(r => (r.fileSizeMB || 0) > 100).sort((a,b) => (b.fileSizeMB||0)-(a.fileSizeMB||0));
    const lodList    = detailed.filter(r => r.lodNeeded    && r.verdict !== 'REJECT');
    const naniteList = detailed.filter(r => r.naniteRecommended && r.verdict !== 'REJECT');
    const candidates = detailed.filter(r => r.verdict === 'PASS' || r.verdict === 'REVIEW');
    const now = new Date().toLocaleString('ko-KR');
    const row = (l, v) => `| ${l} | ${v} |`;
    let md = `# 3D Asset Inspection Report\n생성: ${now}\n\n## 전체 통계\n| 항목 | 수 |\n|------|----|
${row('전체 검사', all.length)}
${row('PASS', pass.length)}
${row('REVIEW', review.length)}
${row('REJECT', reject.length)}
${row('Apply 후보', candidates.length)}

## 최근 검사 목록\n`;
    if (all.length === 0) md += '검사 기록 없음\n';
    else all.slice(0, 10).forEach(r => { md += `- [${r.verdict}] ${(r.assetName || r.fileName).replace('.inspection.md','')} — ${r.reason || '사유 없음'}\n`; });
    md += `\n## 큰 파일 목록 (100MB 초과)\n`;
    if (bigFiles.length === 0) md += '없음\n'; else bigFiles.forEach(r => { md += `- ${r.assetName || r.fileName} (${r.fileSizeMB}MB) [${r.verdict}]\n`; });
    md += `\n## LOD 필요 모델\n`;
    if (lodList.length === 0) md += '없음\n'; else lodList.forEach(r => { md += `- ${r.assetName || r.fileName} [${r.verdict}]\n`; });
    md += `\n## Nanite 추천 모델\n`;
    if (naniteList.length === 0) md += '없음\n'; else naniteList.forEach(r => { md += `- ${r.assetName || r.fileName} [${r.verdict}]\n`; });
    md += `\n## Apply 후보 모델 (PASS / REVIEW)\n`;
    if (candidates.length === 0) md += '없음\n'; else candidates.forEach(r => { md += `- [${r.verdict}] ${r.assetName || r.fileName} — ${r.ueImportPath || '경로 미지정'}\n`; });
    md += `\n## REJECT 사유 요약\n`;
    if (reject.length === 0) md += '없음\n'; else reject.forEach(r => { md += `- ${(r.assetName || r.fileName).replace('.inspection.md','')} — ${r.reason || '사유 없음'}\n`; });
    const reportPath = get3DInspectionReportPath(projectPath);
    if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    try {
        fs.writeFileSync(reportPath, md, 'utf8');
        return { ok: true, reportPath, total: all.length, PASS: pass.length, REVIEW: review.length, REJECT: reject.length };
    } catch (e) { return { ok: false, error: e.message }; }
}

function promoteInspectionToApplyCandidate(projectPath, inspectionFile) {
    const data = read3DInspectionRecord(projectPath, inspectionFile);
    if (!data.ok) return { ok: false, error: '검사 파일 읽기 실패: ' + (data.error || '') };
    if (data.verdict === 'REJECT') return { ok: false, error: 'REJECT 모델은 apply candidate로 승격 금지', verdict: 'REJECT' };
    const name  = (data.assetName || '').toLowerCase();
    const hint  = ((data.reason || '') + (data.ueImportPath || '')).toLowerCase();
    const wKeys = ['architecture','environment','modular','world','건물','환경','모듈','세계','배경'];
    const folder = wKeys.some(k => name.includes(k) || hint.includes(k)) ? 'apply_candidates/world' : 'apply_candidates/art';
    const dir = path.join(projectPath, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cName = (data.assetName || 'unknown').replace(/[^a-zA-Z0-9_\-.가-힣]/g, '_') + '_3d_candidate.md';
    const cPath = path.join(dir, cName);
    const now   = new Date().toISOString();
    const lines = [
        '# Apply Candidate (3D Asset)',
        `생성: ${now}`, '',
        '## 출처',
        `- source model file: ${data.sourceFile || data.filePath || ''}`,
        `- inspection file: ${path.basename(inspectionFile)}`,
        `- verdict: ${data.verdict}`,
        `- reason: ${data.reason || ''}`, '',
        '## UE5 임포트 정보',
        `- recommended UE import path: ${data.ueImportPath || '미지정'}`,
        `- collisionNeeded: ${data.collisionNeeded ? 'true' : 'false'}`,
        `- lodNeeded: ${data.lodNeeded ? 'true' : 'false'}`,
        `- naniteRecommended: ${data.naniteRecommended ? 'true' : 'false'}`, '',
        '## 모델 정보',
        `- file size: ${data.fileSizeMB}MB`,
        `- triangle count: ${data.triangleCount}`,
        `- vertex count: ${data.vertexCount}`,
        `- material count: ${data.materialCount}`, '',
        '## 적용 안전 규칙',
        '- actual content copy: false',
        '- allowRealApply required: true',
    ];
    try {
        fs.writeFileSync(cPath, lines.join('\n'), 'utf8');
        return { ok: true, candidatePath: cPath, candidateName: cName, targetFolder: folder, verdict: data.verdict };
    } catch (e) { return { ok: false, error: e.message }; }
}

// ── V75 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('list-generated-assets', (_, p) => listGeneratedAssets(getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));
ipcMain.handle('read-3d-file', (_, filePath, p) => read3dFile(filePath || '', getWritableProjectPath(p || DEFAULT_PROJECT_PATH)));

// ── V78 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('create-3d-inspection-record', (_, p, inspData) => {
    const result = create3DInspectionRecord(p || DEFAULT_PROJECT_PATH, inspData || {});
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        if (result.ok) {
            const v = result.verdict;
            recordAgentMemory(vp, {
                task: `3D 모델 검사 완료: ${inspData?.assetName || ''}`,
                decision: v + ' 판정',
                result: inspData?.reason || ''
            });
            recordDecision(vp, '3D 모델은 Inspector 판정 후 apply candidate로 승격한다', 'V78 워크플로');
            if (v === 'REJECT') recordDecision(vp, 'REJECT 모델은 UE5 후보로 승격하지 않는다', inspData?.reason || '품질 기준 미달');
        }
    } catch { /* 비중단 */ }
    return result;
});
ipcMain.handle('list-3d-inspection-records',  (_, p) => list3DInspectionRecords(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('read-3d-inspection-record',   (_, p, f) => read3DInspectionRecord(p || DEFAULT_PROJECT_PATH, f || ''));
ipcMain.handle('get-3d-inspection-summary',   (_, p) => get3DInspectionSummary(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('generate-3d-inspection-report', (_, p) => {
    const result = generate3DInspectionReport(p || DEFAULT_PROJECT_PATH);
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        if (result.ok) recordAgentMemory(vp, {
            task: '3D Inspection Report 생성',
            decision: `전체 ${result.total}건 보고서 생성`,
            result: `PASS:${result.PASS} REVIEW:${result.REVIEW} REJECT:${result.REJECT}`
        });
    } catch { /* 비중단 */ }
    return result;
});
ipcMain.handle('promote-3d-inspection-to-candidate', (_, p, f) => {
    const result = promoteInspectionToApplyCandidate(p || DEFAULT_PROJECT_PATH, f || '');
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        if (result.ok) {
            recordAgentMemory(vp, {
                task: `3D Apply Candidate 승격: ${path.basename(f || '')}`,
                decision: `${result.targetFolder}으로 승격`,
                result: result.candidateName || ''
            });
            recordDecision(vp, 'PASS/REVIEW 모델만 art/world 후보로 연결한다', 'V78 apply candidate 승격 워크플로');
        }
    } catch { /* 비중단 */ }
    return result;
});

// ══════════════════════════════════════════════════════════════
// V76 — 무료 로컬 3D 생성 AI Manager
// ══════════════════════════════════════════════════════════════

const ASSET_GENERATOR_CONFIG_FILE = path.join(APP_ROOT, 'asset_generator.config.json');

const DEFAULT_ASSET_GENERATOR_CONFIG = {
    enabled: false,
    defaultProvider: 'none',
    dryRun: true,
    outputDir: DEFAULT_PROJECT_PATH + '\\generated_assets',
    generatorTimeoutMinutes: 120,
    providers: {
        hunyuan3d:   { enabled: false, command: '', workingDir: '', outputDir: '', supportsImageTo3D: true,  supportsTextTo3D: true,  usesWsl2: true  },
        trellis:     { enabled: false, command: '', workingDir: '', outputDir: '', supportsImageTo3D: true,  supportsTextTo3D: true,  usesWsl2: true  },
        stableFast3D:{ enabled: false, command: '', workingDir: '', outputDir: '', supportsImageTo3D: true,  supportsTextTo3D: false, usesWsl2: false },
        blender:     { enabled: false, command: '', workingDir: '', outputDir: '', supportsImageTo3D: false, supportsTextTo3D: false, usesWsl2: false }
    },
    allowedOutputFormats: ['.glb', '.gltf', '.obj', '.fbx'],
    maxFileSizeMBWarning: 100,
    maxFileSizeMBReject: 300,
    allowExternalPaidApi: false
};

function loadAssetGeneratorConfig() {
    try {
        if (fs.existsSync(ASSET_GENERATOR_CONFIG_FILE)) {
            const raw = JSON.parse(fs.readFileSync(ASSET_GENERATOR_CONFIG_FILE, 'utf8'));
            // 항상 enabled/dryRun/allowExternalPaidApi 기본값 강제 적용
            return Object.assign({}, DEFAULT_ASSET_GENERATOR_CONFIG, raw, {
                enabled: raw.enabled === true,
                dryRun: raw.dryRun !== false,
                allowExternalPaidApi: raw.allowExternalPaidApi === true
            });
        }
    } catch (e) {
        sendLog(`asset_generator.config.json 로드 실패: ${e.message}`, 'warn');
    }
    return Object.assign({}, DEFAULT_ASSET_GENERATOR_CONFIG);
}

function saveAssetGeneratorConfig(cfg) {
    try {
        // 안전장치: 저장 시에도 allowExternalPaidApi 강제 false (명시적 true만 허용)
        const safe = Object.assign({}, cfg, {
            allowExternalPaidApi: cfg.allowExternalPaidApi === true
        });
        fs.writeFileSync(ASSET_GENERATOR_CONFIG_FILE, JSON.stringify(safe, null, 2), 'utf8');
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function get3DGeneratorReportFile(projectPath) {
    return path.join(projectPath || DEFAULT_PROJECT_PATH, 'reports', '3d_generator_report.md');
}

function getAssetGeneratorStatus(projectPath) {
    const config = loadAssetGeneratorConfig();
    const pendingDir = path.join(getAssetGenerationQueueDir(projectPath), 'pending');
    const doneDir    = path.join(getAssetGenerationQueueDir(projectPath), 'done');
    const failedDir  = path.join(getAssetGenerationQueueDir(projectPath), 'failed');
    const genDir     = getGeneratedAssetsDir(projectPath);

    const count = (dir) => {
        if (!fs.existsSync(dir)) return 0;
        return fs.readdirSync(dir).filter(f => f.endsWith('.job.md')).length;
    };
    const assetCount = () => {
        if (!fs.existsSync(genDir)) return 0;
        return fs.readdirSync(genDir).filter(f => /\.(glb|gltf|obj|fbx)$/i.test(f)).length;
    };

    const providerKey = config.defaultProvider;
    const provider    = config.providers[providerKey] || null;
    const providerReady = !!(provider && provider.enabled && provider.command && provider.workingDir);
    const canRun = config.enabled && !config.dryRun && providerReady;

    return {
        ok: true,
        enabled: config.enabled,
        dryRun: config.dryRun,
        defaultProvider: providerKey,
        providerReady,
        canRun,
        allowExternalPaidApi: config.allowExternalPaidApi,
        pendingJobs: count(pendingDir),
        doneJobs:    count(doneDir),
        failedJobs:  count(failedDir),
        generatedAssets: assetCount(),
        configFile: ASSET_GENERATOR_CONFIG_FILE
    };
}

function build3DGenerationCommand(job, config) {
    config = config || loadAssetGeneratorConfig();
    const providerKey = config.defaultProvider;
    const provider    = config.providers[providerKey] || {};
    const cmd         = provider.command  || '(command 미설정)';
    const rawOutDir   = provider.outputDir || config.outputDir;
    const jobContent  = typeof job === 'string' ? job : (job.jobContent || '');

    const srcMatch    = jobContent.match(/sourceImage:\s*(.+)/);
    const promptMatch = jobContent.match(/prompt:\s*(.+)/);
    const rawSrc      = srcMatch   ? srcMatch[1].trim()   : '';
    const prompt      = promptMatch? promptMatch[1].trim(): '';

    // WSL2 기반 provider는 경로 자동 변환
    const useWsl = !!(provider.usesWsl2);
    const outDir     = useWsl ? toWslPath(rawOutDir)  : rawOutDir;
    const sourceImage = useWsl ? toWslPath(rawSrc)    : rawSrc;

    switch (providerKey) {
        case 'trellis':
            return sourceImage
                ? `${cmd} --image "${sourceImage}" --output-dir "${outDir}"`
                : `${cmd} --text "${prompt}" --output-dir "${outDir}"`;
        case 'hunyuan3d':
            return sourceImage
                ? `${cmd} image_to_3d --image "${sourceImage}" --output "${outDir}"`
                : `${cmd} text_to_3d --text "${prompt}" --output "${outDir}"`;
        case 'stableFast3D':
            return `${cmd} --image "${sourceImage}" --output-dir "${outDir}"`;
        case 'blender':
            return `${cmd} --background --python "${provider.workingDir}/generate.py" -- --output "${outDir}"`;
        default:
            return `${cmd}`;
    }
}

/**
 * 로컬 3D 생성기 실행 — enabled=true + dryRun=false + provider 설정 완료일 때만 실행
 */
function runLocal3DGenerator(jobFile, projectPath) {
    const config = loadAssetGeneratorConfig();

    // ── 안전장치 (순서 중요) ──────────────────────────────────
    if (!config.enabled)             return { ok: false, reason: 'enabled=false — 실행 금지' };
    if (config.dryRun)               return { ok: false, reason: 'dryRun=true — 실제 실행 금지', dryRun: true };
    if (config.allowExternalPaidApi) return { ok: false, reason: 'allowExternalPaidApi=true — 외부 유료 API 차단' };

    const providerKey = config.defaultProvider;
    if (!providerKey || providerKey === 'none') return { ok: false, reason: 'provider 미설정' };

    const provider = config.providers[providerKey];
    if (!provider || !provider.enabled) return { ok: false, reason: `provider '${providerKey}' 비활성화` };
    if (!provider.command)             return { ok: false, reason: 'command 빈 값 — 실행 금지' };
    if (!provider.workingDir || !fs.existsSync(provider.workingDir)) {
        return { ok: false, reason: 'workingDir 없음 또는 존재하지 않음 — 실행 금지' };
    }

    // outputDir은 반드시 generated_assets 내부
    const resolvedOut  = path.resolve(provider.outputDir || config.outputDir);
    const allowedOut   = path.resolve(getGeneratedAssetsDir(projectPath));
    if (!resolvedOut.startsWith(allowedOut)) {
        return { ok: false, reason: 'outputDir이 generated_assets 외부 — 실행 금지' };
    }

    if (!jobFile || !fs.existsSync(jobFile)) return { ok: false, reason: '작업 파일 없음' };

    // ── V77: 사전 점검 (FAIL 존재 시 실행 금지) ──────────────
    const preflight = runPreflightChecks(projectPath);
    if (!preflight.ok) {
        const reason = `사전 점검 실패: ${preflight.failItems.join(' | ')}`;
        moveGenerationJobToFailed(jobFile, projectPath, reason);
        try {
            const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
            recordAgentMemory(vp, { task: '3D 생성 사전 점검', decision: '실행 차단', result: reason });
        } catch { /* 비중단 */ }
        return { ok: false, reason, preflight };
    }

    const jobContent = fs.readFileSync(jobFile, 'utf8');
    const cmdStr     = build3DGenerationCommand({ jobContent, jobFile }, config);
    const [cmd, ...args] = cmdStr.split(' ');

    // 로그 파일 준비
    const logTs  = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(projectPath, 'reports');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `3d_gen_${logTs}.log`);
    const logLines = [`[${new Date().toISOString()}] spawn: ${cmdStr}\n`];

    // ── V77: 타임아웃 설정 ────────────────────────────────────
    const timeoutMs = (config.generatorTimeoutMinutes || 120) * 60 * 1000;

    return new Promise((resolve) => {
        let proc;
        try {
            proc = spawn(cmd, args, { cwd: provider.workingDir, shell: true });
        } catch (e) {
            write3DGenerationLog(projectPath, logLines.join('') + `\nERROR: ${e.message}`);
            moveGenerationJobToFailed(jobFile, projectPath, e.message);
            resolve({ ok: false, reason: 'spawn 실패: ' + e.message });
            return;
        }

        let timedOut = false;
        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try { proc.kill('SIGTERM'); } catch {}
            const timeoutReason = `타임아웃: ${config.generatorTimeoutMinutes}분 초과`;
            logLines.push(`\n[TIMEOUT] ${timeoutReason}\n`);
            write3DGenerationLog(projectPath, logLines.join(''));
            moveGenerationJobToFailed(jobFile, projectPath, timeoutReason);
            try {
                const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
                recordAgentMemory(vp, { task: '3D 생성 타임아웃', decision: '프로세스 강제 종료', result: timeoutReason });
            } catch { /* 비중단 */ }
            resolve({ ok: false, reason: timeoutReason, timedOut: true });
        }, timeoutMs);

        proc.stdout.on('data', (d) => logLines.push(d.toString()));
        proc.stderr.on('data', (d) => logLines.push('[ERR] ' + d.toString()));

        proc.on('close', (code) => {
            if (timedOut) return; // 타임아웃이 먼저 처리됨
            clearTimeout(timeoutHandle);
            const logContent = logLines.join('');
            write3DGenerationLog(projectPath, logContent);
            fs.writeFileSync(logFile, logContent, 'utf8');
            if (code === 0) {
                moveGenerationJobToDone(jobFile, projectPath);
                resolve({ ok: true, exitCode: code, logFile });
            } else {
                moveGenerationJobToFailed(jobFile, projectPath, `exit code ${code}`);
                resolve({ ok: false, reason: `exit code ${code}`, logFile });
            }
        });

        proc.on('error', (e) => {
            if (timedOut) return;
            clearTimeout(timeoutHandle);
            const logContent = logLines.join('') + `\nERROR: ${e.message}`;
            write3DGenerationLog(projectPath, logContent);
            moveGenerationJobToFailed(jobFile, projectPath, e.message);
            resolve({ ok: false, reason: e.message });
        });
    });
}

function detectGenerated3DAssets(projectPath) {
    const genDir = getGeneratedAssetsDir(projectPath);
    if (!fs.existsSync(genDir)) return { ok: true, assets: [] };
    try {
        const assets = fs.readdirSync(genDir)
            .filter(f => /\.(glb|gltf|obj|fbx|ply)$/i.test(f))
            .map(f => {
                const full = path.join(genDir, f);
                const st   = fs.statSync(full);
                const sizeMB = st.size / (1024 * 1024);
                const config = loadAssetGeneratorConfig();
                const warn   = sizeMB > config.maxFileSizeMBWarning;
                const reject = sizeMB > config.maxFileSizeMBReject;
                return { name: f, path: full, ext: path.extname(f).toLowerCase().slice(1), sizeMB: +sizeMB.toFixed(2), warn, reject, mtime: st.mtime.toISOString() };
            });
        return { ok: true, assets, dir: genDir };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function write3DGenerationLog(projectPath, content) {
    try {
        const reportFile = get3DGeneratorReportFile(projectPath);
        const header     = `# 3D Generator Report\n\n생성: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
        if (!fs.existsSync(reportFile)) {
            fs.writeFileSync(reportFile, header + content, 'utf8');
        } else {
            fs.appendFileSync(reportFile, `\n---\n\n[${new Date().toISOString()}]\n\n${content}`, 'utf8');
        }
        return { ok: true, file: reportFile };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function moveGenerationJobToDone(jobFile, projectPath) {
    try {
        const doneDir = path.join(getAssetGenerationQueueDir(projectPath), 'done');
        if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir, { recursive: true });
        const dest = path.join(doneDir, path.basename(jobFile));
        fs.renameSync(jobFile, dest);
        return { ok: true, dest };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function moveGenerationJobToFailed(jobFile, projectPath, reason) {
    try {
        const failedDir = path.join(getAssetGenerationQueueDir(projectPath), 'failed');
        if (!fs.existsSync(failedDir)) fs.mkdirSync(failedDir, { recursive: true });
        const dest = path.join(failedDir, path.basename(jobFile));
        let content = fs.existsSync(jobFile) ? fs.readFileSync(jobFile, 'utf8') : '';
        content += `\n\n## 실패 원인\n\n- 시각: ${new Date().toISOString()}\n- 이유: ${reason}\n`;
        fs.writeFileSync(dest, content, 'utf8');
        if (fs.existsSync(jobFile)) fs.unlinkSync(jobFile);
        return { ok: true, dest };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * dry-run: 실제 실행 없이 실행 예정 명령만 반환
 */
function dryRun3DGeneration(jobFile, projectPath) {
    const config      = loadAssetGeneratorConfig();
    const providerKey = config.defaultProvider;
    const provider    = config.providers[providerKey] || {};
    const jobContent  = fs.existsSync(jobFile) ? fs.readFileSync(jobFile, 'utf8') : '';
    const cmdStr      = build3DGenerationCommand({ jobContent, jobFile }, config);

    const checks = [
        { label: 'enabled',        ok: config.enabled,               msg: config.enabled ? 'true' : 'false (실행 불가)' },
        { label: 'dryRun',         ok: !config.dryRun,               msg: config.dryRun ? 'true (실행 불가)' : 'false' },
        { label: 'provider',       ok: !!provider.command,           msg: provider.command || '(미설정)' },
        { label: 'workingDir',     ok: !!(provider.workingDir && fs.existsSync(provider.workingDir)), msg: provider.workingDir || '(미설정)' },
        { label: 'allowExternalPaidApi', ok: !config.allowExternalPaidApi, msg: config.allowExternalPaidApi ? 'true (주의)' : 'false' }
    ];

    const allPass = checks.every(c => c.ok);
    return { ok: true, dryRun: true, canRun: allPass, command: cmdStr, checks, provider: providerKey };
}

// ══════════════════════════════════════════════════════════════
// V77 — 실행 안정화 및 환경 점검 시스템
// ══════════════════════════════════════════════════════════════

/** safe execSync 래퍼 — 실패해도 앱 중단 없음 */
function tryExec(cmd, opts) {
    try {
        const out = execSync(cmd, { stdio: 'pipe', timeout: 8000, windowsHide: true, ...opts });
        return { ok: true, output: (out || '').toString().trim() };
    } catch (e) {
        return { ok: false, output: '', error: e.message };
    }
}

/** Windows 경로 → WSL2 경로 변환 (D:\path → /mnt/d/path) */
function toWslPath(winPath) {
    if (!winPath) return winPath || '';
    const m = winPath.match(/^([A-Za-z]):[\\\/](.*)/);
    if (!m) return winPath;
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

/** GPU 감지 및 VRAM 판정 */
function detectGpu() {
    // 1차: nvidia-smi (가장 정확)
    const nvSmi = tryExec('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits');
    if (nvSmi.ok && nvSmi.output) {
        const parts = nvSmi.output.split(', ');
        const name   = (parts[0] || '').trim();
        const vramMB = parseInt((parts[1] || '0').trim(), 10);
        const driver = (parts[2] || '').trim();
        const vramGB = +(vramMB / 1024).toFixed(1);
        const level  = vramGB >= 8 ? 'PASS' : vramGB >= 6 ? 'WARNING' : 'FAIL';
        return { ok: true, name, vendor: 'NVIDIA', vramGB, vramMB, driver, level, source: 'nvidia-smi' };
    }
    // 2차: WMIC
    const wmic = tryExec('wmic path win32_videocontroller get name,AdapterRAM,DriverVersion /format:list');
    if (wmic.ok && wmic.output) {
        const lines  = wmic.output.split(/\r?\n/);
        const get    = (prefix) => (lines.find(l => l.startsWith(prefix)) || '').split('=')[1]?.trim() || '';
        const name   = get('Name=');
        const ramStr = get('AdapterRAM=');
        const driver = get('DriverVersion=');
        const vramBytes = parseInt(ramStr || '0', 10);
        const vramGB = +(vramBytes / (1024 ** 3)).toFixed(1);
        const vendor = name.includes('NVIDIA') ? 'NVIDIA' : name.includes('AMD') ? 'AMD' : name.includes('Intel') ? 'Intel' : '알 수 없음';
        const level  = vramGB >= 8 ? 'PASS' : vramGB >= 6 ? 'WARNING' : 'FAIL';
        return { ok: true, name, vendor, vramGB, driver, level, source: 'wmic' };
    }
    return { ok: false, name: '감지 실패', vendor: '알 수 없음', vramGB: 0, level: 'FAIL', source: 'none' };
}

/** 전체 환경 상태 점검 */
function getEnvironmentStatus() {
    const items = {};

    // Windows 버전
    const winVer = tryExec('cmd /c ver');
    items.windows = { label: 'Windows', value: winVer.ok ? winVer.output : '감지 실패', level: winVer.ok ? 'PASS' : 'WARNING' };

    // CPU
    const cpus = os.cpus();
    items.cpu = { label: 'CPU', value: `${(cpus[0] || {}).model || '알 수 없음'} (${cpus.length}코어)`, level: 'PASS' };

    // RAM
    const ramGB = +(os.totalmem() / (1024 ** 3)).toFixed(1);
    items.ram = { label: 'RAM', value: `${ramGB}GB`, level: ramGB >= 16 ? 'PASS' : ramGB >= 8 ? 'WARNING' : 'FAIL' };

    // GPU / VRAM
    const gpu = detectGpu();
    items.gpu  = { label: 'GPU',  value: `${gpu.name} (${gpu.vramGB}GB VRAM)`, level: gpu.level };
    items.nvidia = { label: 'NVIDIA GPU', value: gpu.vendor === 'NVIDIA' ? gpu.name : '없음', level: gpu.vendor === 'NVIDIA' ? 'PASS' : 'WARNING' };

    // CUDA
    const cuda   = tryExec('nvcc --version');
    const cudaEnv = process.env.CUDA_PATH || '';
    const hasCuda = cuda.ok || !!cudaEnv;
    const cudaVer = cuda.ok ? ((cuda.output.match(/release (\S+),/) || [])[1] || '버전 미확인')
                             : (cudaEnv ? `CUDA_PATH: ${cudaEnv}` : '미설치');
    items.cuda = { label: 'CUDA', value: cudaVer, level: hasCuda ? 'PASS' : 'FAIL' };

    // Python
    const py  = tryExec('python --version');
    const py3 = py.ok ? { ok: false } : tryExec('python3 --version');
    const hasPy = py.ok || py3.ok;
    items.python = { label: 'Python', value: hasPy ? (py.ok ? py.output : py3.output) : '미설치', level: hasPy ? 'PASS' : 'FAIL' };

    // pip
    const pip = tryExec('pip --version');
    items.pip = { label: 'pip', value: pip.ok ? pip.output.split(' ').slice(0, 2).join(' ') : '미설치', level: pip.ok ? 'PASS' : 'WARNING' };

    // Git
    const git = tryExec('git --version');
    items.git = { label: 'Git', value: git.ok ? git.output : '미설치', level: git.ok ? 'PASS' : 'WARNING' };

    // WSL2
    const wslSt = tryExec('wsl --status');
    const wslLv = tryExec('wsl -l -v');
    const hasWsl2 = (wslSt.ok && wslSt.output.includes('2')) || (wslLv.ok && wslLv.output.includes('2'));
    items.wsl2 = { label: 'WSL2', value: hasWsl2 ? 'WSL2 설치됨' : (wslSt.ok ? 'WSL (버전 미확인)' : '미설치'), level: hasWsl2 ? 'PASS' : 'WARNING' };

    // Node / npm
    const nodeVer = tryExec('node --version');
    const npmVer  = tryExec('npm --version');
    items.node = { label: 'Node.js', value: nodeVer.ok ? nodeVer.output : '감지 실패', level: nodeVer.ok ? 'PASS' : 'WARNING' };
    items.npm  = { label: 'npm',     value: npmVer.ok  ? npmVer.output  : '감지 실패', level: npmVer.ok  ? 'PASS' : 'WARNING' };

    const levels  = Object.values(items).map(i => i.level);
    const overall = levels.includes('FAIL') ? 'FAIL' : levels.includes('WARNING') ? 'WARNING' : 'PASS';
    return { ok: true, overall, items };
}

/** Provider별 VRAM/CUDA/Python/WSL2 호환성 확인 */
function checkProviderCompatibility(providerKey) {
    const REQS = {
        trellis:     { label: 'TRELLIS (Microsoft)',         vramMin: 8,  needsCuda: true,  needsPython: true,  needsWsl2: true  },
        hunyuan3d:   { label: 'Hunyuan3D (Tencent)',         vramMin: 16, needsCuda: true,  needsPython: true,  needsWsl2: true  },
        stableFast3D:{ label: 'Stable Fast 3D (Stability)',  vramMin: 6,  needsCuda: true,  needsPython: true,  needsWsl2: false },
        blender:     { label: 'Blender (절차적)',            vramMin: 0,  needsCuda: false, needsPython: false, needsWsl2: false }
    };
    const req = REQS[providerKey];
    if (!req) return { ok: false, error: `알 수 없는 provider: ${providerKey}` };

    const env  = getEnvironmentStatus();
    const gpu  = detectGpu();
    const checks = [];

    // VRAM
    const vramLevel = gpu.vramGB >= req.vramMin ? 'PASS' : gpu.vramGB >= req.vramMin - 2 ? 'WARNING' : 'FAIL';
    checks.push({ label: 'VRAM', message: `${gpu.vramGB}GB (요구: ${req.vramMin}GB+)`, level: vramLevel });

    // CUDA
    if (req.needsCuda) {
        const c = env.items.cuda;
        checks.push({ label: 'CUDA', message: c.value, level: c.level === 'PASS' ? 'PASS' : 'FAIL' });
    }

    // Python
    if (req.needsPython) {
        const p = env.items.python;
        checks.push({ label: 'Python', message: p.value, level: p.level === 'PASS' ? 'PASS' : 'FAIL' });
    }

    // WSL2 (WARNING만 — 없어도 실행 시도 가능)
    if (req.needsWsl2) {
        const w = env.items.wsl2;
        checks.push({ label: 'WSL2', message: w.value, level: w.level === 'PASS' ? 'PASS' : 'WARNING' });
    }

    const overall = checks.some(c => c.level === 'FAIL') ? 'FAIL' : checks.some(c => c.level === 'WARNING') ? 'WARNING' : 'PASS';
    return { ok: true, provider: providerKey, label: req.label, checks, overall };
}

/** Provider 설치 감지 — Installed / Partial / Missing */
function detectProviderInstallation(providerKey) {
    const config   = loadAssetGeneratorConfig();
    const provider = config.providers[providerKey];
    if (!provider) return { status: 'Missing', details: 'provider 설정 없음' };

    const checks = [];
    const hasWorkDir = !!(provider.workingDir && fs.existsSync(provider.workingDir));
    checks.push({ label: 'workingDir', ok: hasWorkDir, value: provider.workingDir || '(미설정)' });

    const PROVIDER_FILES = {
        trellis:     ['requirements.txt', 'infer.py'],
        hunyuan3d:   ['requirements.txt', 'infer.py'],
        stableFast3D:['requirements.txt', 'run.py'],
        blender:     []
    };
    for (const f of (PROVIDER_FILES[providerKey] || [])) {
        const fp  = provider.workingDir ? path.join(provider.workingDir, f) : null;
        const ok  = !!(fp && fs.existsSync(fp));
        checks.push({ label: f, ok, value: fp || '(workingDir 없음)' });
    }

    if (provider.command) {
        const r = tryExec(`${provider.command} --version`);
        checks.push({ label: 'command 실행 가능', ok: r.ok, value: provider.command });
    }

    const allPass = checks.every(c => c.ok);
    const anyPass = checks.some(c => c.ok);
    const status  = allPass ? 'Installed' : anyPass ? 'Partial' : 'Missing';
    return { ok: true, status, provider: providerKey, checks };
}

/** 생성 실행 전 사전 점검 — FAIL 존재 시 실행 금지 */
function runPreflightChecks(projectPath) {
    const config      = loadAssetGeneratorConfig();
    const providerKey = config.defaultProvider;
    const failItems   = [];
    const warnItems   = [];
    const passItems   = [];

    // 환경 점검
    try {
        const env = getEnvironmentStatus();
        for (const [, v] of Object.entries(env.items)) {
            if (v.level === 'FAIL')    failItems.push(`[ENV] ${v.label}: ${v.value}`);
            else if (v.level === 'WARNING') warnItems.push(`[ENV] ${v.label}: ${v.value}`);
            else passItems.push(`[ENV] ${v.label}`);
        }
    } catch (e) { warnItems.push(`[ENV] 점검 오류: ${e.message}`); }

    // GPU
    try {
        const gpu = detectGpu();
        if (gpu.level === 'FAIL')    failItems.push(`[GPU] VRAM 부족: ${gpu.vramGB}GB`);
        else if (gpu.level === 'WARNING') warnItems.push(`[GPU] VRAM 제한: ${gpu.vramGB}GB`);
        else passItems.push(`[GPU] ${gpu.name} ${gpu.vramGB}GB`);
    } catch (e) { warnItems.push(`[GPU] 감지 오류: ${e.message}`); }

    // Provider 호환성
    if (providerKey && providerKey !== 'none') {
        try {
            const compat = checkProviderCompatibility(providerKey);
            for (const c of (compat.checks || [])) {
                if (c.level === 'FAIL')    failItems.push(`[PROVIDER] ${c.label}: ${c.message}`);
                else if (c.level === 'WARNING') warnItems.push(`[PROVIDER] ${c.label}: ${c.message}`);
                else passItems.push(`[PROVIDER] ${c.label}`);
            }
        } catch (e) { warnItems.push(`[PROVIDER] 호환성 오류: ${e.message}`); }
    }

    // Config 검증
    if (!config.outputDir) failItems.push('[CONFIG] outputDir 미설정');
    const prov = config.providers[providerKey];
    if (!prov?.command)    failItems.push('[CONFIG] command 미설정');
    if (!prov?.workingDir) failItems.push('[CONFIG] workingDir 미설정');

    // 경로 준비
    const genDir = getGeneratedAssetsDir(projectPath);
    if (!fs.existsSync(genDir)) {
        try { fs.mkdirSync(genDir, { recursive: true }); passItems.push('[PATH] generated_assets 생성됨'); }
        catch (e) { failItems.push(`[PATH] generated_assets 생성 실패: ${e.message}`); }
    } else {
        passItems.push('[PATH] generated_assets 존재');
    }

    return { ok: failItems.length === 0, failItems, warnItems, passItems };
}

// ── V77 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('get-environment-status',      () => getEnvironmentStatus());
ipcMain.handle('detect-gpu',                  () => detectGpu());
ipcMain.handle('check-provider-compatibility',(_, providerKey) => checkProviderCompatibility(providerKey || 'trellis'));
ipcMain.handle('detect-provider-installation',(_, providerKey) => detectProviderInstallation(providerKey || 'trellis'));
ipcMain.handle('run-preflight-checks',        (_, p) => {
    const result = runPreflightChecks(p || DEFAULT_PROJECT_PATH);
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, {
            task: '3D Generator 사전 점검',
            decision: result.ok ? '점검 통과' : `점검 실패 (${result.failItems.length}개)`,
            result: result.ok ? 'PASS' : result.failItems.slice(0, 3).join(' | ')
        });
        if (!result.ok) {
            recordDecision(vp, 'V77 환경 점검 계층 도입', '생성기 설치 전 환경 점검으로 실행 실패 최소화');
            recordDecision(vp, '생성기 설치 전 검증 우선', '환경 PASS 확인 후에만 실제 생성기 실행 허용');
        }
    } catch { /* 비중단 */ }
    return result;
});

// ── V76 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('load-asset-generator-config', () => {
    const cfg = loadAssetGeneratorConfig();
    // Obsidian: 최초 설계 결정 기록 (중복 방지됨)
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordDecision(vp, '무료 로컬 3D 생성 엔진 우선 사용', 'Meshy/Tripo 등 유료 API 보다 로컬 실행 우선');
        recordDecision(vp, 'Meshy/Tripo는 후순위', '유료 외부 API — allowExternalPaidApi=false 기본값 유지');
        recordDecision(vp, '생성보다 Inspector와 품질검사 우선', 'V75 Inspector + 품질게이트가 생성 이전 우선');
    } catch { /* 비중단 */ }
    return cfg;
});
ipcMain.handle('save-asset-generator-config',  (_, cfg) => saveAssetGeneratorConfig(cfg || {}));
ipcMain.handle('get-asset-generator-status',   (_, p) => getAssetGeneratorStatus(p || DEFAULT_PROJECT_PATH));
ipcMain.handle('build-3d-generation-command',  (_, jobFile, p) => {
    const config = loadAssetGeneratorConfig();
    const content = jobFile && fs.existsSync(jobFile) ? fs.readFileSync(jobFile, 'utf8') : '';
    return { ok: true, command: build3DGenerationCommand({ jobContent: content, jobFile: jobFile || '' }, config) };
});
ipcMain.handle('run-local-3d-generator', async (_, jobFile, p) => {
    const result = await runLocal3DGenerator(jobFile || '', p || DEFAULT_PROJECT_PATH);
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        recordAgentMemory(vp, {
            task: `로컬 3D 생성 실행: ${path.basename(jobFile || '없음')}`,
            decision: result.ok ? '생성 성공' : `실패: ${result.reason}`,
            result: result.ok ? 'done' : 'failed'
        });
    } catch { /* 비중단 */ }
    return result;
});
ipcMain.handle('detect-generated-3d-assets', (_, p) => {
    const result = detectGenerated3DAssets(p || DEFAULT_PROJECT_PATH);
    try {
        const vp = loadConfig().vaultPath || DEFAULT_VAULT_PATH;
        if (result.ok && result.assets.length > 0) {
            recordAgentMemory(vp, {
                task: 'generated_assets 결과물 감지',
                decision: `${result.assets.length}개 파일 감지`,
                result: result.assets.map(a => a.name).join(', ')
            });
        }
    } catch { /* 비중단 */ }
    return result;
});
ipcMain.handle('write-3d-generation-log',      (_, p, content) => write3DGenerationLog(p || DEFAULT_PROJECT_PATH, content || ''));
ipcMain.handle('dry-run-3d-generation',        (_, jobFile, p) => dryRun3DGeneration(jobFile || '', p || DEFAULT_PROJECT_PATH));

// ── V74 IPC 핸들러 ────────────────────────────────────────────
ipcMain.handle('build-knowledge-context',  (_, p, query) => buildKnowledgeContext(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, query || ''));
ipcMain.handle('record-agent-memory',      (_, p, entry) => recordAgentMemory(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, entry || {}));
ipcMain.handle('record-decision',          (_, p, decision, detail) => recordDecision(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH, decision || '', detail || ''));
ipcMain.handle('generate-knowledge-summary', (_, p) => generateKnowledgeSummary(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));
ipcMain.handle('get-agent-memory',         (_, p) => getAgentMemory(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));
ipcMain.handle('get-project-decisions',    (_, p) => getProjectDecisions(p || loadConfig().vaultPath || DEFAULT_VAULT_PATH));

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.hide());

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => {});
app.on('activate', () => mainWindow && mainWindow.show());
