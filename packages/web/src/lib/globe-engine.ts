import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Landmark } from "./landmarks";
import { EARTH_URL, FLY_PLACE_DIST, type MarkerPick } from "./globe-types";

export type { MarkerKind, MarkerPick } from "./globe-types";
export { FLY_LANDMARK_DIST, FLY_PLACE_DIST } from "./globe-types";

export type GlobeViewInfo = {
  lat: number;
  lng: number;
  dist: number;
  flying: boolean;
};

type DomPin = {
  el: HTMLButtonElement;
  lat: number;
  lng: number;
  data: MarkerPick;
};

type OrbitInternals = OrbitControls & {
  _spherical: THREE.Spherical;
  _sphericalDelta: THREE.Spherical;
  _panOffset: THREE.Vector3;
  _quat: THREE.Quaternion;
  _quatInverse: THREE.Quaternion;
  _scale: number;
  state: number;
};

type FlyAnim = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startLen: number;
  endLen: number;
  bump: number;
  elapsed: number;
  duration: number;
  resolve: () => void;
};

let earthTex: THREE.Texture | null = null;
const earthTexWaiters: Array<(tex: THREE.Texture) => void> = [];

function applyEarthTex(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
}

function preloadEarthTexture() {
  if (typeof window === "undefined" || earthTex) return;
  new THREE.TextureLoader().load(
    EARTH_URL,
    (tex) => {
      applyEarthTex(tex);
      earthTex = tex;
      for (const wait of earthTexWaiters) wait(tex);
      earthTexWaiters.length = 0;
    },
    undefined,
    () => {
      for (const wait of earthTexWaiters) wait(makeSolidTex(30, 70, 140) as unknown as THREE.Texture);
      earthTexWaiters.length = 0;
    },
  );
}

function whenEarthTexture(cb: (tex: THREE.Texture) => void) {
  if (earthTex) {
    cb(earthTex);
    return;
  }
  earthTexWaiters.push(cb);
  preloadEarthTexture();
}

preloadEarthTexture();
const GLOBE_R = 1;
const UP = new THREE.Vector3(0, 1, 0);
const PIN_STEM_H = 0.026;
const PIN_HEAD_R = 0.0105;
const PIN_LIFT = 0.002;
const MIN_DIST = 1.2;
const MAX_DIST = 4;
const START_LAT = 16;
const START_LNG = 18;
const START_DIST = 2.5;
const _east = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _segA = new THREE.Vector3();
const _segB = new THREE.Vector3();
const _projWorld = new THREE.Vector3();
const _projCam = new THREE.Vector3();
const _projN = new THREE.Vector3();
const _projClip = new THREE.Vector3();
const _limb = new THREE.Vector3();
const _limbC = new THREE.Vector3();
const _limbE = new THREE.Vector3();

function latLngToVec(lat: number, lng: number, radius = GLOBE_R, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return out.set(
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

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - (-2 * t + 2) ** 5 / 2;
}

function scheduleIdle(cb: () => void, timeout = 800) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(cb, { timeout });
    return;
  }
  window.setTimeout(cb, Math.min(timeout, 250));
}

function makeSolidTex(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function simplifyPolylines(lines: number[][][], minDeg: number): number[][][] {
  const out: number[][][] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const pts = [line[0]];
    for (let i = 1; i < line.length - 1; i++) {
      const a = pts[pts.length - 1];
      const b = line[i];
      if (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) >= minDeg) pts.push(b);
    }
    pts.push(line[line.length - 1]);
    if (pts.length >= 2) out.push(pts);
  }
  return out;
}

function polylinesToSegments(lines: number[][][], radius: number): Float32Array {
  const pts: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (Math.abs(b[0] - a[0]) > 180) continue;
      latLngToVec(a[1], a[0], radius, _segA);
      latLngToVec(b[1], b[0], radius, _segB);
      pts.push(_segA.x, _segA.y, _segA.z, _segB.x, _segB.y, _segB.z);
    }
  }
  return new Float32Array(pts);
}

