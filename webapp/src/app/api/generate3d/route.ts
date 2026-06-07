import { NextRequest, NextResponse } from 'next/server';

// ─── 공통 타입 ─────────────────────────────────────────────────────
export interface GenerateSuccessResponse {
  status: 'completed';
  modelUrl: string;
  taskId: string;
  mode: 'mock' | 'tripo' | 'meshy';
}

export interface GenerateErrorResponse {
  error: string;
}

export type GenerateResponse = GenerateSuccessResponse | GenerateErrorResponse;

// ─── 설정 ──────────────────────────────────────────────────────────
const TRIPO_API_KEY  = process.env.TRIPO_API_KEY;
const MESHY_API_KEY  = process.env.MESHY_API_KEY;
const USE_MOCK       = !TRIPO_API_KEY && !MESHY_API_KEY;

const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES      = 10 * 1024 * 1024; // 10MB

// Vercel 서버리스 최대 실행 시간 (초)
export const maxDuration = 60;

// ─── 공통 입력 검증 ────────────────────────────────────────────────
async function validateImage(request: NextRequest): Promise<
  { ok: true; image: File } | { ok: false; res: NextResponse }
> {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return { ok: false, res: NextResponse.json<GenerateErrorResponse>({ error: '요청 파싱 실패' }, { status: 400 }) };
  }

  const image = formData.get('image');
  if (!(image instanceof File)) {
    return { ok: false, res: NextResponse.json<GenerateErrorResponse>({ error: '이미지 파일이 없습니다.' }, { status: 400 }) };
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return { ok: false, res: NextResponse.json<GenerateErrorResponse>({ error: `JPG, PNG, WEBP 형식만 허용됩니다. (받은 형식: ${image.type || '알 수 없음'})` }, { status: 415 }) };
  }
  if (image.size > MAX_BYTES) {
    return { ok: false, res: NextResponse.json<GenerateErrorResponse>({ error: `파일 크기 초과 (${(image.size / 1024 / 1024).toFixed(1)}MB → 10MB 이하만 허용)` }, { status: 413 }) };
  }
  return { ok: true, image };
}

// ─── 메인 핸들러 ───────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  const validated = await validateImage(request);
  if (!validated.ok) return validated.res as NextResponse<GenerateResponse>;
  const { image } = validated;

  // ── Mock 모드 ─────────────────────────────────────────────────────
  if (USE_MOCK) {
    await sleep(3500); // 실제 API 처리 시간 모사
    return NextResponse.json<GenerateSuccessResponse>({
      status:   'completed',
      modelUrl: '/sample.glb',
      taskId:   `mock-${Date.now()}`,
      mode:     'mock',
    });
  }

  // ── Tripo AI ─────────────────────────────────────────────────────
  if (TRIPO_API_KEY) {
    return handleTripo(image, TRIPO_API_KEY);
  }

  // ── Meshy AI ─────────────────────────────────────────────────────
  if (MESHY_API_KEY) {
    return handleMeshy(image, MESHY_API_KEY);
  }

  // 이 줄에 도달하면 로직 버그 (위에서 USE_MOCK로 처리됨)
  return NextResponse.json<GenerateErrorResponse>({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
}

// ─── Tripo AI 연동 ────────────────────────────────────────────────
async function handleTripo(image: File, apiKey: string): Promise<NextResponse<GenerateResponse>> {
  try {
    const bytes  = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    // 1. 작업 생성
    const createRes  = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        type: 'image_to_model',
        file: { type: image.type, data: base64 },
      }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.data?.task_id) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: `Tripo 작업 생성 실패: ${createData.message ?? createRes.status}` },
        { status: 502 }
      );
    }

    const taskId = createData.data.task_id as string;

    // 2. 폴링 (최대 90초, 3초 간격)
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const statusRes  = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusRes.json();
      const taskStatus = statusData.data?.status as string | undefined;

      if (taskStatus === 'success') {
        const modelUrl: string = statusData.data?.output?.pbr_model ?? statusData.data?.output?.model;
        if (!modelUrl) {
          return NextResponse.json<GenerateErrorResponse>({ error: 'Tripo: 모델 URL 없음' }, { status: 502 });
        }
        return NextResponse.json<GenerateSuccessResponse>({ status: 'completed', modelUrl, taskId, mode: 'tripo' });
      }
      if (taskStatus === 'failed') {
        return NextResponse.json<GenerateErrorResponse>({ error: 'Tripo 생성 실패' }, { status: 502 });
      }
    }

    return NextResponse.json<GenerateErrorResponse>({ error: 'Tripo 생성 시간 초과' }, { status: 504 });
  } catch {
    return NextResponse.json<GenerateErrorResponse>({ error: 'Tripo API 통신 오류' }, { status: 502 });
  }
}

// ─── Meshy AI 연동 ───────────────────────────────────────────────
async function handleMeshy(image: File, apiKey: string): Promise<NextResponse<GenerateResponse>> {
  try {
    const bytes   = await image.arrayBuffer();
    const base64  = Buffer.from(bytes).toString('base64');
    const dataUrl = `data:${image.type};base64,${base64}`;

    // 1. 작업 생성
    const createRes  = await fetch('https://api.meshy.ai/v1/image-to-3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        image_url:  dataUrl,
        enable_pbr: false, // 모바일 최적화: PBR 텍스처 생략
      }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: `Meshy 작업 생성 실패: ${createData.message ?? createRes.status}` },
        { status: 502 }
      );
    }

    const taskId = createData.id as string;

    // 2. 폴링
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const statusRes  = await fetch(`https://api.meshy.ai/v1/image-to-3d/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusRes.json();
      const taskStatus = statusData.status as string | undefined;

      if (taskStatus === 'SUCCEEDED') {
        const modelUrl: string = statusData.model_urls?.glb;
        if (!modelUrl) {
          return NextResponse.json<GenerateErrorResponse>({ error: 'Meshy: GLB URL 없음' }, { status: 502 });
        }
        return NextResponse.json<GenerateSuccessResponse>({ status: 'completed', modelUrl, taskId, mode: 'meshy' });
      }
      if (taskStatus === 'FAILED' || taskStatus === 'EXPIRED') {
        return NextResponse.json<GenerateErrorResponse>({ error: `Meshy 생성 실패 (${taskStatus})` }, { status: 502 });
      }
    }

    return NextResponse.json<GenerateErrorResponse>({ error: 'Meshy 생성 시간 초과' }, { status: 504 });
  } catch {
    return NextResponse.json<GenerateErrorResponse>({ error: 'Meshy API 통신 오류' }, { status: 502 });
  }
}

// ─── 유틸 ────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
