// QuestManager.h — verify-v66 test fixture
// single-line UENUM 감지 테스트용

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "QuestManager.generated.h"

UENUM(BlueprintType) enum class EQuestState : uint8 { Inactive, Active, Completed, Failed };

UCLASS(Blueprintable)
class TORIBATMAGICSCHOOL_API UQuestManager : public UObject
{
    GENERATED_BODY()

public:
    UPROPERTY(BlueprintReadWrite, Category = "Quest")
    EQuestState CurrentState;

    UFUNCTION(BlueprintCallable, Category = "Quest")
    void StartQuest();

    UFUNCTION(BlueprintCallable, Category = "Quest")
    void CompleteQuest();
};
