import type { ModelProvider, GenerationResult } from './types';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30; // 최대 90초
const BASE_URL = 'https://api.meshy.ai/v1';

// 유료 Provider (MESHY_API_KEY 환경변수 필요)
// https://www.meshy.ai/
export const meshyProvider: ModelProvider = {
  id: 'meshy',

  async generate(image: File): Promise<GenerationResult> {
    const apiKey = process.env.MESHY_API_KEY;
    if (!apiKey) throw new Error('MESHY_API_KEY가 설정되지 않았습니다.');

    const bytes   = await image.arrayBuffer();
    const base64  = Buffer.from(bytes).toString('base64');
    const dataUrl = `data:${image.type};base64,${base64}`;

    // 1단계: 작업 생성
    const createRes = await fetch(`${BASE_URL}/image-to-3d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        image_url:  dataUrl,
        enable_pbr: false, // 모바일 최적화: PBR 생략으로 파일 크기 절감
      }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) {
      throw new Error(`Meshy 작업 생성 실패: ${createData.message ?? createRes.status}`);
    }
    const taskId = createData.id as string;

    // 2단계: 완료까지 폴링
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes  = await fetch(`${BASE_URL}/image-to-3d/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusRes.json();
      const status     = statusData.status as string | undefined;

      if (status === 'SUCCEEDED') {
        const modelUrl: string = statusData.model_urls?.glb;
        if (!modelUrl) throw new Error('Meshy: GLB URL 없음');
        return { modelUrl, taskId };
      }
      if (status === 'FAILED' || status === 'EXPIRED') {
        throw new Error(`Meshy 생성 실패 (${status})`);
      }
    }

    throw new Error('Meshy 생성 시간 초과 (90초)');
  },
};
