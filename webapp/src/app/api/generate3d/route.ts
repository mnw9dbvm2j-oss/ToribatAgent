import { NextRequest, NextResponse } from 'next/server';

const TRIPO_API_KEY = process.env.TRIPO_API_KEY;
const MESHY_API_KEY = process.env.MESHY_API_KEY;
const USE_MOCK = !TRIPO_API_KEY && !MESHY_API_KEY;

export const maxDuration = 60; // 최대 60초 대기

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get('image') as File | null;

  if (!image) {
    return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
  }

  if (image.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 });
  }

  // ─────────────── Mock 모드 (API 키 없을 때) ───────────────
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 3500));
    return NextResponse.json({
      status: 'completed',
      modelUrl: '/sample.glb',
      taskId: `mock-${Date.now()}`,
      mode: 'mock',
    });
  }

  // ─────────────── Tripo AI 연동 ───────────────
  if (TRIPO_API_KEY) {
    try {
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = image.type || 'image/jpeg';

      // 1단계: 작업 생성
      const createRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TRIPO_API_KEY}`,
        },
        body: JSON.stringify({
          type: 'image_to_model',
          file: {
            type: mimeType,
            data: base64,
          },
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.data?.task_id) {
        return NextResponse.json({ error: 'Tripo 작업 생성 실패' }, { status: 500 });
      }

      const taskId = createData.data.task_id;

      // 2단계: 완료될 때까지 폴링
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
          headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` },
        });
        const statusData = await statusRes.json();
        const taskStatus = statusData.data?.status;

        if (taskStatus === 'success') {
          const modelUrl = statusData.data?.output?.pbr_model || statusData.data?.output?.model;
          return NextResponse.json({ status: 'completed', modelUrl, taskId });
        }
        if (taskStatus === 'failed') {
          return NextResponse.json({ error: 'Tripo 생성 실패' }, { status: 500 });
        }
      }

      return NextResponse.json({ error: '생성 시간 초과' }, { status: 504 });
    } catch (e) {
      return NextResponse.json({ error: 'Tripo API 오류' }, { status: 500 });
    }
  }

  // ─────────────── Meshy AI 연동 ───────────────
  if (MESHY_API_KEY) {
    try {
      // Meshy는 image_url 방식 사용 (별도 파일 업로드 필요)
      // MVP에서는 base64 data URL 사용
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const dataUrl = `data:${image.type};base64,${base64}`;

      const createRes = await fetch('https://api.meshy.ai/v1/image-to-3d', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MESHY_API_KEY}`,
        },
        body: JSON.stringify({
          image_url: dataUrl,
          enable_pbr: false, // 모바일 최적화: PBR 비활성화
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.id) {
        return NextResponse.json({ error: 'Meshy 작업 생성 실패' }, { status: 500 });
      }

      const taskId = createData.id;

      // 폴링
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`https://api.meshy.ai/v1/image-to-3d/${taskId}`, {
          headers: { 'Authorization': `Bearer ${MESHY_API_KEY}` },
        });
        const statusData = await statusRes.json();

        if (statusData.status === 'SUCCEEDED') {
          const modelUrl = statusData.model_urls?.glb;
          return NextResponse.json({ status: 'completed', modelUrl, taskId });
        }
        if (statusData.status === 'FAILED') {
          return NextResponse.json({ error: 'Meshy 생성 실패' }, { status: 500 });
        }
      }

      return NextResponse.json({ error: '생성 시간 초과' }, { status: 504 });
    } catch (e) {
      return NextResponse.json({ error: 'Meshy API 오류' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
}
