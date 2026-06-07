'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader from '@/components/ImageUploader';
import ProgressIndicator from '@/components/ProgressIndicator';

const ModelViewer = dynamic(() => import('@/components/ModelViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-gray-400">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm">3D 뷰어 초기화 중...</p>
      </div>
    </div>
  ),
});

type AppState = 'idle' | 'ready' | 'generating' | 'done';

const STATUS_MESSAGES = [
  '이미지 분석 중...',
  'AI가 3D 구조를 추정 중...',
  '보이지 않는 면 생성 중...',
  '메쉬 최적화 중...',
  '텍스처 처리 중...',
  '거의 완료됐어요...',
];

export default function Home() {
  const [state, setState] = useState<AppState>('idle');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);

  // 앱 시작 시 현재 Provider 확인
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then((d: { provider?: string }) => setProviderName(d.provider ?? 'unknown'))
      .catch(() => setProviderName('unknown'));
  }, []);

  // 중복 요청 방지용 ref
  const isGeneratingRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
    if (statusTimerRef.current)  { clearInterval(statusTimerRef.current);  statusTimerRef.current = null; }
  };

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
    setState('ready');
    setModelUrl(null);
    setError(null);
    setViewerError(null);
  }, [imagePreview]);

  const handleGenerate = async () => {
    if (!imageFile || isGeneratingRef.current) return;

    isGeneratingRef.current = true;
    setState('generating');
    setProgress(0);
    setStatusText(STATUS_MESSAGES[0]);
    setError(null);
    setViewerError(null);

    // 진행률 / 상태 메시지 타이머
    let msgIdx = 0;
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => (prev >= 88 ? prev : prev + Math.random() * 4 + 1));
    }, 400);
    statusTimerRef.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % STATUS_MESSAGES.length;
      setStatusText(STATUS_MESSAGES[msgIdx]);
    }, 2000);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const res = await fetch('/api/generate3d', { method: 'POST', body: formData });
      const data: { status?: string; modelUrl?: string; error?: string } = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `서버 오류 (${res.status})`);
      }
      if (!data.modelUrl) {
        throw new Error('모델 URL을 받지 못했습니다.');
      }

      setProgress(100);
      setStatusText('완료!');
      setModelUrl(data.modelUrl);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
      setState('ready');
    } finally {
      clearTimers();
      isGeneratingRef.current = false;
    }
  };

  const handleViewerError = useCallback((message: string) => {
    setViewerError(message);
  }, []);

  const handleDownload = () => {
    if (!modelUrl) return;
    const a = document.createElement('a');
    a.href = modelUrl;
    a.download = 'model.glb';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    if (isGeneratingRef.current) return; // 생성 중에는 리셋 차단
    clearTimers();
    setState('idle');
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setModelUrl(null);
    setProgress(0);
    setStatusText('');
    setError(null);
    setViewerError(null);
  };

  const isGenerating = state === 'generating';

  return (
    <main className="flex flex-col h-screen bg-[#0a0a0f] select-none">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-sm font-bold">
            3D
          </div>
          <h1 className="text-white font-semibold text-base">이미지 → 3D 변환기</h1>
        </div>

        {/* 생성 중에는 다시 시작 비활성화 */}
        {state !== 'idle' && (
          <button
            onClick={handleReset}
            disabled={isGenerating}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              isGenerating
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            다시 시작
          </button>
        )}
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-hidden relative min-h-0">

        {/* ── 업로드 / 준비 화면 ─────────────────────────── */}
        {(state === 'idle' || state === 'ready') && (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 flex flex-col min-h-0">
              {imagePreview ? (
                <div className="flex-1 relative rounded-2xl overflow-hidden bg-[#14141f] border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="업로드된 이미지"
                    className="w-full h-full object-contain"
                  />
                  <button
                    onClick={handleReset}
                    className="absolute top-3 right-3 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors text-lg leading-none"
                    aria-label="이미지 제거"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <ImageUploader onImageSelect={handleImageSelect} />
              )}
            </div>

            <div className="px-4 pb-6 flex-shrink-0 space-y-3">
              {/* API / 네트워크 에러 */}
              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <span className="text-red-400 shrink-0">⚠</span>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {state === 'ready' && (
                <>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="w-full py-4 bg-violet-600 hover:bg-violet-700 active:bg-violet-800
                               disabled:opacity-60 disabled:cursor-not-allowed
                               text-white font-semibold rounded-2xl transition-colors text-base"
                  >
                    ✨ 3D 생성하기
                  </button>
                  <p className="text-center text-xs text-gray-500">
                    AI가 보이지 않는 부분까지 추정해서 3D 모델을 만들어요
                  </p>
                </>
              )}

              {state === 'idle' && (
                <p className="text-center text-xs text-gray-500">
                  JPG, PNG, WEBP 지원 · 최대 10MB
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 생성 중 화면 ────────────────────────────────── */}
        {state === 'generating' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
              {imagePreview && (
                <div className="w-28 h-28 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="분석 중인 이미지" className="w-full h-full object-cover" />
                </div>
              )}
              <ProgressIndicator progress={Math.min(progress, 100)} statusText={statusText} />
            </div>
          </div>
        )}

        {/* ── 3D 뷰어 화면 ────────────────────────────────── */}
        {state === 'done' && modelUrl && (
          <div className="flex flex-col h-full">
            {/* 3D 뷰어 */}
            <div className="flex-1 min-h-0 m-3 rounded-2xl overflow-hidden border border-white/10">
              <ModelViewer url={modelUrl} onError={handleViewerError} />
            </div>

            {/* 뷰어 에러 배너 */}
            {viewerError && (
              <p className="text-center text-xs text-red-400 px-4 py-1">
                뷰어 오류: {viewerError}
              </p>
            )}

            {!viewerError && (
              <div className="text-center py-1">
                <p className="text-xs text-gray-500">손가락으로 회전 · 두 손가락으로 확대/축소</p>
              </div>
            )}

            {/* 하단 버튼 */}
            <div className="px-4 pb-6 pt-2 flex-shrink-0 flex gap-3">
              {imagePreview && (
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/20 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="원본" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={handleDownload}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-semibold rounded-xl transition-colors text-sm"
                >
                  GLB 다운로드
                </button>
                <button
                  onClick={handleReset}
                  className="w-full py-2 border border-white/20 hover:bg-white/5 text-gray-300 rounded-xl transition-colors text-sm"
                >
                  새 이미지로 다시 생성
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ── 하단 상태 표시줄 ─────────────────────────────── */}
      <footer className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-white/5">
        <ProviderBadge name={providerName} />
        <span className="text-xs text-gray-700">개인용</span>
      </footer>
    </main>
  );
}

// ─── Provider 배지 ────────────────────────────────────────────────
function ProviderBadge({ name }: { name: string | null }) {
  if (name === null) {
    return <span className="text-xs text-gray-800">모드 확인 중...</span>;
  }

  const isMock = name === 'mock';
  const label  = isMock ? 'Mock' : name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <span className="text-xs text-gray-600 flex items-center gap-1.5">
      현재 모드:{' '}
      <span
        className={`font-medium ${isMock ? 'text-amber-600' : 'text-emerald-500'}`}
        title={isMock ? 'API 키 없음 — sample.glb 반환' : `${name} API 사용 중`}
      >
        {label} Provider
      </span>
    </span>
  );
}
