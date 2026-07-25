const MIN = 30;
const MAX = 300;
const STEP = 10;
const DEFAULT_ZOOM = 100;

let zoomPct = DEFAULT_ZOOM;
let target: HTMLElement | null = null;
const listeners: Array<(pct: number) => void> = [];

export function initZoom(el: HTMLElement): void {
  target = el;
  apply();

  el.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  });
}

export function initZoomIndicator(el: HTMLElement): void {
  const update = (pct: number) => {
    el.textContent = `${pct}%`;
  };
  update(zoomPct);
  onZoomChange(update);
  el.addEventListener('click', () => resetZoom());
}

export function getZoom(): number {
  return zoomPct;
}

export function setZoom(pct: number): void {
  zoomPct = Math.min(MAX, Math.max(MIN, Math.round(pct / STEP) * STEP));
  apply();
}

export function zoomIn(): void {
  setZoom(zoomPct + STEP);
}

export function zoomOut(): void {
  setZoom(zoomPct - STEP);
}

export function resetZoom(): void {
  setZoom(DEFAULT_ZOOM);
}

export function onZoomChange(cb: (pct: number) => void): void {
  listeners.push(cb);
}

function apply(): void {
  if (target) {
    (target.style as CSSStyleDeclaration & { zoom: string }).zoom = `${zoomPct}%`;
  }
  listeners.forEach((cb) => cb(zoomPct));
}
