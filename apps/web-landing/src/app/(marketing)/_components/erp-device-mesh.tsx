// src/app/(marketing)/_components/erp-device-mesh.tsx — Cap. 2.1/2.2 (React Three Fiber)
'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Mockup 3D "vivo" do dispositivo do Filitech (tablet/monitor) —
 * renderizado em WebGL no hero da landing (Cap. 2.1: R3F + drei).
 */
export function ErpDeviceMesh() {
  const screenRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Pulso sutil do brilho da tela — percepção de produto "vivo".
    if (glowRef.current) {
      glowRef.current.intensity = 1.6 + Math.sin(t * 2) * 0.4;
    }
    if (screenRef.current) {
      const mat = screenRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.15;
    }
  });

  return (
    <group>
      {/* Chassi do tablet */}
      <mesh castShadow>
        <boxGeometry args={[3.2, 2.2, 0.12]} />
        <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Tela emissiva (UI dark premium do ERP) */}
      <mesh ref={screenRef} position={[0, 0, 0.07]}>
        <planeGeometry args={[2.9, 1.9]} />
        <meshStandardMaterial
          color="#0b1020"
          emissive="#4f46e5"
          emissiveIntensity={0.9}
          roughness={0.4}
        />
      </mesh>

      {/* Barras "falsas" sugerindo a UI (grid de módulos) */}
      {[-0.6, -0.2, 0.2, 0.6].map((y, i) => (
        <mesh key={i} position={[-0.7 + (i % 2) * 0.1, y, 0.08]}>
          <planeGeometry args={[1.4 - i * 0.15, 0.16]} />
          <meshStandardMaterial
            color={i === 1 ? '#6366f1' : '#27272a'}
            emissive={i === 1 ? '#6366f1' : '#000000'}
            emissiveIntensity={i === 1 ? 0.6 : 0}
          />
        </mesh>
      ))}

      {/* Glow dinâmico atrás do device */}
      <pointLight ref={glowRef} position={[0, 0, 1.4]} color="#6366f1" intensity={1.6} distance={6} />

      {/* Suporte/monitor */}
      <mesh position={[0, -1.5, -0.1]} castShadow>
        <cylinderGeometry args={[0.08, 0.14, 0.9, 24]} />
        <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, -1.98, -0.1]} receiveShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.06, 32]} />
        <meshStandardMaterial color="#18181b" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}
