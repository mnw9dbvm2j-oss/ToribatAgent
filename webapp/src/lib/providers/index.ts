import type { ModelProvider } from './types';
import { mockProvider }  from './mock';
import { tripoProvider } from './tripo';
import { meshyProvider } from './meshy';

// ─── Provider 등록 목록 ─────────────────────────────────────────────
// 새 Provider를 추가할 때는 여기에 등록하면 됩니다.
//
// 예: 나중에 무료 오픈소스 엔진을 붙일 때
//   import { huggingfaceProvider } from './huggingface';
//   if (process.env.HF_TOKEN) return huggingfaceProvider;

// ─── 활성 Provider 선택 ─────────────────────────────────────────────
// 우선순위: 무료(Mock) > 유료(Tripo, Meshy)
// 개인 사용 목적이므로 API 키가 없으면 항상 Mock으로 동작합니다.
export function getActiveProvider(): ModelProvider {
  if (process.env.TRIPO_API_KEY)  return tripoProvider;
  if (process.env.MESHY_API_KEY)  return meshyProvider;
  return mockProvider; // 기본값 — 별도 설정 없이 바로 동작
}

export type { ModelProvider, GenerationResult } from './types';