export type GlobeHandlers = {
  onPick: (pick: MarkerPick | null) => void;
  onHover: (pick: MarkerPick | null) => void;
  onReady: () => void;
};

export class WonderGlobe {
  readonly canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private earth: THREE.Mesh;
  private earthMat: THREE.MeshBasicMaterial;
  private labelsEl: HTMLDivElement;
  private domPins: DomPin[] = [];
  private geoPin: DomPin | null = null;
  private ripples: { mesh: THREE.Mesh; age: number }[] = [];
  private pulseGeom = new THREE.RingGeometry(0.008, 0.012, 24);
  private countryMat: THREE.LineBasicMaterial | null = null;
  private stateMat: THREE.LineBasicMaterial | null = null;
  private borderMats: THREE.LineBasicMaterial[] = [];
  private statesLoaded = false;
  private statesLoading = false;
  private pinAge = 0;
  private lastBorderDist = 0;
  private presentation: "hero" | "map" = "hero";
  private container: HTMLElement;
  private handlers: GlobeHandlers;
  private landmarks: Landmark[] = [];
  private flying = false;
  private flyAnim: FlyAnim | null = null;
  private focusLandmark: Landmark | null = null;
  private reducedMotion: boolean;
  private ignorePickUntil = 0;
  private lastInput = 0;
  private hovered: MarkerPick | null = null;
  private selected: MarkerPick | null = null;
  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private downX = 0;
  private downY = 0;
  private raf = 0;
  private disposed = false;
  private painted = false;
  private lastTick = 0;
  private holdIdle = false;
  private drawQuality: "hero" | "map" = "hero";

  get ready() {
    return this.painted;
  }

  get isDisposed() {
    return this.disposed;
  }

  constructor(container: HTMLElement, handlers: GlobeHandlers) {
    this.container = container;
    this.handlers = handlers;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
    this.camera.position.copy(latLngToVec(START_LAT, START_LNG, START_DIST));
    this.camera.lookAt(0, 0, 0);

    const bootDpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      antialias: bootDpr < 1.5,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(bootDpr, 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    this.canvas.style.cursor = "grab";
    container.appendChild(this.canvas);

    this.earthMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: makeSolidTex(30, 70, 140),
      side: THREE.DoubleSide,
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 64, 32), this.earthMat);
    this.earth.name = "globe";
    this.scene.add(this.earth);

    whenEarthTexture((tex) => {
      if (this.disposed) return;
      const prev = this.earthMat.map;
      this.earthMat.map = tex;
      this.earthMat.needsUpdate = true;
      if (prev && prev !== earthTex && prev !== tex) prev.dispose();
    });

    this.pulseGeom.rotateX(-Math.PI / 2);

    this.labelsEl = document.createElement("div");
    this.labelsEl.className = "globe-pins";
    container.appendChild(this.labelsEl);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = this.reducedMotion ? 0.18 : 0.062;
    this.controls.minDistance = MIN_DIST;
    this.controls.maxDistance = MAX_DIST;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 1.15;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.2;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.lastInput = performance.now();
    this.controls.addEventListener("start", () => {
      this.lastInput = performance.now();
      this.controls.autoRotate = false;
    });
    this.controls.addEventListener("end", () => {
      this.lastInput = performance.now();
    });

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("dblclick", this.onDblClick);

