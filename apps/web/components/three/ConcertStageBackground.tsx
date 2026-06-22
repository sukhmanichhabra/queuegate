"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ConcertStageBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 18);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // ── Crowd Particles ──────────────────────────────────────────
    const crowdCount = 600;
    const crowdGeo = new THREE.BufferGeometry();
    const crowdPos = new Float32Array(crowdCount * 3);
    const crowdColors = new Float32Array(crowdCount * 3);

    const palette = [
      new THREE.Color('#e11d48'),
      new THREE.Color('#facc15'),
      new THREE.Color('#a855f7'),
      new THREE.Color('#06b6d4'),
      new THREE.Color('#f97316'),
    ];

    for (let i = 0; i < crowdCount; i++) {
      crowdPos[i * 3]     = (Math.random() - 0.5) * 40;
      crowdPos[i * 3 + 1] = (Math.random() - 0.5) * 20 - 5;
      crowdPos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
      const c = palette[Math.floor(Math.random() * palette.length)].clone();
      crowdColors[i * 3]     = c.r;
      crowdColors[i * 3 + 1] = c.g;
      crowdColors[i * 3 + 2] = c.b;
    }
    crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3));
    crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdColors, 3));

    const crowdMat = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    const crowd = new THREE.Points(crowdGeo, crowdMat);
    scene.add(crowd);

    // ── Stage Spotlights (cones) ──────────────────────────────────
    const spotColors = ['#e11d48', '#facc15', '#a855f7', '#06b6d4', '#f97316'];
    const spotMeshes: THREE.Mesh[] = [];
    const spotLights: THREE.SpotLight[] = [];
    const numSpots = 5;

    for (let i = 0; i < numSpots; i++) {
      const coneGeo = new THREE.ConeGeometry(1.2, 12, 16, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: spotColors[i],
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      const x = (i - 2) * 4.5;
      cone.position.set(x, 8, -6);
      cone.rotation.z = (Math.random() - 0.5) * 0.5;
      scene.add(cone);
      spotMeshes.push(cone);

      const spotLight = new THREE.SpotLight(spotColors[i], 2, 30, Math.PI / 6, 0.5);
      spotLight.position.set(x, 14, -6);
      scene.add(spotLight);
      spotLights.push(spotLight);
    }

    // ── Floating Music Notes ──────────────────────────────────────
    const notePositions: { mesh: THREE.Mesh; speed: number; offset: number }[] = [];
    const noteGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 20);
    for (let i = 0; i < 20; i++) {
      const noteMat = new THREE.MeshBasicMaterial({
        color: palette[i % palette.length],
        transparent: true,
        opacity: 0.5,
      });
      const note = new THREE.Mesh(noteGeo, noteMat);
      note.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 20 - 5
      );
      note.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene.add(note);
      notePositions.push({ mesh: note, speed: 0.003 + Math.random() * 0.005, offset: Math.random() * Math.PI * 2 });
    }

    // ── Stage Floor Grid ─────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(60, 30, '#e11d48', '#1a0010');
    gridHelper.position.y = -8;
    scene.add(gridHelper);

    // ── Mouse Parallax ────────────────────────────────────────────
    let mouseX = 0, mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    document.addEventListener('mousemove', onMouseMove);

    // ── Animation ─────────────────────────────────────────────────
    let frameId: number;
    let t = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.01;

      // sway camera
      camera.position.x += (mouseX * 2 - camera.position.x) * 0.03;
      camera.position.y += (-mouseY * 1 - camera.position.y + 2) * 0.03;
      camera.lookAt(0, 0, 0);

      // spin crowd particles
      crowd.rotation.y += 0.0008;
      crowd.rotation.x = Math.sin(t * 0.3) * 0.05;

      // breathe spotlights
      spotMeshes.forEach((cone, i) => {
        const mat = cone.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.04 + Math.abs(Math.sin(t * 0.8 + i * 1.2)) * 0.08;
        cone.rotation.z = Math.sin(t * 0.5 + i) * 0.3;
      });
      spotLights.forEach((light, i) => {
        light.intensity = 1.5 + Math.abs(Math.sin(t * 0.8 + i * 1.2)) * 2.5;
      });

      // float notes
      notePositions.forEach(({ mesh, speed, offset }) => {
        mesh.position.y += Math.sin(t + offset) * 0.02;
        mesh.rotation.y += speed;
        mesh.rotation.x += speed * 0.5;
      });

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousemove', onMouseMove);
      crowdGeo.dispose(); crowdMat.dispose();
      noteGeo.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-[-1] pointer-events-none"
      style={{ background: 'linear-gradient(180deg, #07030f 0%, #0d0318 40%, #0a0205 100%)' }}
    />
  );
}
