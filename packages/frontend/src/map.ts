import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { API_BASE_URL } from './constants';
// Public-domain Natural Earth 110m land/lakes, cream land / pale ocean — no vendor watermark.
import earthVoyagerUrl from './assets/earth-voyager.png';

interface MapLandmark {
  name: string;
  type: string;
  lat: number;
  lng: number;
  snippet: string;
}

type PinKind = 'landmark' | 'geocode';

interface MarkerUserData {
  kind: 'pin' | 'cluster';
  pinKind?: PinKind;
  landmark?: MapLandmark;
  members?: MapLandmark[];
  label?: string;
  lat: number;
  lng: number;
}

const GLOBE_R = 1;
const UP = new THREE.Vector3(0, 1, 0);
const PIN_STEM_H = 0.022;
const PIN_STEM_R = 0.0036;
const PIN_SPHERE_R = 0.014;
const PIN_RING_R = 0.018;
const PIN_RING_TUBE = 0.0025;
const CLUSTER_R = 0.038;
const MIN_DIST = 1.085;
const MAX_DIST = 3.2;
const START_LAT = 20;
const START_LNG = 0;
const START_DIST = 2.45;
const FLY_LANDMARK_DIST = 1.22;
const FLY_PLACE_DIST = 1.14;

const GREEN = 0x16a34a;
const GREEN_STEM = 0x15803d;
const BLUE = 0x2563eb;
const BLUE_STEM = 0x1d4ed8;

function escHtml(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ');
}

function latLngToVec(lat: number, lng: number, radius = GLOBE_R): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function vecToLatLng(v: THREE.Vector3): { lat: number; lng: number } {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) * (180 / Math.PI);
  const theta = Math.atan2(n.z, -n.x);
  let lng = (theta * 180) / Math.PI - 180;
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}

function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const na = a.clone().normalize();
  const nb = b.clone().normalize();
  const dot = THREE.MathUtils.clamp(na.dot(nb), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-5) return out.copy(na).lerp(nb, t).normalize();
  const sinT = Math.sin(theta);
  return out
    .copy(na)
    .multiplyScalar(Math.sin((1 - t) * theta) / sinT)
    .addScaledVector(nb, Math.sin(t * theta) / sinT)
    .normalize();
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function cellDegForDistance(dist: number): number {
  const alt = dist - GLOBE_R;
  if (alt > 1.45) return 18;
  if (alt > 1.05) return 10;
  if (alt > 0.72) return 6;
  if (alt > 0.46) return 3.5;
  if (alt > 0.28) return 1.8;
  if (alt > 0.16) return 0.8;
  return 0.25;
}

function markerScaleForDistance(dist: number): number {
  return THREE.MathUtils.clamp(0.28 + (dist - 1.05) * 0.52, 0.34, 1.22);
}

function landmarkPopupHtml(lm: MapLandmark): string {
  return (
    `<strong>${escHtml(lm.name)}</strong>` +
    `<br><span class="popup-type">${escHtml(formatType(lm.type))}</span>` +
    `<br><br>${escHtml(lm.snippet)}`
  );
}

function clusterPopupHtml(members: MapLandmark[]): string {
  const rows = members
    .map(
      (m, i) =>
        `<div class="cl-item" data-i="${i}">${escHtml(m.name)}` +
        `<span class="cl-type">${escHtml(formatType(m.type))}</span></div>`,
    )
    .join('');
  return `<div class="cl-list">${rows}</div>`;
}

