import type { GlobeSlot } from "./globe-session";

export const MORPH_MS = 1300;
export const MORPH_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyHeroFrame(el: HTMLElement, slot: GlobeSlot) {
  applyMapFrame(el);
  el.style.clipPath = heightCircle(el);
  el.style.transform = orbTransform(el, slot);
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

function heightCircle(el: HTMLElement) {
  const h = el.clientHeight || window.innerHeight;
  return `circle(${h / 2}px at 50% 50%)`;
}

function orbTransform(el: HTMLElement, slot: GlobeSlot) {
  const w = el.clientWidth || window.innerWidth;
  const h = el.clientHeight || window.innerHeight;
  const s = (slot.r * 2) / h;
  return `translate(${slot.x - w / 2}px, ${slot.y - h / 2}px) scale(${s})`;
}

function currentTransform(el: HTMLElement, fallback: string) {
  const t = el.style.transform;
  return t && t !== "none" ? t : fallback;
}

function play(el: HTMLElement, start: string, end: string): Animation {
  const reduce = prefersReducedMotion();
  el.style.transform = start;
  return el.animate([{ transform: start }, { transform: end }], {
    duration: reduce ? 0 : MORPH_MS,
    easing: MORPH_EASE,
    fill: "forwards",
  });
}

export function animateToMap(el: HTMLElement, slot: GlobeSlot): Animation {
  el.style.clipPath = heightCircle(el);
  return play(el, currentTransform(el, orbTransform(el, slot)), "translate(0px, 0px) scale(1)");
}

export function animateToHero(el: HTMLElement, slot: GlobeSlot): Animation {
  el.style.clipPath = heightCircle(el);
  return play(el, currentTransform(el, "translate(0px, 0px) scale(1)"), orbTransform(el, slot));
}
