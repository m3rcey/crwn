import { useEffect, useRef } from 'react';

/**
 * CRWN — "living photo".
 *
 * Makes a still hero read as footage rather than a photograph.
 *
 * The photo is drawn TWICE: a `surround` plate, and a `subject` plate soft-masked
 * to an oval over the head and torso. ONLY THE DIFFERENCE between the two plates
 * is visible — give both similar motion and they cancel to about 2px, which
 * animates without ever looking animated. So the surround is held near-static
 * and the subject carries everything.
 *
 * Usage:
 *
 *   const { rootRef, surroundRef, subjectRef } = useLivingPhoto({ focal: [50, 38] });
 *
 *   <div ref={rootRef} style={{ position:'absolute', inset:0, overflow:'hidden' }}>
 *     <div ref={surroundRef} style={{ position:'absolute', inset:0 }}>
 *       <img src={src} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
 *     </div>
 *     <div ref={subjectRef} style={{ position:'absolute', inset:0 }}>
 *       <img src={src} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
 *     </div>
 *     <div style={{ position:'absolute', inset:0, background: SCRIM }} />
 *   </div>
 *
 * If the two plates can ever show different crops (a pan/zoom-capable upload
 * component), mirror the rendered geometry of the source image onto the subject
 * plate's <img> — and drive that sync from a MutationObserver, NOT from this
 * animation frame: rAF throttles to a stop in a background tab, and the crop
 * must stay correct whether or not the motion is being drawn.
 */

export interface LivingPhotoOptions {
  /** Percent [x, y] of the subject's head within the frame. Point it at the
   *  head or the pivot happens over the wrong part of the image. */
  focal?: [number, number];
  /** Scale multiplier, 0 = still. Below ~0.6 the motion stops being visible. */
  intensity?: number;
}

export function useLivingPhoto({ focal = [50, 38], intensity = 1 }: LivingPhotoOptions = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surroundRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const surround = surroundRef.current;
    const subject = subjectRef.current;
    if (!root || !surround || !subject) return;

    const [fx, fy] = focal;
    const mask = `radial-gradient(ellipse 44% 40% at ${fx}% ${fy}%, #000 0%, #000 46%, rgba(0,0,0,0) 100%)`;
    subject.style.webkitMaskImage = mask;
    subject.style.maskImage = mask;
    subject.style.transformOrigin = `${fx}% ${fy}%`;
    surround.style.transformOrigin = '50% 45%';
    surround.style.willChange = 'transform';
    subject.style.willChange = 'transform';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || intensity === 0) {
      surround.style.transform = 'scale(1.025)';
      subject.style.transform = 'scale(1.062)';
      return;
    }

    let raf = 0;
    let visible = false;
    const t0 = performance.now();
    const k = intensity;

    const tick = (now: number) => {
      raf = visible ? requestAnimationFrame(tick) : 0;
      if (!visible) return;
      const t = (now - t0) / 1000;

      // Surround: all but locked. This is what makes the differential visible.
      surround.style.transform =
        `perspective(1600px) rotateY(${(0.1 * Math.sin(t * 0.11)).toFixed(3)}deg)` +
        ` scale(${(1.025 + 0.0015 * Math.sin(t * 0.17)).toFixed(4)})` +
        ` translate3d(${(0.4 * Math.sin(t * 0.13)).toFixed(2)}px,${(0.3 * Math.sin(t * 0.19 + 1.1)).toFixed(2)}px,0)`;

      // Subject: human timings — head turn near 5s, nod near 8s, breath near 3.5s.
      // Frequencies are co-prime so the composite never repeats on a visible cycle.
      const turn = (2.35 * Math.sin(t * 1.14) + 0.75 * Math.sin(t * 0.63 + 0.6)) * k;
      const nod = (1.05 * Math.sin(t * 0.78 + 2.0) + 0.3 * Math.sin(t * 1.7 + 0.4)) * k;
      const breath = 0.007 * Math.sin(t * 1.83) * k;
      const shiftX = (5.5 * Math.sin(t * 0.71 + 0.8) + 1.6 * Math.sin(t * 1.29)) * k;
      const shiftY = (3.0 * Math.sin(t * 0.94 + 2.4) + 0.9 * Math.sin(t * 1.61 + 1.2)) * k;

      subject.style.transform =
        `perspective(900px) rotateY(${turn.toFixed(3)}deg) rotateX(${nod.toFixed(3)}deg)` +
        ` scale(${(1.062 + breath).toFixed(4)})` +
        ` translate3d(${shiftX.toFixed(2)}px,${shiftY.toFixed(2)}px,0)`;
    };

    // Pause off-screen.
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(tick);
      }),
      { threshold: 0.01 }
    );
    io.observe(root);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [focal[0], focal[1], intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rootRef, surroundRef, subjectRef };
}

/**
 * Cursor parallax for the whole art block. Kept separate from the idle motion:
 * transform has one owner per element, and two owners clobber each other.
 * Apply to a wrapper OUTSIDE the plates.
 */
export function useHeroParallax(strength = 1) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame = wrap.parentElement;
    if (!frame) return;

    const st = { x: 0, y: 0, tx: 0, ty: 0, raf: 0 };
    const tick = () => {
      st.x += (st.tx - st.x) * 0.07;
      st.y += (st.ty - st.y) * 0.07;
      wrap.style.transform = `translate3d(${st.x.toFixed(2)}px,${st.y.toFixed(2)}px,0)`;
      st.raf = Math.abs(st.tx - st.x) > 0.05 || Math.abs(st.ty - st.y) > 0.05
        ? requestAnimationFrame(tick)
        : 0;
    };
    const nudge = () => { if (!st.raf) st.raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => {
      const r = frame.getBoundingClientRect();
      st.tx = ((e.clientX - r.left) / r.width - 0.5) * -22 * strength;
      st.ty = ((e.clientY - r.top) / r.height - 0.5) * -14 * strength;
      nudge();
    };
    const leave = () => { st.tx = 0; st.ty = 0; nudge(); };

    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerleave', leave);
    return () => {
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerleave', leave);
      if (st.raf) cancelAnimationFrame(st.raf);
    };
  }, [strength]);

  return wrapRef;
}
