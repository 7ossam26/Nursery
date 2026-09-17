import { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// jsdom does not implement matchMedia, and a browser may expose it without addEventListener.
// Every access is guarded so a scripted DOM render behaves as "no animation" instead of throwing.
const mediaQuery = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    return null;
  }
};

export const prefersReducedMotion = (): boolean => mediaQuery()?.matches ?? false;

/**
 * Tracks the reduced-motion preference so JavaScript-driven effects opt out too, not only the CSS
 * animations that styles.css already neutralises.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());
  useEffect(() => {
    const media = mediaQuery();
    if (!media || typeof media.addEventListener !== 'function') return;
    const listen = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', listen);
    setReduced(media.matches);
    return () => media.removeEventListener('change', listen);
  }, []);
  return reduced;
}

/**
 * Counts up to a value the application already has. It never invents or extrapolates a number: the
 * target is always displayed exactly, immediately under reduced motion and at the end of the ramp
 * otherwise, so a partially animated figure can never be mistaken for real data at rest.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (reduced || from === target || !Number.isFinite(target) || typeof requestAnimationFrame !== 'function') {
      setValue(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - started) / durationMs, 1);
      // Ease-out cubic, matching --ease-out, so the motion agrees with the CSS transitions.
      setValue(Math.round(from + (target - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
      else setValue(target);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return value;
}

/** Caps the staggered entrance delay so a long list never animates itself into a slow page. */
export const staggerStyle = (index: number): Readonly<Record<string, string | number>> => ({ '--stagger-index': Math.min(index, 8) });
