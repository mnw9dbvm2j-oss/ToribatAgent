'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// GLB 모델 로더
function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  // 모델을 중앙에 맞추고 크기 정규화
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 1.5 / maxDim : 1;

  scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  scene.scale.setScalar(scale);

  return <primitive object={scene} />;
}

// 로딩 중 보여줄 와이어프레임 큐브
function LoadingCube() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * 0.5;
    ref.current.rotation.y += delta * 0.7;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#7c3aed" wireframe />
    </mesh>
  );
}

interface Props {
  url: string;
}

export default function ModelViewer({ url }: Props) {
  return (
    <div className="w-full h-full relative" style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #1a0d2e 100%)' }}>
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
        {/* 모바일 최적화: 단순 조명, 그림자 없음 */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 3]} intensity={1.5} />
        <directionalLight position={[-2, -2, -2]} intensity={0.3} color="#8888ff" />

        {/* 모델 로드 (로딩 중 큐브 표시) */}
        <Suspense fallback={<LoadingCube />}>
          <GLBModel url={url} />
        </Suspense>

        {/* 터치 조작 컨트롤 */}
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.8}
          minDistance={0.5}
          maxDistance={8}
          autoRotate={false}
          makeDefault
        />
      </Canvas>

      {/* 조작 힌트 오버레이 (처음 3초만) */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex gap-4 text-xs text-white/40">
          <span>☝️ 드래그: 회전</span>
          <span>🤌 핀치: 확대/축소</span>
        </div>
      </div>
    </div>
  );
}