    this.sizeRenderer();
    this.ro.observe(container);
    this.lastTick = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.notifyReady();
    this.loop();
    scheduleIdle(() => {
      if (!this.disposed) void this.loadBorders("c");
    }, 800);
  }

  private notifyReady() {
    if (this.painted) return;
    this.painted = true;
    this.handlers.onReady();
  }

  private ro = new ResizeObserver(() => this.sizeRenderer());

  private sizeRenderer() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const hero = this.drawQuality === "hero";
    const dpr = Math.min(window.devicePixelRatio || 1, hero ? 1 : 2);
    this.renderer.setPixelRatio(dpr);
    const scale = hero ? 0.55 : 1;
    this.renderer.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), false);
  }

  private async loadBorders(kind: "c" | "s") {
    if (kind === "s") {
      if (this.statesLoaded || this.statesLoading || this.presentation !== "map") return;
      this.statesLoading = true;
    }
    try {
      const res = await fetch(kind === "c" ? "/borders-c.json" : "/borders-s.json");
      if (!res.ok || this.disposed) return;
      const lines = (await res.json()) as number[][][];
      if (this.disposed) return;
      if (kind === "c" && !this.countryMat) {
        this.countryMat = this.addBorderLayer(simplifyPolylines(lines, 0.45), 0xffffff, 0.22, GLOBE_R * 1.003);
      }
      if (kind === "s" && !this.stateMat) {
        this.stateMat = this.addBorderLayer(simplifyPolylines(lines, 0.9), 0xffffff, 0, GLOBE_R * 1.0022);
        this.statesLoaded = true;
      }
      this.fadeBorders();
    } catch {
      /* borders are decorative */
    } finally {
      if (kind === "s") this.statesLoading = false;
    }
  }

  private addBorderLayer(
    lines: number[][][],
    color: number,
    opacity: number,
    radius: number,
  ): THREE.LineBasicMaterial | null {
    const positions = polylinesToSegments(lines, radius);
    if (positions.length < 6) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    this.scene.add(mesh);
    this.borderMats.push(mat);
    return mat;
  }

  private fadeBorders() {
    const dist = this.camera.position.length();
    if (Math.abs(dist - this.lastBorderDist) < 0.012) return;
    this.lastBorderDist = dist;
    const zoom = THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(2.35, 1.38, dist), 0, 1);
    if (this.countryMat) this.countryMat.opacity = THREE.MathUtils.lerp(0.16, 0.3, zoom);
    if (this.presentation === "map" && zoom > 0.12) void this.loadBorders("s");
    if (this.stateMat) {
      this.stateMat.opacity = zoom < 0.12 ? 0 : THREE.MathUtils.lerp(0, 0.16, zoom);
      this.stateMat.visible = this.stateMat.opacity > 0.01;
    }
  }

  setLandmarks(list: Landmark[]) {
    this.landmarks = list;
    this.rebuildMarkers();
  }

  setFocus(lm: Landmark | null) {
    this.focusLandmark = lm;
    this.selected = null;
    if (!lm) return;
    for (const pin of this.domPins) {
      if (pin.data.landmark && this.isFocus(pin.data.landmark)) {
        this.selected = pin.data;
        break;
      }
    }
  }

  getView(): GlobeViewInfo {
    const { lat, lng } = vecToLatLng(this.camera.position);
    return {
      lat,
      lng,
      dist: this.camera.position.length(),
      flying: this.flying,
    };
  }

  project(lat: number, lng: number, lift = PIN_STEM_H + PIN_HEAD_R): { x: number; y: number; visible: boolean } | null {
    latLngToVec(lat, lng, GLOBE_R + lift, _projWorld);
    _projCam.copy(this.camera.position).normalize();
    _projN.copy(_projWorld).normalize();
    _projClip.copy(_projWorld).project(this.camera);
    const visible =
      _projN.dot(_projCam) > 0.08 &&
      _projClip.z < 1 &&
      Math.abs(_projClip.x) < 1.2 &&
      Math.abs(_projClip.y) < 1.2;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return {
      x: (_projClip.x * 0.5 + 0.5) * w,
      y: (-_projClip.y * 0.5 + 0.5) * h,
      visible,
    };
  }

  private framedCameraPos(lat: number, lng: number, distance: number): THREE.Vector3 {
    const pos = latLngToVec(lat, lng, distance);
    _dir.copy(pos).normalize();
    _east.crossVectors(UP, _dir);
    if (_east.lengthSq() < 1e-10) return pos;
    _east.normalize();
    _dir.applyAxisAngle(_east, -THREE.MathUtils.degToRad(2.6));
    return _dir.multiplyScalar(distance);
  }

  async flyTo(lat: number, lng: number, distance: number, duration = 1600): Promise<void> {
    if (this.disposed) return;
    if (this.flyAnim) {
      this.flyAnim.resolve();
      this.flyAnim = null;
    }

    this.controls.autoRotate = false;
    this.controls.enabled = false;
    this.controls.target.set(0, 0, 0);
    this.clearControlInertia();

    const start = this.camera.position.clone();
    const end = this.framedCameraPos(lat, lng, distance);
    const startLen = Math.max(start.length(), MIN_DIST);
    const endLen = end.length();
    const ang = start.angleTo(end);
    const bump = this.reducedMotion ? 0 : Math.min(0.42, ang * 0.3);
    const dur = this.reducedMotion ? 0 : duration / 1000;

    this.flying = true;
    this.lastInput = performance.now();

    return new Promise((resolve) => {
      this.flyAnim = {
        start,
        end,
        startLen,
        endLen,
        bump,
        elapsed: 0,
        duration: dur,
        resolve,
      };
    });
  }

  dropGeocode(lat: number, lng: number, label: string) {
    if (this.geoPin) this.geoPin.el.remove();
    this.geoPin = this.makeDomPin({ kind: "geocode", lat, lng, label });
    this.labelsEl.appendChild(this.geoPin.el);
  }

  suppressPicks(ms = 400) {
    this.ignorePickUntil = performance.now() + ms;
  }

  setSpin(on: boolean) {
    if (this.reducedMotion) return;
    if (this.holdIdle && on) return;
    this.controls.autoRotate = on;
    this.lastInput = performance.now();
  }

  holdIdleSpin(held: boolean) {
    this.holdIdle = held;
    if (held) this.controls.autoRotate = false;
  }

  get spinning() {
    return this.controls.autoRotate;
  }

  setPresentation(mode: "hero" | "map") {
    const hero = mode === "hero";
    const nextQuality = mode;
    const qualityChange = this.drawQuality !== nextQuality;
    this.presentation = mode;
    this.drawQuality = nextQuality;
    this.controls.enabled = !hero;
    this.controls.enableRotate = !hero;
    this.controls.enableZoom = !hero;
    this.canvas.style.pointerEvents = hero ? "none" : "auto";
    this.canvas.style.cursor = hero ? "default" : "grab";
    this.labelsEl.style.opacity = "1";
    this.labelsEl.style.display = "block";
    this.labelsEl.style.pointerEvents = hero ? "none" : "auto";
    if (hero) {
      this.holdIdle = false;
      if (!this.reducedMotion) this.controls.autoRotate = true;
    }
    if (this.landmarks.length && this.domPins.length === 0) this.rebuildMarkers();
    if (qualityChange) this.sizeRenderer();
    if (this.domPins.length || this.geoPin) this.layoutPins();
  }

  attach(container: HTMLElement) {
    if (this.container === container) return;
    this.ro.unobserve(this.container);
    this.container = container;
    container.appendChild(this.canvas);
    container.appendChild(this.labelsEl);
    this.ro.observe(container);
    this.sizeRenderer();
  }

  setHandlers(handlers: Partial<GlobeHandlers>) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  globeScreenRadius(): number {
    _projCam.copy(this.camera.position).normalize();
    _limb.crossVectors(_projCam, UP);
    if (_limb.lengthSq() < 1e-8) _limb.set(1, 0, 0);
    _limb.normalize().multiplyScalar(GLOBE_R);
    _limbC.set(0, 0, 0).project(this.camera);
    _limbE.copy(_limb).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const dx = (_limbE.x - _limbC.x) * 0.5 * w;
    const dy = (_limbE.y - _limbC.y) * 0.5 * h;
    return Math.max(24, Math.hypot(dx, dy));
  }

  dispose() {
    this.disposed = true;
    if (this.flyAnim) {
      this.flyAnim.resolve();
      this.flyAnim = null;
    }
    this.flying = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("dblclick", this.onDblClick);
    this.controls.dispose();
    for (const r of this.ripples) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.ripples.length = 0;
    this.earth.geometry.dispose();
    if (this.earthMat.map && this.earthMat.map !== earthTex) this.earthMat.map.dispose();
    this.earthMat.dispose();
    this.pulseGeom.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.LineSegments) obj.geometry.dispose();
    });
    for (const mat of this.borderMats) mat.dispose();
    this.renderer.dispose();
    this.labelsEl.remove();
    this.canvas.remove();
  }

  private orbit(): OrbitInternals {
    return this.controls as OrbitInternals;
  }

  private clearControlInertia() {
    const c = this.orbit();
    c._sphericalDelta.set(0, 0, 0);
    c._panOffset.set(0, 0, 0);
    c._scale = 1;
    c.state = -1;
  }

  private syncControlsToCamera() {
    const c = this.orbit();
    this.controls.target.set(0, 0, 0);
    this.clearControlInertia();
    _tmp.copy(this.camera.position).sub(this.controls.target);
    _tmp.applyQuaternion(c._quat);
    c._spherical.setFromVector3(_tmp);
    this.camera.lookAt(this.controls.target);
  }

  private finishFly() {
    const f = this.flyAnim;
    if (!f) return;
    this.camera.position.copy(f.end);
    this.syncControlsToCamera();
    this.flying = false;
    this.flyAnim = null;
    this.controls.enabled = true;
    this.controls.autoRotate = false;
    this.lastInput = performance.now();
    f.resolve();
  }

  private stepFly(dt: number) {
    const f = this.flyAnim;
    if (!f) return;
    f.elapsed += dt;
    const t = f.duration <= 0 ? 1 : Math.min(1, f.elapsed / f.duration);
    const e = easeInOutQuint(t);
    slerpDir(f.start, f.end, e, this.camera.position);
    const dist = THREE.MathUtils.lerp(f.startLen, f.endLen, e) + Math.sin(Math.PI * e) * f.bump;
    this.camera.position.multiplyScalar(dist);
    this.camera.lookAt(0, 0, 0);
    if (t >= 1) this.finishFly();
  }

  private isFocus(lm: Landmark): boolean {
    const f = this.focusLandmark;
    return !!f && f.name === lm.name && Math.abs(f.lat - lm.lat) < 1e-5 && Math.abs(f.lng - lm.lng) < 1e-5;
  }

  private makeDomPin(data: MarkerPick): DomPin {
    const el = makePinEl();
    el.setAttribute("aria-label", data.landmark?.name ?? data.label ?? "Pin");
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selected = data;
      this.handlers.onPick(data);
    });
    el.addEventListener("pointerenter", () => {
      this.hovered = data;
      this.handlers.onHover(data);
    });
    el.addEventListener("pointerleave", () => {
      if (this.hovered === data) {
        this.hovered = null;
        this.handlers.onHover(null);
      }
    });
    return { el, lat: data.lat, lng: data.lng, data };
  }

  private rebuildMarkers() {
    this.labelsEl.replaceChildren();
    this.domPins = [];
    this.selected = null;
    const frag = document.createDocumentFragment();
    for (const lm of this.landmarks) {
      const pin = this.makeDomPin({ kind: "pin", lat: lm.lat, lng: lm.lng, landmark: lm });
      this.domPins.push(pin);
      frag.appendChild(pin.el);
      if (this.focusLandmark && this.isFocus(lm)) this.selected = pin.data;
    }
    this.labelsEl.appendChild(frag);
    if (this.geoPin) this.labelsEl.appendChild(this.geoPin.el);
    this.layoutPins();
  }

  private layoutPins() {
    const dist = this.camera.position.length();
    const t = THREE.MathUtils.inverseLerp(MAX_DIST, MIN_DIST, dist);
    const size = THREE.MathUtils.lerp(16, 36, THREE.MathUtils.clamp(t, 0, 1));
    const layout = (pin: DomPin) => {
      const pos = this.project(pin.lat, pin.lng, 0.01);
      if (!pos || !pos.visible) {
        if (pin.el.style.display !== "none") pin.el.style.display = "none";
        return;
      }
      const on = this.selected === pin.data || this.hovered === pin.data;
      const px = on ? size * 1.18 : size;
      pin.el.style.display = "block";
      pin.el.style.width = `${px}px`;
      pin.el.style.height = `${px}px`;
      pin.el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      pin.el.classList.toggle("is-on", this.selected === pin.data);
      pin.el.classList.toggle("is-hover", this.hovered === pin.data);
    };
    for (const pin of this.domPins) layout(pin);
    if (this.geoPin) layout(this.geoPin);
  }

  private hitEarth(clientX: number, clientY: number): THREE.Intersection | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.earth, false)[0] ?? null;
  }

  private spawnRipple(point: THREE.Vector3) {
    if (this.reducedMotion) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc5d4e4,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.pulseGeom, mat);
    const n = point.clone().normalize();
    mesh.position.copy(n).multiplyScalar(GLOBE_R * 1.006);
    mesh.quaternion.setFromUnitVectors(UP, n);
    this.scene.add(mesh);
    this.ripples.push({ mesh, age: 0 });
    while (this.ripples.length > 6) {
      const old = this.ripples.shift();
      if (!old) break;
      this.scene.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.lastInput = performance.now();
    this.controls.autoRotate = false;
    this.canvas.style.cursor = "grabbing";
  };

  private onPointerUp = (e: PointerEvent) => {
    this.canvas.style.cursor = "grab";
    if (this.flying) return;
    if (performance.now() < this.ignorePickUntil) return;
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 7) return;
    this.selected = null;
    this.handlers.onPick(null);
    const earth = this.hitEarth(e.clientX, e.clientY);
    if (earth) this.spawnRipple(earth.point);
  };

  private onPointerMove = () => {
    this.canvas.style.cursor = "grab";
  };

  private onPointerLeave = () => {
    this.canvas.style.cursor = "grab";
  };

  private onDblClick = (e: MouseEvent) => {
    if (this.flying || this.reducedMotion) return;
    const earth = this.hitEarth(e.clientX, e.clientY);
    if (!earth) return;
    const { lat, lng } = vecToLatLng(earth.point);
    void this.flyTo(lat, lng, FLY_PLACE_DIST, 1100);
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    if (this.flyAnim) this.stepFly(dt);
    else this.controls.update();

    if (!this.reducedMotion && !this.flyAnim && !this.controls.autoRotate && !this.holdIdle) {
      if (performance.now() - this.lastInput > 8000) this.controls.autoRotate = true;
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const k = Math.min(1, r.age / 0.65);
      r.mesh.scale.setScalar(1 + k * 4.2);
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        mat.dispose();
        this.ripples.splice(i, 1);
      }
    }

    this.pinAge += dt;
    if ((this.domPins.length || this.geoPin) && this.pinAge > 0.033) {
      this.pinAge = 0;
      this.layoutPins();
    }
    this.fadeBorders();
    this.renderer.render(this.scene, this.camera);
  };
}

