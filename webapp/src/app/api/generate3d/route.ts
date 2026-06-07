import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/providers';

// ─── 응답 타입 ────────────────────────────────────────────────────
export interface GenerateSuccessResponse {
  status: 'completed';
  modelUrl: string;
  taskId: string;
  provider: string;
}

export interface GenerateErrorResponse {
  error: string;
}

export type GenerateResponse = GenerateSuccessResponse | GenerateErrorResponse;

// ─── 상수 ─────────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES     = 10 * 1024 * 1024; // 10MB

// Vercel 서버리스 최대 실행 시간
export const maxDuration = 60;

// ─── 핸들러 ───────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  // 1. 이미지 파싱 및 검증
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return err('요청 파싱 실패', 400);
  }

  const image = formData.get('image');
  if (!(image instanceof File)) {
    return err('이미지 파일이 없습니다.', 400);
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return err(`JPG, PNG, WEBP만 허용됩니다. (받은 형식: ${image.type || '알 수 없음'})`, 415);
  }
  if (image.size > MAX_BYTES) {
    return err(`파일 크기 초과 (${(image.size / 1024 / 1024).toFixed(1)}MB, 최대 10MB)`, 413);
  }

  // 2. 활성 Provider로 생성
  const provider = getActiveProvider();
  try {
    const result = await provider.generate(image);
    return NextResponse.json<GenerateSuccessResponse>({
      status:   'completed',
      modelUrl: result.modelUrl,
      taskId:   result.taskId,
      provider: provider.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return err(`[${provider.id}] ${message}`, 502);
  }
}

// ─── 유틸 ─────────────────────────────────────────────────────────
function err(message: string, status: number): NextResponse<GenerateErrorResponse> {
  return NextResponse.json<GenerateErrorResponse>({ error: message }, { status });
}
