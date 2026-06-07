# PROJECT_STATUS.md

> 마지막 업데이트: 2026-06-07  
> 브랜치: `claude/image-to-3d-webapp-5FGno`

---

## 프로젝트 개요

**이름**: 이미지 → 3D 변환 웹앱  
**목표**: 사진 1장을 업로드하면 AI가 보이지 않는 면까지 추정해서 3D 모델(GLB)을 생성하고, 모바일 브라우저에서 손가락으로 회전/확대/축소할 수 있는 웹앱

---

## 현재 완료된 것

### MVP 1차 기능 ✅

| 기능 | 파일 | 상태 |
|------|------|------|
| 이미지 업로드 (드래그앤드롭 + 갤러리/카메라) | `ImageUploader.tsx` | ✅ |
| 파일 형식 검사 (JPG/PNG/WEBP만 허용) | `ImageUploader.tsx`, `route.ts` | ✅ |
| 파일 용량 검사 (10MB 이하) | `ImageUploader.tsx`, `route.ts` | ✅ |
| 인라인 에러 메시지 (alert → UI 내 표시) | `ImageUploader.tsx` | ✅ |
| 이미지 미리보기 | `page.tsx` | ✅ |
| 3D 생성 버튼 (중복 클릭 방지) | `page.tsx` | ✅ |
| 생성 중 버튼 비활성화 / 다시 시작 차단 | `page.tsx` | ✅ |
| 생성 진행 상태 표시 (진행률 + 단계 메시지) | `ProgressIndicator.tsx` | ✅ |
| GLB 3D 뷰어 (터치 회전/확대/축소) | `ModelViewer.tsx` | ✅ |
| GLB 로딩 실패 에러 처리 + 오버레이 | `ModelViewer.tsx` | ✅ |
| GLB 다운로드 버튼 | `page.tsx` | ✅ |
| Mock API 구조 (API 키 없이 동작) | `route.ts` | ✅ |
| Tripo AI 연동 구조 | `route.ts` | ✅ |
| Meshy AI 연동 구조 | `route.ts` | ✅ |
| API 응답 TypeScript 타입 명확화 | `route.ts` | ✅ |
| 서버사이드 파일 형식 / 용량 검증 | `route.ts` | ✅ |

### 모바일 성능 최적화 ✅

| 항목 | 적용 내용 |
|------|----------|
| `dpr={[1, 2]}` | 픽셀 밀도 최대 2배 제한 |
| `powerPreference: 'low-power'` | GPU 절전 모드 |
| `antialias: false` | 모바일에서 가장 무거운 요소 제거 |
| 그림자 없음 | `castShadow` / `receiveShadow` 미사용 |
| 조명 2개 → 1개 감소 | directionalLight 3개 → 2개 → 불필요한 두 번째 조명 1개 제거 |
| `meshBasicMaterial` (로딩 큐브) | `meshStandardMaterial` 대비 연산량 최소화 |
| `useMemo` 씬 정규화 | 렌더마다 Box3/scale 연산 → 씬 변경 시 1회만 |
| `scene` 직접 뮤테이션 제거 | group 트랜스폼으로 대체 |
| `styled-jsx` 제거 | Tailwind `animate-spin` 대체 |

---

## 기술 스택

| 분류 | 선택 | 버전 |
|------|------|------|
| 프레임워크 | Next.js | 15.3.3 |
| 3D 렌더링 | React Three Fiber | ^8.16.8 |
| 3D 유틸 | @react-three/drei | ^9.108.3 |
| 3D 엔진 | Three.js | ^0.166.1 |
| 스타일 | Tailwind CSS | ^3.4.1 |
| 언어 | TypeScript | ^5 |

---

## 폴더 구조

