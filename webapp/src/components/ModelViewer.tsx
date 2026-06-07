'use client';

import { Suspense, useRef, useMemo, useState, Component, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// ─── GLB 로딩 에러 경계 ───────────────────────────────────────────
class GLBErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: (e: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ─── 실제 GLB 모델 ───────────────────────────────────────────────
function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  // scene이 바뀔 때만 연산 (렌더마다 scene 뮤테이션 방지)
  const { offset, scale } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim > 0 ? 1.5 / maxDim : 1;
    return {
      offset: [-center.x * s, -center.y * s, -center.z * s] as [number, number, number],
      scale: s,
    };
  }, [scene]);

  return (
    <group position={offset} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

// ─── 로딩 중 와이어프레임 큐브 (meshBasicMaterial로 경량화) ──────
function LoadingCube() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * 0.5;
    ref.current.rotation.y += delta * 0.7;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshBasicMaterial color="#7c3aed" wireframe />
    </mesh>
  );
}

// ─── 에러 시 표시할 3D 오브젝트 ──────────────────────────────────
function ErrorMesh() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.4;
  });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.6]} />
      <meshBasicMaterial color="#ef4444" wireframe />
    </mesh>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
interface Props {
  url: string;
  onError?: (message: string) => void;
}

export default function ModelViewer({ url, onError }: Props) {
  const [loadError, setLoadError] = useState(false);

  const handleGLBError = (e: Error) => {
    setLoadError(true);
    onError?.(e.message || 'GLB 모델을 불러올 수 없습니다.');
  };

  return (
    <div
      className="w-full h-full relative"
      style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #1a0d2e 100%)' }}
    >
      <Canvas
        camera={{ position: [0, 0.5, 3], fov: 45 }}
        dpr={[1, 2]}
        gl={{
          antialias: false,
          powerPreference: 'low-power',
          alpha: false,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* 단순 조명 2개만 — 그림자 없음 */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 3]} intensity={1.4} />

        {/* 에러 경계 → Suspense → 실제 모델 */}
        <GLBErrorBoundary fallback={<ErrorMesh />} onError={handleGLBError}>
          <Suspense fallback={<LoadingCube />}>
            <GLBModel url={url} />
          </Suspense>
        </GLBErrorBoundary>

        {/* 터치/마우스 조작 */}
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.8}
          minDistance={0.5}
          maxDistance={8}
          makeDefault
        />
      </Canvas>

      {/* GLB 로딩 실패 오버레이 */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
          <div className="text-center px-6">
            <div className="text-3xl mb-3">⚠️</div>
            <p className="text-red-400 font-semibold mb-1">3D 모델 로딩 실패</p>
            <p className="text-gray-400 text-sm">
              파일이 손상되었거나 지원하지 않는 형식입니다
            </p>
          </div>
        </div>
      )}

      {/* 조작 힌트 (에러 없을 때만) */}
      {!loadError && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <div className="flex gap-4 text-xs text-white/30">
            <span>☝️ 드래그: 회전</span>
            <span>🤌 핀치: 확대/축소</span>
          </div>
        </div>
      )}
    </div>
  );
}
