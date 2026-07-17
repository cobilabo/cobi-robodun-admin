import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** Drag-resizable width persisted in localStorage. */
export function usePersistedWidth(
  storageKey: string,
  defaults: { initial: number; min: number; max: number },
) {
  const [width, setWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= defaults.min && n <= defaults.max) return n;
    } catch {
      /* ignore */
    }
    return defaults.initial;
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [storageKey, width]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      // Handle is on the left of the panel: drag left → wider panel
      const delta = startX.current - e.clientX;
      const next = Math.min(
        defaults.max,
        Math.max(defaults.min, startW.current + delta),
      );
      setWidth(next);
    },
    [defaults.max, defaults.min],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return { width, setWidth, onPointerDown, onPointerMove, onPointerUp };
}
