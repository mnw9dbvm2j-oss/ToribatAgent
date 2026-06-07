# 이미지 → 3D 변환기

> **개인용 도구입니다.** 사진 1장으로 AI가 3D 모델(GLB)을 생성하고, 모바일 브라우저에서 손가락으로 회전/확대/축소할 수 있는 웹앱.

---

## 빠른 시작 (로컬)

```bash
npm install
npm run dev
# → http://localhost:3000
```

API 키 없이도 **Mock 모드**로 즉시 동작합니다.  
화면 하단에 현재 모드가 표시됩니다 (`Mock Provider` / `Tripo Provider` / ...).

---

## 사용 방법

1. 이미지 업로드 (JPG / PNG / WEBP, 최대 10MB)
2. **3D 생성하기** 버튼 클릭
3. 3D 모델 뷰어에서 확인 (손가락으로 회전 · 두 손가락으로 확대)
4. GLB 다운로드

---

## API 키 설정 (로컬 개발)

`.env.local` 파일을 직접 만들어서 키를 넣습니다.  
이 파일은 `.gitignore`에 포함되어 **절대 GitHub에 올라가지 않습니다.**

```bash
cp .env.local.example .env.local
# 파일을 열어서 키 값 입력
```

```env
# .env.local  ← 이 파일은 절대 커밋하지 말 것
TRIPO_API_KEY=your_key_here
MESHY_API_KEY=your_key_here
```

---

## Vercel 배포

### Import 시 (처음 배포할 때)

1. [vercel.com](https://vercel.com) → **Add New Project** → GitHub 저장소 선택
2. **Configure Project** 화면에서 아래처럼 설정:

   | 항목 | 값 | 비고 |
   |---|---|---|
   | Framework Preset | Next.js | 자동 감지됨 |
   | Root Directory | `.` (루트) | 기본값 유지 |
   | Build Command | `npm run build` | 기본값 유지 |
   | Output Directory | `.next` | 기본값 유지 |

3. **Deploy** 클릭

### 환경변수 설정 (API 키 사용 시)

> ⚠️ 코드나 `.env.local`에 절대 넣지 않습니다. Vercel 대시보드에서만 설정합니다.

**Vercel 대시보드 → 해당 프로젝트 → Settings → Environment Variables**

| 변수명 | 설명 | 필수 |
|---|---|---|
| `TRIPO_API_KEY` | Tripo AI 키 | 선택 |
| `MESHY_API_KEY` | Meshy AI 키 | 선택 |

- 둘 다 없으면 → **Mock 모드** 자동 활성화 (sample.glb 반환)
- 키를 추가하면 → 해당 Provider로 자동 전환 (재배포 없이 즉시 적용)

---

## Provider 구조

새로운 3D 생성 엔진을 붙이려면 파일 하나만 추가하면 됩니다.

```
src/lib/providers/
├── types.ts     ← ModelProvider 인터페이스
├── mock.ts      ← 기본값 (API 키 불필요, 무료)
├── tripo.ts     ← Tripo AI (유료, 선택)
├── meshy.ts     ← Meshy AI (유료, 선택)
└── index.ts     ← 환경변수 기반 자동 선택
```

**새 Provider 추가 예시** (Hugging Face 등):

```typescript
// src/lib/providers/huggingface.ts
import type { ModelProvider } from './types';

export const huggingfaceProvider: ModelProvider = {
  id: 'huggingface',
  async generate(image) {
    // HF Spaces API 호출
    return { modelUrl: '...', taskId: '...' };
  },
};
```

```typescript
// src/lib/providers/index.ts 에 두 줄 추가
import { huggingfaceProvider } from './huggingface';
if (process.env.HF_TOKEN) return huggingfaceProvider;
```

---

## 폴더 구조

```
image-to-3d-webapp/
├── .env.local.example    ← API 키 템플릿
├── scripts/
│   └── generate-sample-glb.mjs  ← sample.glb 재생성 스크립트
├── public/
│   └── sample.glb        ← Mock용 샘플 모델
└── src/
    ├── app/
    │   ├── page.tsx      ← 메인 페이지
    │   └── api/
    │       ├── generate3d/route.ts  ← 3D 생성 API
    │       └── status/route.ts      ← 현재 Provider 확인 API
    ├── components/
    │   ├── ImageUploader.tsx
    │   ├── ModelViewer.tsx
    │   └── ProgressIndicator.tsx
    └── lib/
        └── providers/    ← 3D 엔진 추상화
```

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | Next.js 15 |
| 3D 뷰어 | React Three Fiber + Three.js |
| 스타일 | Tailwind CSS |
| 언어 | TypeScript |

---

## 프로젝트 방향

- **개인 사용** 목적 — 공개 서비스가 아님
- 유료 API 비용 없이 무료로 동작하는 구조 우선
- 언제든 무료/오픈소스 엔진으로 교체 가능
- 모바일 브라우저 성능 최우선 (그림자/후처리 없음)
- 회원가입 · 결제 · 다중 사용자 기능 없음
