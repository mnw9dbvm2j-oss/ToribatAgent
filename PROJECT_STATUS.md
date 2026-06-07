# PROJECT_STATUS.md

> 마지막 업데이트: 2026-06-07  
> 브랜치: `claude/image-to-3d-webapp-5FGno`

---

## 프로젝트 방향

**개인용 도구.** 공개 서비스가 아닙니다.

| 원칙 | 내용 |
|------|------|
| 사용자 | 나 혼자 |
| 접근 방식 | 모바일 브라우저에서 편하게 쓰는 것이 최우선 |
| API 비용 | Tripo/Meshy 등 유료 API에 의존하지 않음 |
| 확장성 | 무료/오픈소스 엔진 교체가 쉬운 Provider 구조 유지 |
| 보안 | API 키, 개인 설정은 절대 GitHub에 올리지 않음 |
| 미포함 | 회원가입, 결제, 다중 사용자, AR, Unity/Unreal |

---

## 구현 완료

### 기능

| 기능 | 파일 | 상태 |
|------|------|------|
| 이미지 업로드 (갤러리/카메라/드래그앤드롭) | `ImageUploader.tsx` | ✅ |
| 파일 형식 검사 (JPG/PNG/WEBP) | `ImageUploader.tsx` + `route.ts` | ✅ |
| 파일 용량 검사 (10MB 이하) | `ImageUploader.tsx` + `route.ts` | ✅ |
| 인라인 에러 메시지 | `ImageUploader.tsx` | ✅ |
| 이미지 미리보기 | `page.tsx` | ✅ |
| 3D 생성 버튼 (중복 클릭 방지) | `page.tsx` | ✅ |
| 생성 진행 상태 표시 | `ProgressIndicator.tsx` | ✅ |
| GLB 3D 뷰어 (터치 회전/확대/축소) | `ModelViewer.tsx` | ✅ |
| GLB 로딩 실패 에러 처리 | `ModelViewer.tsx` | ✅ |
| GLB 다운로드 | `page.tsx` | ✅ |
| Mock Provider (기본값, 무료) | `lib/providers/mock.ts` | ✅ |
| Provider 추상화 구조 | `lib/providers/` | ✅ |
| Tripo AI Provider (유료, 선택) | `lib/providers/tripo.ts` | ✅ |
| Meshy AI Provider (유료, 선택) | `lib/providers/meshy.ts` | ✅ |
| API 키 GitHub 유출 방지 `.gitignore` | `.gitignore` | ✅ |

### 모바일 성능 최적화

| 항목 | 내용 |
|------|------|
| `dpr={[1, 2]}` | 픽셀 밀도 상한 제한 |
| `powerPreference: 'low-power'` | GPU 절전 모드 |
| `antialias: false` | 모바일 GPU 부담 감소 |
| 그림자 없음 | castShadow / receiveShadow 미사용 |
| 조명 최소화 | ambient 1개 + directional 1개 |
| `meshBasicMaterial` (로딩 큐브) | 조명 연산 없는 경량 재질 |
| `useMemo` 씬 정규화 | 씬 변경 시 1회만 Box3 계산 |
| scene 직접 뮤테이션 제거 | group 트랜스폼으로 대체 |

---

## 폴더 구조

```
ToribatAgent/
├── webapp/
│   ├── .env.local.example          ← API 키 템플릿 (실제 키는 .env.local에만)
│   ├── public/
│   │   └── sample.glb              ← Mock용 보라색 박스 (1.6KB)
│   └── src/
│       ├── app/
│       │   ├── page.tsx            ← 메인 페이지 (4단계 상태)
│       │   └── api/generate3d/
│       │       └── route.ts        ← 입력 검증 → Provider 호출
│       ├── components/
│       │   ├── ImageUploader.tsx
│       │   ├── ModelViewer.tsx
│       │   └── ProgressIndicator.tsx
│       └── lib/
│           └── providers/          ← 3D 생성 엔진 추상화
│               ├── types.ts        ← ModelProvider 인터페이스
│               ├── mock.ts         ← 기본값 (무료)
│               ├── tripo.ts        ← Tripo AI (유료)
│               ├── meshy.ts        ← Meshy AI (유료)
│               └── index.ts        ← 활성 Provider 선택
├── scripts/
│   └── generate-sample-glb.mjs
├── README.md
└── PROJECT_STATUS.md
```

---

## Provider 선택 로직

```
환경변수 설정 없음  →  Mock Provider  (기본값, 무료, 즉시 동작)
TRIPO_API_KEY 있음 →  Tripo Provider
MESHY_API_KEY 있음 →  Meshy Provider
```

새 Provider 추가 방법:

```typescript
// 1. webapp/src/lib/providers/새이름.ts 생성
export const 새provider: ModelProvider = {
  id: '새이름',
  async generate(image) { ... }
};

// 2. index.ts 에 한 줄 추가
if (process.env.새_API_KEY) return 새provider;
```

---

## 실행 방법

```bash
# 개발 서버
cd webapp && npm install && npm run dev
# → http://localhost:3000

# 프로덕션 빌드 (검증됨)
npm run build && npm start

# 샘플 GLB 재생성
node scripts/generate-sample-glb.mjs
```

---

## API 키 설정 (선택)

`webapp/.env.local` 파일에만 기록합니다. **이 파일은 .gitignore에 포함되어 절대 커밋되지 않습니다.**

```env
TRIPO_API_KEY=your_key_here
MESHY_API_KEY=your_key_here
```

`.env.local.example`을 복사해서 시작하면 됩니다.

---

## 빌드 결과

```
Route              Size      First Load JS
/                  4.96 kB   106 kB
/api/generate3d    136 B     101 kB
```

---

## 다음 단계

| 우선순위 | 기능 | 비고 |
|----------|------|------|
| 🔴 | Vercel 배포 (개인 테스트용) | `webapp/`를 루트로 설정 |
| 🔴 | 무료 오픈소스 3D Provider 탐색 | TripoSG, Shap-E, InstantMesh 등 |
| 🟡 | 생성 취소 (AbortController) | 생성 중 취소 기능 |
| 🟡 | 최근 생성 목록 (localStorage) | 새로고침 후에도 유지 |
| 🟢 | 와이어프레임 토글 | 뷰어 모드 전환 |

---

## 보안 체크리스트

- [x] `.env.local` → `.gitignore` 포함
- [x] `.env`, `.env.*.local` 등 모든 env 파일 패턴 차단
- [x] `*.key`, `*.secret` 파일 패턴 차단
- [x] `.env.local.example` 만 커밋 (실제 값 없음)
- [ ] Vercel 환경변수는 대시보드에서만 설정 (코드에 하드코딩 금지)

---

## 커밋 이력

| 커밋 | 내용 |
|------|------|
| `최신` | refactor: Provider 패턴 도입, 개인용 방향 정리 |
| `6fa6cc5` | refactor: Mock 흐름 안정화, 성능/에러 처리 개선 |
| `2117341` | docs: PROJECT_STATUS.md 초기 작성 |
| `42a7a00` | feat: 이미지→3D 변환 웹앱 MVP 초기 구현 |