let sharedGlobe: WonderGlobe | null = null;
let globeUsers = 0;
let pinNode: HTMLButtonElement | null = null;

function makePinEl(): HTMLButtonElement {
  if (!pinNode) {
    pinNode = document.createElement("button");
    pinNode.type = "button";
    pinNode.className = "globe-pin";
    const shape = document.createElement("span");
    shape.className = "globe-pin-shape";
    const core = document.createElement("span");
    core.className = "globe-pin-core";
    shape.appendChild(core);
    pinNode.appendChild(shape);
  }
  return pinNode.cloneNode(true) as HTMLButtonElement;
}

export function acquireGlobe(container: HTMLElement, handlers: GlobeHandlers): WonderGlobe {
  globeUsers += 1;
  if (sharedGlobe && !sharedGlobe.isDisposed) {
    sharedGlobe.attach(container);
    sharedGlobe.setHandlers(handlers);
    if (sharedGlobe.ready) queueMicrotask(() => handlers.onReady());
    return sharedGlobe;
  }
  sharedGlobe = new WonderGlobe(container, handlers);
  return sharedGlobe;
}

export function releaseGlobe(globe: WonderGlobe) {
  globeUsers = Math.max(0, globeUsers - 1);
  window.setTimeout(() => {
    if (globeUsers > 0 || sharedGlobe !== globe) return;
    globe.dispose();
    sharedGlobe = null;
  }, 0);
}
