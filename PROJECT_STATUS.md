# PROJECT_STATUS.md

> 마지막 업데이트: 2026-06-07  
> 브랜치: `claude/image-to-3d-webapp-5FGno`

---

## 프로젝트 방향

**개인용 도구.** 공개 서비스가 아닙니다.

| 원칙 | 내용 |
|------|------|
| 사용자 | 나 혼자 |
| 목표 | 모바일 브라우저에서 편하게 쓰는 것 최우선 |
| API 비용 | 유료 API 의존도 최소화, 무료 Mock 기본값 |
| 확장성 | 무료/오픈소스 엔진 교체가 쉬운 Provider 구조 |
| 보안 | API 키 · 개인 설정은 절대 GitHub에 올리지 않음 |
| 미포함 | 회원가입, 결제, 다중 사용자, AR, Unity/Unreal |

---

## 구현 완료

### 기능

| 기능 | 파일 | 상태 |
|------|------|------|
| 이미지 업로드 (갤러리/카메라/드래그앤드롭) | `ImageUploader.tsx` | ✅ |
| 파일 형식·용량 검사 + 인라인 에러 | `ImageUploader.tsx` + `route.ts` | ✅ |
| 이미지 미리보기 | `page.tsx` | ✅ |
| 3D 생성 버튼 (중복 클릭 방지) | `page.tsx` | ✅ |
| 생성 진행 상태 표시 | `ProgressIndicator.tsx` | ✅ |
| GLB 3D 뷰어 (터치 회전/확대/축소) | `ModelViewer.tsx` | ✅ |
| GLB 로딩 실패 에러 처리 + 오버레이 | `ModelViewer.tsx` | ✅ |
| GLB 다운로드 | `page.tsx` | ✅ |
| **Provider 상태 표시** (화면 하단) | `page.tsx` + `ProviderBadge` | ✅ |
| **현재 모드 확인 API** | `api/status/route.ts` | ✅ |
| Mock Provider (기본값, 무료) | `lib/providers/mock.ts` | ✅ |
| Provider 추상화 구조 | `lib/providers/` | ✅ |
| Tripo AI Provider (유료, 선택) | `lib/providers/tripo.ts` | ✅ |
| Meshy AI Provider (유료, 선택) | `lib/providers/meshy.ts` | ✅ |
| **Vercel 자동 설정** | `vercel.json` | ✅ |
| API 키 GitHub 유출 방지 | `.gitignore` | ✅ |

### 모바일 성능 최적화

| 항목 | 내용 |
|------|------|
| `dpr={[1, 2]}` | 픽셀 밀도 상한 제한 |
| `powerPreference: 'low-power'` | GPU 절전 모드 |
| `antialias: false` | 모바일 GPU 부담 감소 |
| 그림자 없음 | `castShadow` / `receiveShadow` 미사용 |
| 조명 최소화 | ambient 1개 + directional 1개 |
| `meshBasicMaterial` | 로딩 큐브 — 조명 연산 없는 경량 재질 |
| `useMemo` 씬 정규화 | 씬 변경 시 Box3 계산 1회만 실행 |
| scene 직접 뮤테이션 제거 | group 트랜스폼으로 대체 |

---

## 폴더 구조

```
ToribatAgent/
├── vercel.json                    ← rootDirectory: webapp 자동 설정
├── webapp/
│   ├── .env.local.example         ← API 키 템플릿
│   ├── public/
│   │   └── sample.glb             ← Mock용 샘플 (1.6KB, GLB 형식 검증 완료)
│   └── src/
│       ├── app/
│       │   ├── page.tsx           ← 4단계 상태 + Provider 배지 + 하단 footer
│       │   └── api/
│       │       ├── generate3d/    ← 검증 → Provider 호출 → 응답
│       │       └── status/        ← 현재 Provider id 반환 (GET)
│       ├── components/
│       │   ├── ImageUploader.tsx
│       │   ├── ModelViewer.tsx
│       │   └── ProgressIndicator.tsx
│       └── lib/
│           └── providers/
│               ├── types.ts       ← ModelProvider 인터페이스
│               ├── mock.ts        ← 기본값 (무료)
│               ├── tripo.ts       ← Tripo AI (유료)
│               ├── meshy.ts       ← Meshy AI (유료)
│               └── index.ts       ← 환경변수 기반 자동 선택
└── scripts/
    └── generate-sample-glb.mjs
```

---

## sample.glb 경로 확인

| 항목 | 내용 |
|------|------|
| 파일 위치 | `webapp/public/sample.glb` |
| 서빙 경로 | `/sample.glb` |
| 파일 크기 | 1.7KB |
| Vercel 배포 시 | `webapp/`이 루트이므로 `/sample.glb`로 정상 서빙됨 |
| Mock Provider 반환값 | `'/sample.glb'` (경로 일치 ✅) |

