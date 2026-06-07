'use client';

interface Props {
  progress: number;
  statusText: string;
}

export default function ProgressIndicator({ progress, statusText }: Props) {
  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-5">
      {/* 회전 애니메이션 */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div
          className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent"
          style={{
            animation: 'spin 1s linear infinite',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold text-sm">{Math.round(progress)}%</span>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* 상태 텍스트 */}
      <div className="text-center">
        <p className="text-white font-medium text-sm">{statusText}</p>
        <p className="text-gray-500 text-xs mt-1">잠시만 기다려 주세요</p>
      </div>

      {/* 단계 표시 */}
      <div className="flex gap-2">
        {['분석', '생성', '최적화'].map((step, i) => (
          <div
            key={step}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all duration-500 ${
              progress > i * 33
                ? 'bg-violet-600/30 text-violet-300'
                : 'bg-white/5 text-gray-600'
            }`}
          >
            {progress > (i + 1) * 33 ? '✓' : `${i + 1}`} {step}
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
