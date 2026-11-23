import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VisualEngineSettings, PaletteId } from '../../types';

interface CanvasProps {
  settings: VisualEngineSettings;
  onFpsUpdate?: (fps: number) => void;
  onStatsUpdate?: (stats: { triangles: number; points: number }) => void;
  exportTrigger?: number;
}

const PALETTE_COLORS: Record<PaletteId, number[]> = {
  cyberpunk: [0x00f0ff, 0xff007f, 0x7928ca, 0xffe600],
  void_violet: [0x9d4edd, 0x7b2cbf, 0xc77dff, 0x3c096c],
  solar_flare: [0xff6b35, 0xf7b267, 0xf25c54, 0xd81159],
  emerald_matrix: [0x00ff66, 0x00e5a3, 0x04e762, 0x00b4d8],
  aurora_borealis: [0x05ffa1, 0x00c3ff, 0xb900ff, 0x5800ff],
  monolith_gold: [0xe5c07b, 0xd19a66, 0xf4a261, 0xe76f51],
};

export const VisualEngineCanvas: React.FC<CanvasProps> = ({
  settings,
  onFpsUpdate,
  onStatsUpdate,
  exportTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const activeObjectsRef = useRef<THREE.Object3D[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Interaction state
  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const cameraRotation = useRef({ x: 0.3, y: 0.5 });
  const cameraDistance = useRef(40);
  const mouseRayPos = useRef(new THREE.Vector2(0, 0));

  // FPS tracking
  const frameCount = useRef(0);
  const lastFpsTime = useRef(performance.now());

  // Setup Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.FogExp2(0x050508, 0.015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(settings.fieldOfView, width / height, 0.1, 1000);
    camera.position.set(0, 15, 35);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Handle export snapshot
  useEffect(() => {
    if (!exportTrigger || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    try {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `belentani-${settings.generator}-seed${settings.seed}-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error('Snapshot failed', e);
    }
  }, [exportTrigger]);

  // Re-generate 3D scene objects when settings change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous objects
    activeObjectsRef.current.forEach((obj) => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    activeObjectsRef.current = [];

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, settings.ambientLight);
    scene.add(ambient);
    activeObjectsRef.current.push(ambient);

    const pointLight = new THREE.PointLight(PALETTE_COLORS[settings.palette][0], 2.5, 100);
    pointLight.position.set(10, 20, 15);
    scene.add(pointLight);
    activeObjectsRef.current.push(pointLight);

    const colors = PALETTE_COLORS[settings.palette];
    let totalTriangles = 0;
    let totalPoints = 0;

    // Pseudo-random helper from seed
    const pseudoRandom = (offset: number) => {
      const x = Math.sin(settings.seed * 997 + offset * 7919) * 10000;
      return x - Math.floor(x);
    };

    // GENERATORS
    if (settings.generator === 'galaxy') {
      const particleCount = Math.floor(12000 * settings.density);
      const positions = new Float32Array(particleCount * 3);
      const colorArray = new Float32Array(particleCount * 3);
      const c1 = new THREE.Color(colors[0]);
      const c2 = new THREE.Color(colors[1]);
      const c3 = new THREE.Color(colors[2]);
      const coreColor = new THREE.Color(0xffffff);

      const arms = 2 + Math.floor(pseudoRandom(1) * 3);
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const radius = Math.pow(pseudoRandom(i), 1.6) * 28;
        const spinAngle = radius * 0.45;
        const branchAngle = ((i % arms) * ((2 * Math.PI) / arms));

        const randomX = Math.pow(pseudoRandom(i + 10), 3) * (pseudoRandom(i + 20) < 0.5 ? 1 : -1) * 1.5;
        const randomY = Math.pow(pseudoRandom(i + 30), 3) * (pseudoRandom(i + 40) < 0.5 ? 1 : -1) * (1.2 + (28 - radius) * 0.08);
        const randomZ = Math.pow(pseudoRandom(i + 50), 3) * (pseudoRandom(i + 60) < 0.5 ? 1 : -1) * 1.5;

        positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
        positions[i3 + 1] = randomY;
        positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

        // Color blend
        const mixedColor = radius < 4 ? coreColor.clone().lerp(c1, radius / 4) : c1.clone().lerp(c2, radius / 28);
        if (i % 5 === 0) mixedColor.lerp(c3, 0.4);

        colorArray[i3] = mixedColor.r;
        colorArray[i3 + 1] = mixedColor.g;
        colorArray[i3 + 2] = mixedColor.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

      const material = new THREE.PointsMaterial({
        size: settings.particleSize * 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);
      activeObjectsRef.current.push(points);
      totalPoints += particleCount;

      // Core glow sphere
      const coreGeo = new THREE.SphereGeometry(2.2, 32, 32);
      const coreMat = new THREE.MeshBasicMaterial({
        color: colors[0],
        transparent: true,
        opacity: settings.bloomGlow ? 0.7 : 0.3,
        wireframe: settings.wireframe,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      scene.add(coreMesh);
      activeObjectsRef.current.push(coreMesh);
      totalTriangles += coreGeo.index ? coreGeo.index.count / 3 : 0;
    } 
    else if (settings.generator === 'cyber_matrix') {
      const gridW = 50;
      const gridH = 50;
      const terrainGeo = new THREE.PlaneGeometry(60, 60, gridW, gridH);
      terrainGeo.rotateX(-Math.PI / 2);

      const mat = new THREE.MeshStandardMaterial({
        color: colors[0],
        wireframe: true,
        emissive: colors[1],
        emissiveIntensity: settings.bloomGlow ? 0.6 : 0.2,
      });
      const mesh = new THREE.Mesh(terrainGeo, mat);
      scene.add(mesh);
      activeObjectsRef.current.push(mesh);
      totalTriangles += (gridW * gridH) * 2;

      // Cyber Towers
      const towerGroup = new THREE.Group();
      const towerCount = Math.floor(35 * settings.density);
      for (let i = 0; i < towerCount; i++) {
        const tw = 1.2 + pseudoRandom(i) * 1.5;
        const th = 4 + pseudoRandom(i + 1) * 18;
        const tGeo = new THREE.BoxGeometry(tw, th, tw);
        const tMat = new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          wireframe: settings.wireframe,
          metalness: 0.8,
          roughness: 0.2,
          emissive: colors[(i + 1) % colors.length],
          emissiveIntensity: 0.3,
        });
        const tower = new THREE.Mesh(tGeo, tMat);
        const tx = (pseudoRandom(i + 10) - 0.5) * 45;
        const tz = (pseudoRandom(i + 20) - 0.5) * 45;
        tower.position.set(tx, th / 2, tz);
        towerGroup.add(tower);
        totalTriangles += 12;
      }
      scene.add(towerGroup);
      activeObjectsRef.current.push(towerGroup);
    } 
    else if (settings.generator === 'landscape_biomes') {
      const segments = Math.floor(64 * Math.min(1.5, settings.density));
      const terrainGeo = new THREE.PlaneGeometry(55, 55, segments, segments);
      terrainGeo.rotateX(-Math.PI / 2);

      const pos = terrainGeo.attributes.position;
      const colorsAttr = new Float32Array(pos.count * 3);
      const cWater = new THREE.Color(colors[0]);
      const cLow = new THREE.Color(colors[1]);
      const cMid = new THREE.Color(colors[2]);
      const cHigh = new THREE.Color(0xffffff);

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        // Multi-frequency harmonic elevation
        const s = settings.seed * 0.1;
        const y =
          Math.sin(x * 0.15 + s) * Math.cos(z * 0.15 + s) * 4 +
          Math.sin(x * 0.3 + z * 0.2 + s * 1.4) * 2.2 +
          Math.cos(x * 0.08 - z * 0.12) * 5;
        pos.setY(i, y);

        // Biome coloration
        const normY = (y + 6) / 14;
        let col = cWater.clone();
        if (normY > 0.65) {
          col = cMid.clone().lerp(cHigh, (normY - 0.65) / 0.35);
        } else if (normY > 0.3) {
          col = cLow.clone().lerp(cMid, (normY - 0.3) / 0.35);
        } else {
          col = cWater.clone().lerp(cLow, normY / 0.3);
        }

        colorsAttr[i * 3] = col.r;
        colorsAttr[i * 3 + 1] = col.g;
        colorsAttr[i * 3 + 2] = col.b;
      }
      terrainGeo.computeVertexNormals();
      terrainGeo.setAttribute('color', new THREE.BufferAttribute(colorsAttr, 3));

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        wireframe: settings.wireframe,
        roughness: 0.6,
        metalness: 0.2,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(terrainGeo, mat);
      scene.add(mesh);
      activeObjectsRef.current.push(mesh);
      totalTriangles += segments * segments * 2;
    }
    else if (settings.generator === 'particle_vortex') {
      const pCount = Math.floor(9000 * settings.density);
      const positions = new Float32Array(pCount * 3);
      const velocities = new Float32Array(pCount * 3);
      const colorsAttr = new Float32Array(pCount * 3);

      for (let i = 0; i < pCount; i++) {
        const i3 = i * 3;
        const angle = pseudoRandom(i) * Math.PI * 2;
        const dist = 3 + pseudoRandom(i + 1) * 22;
        positions[i3] = Math.cos(angle) * dist;
        positions[i3 + 1] = (pseudoRandom(i + 2) - 0.5) * 15;
        positions[i3 + 2] = Math.sin(angle) * dist;

        velocities[i3] = -Math.sin(angle) * (0.05 + 1.2 / dist);
        velocities[i3 + 1] = (pseudoRandom(i + 3) - 0.5) * 0.02;
        velocities[i3 + 2] = Math.cos(angle) * (0.05 + 1.2 / dist);

        const col = new THREE.Color(colors[i % colors.length]);
        colorsAttr[i3] = col.r;
        colorsAttr[i3 + 1] = col.g;
        colorsAttr[i3 + 2] = col.b;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colorsAttr, 3));

      const mat = new THREE.PointsMaterial({
        size: settings.particleSize * 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });

      const pSystem = new THREE.Points(geom, mat);
      scene.add(pSystem);
      activeObjectsRef.current.push(pSystem);
      totalPoints += pCount;

      // Central attractor core
      const sphereGeo = new THREE.IcosahedronGeometry(1.6, 2);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: colors[0],
        emissive: colors[1],
        emissiveIntensity: 1.5,
        wireframe: true,
      });
      const core = new THREE.Mesh(sphereGeo, sphereMat);
      scene.add(core);
      activeObjectsRef.current.push(core);
      totalTriangles += sphereGeo.index ? sphereGeo.index.count / 3 : 0;
    }
    else if (settings.generator === 'atmospheric_nebula') {
      const cloudGroup = new THREE.Group();
      const shellCount = Math.floor(18 * settings.density);
      for (let i = 0; i < shellCount; i++) {
        const radius = 6 + i * 1.3;
        const geom = new THREE.IcosahedronGeometry(radius, 3);
        const col = new THREE.Color(colors[i % colors.length]);
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          transparent: true,
          opacity: 0.12 - (i / shellCount) * 0.07,
          wireframe: settings.wireframe,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.set(pseudoRandom(i) * 5, pseudoRandom(i + 1) * 5, pseudoRandom(i + 2) * 5);
        cloudGroup.add(mesh);
        totalTriangles += geom.index ? geom.index.count / 3 : 0;
      }
      scene.add(cloudGroup);
      activeObjectsRef.current.push(cloudGroup);

      // Star particles in nebula
      const starCount = 3500;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (pseudoRandom(i + 100) - 0.5) * 80;
        starPos[i * 3 + 1] = (pseudoRandom(i + 200) - 0.5) * 80;
        starPos[i * 3 + 2] = (pseudoRandom(i + 300) - 0.5) * 80;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        size: settings.particleSize * 0.15,
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
      });
      const starPoints = new THREE.Points(starGeo, starMat);
      scene.add(starPoints);
      activeObjectsRef.current.push(starPoints);
      totalPoints += starCount;
    }
    else if (settings.generator === 'planet_system') {
      const systemGroup = new THREE.Group();

      // Main Planet
      const planetGeo = new THREE.SphereGeometry(6, 48, 48);
      const planetMat = new THREE.MeshStandardMaterial({
        color: colors[0],
        roughness: 0.7,
        metalness: 0.1,
        wireframe: settings.wireframe,
      });
      const planetMesh = new THREE.Mesh(planetGeo, planetMat);
      systemGroup.add(planetMesh);
      totalTriangles += planetGeo.index ? planetGeo.index.count / 3 : 0;

      // Planet Atmosphere Rim
      const atmoGeo = new THREE.SphereGeometry(6.4, 32, 32);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: colors[1],
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      systemGroup.add(atmoMesh);

      // Planet Rings
      const ringGeo = new THREE.RingGeometry(8.5, 14, 64);
      ringGeo.rotateX(Math.PI / 2.3);
      const ringMat = new THREE.MeshStandardMaterial({
        color: colors[2],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        wireframe: settings.wireframe,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      systemGroup.add(ringMesh);

      // 3 Orbiting Moons
      const moonDistances = [18, 26, 34];
      const moonSizes = [1.2, 0.8, 1.5];
      moonDistances.forEach((dist, idx) => {
        const mGeo = new THREE.SphereGeometry(moonSizes[idx], 24, 24);
        const mMat = new THREE.MeshStandardMaterial({
          color: colors[(idx + 1) % colors.length],
          roughness: 0.8,
          wireframe: settings.wireframe,
        });
        const moon = new THREE.Mesh(mGeo, mMat);
        moon.position.set(dist, Math.sin(idx) * 2, 0);
        moon.userData = { orbitDist: dist, orbitSpeed: 0.6 / (idx + 1), angle: idx * 2.1 };
        systemGroup.add(moon);
        totalTriangles += mGeo.index ? mGeo.index.count / 3 : 0;

        // Orbit Line
        const orbitCurve = new THREE.EllipseCurve(0, 0, dist, dist, 0, 2 * Math.PI, false, 0);
        const orbitPts = orbitCurve.getPoints(64);
        const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: colors[idx % colors.length], transparent: true, opacity: 0.25 }));
        orbitLine.rotation.x = Math.PI / (2 + idx * 0.1);
        systemGroup.add(orbitLine);
      });

      scene.add(systemGroup);
      activeObjectsRef.current.push(systemGroup);
    }
    else if (settings.generator === 'black_hole') {
      const bhGroup = new THREE.Group();

      // Event Horizon (Absolute Singularity)
      const horizonGeo = new THREE.SphereGeometry(4.5, 48, 48);
      const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const horizon = new THREE.Mesh(horizonGeo, horizonMat);
      bhGroup.add(horizon);
      totalTriangles += horizonGeo.index ? horizonGeo.index.count / 3 : 0;

      // Photon Sphere Glowing Rim
      const photonGeo = new THREE.SphereGeometry(4.85, 32, 32);
      const photonMat = new THREE.MeshBasicMaterial({
        color: colors[0],
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        wireframe: settings.wireframe,
      });
      bhGroup.add(new THREE.Mesh(photonGeo, photonMat));

      // Relativistic Doppler Accretion Disk (Upper & Lower Warped Planes)
      const diskPCount = Math.floor(10000 * settings.density);
      const diskPos = new Float32Array(diskPCount * 3);
      const diskCol = new Float32Array(diskPCount * 3);
      const cBlue = new THREE.Color(colors[0]);
      const cRed = new THREE.Color(colors[1]);
      const cCore = new THREE.Color(0xffffff);

      for (let i = 0; i < diskPCount; i++) {
        const i3 = i * 3;
        const rad = 5.2 + Math.pow(pseudoRandom(i), 1.8) * 16;
        const ang = pseudoRandom(i + 1) * Math.PI * 2;
        // Gravitational warp upwards behind horizon
        const isBehind = Math.sin(ang) < -0.1;
        const warpY = isBehind ? Math.cos(ang) * (rad * 0.35) : (pseudoRandom(i + 2) - 0.5) * 0.35;

        diskPos[i3] = Math.cos(ang) * rad;
        diskPos[i3 + 1] = warpY;
        diskPos[i3 + 2] = Math.sin(ang) * rad;

        // Doppler shift: Approaching side (left) is blue-shifted, receding (right) is red-shifted
        const doppler = (Math.cos(ang) + 1.0) * 0.5;
        const col = doppler > 0.5 ? cBlue.clone().lerp(cCore, (doppler - 0.5) * 2) : cRed.clone().lerp(cBlue, doppler * 2);

        diskCol[i3] = col.r;
        diskCol[i3 + 1] = col.g;
        diskCol[i3 + 2] = col.b;
      }

      const diskGeo = new THREE.BufferGeometry();
      diskGeo.setAttribute('position', new THREE.BufferAttribute(diskPos, 3));
      diskGeo.setAttribute('color', new THREE.BufferAttribute(diskCol, 3));
      const diskMat = new THREE.PointsMaterial({
        size: settings.particleSize * 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const diskPoints = new THREE.Points(diskGeo, diskMat);
      bhGroup.add(diskPoints);
      totalPoints += diskPCount;

      scene.add(bhGroup);
      activeObjectsRef.current.push(bhGroup);
    }
    else if (settings.generator === 'spectral_ocean') {
      const oceanSegments = Math.floor(96 * Math.min(1.5, settings.density));
      const oceanGeo = new THREE.PlaneGeometry(65, 65, oceanSegments, oceanSegments);
      oceanGeo.rotateX(-Math.PI / 2);

      const oceanMat = new THREE.MeshStandardMaterial({
        color: colors[0],
        emissive: colors[1],
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.85,
        wireframe: settings.wireframe,
        flatShading: true,
      });
      const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
      scene.add(oceanMesh);
      activeObjectsRef.current.push(oceanMesh);
      totalTriangles += oceanSegments * oceanSegments * 2;
    }
    else if (settings.generator === 'atmospheric_aurora') {
      const auroraGroup = new THREE.Group();

      // Atmospheric Curvature Ground
      const groundGeo = new THREE.SphereGeometry(45, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.3);
      groundGeo.rotateX(Math.PI);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x070712, roughness: 0.95 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.position.y = -42;
      auroraGroup.add(ground);

      // Undulating Aurora Curtains (3 layered ribbons)
      for (let c = 0; c < 4; c++) {
        const ribbonGeo = new THREE.PlaneGeometry(70, 16, 48, 12);
        ribbonGeo.translate(0, 10 + c * 2.5, -15 + c * 8);
        const rMat = new THREE.MeshBasicMaterial({
          color: colors[c % colors.length],
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          wireframe: settings.wireframe,
        });
        const ribbon = new THREE.Mesh(ribbonGeo, rMat);
        auroraGroup.add(ribbon);
        totalTriangles += 48 * 12 * 2;
      }

      scene.add(auroraGroup);
      activeObjectsRef.current.push(auroraGroup);
    }
    else if (settings.generator === 'volumetric_clouds') {
      const cloudsGroup = new THREE.Group();
      const deckCount = Math.floor(18 * settings.density);
      for (let i = 0; i < deckCount; i++) {
        const w = 12 + pseudoRandom(i) * 16;
        const h = 4 + pseudoRandom(i + 1) * 6;
        const d = 12 + pseudoRandom(i + 2) * 16;
        const cGeo = new THREE.BoxGeometry(w, h, d);
        const cMat = new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 0.18,
          roughness: 0.9,
          blending: THREE.AdditiveBlending,
          wireframe: settings.wireframe,
        });
        const cloudBox = new THREE.Mesh(cGeo, cMat);
        cloudBox.position.set(
          (pseudoRandom(i + 10) - 0.5) * 50,
          8 + (pseudoRandom(i + 20) - 0.5) * 10,
          (pseudoRandom(i + 30) - 0.5) * 50
        );
        cloudsGroup.add(cloudBox);
        totalTriangles += 12;
      }
      scene.add(cloudsGroup);
      activeObjectsRef.current.push(cloudsGroup);
    }
    else if (settings.generator === 'storm_precipitation') {
      const rainCount = Math.floor(12000 * settings.density);
      const rainPos = new Float32Array(rainCount * 6); // Line segments (2 vertices per streak)
      for (let i = 0; i < rainCount; i++) {
        const i6 = i * 6;
        const x = (pseudoRandom(i) - 0.5) * 60;
        const y = pseudoRandom(i + 1) * 45;
        const z = (pseudoRandom(i + 2) - 0.5) * 60;
        const len = 1.2 + pseudoRandom(i + 3) * 1.5;

        rainPos[i6] = x;
        rainPos[i6 + 1] = y;
        rainPos[i6 + 2] = z;

        rainPos[i6 + 3] = x;
        rainPos[i6 + 4] = y - len;
        rainPos[i6 + 5] = z;
      }

      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
      const rainMat = new THREE.LineBasicMaterial({
        color: colors[0],
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      });
      const rainSystem = new THREE.LineSegments(rainGeo, rainMat);
      scene.add(rainSystem);
      activeObjectsRef.current.push(rainSystem);
      totalPoints += rainCount * 2;

      // Wet Reflective Ground
      const groundGeo = new THREE.PlaneGeometry(70, 70);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x050509,
        roughness: 0.1,
        metalness: 0.9,
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.position.y = 0;
      scene.add(groundMesh);
      activeObjectsRef.current.push(groundMesh);
      totalTriangles += 2;
    }
    else if (settings.generator === 'solar_rts') {
      const solarGroup = new THREE.Group();

      // Central Sun
      const sunGeo = new THREE.SphereGeometry(3.5, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({
        color: colors[0],
        wireframe: settings.wireframe,
      });
      const sun = new THREE.Mesh(sunGeo, sunMat);
      solarGroup.add(sun);
      totalTriangles += sunGeo.index ? sunGeo.index.count / 3 : 0;

      // Planetary Orbits & RTS Units
      const orbits = [
        { r: 8, size: 0.7, col: colors[1], name: 'Alpha' },
        { r: 13, size: 1.1, col: colors[2], name: 'Beta' },
        { r: 19, size: 0.9, col: colors[3] || colors[0], name: 'Gamma' },
        { r: 26, size: 1.6, col: colors[0], name: 'Delta' },
        { r: 34, size: 1.3, col: colors[1], name: 'Epsilon' },
      ];

      orbits.forEach((orb, idx) => {
        // Orbit ring line
        const ringCurve = new THREE.EllipseCurve(0, 0, orb.r, orb.r, 0, 2 * Math.PI, false, 0);
        const ringPts = ringCurve.getPoints(72);
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const ringLine = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: orb.col, transparent: true, opacity: 0.35 }));
        ringLine.rotation.x = Math.PI / 2;
        solarGroup.add(ringLine);

        // Planet
        const pMesh = new THREE.Mesh(
          new THREE.SphereGeometry(orb.size, 20, 20),
          new THREE.MeshStandardMaterial({ color: orb.col, roughness: 0.6, wireframe: settings.wireframe })
        );
        const initAng = idx * 1.3;
        pMesh.position.set(Math.cos(initAng) * orb.r, 0, Math.sin(initAng) * orb.r);
        pMesh.userData = { orbR: orb.r, speed: 0.8 / (idx + 1), angle: initAng };
        solarGroup.add(pMesh);
        totalTriangles += 400;

        // RTS Satellite Probe on orbital transfer
        const probeGeo = new THREE.ConeGeometry(0.35, 0.9, 4);
        probeGeo.rotateX(Math.PI / 2);
        const probeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const probe = new THREE.Mesh(probeGeo, probeMat);
        probe.position.set(Math.cos(initAng + 0.4) * (orb.r + 0.8), 0.3, Math.sin(initAng + 0.4) * (orb.r + 0.8));
        solarGroup.add(probe);
      });

      scene.add(solarGroup);
      activeObjectsRef.current.push(solarGroup);
    }
    else if (settings.generator === 'monumental_architecture') {
      const archGroup = new THREE.Group();
      
      // Central Megalith Obelisk
      const mainGeo = new THREE.BoxGeometry(4, 28, 4);
      const mainMat = new THREE.MeshStandardMaterial({
        color: colors[0],
        metalness: 0.85,
        roughness: 0.2,
        wireframe: settings.wireframe,
        emissive: colors[1],
        emissiveIntensity: 0.4,
      });
      const mainMonolith = new THREE.Mesh(mainGeo, mainMat);
      mainMonolith.position.y = 12;
      archGroup.add(mainMonolith);
      totalTriangles += 12;

      // Halo rings
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(8, 0.4, 16, 100),
        new THREE.MeshStandardMaterial({ color: colors[2], emissive: colors[0], emissiveIntensity: 0.8, wireframe: settings.wireframe })
      );
      ring1.position.y = 14;
      ring1.rotation.x = Math.PI / 3;
      archGroup.add(ring1);

      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(12, 0.3, 16, 100),
        new THREE.MeshStandardMaterial({ color: colors[3], emissive: colors[1], emissiveIntensity: 0.6, wireframe: settings.wireframe })
      );
      ring2.position.y = 18;
      ring2.rotation.y = Math.PI / 4;
      archGroup.add(ring2);
      totalTriangles += 200 * 2;

      // Surrounding satellite pillars
      const pCount = 8;
      for (let i = 0; i < pCount; i++) {
        const ang = (i / pCount) * Math.PI * 2;
        const rad = 14;
        const pGeo = new THREE.CylinderGeometry(0.8, 1.2, 10 + pseudoRandom(i) * 6, 6);
        const pMat = new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          metalness: 0.9,
          roughness: 0.3,
          wireframe: settings.wireframe,
        });
        const pillar = new THREE.Mesh(pGeo, pMat);
        pillar.position.set(Math.cos(ang) * rad, 5, Math.sin(ang) * rad);
        archGroup.add(pillar);
        totalTriangles += 12;
      }

      // Base platform
      const baseGeo = new THREE.CylinderGeometry(18, 20, 2, 8);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x111116,
        roughness: 0.7,
        wireframe: settings.wireframe,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = -1;
      archGroup.add(baseMesh);
      totalTriangles += 16;

      scene.add(archGroup);
      activeObjectsRef.current.push(archGroup);
    }

    if (onStatsUpdate) {
      onStatsUpdate({ triangles: Math.floor(totalTriangles), points: totalPoints });
    }
  }, [settings.generator, settings.palette, settings.density, settings.wireframe, settings.bloomGlow, settings.particleSize, settings.seed, settings.ambientLight]);

  // Animation Loop
  useEffect(() => {
    let animTime = 0;

    const animate = (timestamp: number) => {
      animFrameRef.current = requestAnimationFrame(animate);

      // FPS calculation
      frameCount.current++;
      if (timestamp - lastFpsTime.current >= 500) {
        const fps = Math.round((frameCount.current * 1000) / (timestamp - lastFpsTime.current));
        if (onFpsUpdate) onFpsUpdate(fps);
        frameCount.current = 0;
        lastFpsTime.current = timestamp;
      }

      animTime += 0.01 * settings.speed;

      // Update camera from orbital angle & distance
      if (cameraRef.current) {
        const cam = cameraRef.current;
        const dist = cameraDistance.current;
        const rotX = cameraRotation.current.x;
        const rotY = cameraRotation.current.y + (settings.rotationSpeed > 0 ? animTime * settings.rotationSpeed * 0.15 : 0);

        cam.position.x = dist * Math.sin(rotY) * Math.cos(rotX);
        cam.position.y = dist * Math.sin(rotX);
        cam.position.z = dist * Math.cos(rotY) * Math.cos(rotX);
        cam.lookAt(0, 4, 0);
      }

      // Dynamic generator animation ticks
      activeObjectsRef.current.forEach((obj) => {
        if (settings.generator === 'cyber_matrix' && obj instanceof THREE.Mesh) {
          // Animate cyber matrix undulating wave
          const geo = obj.geometry;
          if (geo instanceof THREE.PlaneGeometry) {
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const z = pos.getZ(i);
              const y = Math.sin(x * 0.2 + animTime * 3) * Math.cos(z * 0.2 + animTime * 2) * 1.8;
              pos.setY(i, y);
            }
            pos.needsUpdate = true;
          }
        } else if (settings.generator === 'particle_vortex' && obj instanceof THREE.Points) {
          // Dynamic gravitational swirl
          const geo = obj.geometry;
          const pos = geo.attributes.position;
          const vel = geo.attributes.velocity;
          if (pos && vel) {
            for (let i = 0; i < pos.count; i++) {
              const i3 = i * 3;
              let px = pos.getX(i);
              let py = pos.getY(i);
              let pz = pos.getZ(i);

              const distSq = px * px + pz * pz;
              const angle = 0.015 * settings.speed * (15 / Math.max(distSq, 4));
              const cosA = Math.cos(angle);
              const sinA = Math.sin(angle);

              const newX = px * cosA - pz * sinA;
              const newZ = px * sinA + pz * cosA;

              // Pull slightly towards core then bounce
              const factor = distSq < 4 ? 1.02 : 0.999;
              pos.setXYZ(i, newX * factor, py + Math.sin(animTime + i) * 0.01, newZ * factor);
            }
            pos.needsUpdate = true;
          }
        } else if (settings.generator === 'monumental_architecture' && obj instanceof THREE.Group) {
          // Rotate floating rings
          obj.children.forEach((child, idx) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) {
              child.rotation.z += 0.01 * (idx === 1 ? -1 : 1) * settings.speed;
              child.rotation.x += 0.005 * settings.speed;
            }
          });
        } else if (settings.generator === 'atmospheric_nebula' && obj instanceof THREE.Group) {
          obj.rotation.y = animTime * 0.15;
          obj.rotation.x = Math.sin(animTime * 0.1) * 0.1;
        } else if (settings.generator === 'planet_system' && obj instanceof THREE.Group) {
          obj.rotation.y = animTime * 0.08;
          obj.children.forEach((child) => {
            if (child.userData && child.userData.orbitDist) {
              child.userData.angle += 0.015 * child.userData.orbitSpeed * settings.speed;
              const a = child.userData.angle;
              const d = child.userData.orbitDist;
              child.position.set(Math.cos(a) * d, Math.sin(a * 0.8) * 1.5, Math.sin(a) * d);
            }
          });
        } else if (settings.generator === 'black_hole' && obj instanceof THREE.Group) {
          obj.children.forEach((child) => {
            if (child instanceof THREE.Points) {
              child.rotation.y += 0.025 * settings.speed;
            }
          });
        } else if (settings.generator === 'spectral_ocean' && obj instanceof THREE.Mesh) {
          const geo = obj.geometry;
          if (geo instanceof THREE.PlaneGeometry) {
            const pos = geo.attributes.position;
            const t = animTime * 3.5;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const z = pos.getZ(i);
              // Gerstner superposition of 3 wavefronts
              const y =
                Math.sin(x * 0.25 + t) * 1.4 +
                Math.cos(z * 0.22 + t * 1.2) * 1.1 +
                Math.sin((x + z) * 0.18 + t * 0.8) * 0.8;
              pos.setY(i, y);
            }
            pos.needsUpdate = true;
          }
        } else if (settings.generator === 'atmospheric_aurora' && obj instanceof THREE.Group) {
          obj.children.forEach((child, idx) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry) {
              const pos = child.geometry.attributes.position;
              const t = animTime * 2.0 + idx;
              for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                pos.setZ(i, Math.sin(x * 0.12 + t) * 3.2 + Math.cos(x * 0.25 + t * 1.4) * 1.5);
              }
              pos.needsUpdate = true;
            }
          });
        } else if (settings.generator === 'volumetric_clouds' && obj instanceof THREE.Group) {
          obj.children.forEach((child, idx) => {
            child.position.x += 0.04 * settings.speed;
            if (child.position.x > 35) child.position.x = -35;
          });
        } else if (settings.generator === 'storm_precipitation' && obj instanceof THREE.LineSegments) {
          const pos = obj.geometry.attributes.position;
          const fall = 1.4 * settings.speed;
          for (let i = 1; i < pos.count; i += 2) {
            let y = pos.getY(i);
            y -= fall;
            if (y < 0) {
              y = 45;
              pos.setY(i - 1, 45);
            }
            pos.setY(i, y);
            pos.setY(i - 1, y + 1.8);
          }
          pos.needsUpdate = true;
        } else if (settings.generator === 'solar_rts' && obj instanceof THREE.Group) {
          obj.children.forEach((child) => {
            if (child.userData && child.userData.orbR) {
              child.userData.angle += 0.01 * child.userData.speed * settings.speed;
              const a = child.userData.angle;
              const r = child.userData.orbR;
              child.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            }
          });
        }
      });

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [settings.speed, settings.rotationSpeed, settings.generator]);

  // Mouse & Touch controls for orbital interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    cameraRotation.current.y -= deltaX * 0.008;
    cameraRotation.current.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraRotation.current.x + deltaY * 0.008));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraDistance.current = Math.max(10, Math.min(90, cameraDistance.current + e.deltaY * 0.05));
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden select-none"
    />
  );
};