---

## Provider 선택 로직

```
환경변수 없음         →  Mock Provider  (기본, 무료)
TRIPO_API_KEY 있음  →  Tripo Provider
MESHY_API_KEY 있음  →  Meshy Provider
```

화면 하단 상태줄:
- **노란색** `Mock Provider` → API 키 없음, sample.glb 반환
- **초록색** `Tripo Provider` / `Meshy Provider` → 실제 API 사용 중

---

## 모바일 브라우저 테스트 체크리스트

배포 후 실제 기기에서 확인할 항목입니다.

### iOS Safari

- [ ] 이미지 선택 — 갤러리에서
- [ ] 이미지 선택 — 카메라 촬영
- [ ] 잘못된 형식 (PDF 등) 선택 시 인라인 에러 표시
- [ ] 10MB 초과 파일 선택 시 인라인 에러 표시
- [ ] "3D 생성하기" 버튼 → 진행률 표시 (스피너 + %)
- [ ] 단계 메시지 순환 (이미지 분석 중... → AI가 추정 중... → ...)
- [ ] 생성 완료 후 3D 뷰어 표시
- [ ] 한 손가락 드래그 → 회전 (부드러움 확인)
- [ ] 두 손가락 핀치 → 확대/축소
- [ ] GLB 다운로드 → 파일 저장 확인
- [ ] "새 이미지로 다시 생성" → 초기 화면 복귀
- [ ] 화면 하단 "현재 모드: Mock Provider" 표시 확인
- [ ] 가로 방향 회전 시 레이아웃 이상 없음

### Android Chrome

- [ ] 이미지 선택 — 갤러리
- [ ] 이미지 선택 — 카메라
- [ ] 3D 뷰어 WebGL 렌더링 정상 (검은 화면 없음)
- [ ] 터치 회전/확대 부드러움 (프레임 드롭 없음)
- [ ] GLB 다운로드 → 다운로드 폴더 저장 확인
- [ ] 화면 하단 모드 표시 확인

### 공통

- [ ] 네트워크 느린 환경(3G 모사)에서 GLB 로딩 완료
- [ ] 존재하지 않는 GLB URL → 에러 오버레이 표시
- [ ] 페이지 새로고침 후 초기 화면으로 정상 복귀
- [ ] 홈 화면에 추가(PWA) 후 실행 시 정상 동작

---

## 빌드 결과 (최신)

```
Route              Size      First Load JS
/                  4.96 kB   106 kB
/api/generate3d    136 B     101 kB
/api/status        136 B     101 kB
```

---

## 실행 방법

```bash
# 로컬 개발
cd webapp && npm install && npm run dev

# 프로덕션 빌드 (검증됨)
npm run build && npm start

# 샘플 GLB 재생성
node scripts/generate-sample-glb.mjs
```

---

## Vercel 배포 요약

```
1. GitHub 저장소 → Vercel Import
2. vercel.json이 있으므로 Root Directory 자동 webapp/ 설정
3. Deploy (API 키 없으면 Mock 모드로 즉시 배포 가능)
4. 배포 URL로 모바일 접속 테스트
5. API 키 필요 시: Vercel 대시보드 → Settings → Environment Variables
```

---

## 다음 단계

| 우선순위 | 기능 | 비고 |
|----------|------|------|
| 🔴 | **Vercel 배포 실행** | vercel.json 준비 완료, 즉시 가능 |
| 🔴 | 모바일 체크리스트 실제 기기 점검 | 위 체크리스트 |
| 🟡 | 무료 오픈소스 3D Provider 탐색 | TripoSG, Shap-E, InstantMesh |
| 🟡 | 생성 취소 (AbortController) | |
| 🟡 | 최근 생성 목록 (localStorage) | |
| 🟢 | 와이어프레임 토글 | |

---

## 보안 체크리스트

- [x] `.env.local` → `.gitignore` 포함
- [x] `.env*`, `*.key`, `*.secret` 패턴 차단
- [x] `.env.local.example`만 커밋 (실제 값 없음)
- [ ] Vercel 환경변수는 대시보드에서만 설정 (코드 하드코딩 금지)
- [ ] 배포 후 URL 공개 여부 결정 (비공개 원하면 Vercel Password Protection 설정)

---

## 커밋 이력

| 커밋 | 내용 |
|------|------|
| `최신` | feat: Provider 상태 표시, Vercel 배포 설정, 모바일 체크리스트 |
| `a3fb60c` | refactor: Provider 패턴 도입, 개인용 방향 정리 |
| `6fa6cc5` | refactor: Mock 흐름 안정화, 성능/에러 처리 개선 |
| `42a7a00` | feat: 이미지→3D 변환 웹앱 MVP 초기 구현 |