```
ToribatAgent/
├── webapp/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── .env.local.example          ← API 키 템플릿
│   ├── public/
│   │   ├── sample.glb              ← Mock용 보라색 박스 (1.6KB)
│   │   └── manifest.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          ← 루트 레이아웃, 모바일 뷰포트
│       │   ├── page.tsx            ← 메인 페이지 (4단계 상태 관리)
│       │   ├── globals.css
│       │   └── api/generate3d/
│       │       └── route.ts        ← Mock + Tripo + Meshy, TS 타입 포함
│       └── components/
│           ├── ImageUploader.tsx   ← 파일 형식/용량 검증 + 인라인 에러
│           ├── ModelViewer.tsx     ← 에러 경계 + 오버레이 + 성능 최적화
│           └── ProgressIndicator.tsx ← Tailwind animate-spin
└── scripts/
    └── generate-sample-glb.mjs    ← 샘플 GLB 생성 스크립트
```

---

## 앱 상태 흐름

```
idle
  └─ 이미지 선택 (JPG/PNG/WEBP, 10MB 이하)
ready
  └─ "3D 생성하기" 클릭 (중복 클릭 방지 / 생성 중 리셋 차단)
generating
  └─ 진행률 + 상태 메시지 순환
  └─ 성공 → done / 실패 → ready (에러 메시지 표시)
done
  └─ 3D 뷰어 (GLB 로딩 실패 시 에러 오버레이)
  └─ GLB 다운로드 버튼
  └─ "새 이미지로 다시 생성" → idle
```

---

## API 응답 타입

```typescript
// 성공
{ status: 'completed'; modelUrl: string; taskId: string; mode: 'mock' | 'tripo' | 'meshy' }

// 실패
{ error: string }
```

---

## 실행 방법

```bash
# 1. 의존성 설치
cd webapp && npm install

# 2. 개발 서버 실행
npm run dev
# → http://localhost:3000

# 3. 프로덕션 빌드 (검증됨 ✅)
npm run build && npm start

# 4. 샘플 GLB 재생성
cd .. && node scripts/generate-sample-glb.mjs
```

---

## API 키 연동 방법

```env
# webapp/.env.local
TRIPO_API_KEY=your_key_here   # https://platform.tripo3d.ai/
MESHY_API_KEY=your_key_here   # https://www.meshy.ai/
```

- 둘 다 없으면 → **Mock 모드** (3.5초 후 sample.glb 반환)
- 키 있으면 → 실제 API 호출 (폴링 최대 90초)

---

## 빌드 결과 (최신)

```
Route              Size      First Load JS
/                  4.96 kB   106 kB       ← 이전 7.47 kB에서 감소
/api/generate3d    136 B     101 kB
```

---

## 다음 단계

| 기능 | 우선순위 | 비고 |
|------|----------|------|
| 실제 API 키 연동 및 E2E 테스트 | 🔴 높음 | API 키 필요 |
| Vercel 배포 | 🔴 높음 | `webapp/` 폴더를 루트로 설정 |
| 생성 취소 버튼 (AbortController) | 🟡 중간 | 생성 중 취소 기능 |
| 생성 이력 (localStorage) | 🟡 중간 | 최근 모델 목록 |
| 여러 뷰 모드 (와이어프레임 토글) | 🟢 낮음 | |
| 모델 배경 환경맵 | 🟢 낮음 | 더 예쁜 뷰어 |

---

## 의도적으로 제외한 것

회원가입 · 결제 · AR · Unity/Unreal 연동 · 복잡한 3D 편집기 · 여러 모델 동시 표시 · 앱스토어 배포 · 실시간 그림자 · 복잡한 후처리

---

## Git 커밋 이력

| 커밋 | 내용 |
|------|------|
| `최신` | refactor: Mock 흐름 안정화 (성능 최적화, 에러 처리, 유효성 검사) |
| `2117341` | docs: PROJECT_STATUS.md 초기 작성 |
| `42a7a00` | feat: 이미지→3D 변환 웹앱 MVP 초기 구현 |
| `1154cec` | Initial commit |
