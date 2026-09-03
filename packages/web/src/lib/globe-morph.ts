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
  el.style.borderRadius = "50%";
  el.style.transform = "none";
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
}

function lockBox(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  el.style.inset = "auto";
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  return r;
}

export function animateToMap(el: HTMLElement, slot: GlobeSlot): Animation {
  const d = Math.max(8, slot.r * 2);
  const reduce = prefersReducedMotion();
  applyHeroFrame(el, slot);
  return el.animate(
    [
      {
        left: `${slot.x - d / 2}px`,
        top: `${slot.y - d / 2}px`,
        width: `${d}px`,
        height: `${d}px`,
        borderRadius: "50%",
      },
      {
        left: "0px",
        top: "0px",
        width: `${window.innerWidth}px`,
        height: `${window.innerHeight}px`,
        borderRadius: "0px",
      },
    ],
    { duration: reduce ? 0 : MORPH_MS, easing: MORPH_EASE, fill: "forwards" },
  );
}

export function animateToHero(el: HTMLElement, slot: GlobeSlot): Animation {
  const d = Math.max(8, slot.r * 2);
  const reduce = prefersReducedMotion();
  lockBox(el);
  return el.animate(
    [
      {
        left: el.style.left,
        top: el.style.top,
        width: el.style.width,
        height: el.style.height,
        borderRadius: "0px",
      },
      {
        left: `${slot.x - d / 2}px`,
        top: `${slot.y - d / 2}px`,
        width: `${d}px`,
        height: `${d}px`,
        borderRadius: "50%",
      },
    ],
    { duration: reduce ? 0 : MORPH_MS, easing: MORPH_EASE, fill: "forwards" },
  );
}
