# PROJECT_STATUS.md

> 마지막 업데이트: 2026-06-07
> 브랜치: `claude/image-to-3d-webapp-5FGno`

---

## 프로젝트 개요

**이름**: 이미지 → 3D 변환 웹앱  
**목표**: 사진 1장을 업로드하면 AI가 보이지 않는 면까지 추정해서 3D 모델(GLB)을 생성하고, 모바일 브라우저에서 손가락으로 회전/확대/축소할 수 있는 웹앱

---

## 현재 완료된 것 (MVP 1차)

### 구현됨 ✅

| 기능 | 파일 | 상태 |
|------|------|------|
| 이미지 업로드 (드래그앤드롭 + 카메라/갤러리) | `src/components/ImageUploader.tsx` | 완료 |
| 이미지 미리보기 | `src/app/page.tsx` | 완료 |
| 3D 생성 버튼 | `src/app/page.tsx` | 완료 |
| 생성 진행 상태 표시 (진행률 바 + 단계 텍스트) | `src/components/ProgressIndicator.tsx` | 완료 |
| GLB 3D 뷰어 (터치 회전/확대/축소) | `src/components/ModelViewer.tsx` | 완료 |
| GLB 다운로드 버튼 | `src/app/page.tsx` | 완료 |
| 모바일 화면 최적화 | 전체 | 완료 |
| Mock API 구조 | `src/app/api/generate3d/route.ts` | 완료 |
| Tripo AI 연동 구조 (API 키만 있으면 동작) | `src/app/api/generate3d/route.ts` | 완료 |
| Meshy AI 연동 구조 (API 키만 있으면 동작) | `src/app/api/generate3d/route.ts` | 완료 |
| 샘플 GLB 자동 생성 스크립트 | `scripts/generate-sample-glb.mjs` | 완료 |

---

## 기술 스택

| 분류 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | 빠른 개발, Vercel 무료 배포 |
| 3D 뷰어 | React Three Fiber + drei | 터치 지원, 모바일 최적화 쉬움 |
| 3D 엔진 | Three.js 0.166 | 검증된 GLB 로더, 가벼움 |
| 스타일 | Tailwind CSS | 모바일 퍼스트 레이아웃 빠름 |
| 언어 | TypeScript | 타입 안정성 |
| 3D 생성 API | Tripo AI / Meshy AI (Mock) | 이미지→GLB 전문 서비스 |

---

## 폴더 구조

```
ToribatAgent/
├── webapp/                          ← Next.js 웹앱 루트
│   ├── package.json                 ← 의존성 (Next.js 15, R3F, three.js)
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── .env.local.example           ← API 키 템플릿
│   ├── public/
│   │   ├── sample.glb               ← Mock용 보라색 박스 모델 (1.6KB)
│   │   └── manifest.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx           ← 루트 레이아웃, 모바일 뷰포트 설정
│       │   ├── page.tsx             ← 메인 페이지 (4가지 상태 관리)
│       │   ├── globals.css          ← 전역 스타일, 터치 최적화
│       │   └── api/generate3d/
│       │       └── route.ts         ← API 라우트 (Mock + Tripo + Meshy)
│       └── components/
│           ├── ImageUploader.tsx    ← 이미지 업로드 UI
│           ├── ModelViewer.tsx      ← Three.js 3D 뷰어
│           └── ProgressIndicator.tsx ← 생성 진행 상태 UI
└── scripts/
    └── generate-sample-glb.mjs     ← 샘플 GLB 생성 스크립트
```

---

## 앱 상태 흐름

```
idle
  → 이미지 선택
ready
  → "3D 생성하기" 버튼 클릭
generating (진행률 표시, 상태 메시지 순환)
  → API 응답 수신
done
  → 3D 뷰어 + 다운로드 버튼
  → "새 이미지로 다시 생성" → idle로 복귀
```

---

## 모바일 최적화 적용 내역

- Canvas `dpr={[1, 2]}` — 픽셀 밀도 최대 2배로 제한
- `powerPreference: 'low-power'` — GPU 절전 모드
- `antialias: false` — 안티앨리어싱 비활성화 (성능 우선)
- 그림자 없음 — 모바일에서 가장 무거운 요소 제거
- 조명 2개만 사용 — AmbientLight + DirectionalLight
- 모델 자동 크기 정규화 — 어떤 GLB든 카메라에 맞게 조정
- `touch-action: none` — 캔버스 터치 이벤트 직접 처리
- `userScalable: false` — 브라우저 핀치줌과 3D 줌 충돌 방지
- `overscroll-behavior: none` — 풀다운 리프레시 방지

---

## 실행 방법

### 로컬 개발 서버

```bash
cd webapp
npm run dev
# → http://localhost:3000
```

### 프로덕션 빌드 (확인 완료 ✅)

```bash
cd webapp
npm run build
npm start
```

### 샘플 GLB 재생성

```bash
node scripts/generate-sample-glb.mjs
```

---

## API 키 연동 방법

`webapp/.env.local` 파일 생성 후:

```env
# Tripo AI (https://platform.tripo3d.ai/)
TRIPO_API_KEY=your_key_here

# 또는 Meshy AI (https://www.meshy.ai/)
MESHY_API_KEY=your_key_here
```

- 둘 다 비어있으면 → **Mock 모드** (3.5초 후 sample.glb 반환)
- 키가 있으면 → 자동으로 실제 API 호출

---

## 아직 하지 않은 것 (다음 단계)

| 기능 | 우선순위 | 비고 |
|------|----------|------|
| 실제 Tripo/Meshy API 키 연동 및 테스트 | 🔴 높음 | API 키 필요 |
| Vercel 배포 | 🔴 높음 | `webapp/` 폴더를 루트로 설정 |
| 생성 실패 시 재시도 UI | 🟡 중간 | 에러 처리 개선 |
| 생성 이력 (로컬스토리지) | 🟡 중간 | 최근 생성 모델 저장 |
| 여러 뷰 모드 (와이어프레임, 텍스처 토글) | 🟢 낮음 | |
| 생성된 모델 배경 환경맵 | 🟢 낮음 | 더 예쁜 뷰어 |
| PWA 아이콘 (192px, 512px) | 🟢 낮음 | manifest.json 있음 |

---

## 의도적으로 제외한 것

- 회원가입 / 로그인
- 결제 시스템
- AR 기능
- Unity / Unreal 연동
- 복잡한 3D 편집기
- 여러 모델 동시 표시
- 앱스토어 / 플레이스토어 배포
- 실시간 그림자 / 복잡한 후처리

---

## Git 커밋 이력

| 커밋 | 내용 |
|------|------|
| `42a7a00` | feat: 이미지→3D 변환 웹앱 MVP 초기 구현 |
| `1154cec` | Initial commit (ToribatAgent Electron 앱) |
