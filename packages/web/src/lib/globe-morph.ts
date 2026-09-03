import type { GlobeSlot } from "./globe-session";

export const MORPH_MS = 920;
export const MORPH_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyHeroFrame(el: HTMLElement, slot: GlobeSlot) {
  const d = Math.max(8, slot.r * 2);
  el.style.inset = "auto";
  el.style.left = `${slot.x - d / 2}px`;
  el.style.top = `${slot.y - d / 2}px`;
  el.style.width = `${d}px`;
  el.style.height = `${d}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.borderRadius = "50%";
  el.style.transform = "none";
  el.style.clipPath = "none";
}

export function applyMapFrame(el: HTMLElement) {
  el.style.left = "0";
  el.style.top = "0";
  el.style.right = "0";
  el.style.bottom = "0";
  el.style.width = "auto";
  el.style.height = "auto";
  el.style.borderRadius = "0";
  el.style.transform = "none";
  el.style.clipPath = "none";
}

function invertFromOrb(slot: GlobeSlot) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = (slot.r * 2) / vh;
  return {
    transform: `translate(${slot.x - vw / 2}px, ${slot.y - vh / 2}px) scale(${s})`,
    clipPath: `circle(${vh / 2}px at 50% 50%)`,
  };
}

function mapRest() {
  const cover = Math.hypot(window.innerWidth, window.innerHeight);
  return {
    transform: "translate(0px, 0px) scale(1)",
    clipPath: `circle(${cover}px at 50% 50%)`,
  };
}

export function animateToMap(el: HTMLElement, slot: GlobeSlot): Animation {
  applyMapFrame(el);
  const reduce = prefersReducedMotion();
  const from = invertFromOrb(slot);
  const to = mapRest();
  el.style.transform = from.transform;
  el.style.clipPath = from.clipPath;
  return el.animate([from, to], {
    duration: reduce ? 0 : MORPH_MS,
    easing: MORPH_EASE,
    fill: "forwards",
  });
}

export function animateToHero(el: HTMLElement, slot: GlobeSlot): Animation {
  applyMapFrame(el);
  const reduce = prefersReducedMotion();
  const from = mapRest();
  const to = invertFromOrb(slot);
  el.style.transform = from.transform;
  el.style.clipPath = from.clipPath;
  return el.animate([from, to], {
    duration: reduce ? 0 : MORPH_MS,
    easing: MORPH_EASE,
    fill: "forwards",
  });
}
