import type { ModelProvider, GenerationResult } from './types';

// 기본 Provider: API 키 없이 로컬에서 동작
// API 키가 설정되지 않으면 자동으로 이 Provider가 선택됨
export const mockProvider: ModelProvider = {
  id: 'mock',

  async generate(_image: File): Promise<GenerationResult> {
    // 실제 API 처리 시간을 흉내냄
    await new Promise(r => setTimeout(r, 3500));
    return {
      modelUrl: '/sample.glb',
      taskId: `mock-${Date.now()}`,
    };
  },
};
