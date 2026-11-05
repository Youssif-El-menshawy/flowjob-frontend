import { useEffect, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 up to `target` with an ease-out curve. */
export function useCountUp(target: number, duration = 1000, delay = 250) {
  const [v, setV] = useState(reduced() ? target : 0);
  useEffect(() => {
    if (reduced()) {
      setV(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.max(0, Math.min(1, (ts - start - delay) / duration));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return v;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · FlowJob` : 'FlowJob';
  }, [title]);
}

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 700): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
