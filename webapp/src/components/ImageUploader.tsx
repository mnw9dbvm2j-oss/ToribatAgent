'use client';

import { useCallback, useRef, useState } from 'react';

interface Props {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
}

export default function ImageUploader({ onImageSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기는 10MB 이하여야 합니다.');
        return;
      }
      onImageSelect(file);
    },
    [onImageSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // 같은 파일 재선택 가능하도록 초기화
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      className={`
        flex-1 flex flex-col items-center justify-center
        border-2 border-dashed rounded-2xl cursor-pointer
        transition-all duration-200 select-none min-h-0
        ${isDragging
          ? 'border-violet-400 bg-violet-500/10'
          : 'border-white/20 bg-[#14141f] hover:border-violet-500/50 hover:bg-violet-500/5 active:scale-[0.98]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />

      {/* 아이콘 */}
      <div className="w-16 h-16 rounded-2xl bg-violet-600/20 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-violet-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
          />
        </svg>
      </div>

      <p className="text-white font-semibold text-base mb-1">
        {isDragging ? '여기에 놓으세요!' : '이미지를 선택하세요'}
      </p>
      <p className="text-gray-400 text-sm mb-2">
        탭하거나 사진을 드래그하세요
      </p>

      {/* 카메라 촬영 힌트 (모바일) */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>📷</span>
          <span>카메라로 촬영</span>
        </div>
        <div className="w-px h-3 bg-gray-700" />
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>🖼️</span>
          <span>갤러리에서 선택</span>
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-4">JPG · PNG · WEBP · 최대 10MB</p>
    </div>
  );
}
