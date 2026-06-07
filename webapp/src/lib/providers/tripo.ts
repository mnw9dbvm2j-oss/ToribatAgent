import type { ModelProvider, GenerationResult } from './types';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30; // 최대 90초
const BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

// 유료 Provider (TRIPO_API_KEY 환경변수 필요)
// https://platform.tripo3d.ai/
export const tripoProvider: ModelProvider = {
  id: 'tripo',

  async generate(image: File): Promise<GenerationResult> {
    const apiKey = process.env.TRIPO_API_KEY;
    if (!apiKey) throw new Error('TRIPO_API_KEY가 설정되지 않았습니다.');

    const bytes  = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    // 1단계: 작업 생성
    const createRes = await fetch(`${BASE_URL}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ type: 'image_to_model', file: { type: image.type, data: base64 } }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.data?.task_id) {
      throw new Error(`Tripo 작업 생성 실패: ${createData.message ?? createRes.status}`);
    }
    const taskId = createData.data.task_id as string;

    // 2단계: 완료까지 폴링
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes  = await fetch(`${BASE_URL}/task/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusRes.json();
      const status     = statusData.data?.status as string | undefined;

      if (status === 'success') {
        const modelUrl: string = statusData.data?.output?.pbr_model ?? statusData.data?.output?.model;
        if (!modelUrl) throw new Error('Tripo: 모델 URL 없음');
        return { modelUrl, taskId };
      }
      if (status === 'failed') {
        throw new Error('Tripo 생성 실패');
      }
    }

    throw new Error('Tripo 생성 시간 초과 (90초)');
  },
};