function makeLabelTexture(count: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 8;
    ctx.font = `700 ${count > 99 ? 48 : 58}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(count);
    ctx.strokeText(text, size / 2, size / 2 + 2);
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

init();

function init() {
  const container = document.getElementById('map');
  const statusEl = document.getElementById('map-status');
  const countEl = document.getElementById('count');
  const popupEl = document.getElementById('map-popup') as HTMLElement | null;
  const popupBody = popupEl?.querySelector('.map-popup-body') as HTMLElement | null;
  const popupClose = popupEl?.querySelector('.map-popup-close') as HTMLElement | null;
  if (!container) return;
  const mapEl = container;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6e4ec);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 20);
  camera.position.copy(latLngToVec(START_LAT, START_LNG, START_DIST));
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xd6e4ec, 1);
  mapEl.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);
  // Camera-attached key light: facing hemisphere stays bright, no night side.
  const key = new THREE.DirectionalLight(0xffffff, 0.38);
  key.position.set(0.4, 0.25, 1);
  camera.add(key);
  scene.add(camera);

  const texLoader = new THREE.TextureLoader();
  const earthTex = texLoader.load(earthVoyagerUrl);
  earthTex.colorSpace = THREE.SRGBColorSpace;
  earthTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  earthTex.minFilter = THREE.LinearMipmapLinearFilter;
  earthTex.magFilter = THREE.LinearFilter;

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_R, 96, 64),
    new THREE.MeshBasicMaterial({ map: earthTex }),
  );
  globe.name = 'globe';
  scene.add(globe);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_R * 1.018, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0xc5d9e8,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  atmo.raycast = () => {};
  scene.add(atmo);

  const pinsGroup = new THREE.Group();
  scene.add(pinsGroup);
  const geoGroup = new THREE.Group();
  scene.add(geoGroup);

  const stemGeom = new THREE.CylinderGeometry(PIN_STEM_R * 0.85, PIN_STEM_R, PIN_STEM_H, 10);
  const sphereGeom = new THREE.SphereGeometry(PIN_SPHERE_R, 18, 14);
  const ringGeom = new THREE.TorusGeometry(PIN_RING_R, PIN_RING_TUBE, 8, 28);
  const clusterGeom = new THREE.SphereGeometry(CLUSTER_R, 24, 16);
  const clusterRingGeom = new THREE.TorusGeometry(CLUSTER_R * 1.05, PIN_RING_TUBE, 8, 28);

  const greenSphereMat = new THREE.MeshPhongMaterial({ color: GREEN, shininess: 45, specular: 0x88cc99 });
  const greenStemMat = new THREE.MeshPhongMaterial({ color: GREEN_STEM, shininess: 18 });
  const blueSphereMat = new THREE.MeshPhongMaterial({ color: BLUE, shininess: 45, specular: 0x99bbff });
  const blueStemMat = new THREE.MeshPhongMaterial({ color: BLUE_STEM, shininess: 18 });
  const whiteRingMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
  const clusterMat = new THREE.MeshPhongMaterial({ color: GREEN, shininess: 32, specular: 0x66aa77 });

  const labelTexCache = new Map<number, THREE.CanvasTexture>();

  function placeOnGlobe(group: THREE.Group, lat: number, lng: number) {
    const pos = latLngToVec(lat, lng, GLOBE_R);
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(UP, pos.clone().normalize());
  }

  function makePin(lat: number, lng: number, pinKind: PinKind, landmark?: MapLandmark): THREE.Group {
    const group = new THREE.Group();
    const stem = new THREE.Mesh(stemGeom, pinKind === 'geocode' ? blueStemMat : greenStemMat);
    stem.position.y = PIN_STEM_H / 2;
    const ball = new THREE.Mesh(sphereGeom, pinKind === 'geocode' ? blueSphereMat : greenSphereMat);
    ball.position.y = PIN_STEM_H + PIN_SPHERE_R * 0.15;
    const ring = new THREE.Mesh(ringGeom, whiteRingMat);
    ring.position.y = ball.position.y;
    ring.rotation.x = Math.PI / 2;
    group.add(stem, ball, ring);
    const data: MarkerUserData = { kind: 'pin', pinKind, landmark, lat, lng };
    group.userData = data;
    placeOnGlobe(group, lat, lng);
    return group;
  }

  function makeCluster(lat: number, lng: number, members: MapLandmark[]): THREE.Group {
    const group = new THREE.Group();
    const ball = new THREE.Mesh(clusterGeom, clusterMat);
    ball.position.y = CLUSTER_R * 0.75;
    const ring = new THREE.Mesh(clusterRingGeom, whiteRingMat);
    ring.position.y = ball.position.y;
    ring.rotation.x = Math.PI / 2;
    let tex = labelTexCache.get(members.length);
    if (!tex) {
      tex = makeLabelTexture(members.length);
      labelTexCache.set(members.length, tex);
    }
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(CLUSTER_R * 1.7, CLUSTER_R * 1.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    label.position.y = ball.position.y + CLUSTER_R * 0.02;
    label.rotation.x = -Math.PI / 2;
    group.add(ball, ring, label);
    group.userData = { kind: 'cluster', members, lat, lng } satisfies MarkerUserData;
    placeOnGlobe(group, lat, lng);
    return group;
  }

  let landmarks: MapLandmark[] = [];
  let currentCellDeg = -1;
  let flying = false;
  let popupAnchor: { lat: number; lng: number } | null = null;

  function clearGroup(group: THREE.Group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
    }
  }

  function rebuildMarkers() {
    const dist = camera.position.length();
    const cell = cellDegForDistance(dist);
    if (cell === currentCellDeg && pinsGroup.children.length) return;
    currentCellDeg = cell;
    clearGroup(pinsGroup);
    if (!landmarks.length) return;

    const buckets = new Map<string, MapLandmark[]>();
    const jWrap = Math.max(1, Math.round(360 / cell));
    for (const lm of landmarks) {
      const i = Math.round(lm.lat / cell);
      let j = Math.round(lm.lng / cell);
      j = ((j % jWrap) + jWrap) % jWrap;
      const key = `${i}:${j}`;
      const arr = buckets.get(key);
      if (arr) arr.push(lm);
      else buckets.set(key, [lm]);
    }

    for (const members of buckets.values()) {
      if (members.length === 1) {
        const lm = members[0];
        pinsGroup.add(makePin(lm.lat, lm.lng, 'landmark', lm));
        continue;
      }
      const acc = new THREE.Vector3();
      for (const lm of members) acc.add(latLngToVec(lm.lat, lm.lng, 1));
      const { lat, lng } = vecToLatLng(acc);
      pinsGroup.add(makeCluster(lat, lng, members));
    }
  }

  function applyMarkerScale() {
    const s = markerScaleForDistance(camera.position.length());
    for (const child of pinsGroup.children) child.scale.setScalar(s);
    for (const child of geoGroup.children) child.scale.setScalar(s);
  }

  function closePopup() {
    if (!popupEl) return;
    popupEl.hidden = true;
    popupAnchor = null;
  }

  function openPopupAt(lat: number, lng: number, html: string, onBody?: (body: HTMLElement) => void) {
    if (!popupEl || !popupBody) return;
    popupBody.innerHTML = html;
    popupAnchor = { lat, lng };
    popupEl.hidden = false;
    onBody?.(popupBody);
    positionPopup();
  }

  function positionPopup() {
    if (!popupEl || !popupAnchor || popupEl.hidden) return;
    const world = latLngToVec(popupAnchor.lat, popupAnchor.lng, GLOBE_R + PIN_STEM_H + PIN_SPHERE_R);
    const camDir = camera.position.clone().normalize();
    const n = world.clone().normalize();
    if (n.dot(camDir) < 0.12) {
      popupEl.style.visibility = 'hidden';
      return;
    }
    const projected = world.clone().project(camera);
    const w = mapEl.clientWidth;
    const h = mapEl.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const pad = 16;
    const clampedX = Math.min(Math.max(x, pad + 40), w - pad - 40);
    popupEl.style.visibility = 'visible';
    popupEl.style.left = `${clampedX}px`;
    popupEl.style.top = `${Math.max(y, 8)}px`;
  }

  function showLandmarkCard(lm: MapLandmark) {
    openPopupAt(lm.lat, lm.lng, landmarkPopupHtml(lm));
  }

  function showClusterCard(lat: number, lng: number, members: MapLandmark[]) {
    openPopupAt(lat, lng, clusterPopupHtml(members), (body) => {
      body.querySelectorAll('.cl-item').forEach((el) => {
        el.addEventListener('click', () => {
          const lm = members[Number((el as HTMLElement).dataset.i)];
          if (!lm) return;
          void flyTo(lm.lat, lm.lng, FLY_LANDMARK_DIST).then(() => showLandmarkCard(lm));
        });
      });
    });
  }

  popupClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopup();
  });

  function sizeRenderer() {
    const w = Math.max(1, mapEl.clientWidth);
    const h = Math.max(1, mapEl.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  sizeRenderer();
  const ro = new ResizeObserver(() => sizeRenderer());
  ro.observe(mapEl);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = MAX_DIST;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.95;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;
  controls.target.set(0, 0, 0);
  controls.update();

  function flyTo(lat: number, lng: number, distance: number, duration = 1100): Promise<void> {
    const start = camera.position.clone();
    const end = latLngToVec(lat, lng, distance);
    const startLen = start.length();
    const endLen = end.length();
    const t0 = performance.now();
    flying = true;
    controls.enabled = false;
    controls.autoRotate = false;
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeInOut(t);
        slerpDir(start, end, e, camera.position);
        camera.position.multiplyScalar(startLen + (endLen - startLen) * e);
        camera.lookAt(0, 0, 0);
        rebuildMarkers();
        applyMarkerScale();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          flying = false;
          controls.enabled = true;
          controls.update();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;

  function pick(clientX: number, clientY: number): MarkerUserData | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...pinsGroup.children, ...geoGroup.children, globe], true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const data = obj.userData as MarkerUserData;
        if (data && (data.kind === 'pin' || data.kind === 'cluster')) return data;
        obj = obj.parent;
      }
      if (hit.object === globe) return null;
    }
    return null;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (flying) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const data = pick(e.clientX, e.clientY);
    if (!data) {
      closePopup();
      return;
    }
    if (data.kind === 'cluster' && data.members) {
      showClusterCard(data.lat, data.lng, data.members);
      return;
    }
    if (data.kind === 'pin' && data.landmark) {
      showLandmarkCard(data.landmark);
      return;
    }
    if (data.kind === 'pin' && data.pinKind === 'geocode') {
      openPopupAt(data.lat, data.lng, `<strong>${escHtml(data.label || 'Pinned place')}</strong>`);
    }
  });

  function dropGeocode(lat: number, lng: number, label: string) {
    clearGroup(geoGroup);
    const pin = makePin(lat, lng, 'geocode');
    (pin.userData as MarkerUserData).label = label;
    geoGroup.add(pin);
    applyMarkerScale();
    void flyTo(lat, lng, FLY_PLACE_DIST).then(() => {
      openPopupAt(lat, lng, `<strong>${escHtml(label)}</strong>`);
    });
  }

  function setupSearch() {
    const input = document.getElementById('search') as HTMLInputElement | null;
    const resultsEl = document.getElementById('search-results');
    if (!input || !resultsEl) return;

    let activeIndex = -1;
    let currentMatches: MapLandmark[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const hideResults = () => {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      activeIndex = -1;
      currentMatches = [];
    };

    const selectLandmark = (lm: MapLandmark) => {
      hideResults();
      input.value = lm.name;
      input.blur();
      void flyTo(lm.lat, lm.lng, FLY_LANDMARK_DIST).then(() => showLandmarkCard(lm));
    };

    const searchLocation = async (query: string) => {
      hideResults();
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`geocode error: ${res.status}`);
        const results = await res.json();
        const place = results?.[0];
        if (!place) return;
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);
        dropGeocode(lat, lng, String(place.display_name ?? query));
      } catch (err) {
        console.error('[map] Location search failed:', err);
      }
    };

    const renderResults = (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        hideResults();
        return;
      }
      currentMatches = landmarks.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
      activeIndex = -1;
      const landmarkRows = currentMatches
        .map(
          (m, i) =>
            `<div class="search-result" data-i="${i}">` +
            `<span class="search-result-name">${escHtml(m.name)}</span>` +
            `<span class="search-result-type">${escHtml(formatType(m.type))}</span>` +
            `</div>`,
        )
        .join('');
      const locationRow =
        `<div class="search-result search-result-location" data-location="1">Search “${escHtml(query.trim())}” as a place…</div>`;
      resultsEl.innerHTML = landmarkRows + locationRow;
      resultsEl.hidden = false;
      resultsEl.querySelectorAll('.search-result').forEach((el) => {
        el.addEventListener('click', () => {
          const i = (el as HTMLElement).dataset.i;
          if (i !== undefined) selectLandmark(currentMatches[Number(i)]);
          else void searchLocation(input.value);
        });
      });
    };

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderResults(input.value), 150);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < currentMatches.length) {
          selectLandmark(currentMatches[activeIndex]);
        } else if (currentMatches.length > 0) {
          selectLandmark(currentMatches[0]);
        } else if (input.value.trim()) {
          void searchLocation(input.value);
        }
      } else if (e.key === 'Escape') {
        hideResults();
        input.blur();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const rows = resultsEl.querySelectorAll('.search-result');
        if (!rows.length) return;
        e.preventDefault();
        const maxIdx = currentMatches.length; // location row is last
        if (e.key === 'ArrowDown') activeIndex = Math.min(activeIndex + 1, maxIdx);
        else activeIndex = Math.max(activeIndex - 1, 0);
        rows.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      }
    });

    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node)) return;
      if (!input.contains(e.target) && !resultsEl.contains(e.target)) hideResults();
    });
  }

  setupSearch();

  let lastDistBucket = -1;
  function animate() {
    requestAnimationFrame(animate);
    if (!flying) controls.update();
    const dist = camera.position.length();
    const bucket = cellDegForDistance(dist);
    if (bucket !== lastDistBucket) {
      lastDistBucket = bucket;
      rebuildMarkers();
    }
    applyMarkerScale();
    positionPopup();
    renderer.render(scene, camera);
  }
  animate();

  async function loadLandmarks() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/map`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      landmarks = Array.isArray(data.landmarks) ? data.landmarks : [];
      if (countEl) {
        countEl.textContent = `${landmarks.length} landmark${landmarks.length !== 1 ? 's' : ''}`;
      }
      currentCellDeg = -1;
      rebuildMarkers();
      applyMarkerScale();
      if (statusEl) statusEl.hidden = true;
    } catch (err) {
      console.error('[map] Failed to load landmark data:', err);
      landmarks = [];
      currentCellDeg = -1;
      clearGroup(pinsGroup);
      if (statusEl) {
        statusEl.textContent = "Couldn't load landmarks";
        statusEl.hidden = false;
      }
    } finally {
      controls.autoRotate = false;
    }
  }

  void loadLandmarks();
}
