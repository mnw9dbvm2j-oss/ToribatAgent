'use client';

interface Props {
  progress: number;
  statusText: string;
}

const STEPS = ['분석', '생성', '최적화'] as const;

export default function ProgressIndicator({ progress, statusText }: Props) {
  const clamped = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-5">
      {/* 회전 스피너 (Tailwind animate-spin 사용) */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        <span className="text-white font-bold text-sm tabular-nums">{Math.round(clamped)}%</span>
      </div>

      {/* 진행률 바 */}
      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* 상태 텍스트 */}
      <div className="text-center min-h-[2.5rem] flex flex-col items-center justify-center">
        <p className="text-white font-medium text-sm">{statusText}</p>
        <p className="text-gray-500 text-xs mt-0.5">잠시만 기다려 주세요</p>
      </div>

      {/* 단계 칩 */}
      <div className="flex gap-2">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all duration-500 ${
              clamped > i * 33
                ? 'bg-violet-600/30 text-violet-300'
                : 'bg-white/5 text-gray-600'
            }`}
          >
            {clamped > (i + 1) * 33 ? '✓' : `${i + 1}`} {step}
          </div>
        ))}
      </div>
    </div>
  );
}
