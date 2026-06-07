import { NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/providers';

// 매 요청마다 실행 (캐시 안 함 — 환경변수 변경 즉시 반영)
export const dynamic = 'force-dynamic';

export interface StatusResponse {
  provider: string;
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  const provider = getActiveProvider();
  return NextResponse.json({ provider: provider.id });
}
