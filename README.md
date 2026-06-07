# 이미지 → 3D 변환기

> **개인용 도구입니다.** 사진 1장으로 AI가 3D 모델(GLB)을 생성하고, 모바일 브라우저에서 손가락으로 회전/확대/축소할 수 있는 웹앱.

---

## 빠른 시작

```bash
cd webapp
npm install
npm run dev
# → http://localhost:3000
```

API 키 없이도 **Mock 모드**로 즉시 동작합니다.

---

## 사용 방법

1. 이미지 업로드 (JPG / PNG / WEBP, 최대 10MB)
2. **3D 생성하기** 버튼 클릭
3. 3D 모델 뷰어에서 확인 (손가락으로 회전/확대)
4. GLB 다운로드

---

## API 키 설정 (선택)

실제 3D 생성이 필요하면 `webapp/.env.local` 파일을 만들어 키를 넣습니다.  
이 파일은 `.gitignore`에 포함되어 **절대 GitHub에 올라가지 않습니다.**

```env
# webapp/.env.local  ← 이 파일은 절대 커밋하지 말 것

# Tripo AI (https://platform.tripo3d.ai/)
TRIPO_API_KEY=your_key_here

# Meshy AI (https://www.meshy.ai/)
MESHY_API_KEY=your_key_here
```

키가 없으면 자동으로 Mock 모드가 활성화됩니다.

---

## Provider 구조

새로운 3D 생성 엔진을 붙이려면 파일 하나만 추가하면 됩니다.

```
webapp/src/lib/providers/
├── types.ts     ← ModelProvider 인터페이스
├── mock.ts      ← 기본값 (API 키 불필요)
├── tripo.ts     ← Tripo AI (유료)
├── meshy.ts     ← Meshy AI (유료)
└── index.ts     ← 활성 Provider 선택 로직
```

**새 Provider 추가 예시** (Hugging Face 등 무료 엔진):

```typescript
// webapp/src/lib/providers/huggingface.ts
import type { ModelProvider } from './types';

export const huggingfaceProvider: ModelProvider = {
  id: 'huggingface',
  async generate(image) {
    // HF API 호출
    return { modelUrl: '...', taskId: '...' };
  },
};
```

```typescript
// webapp/src/lib/providers/index.ts 에 한 줄 추가
if (process.env.HF_TOKEN) return huggingfaceProvider;
```

---

## 프로젝트 방향

- **개인 사용** 목적 — 공개 서비스가 아님
- API 비용이 드는 유료 서비스 의존도 최소화
- 무료/오픈소스 엔진으로 언제든 교체 가능한 구조
- 모바일 브라우저 성능 최우선 (그림자/후처리 없음)
- 회원가입 / 결제 / 다중 사용자 기능 없음

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | Next.js 15 |
| 3D 뷰어 | React Three Fiber + Three.js |
| 스타일 | Tailwind CSS |
| 언어 | TypeScript |

---

## 폴더 구조

```
ToribatAgent/
├── webapp/               ← Next.js 웹앱
│   ├── src/
│   │   ├── app/          ← 페이지, API 라우트
│   │   ├── components/   ← UI 컴포넌트
│   │   └── lib/
│   │       └── providers/ ← 3D 생성 엔진 추상화
│   └── public/
│       └── sample.glb    ← Mock용 샘플 모델
├── scripts/
│   └── generate-sample-glb.mjs
└── PROJECT_STATUS.md
```

---

## 현재 상태 및 다음 단계

→ [PROJECT_STATUS.md](./PROJECT_STATUS.md) 참고
