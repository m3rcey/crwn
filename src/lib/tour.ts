import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

function waitForElement(selector: string, timeout = 3000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

// The gold highlight ring is drawn as a single fixed-position element appended
// to <body>, NOT on the target element itself. Anything drawn on the target
// (border / outline / box-shadow / ::after) is clipped by an ancestor's
// overflow:hidden — and driver.js itself forces overflow:hidden on the target's
// parent — which sliced the ring and made its thickness look uneven. A
// top-level fixed element has no clipping ancestor, so it always renders a
// perfectly uniform ring. We just move/resize it over the active target.
const RING_OFFSET = 4; // gap between the target's edge and the ring

function createRing(): HTMLDivElement {
  const ring = document.createElement('div');
  ring.className = 'crwn-tour-ring';
  ring.style.display = 'none';
  document.body.appendChild(ring);
  return ring;
}

function positionRing(ring: HTMLDivElement, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  // A collapsed/hidden target (e.g. a display:none section) has a zero-size
  // rect — don't draw a ring around nothing.
  if (r.width === 0 && r.height === 0) {
    ring.style.display = 'none';
    return;
  }
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  ring.style.top = `${r.top - RING_OFFSET}px`;
  ring.style.left = `${r.left - RING_OFFSET}px`;
  ring.style.width = `${r.width + RING_OFFSET * 2}px`;
  ring.style.height = `${r.height + RING_OFFSET * 2}px`;
  ring.style.borderRadius = `${radius + RING_OFFSET}px`;
  ring.style.display = 'block';
}

// Track the currently-running tour so it can be torn down on navigation. driver.js
// renders global DOM (overlay + popover) and our body-level ring, none tied to the
// React tree — so a tour left running when the user navigates away leaks its elements
// onto the next page (e.g. a stray "?" replay highlight / ghost popover on the Studio
// grid). usePageTour calls endActiveTour() on unmount; startTour also ends any prior
// tour before starting a new one.
let activeDriver: ReturnType<typeof driver> | null = null;
let activeCleanup: (() => void) | null = null;

export function endActiveTour() {
  try { activeCleanup?.(); } catch { /* ignore */ }
  try { activeDriver?.destroy(); } catch { /* ignore */ }
  activeCleanup = null;
  activeDriver = null;
  if (typeof document !== 'undefined') {
    // Backstop: sweep any orphaned tour DOM a prior leak may have left behind.
    document.querySelectorAll('.crwn-tour-ring, .driver-overlay, .driver-popover').forEach((n) => n.remove());
    document.querySelectorAll('.driver-active-element').forEach((n) => n.classList.remove('driver-active-element'));
  }
}

// One AUTO-started tour per browser session. Every surface has its own
// first-visit tour, so a new user tapping through the tabs got greeted by tour
// after tour after tour: one uninterrupted chain that read as a single tour
// dragging them across the app. An auto-start (recognized by its completion
// callback) beyond the first now defers to that surface's NEXT visit in a new
// session; explicit replays are never capped.
const AUTO_TOUR_SESSION_KEY = 'crwn_auto_tour_ran';

export function startTour(
  steps: DriveStep[],
  onComplete?: () => void,
  onDismiss?: (stepIndex: number) => void,
  startIndex?: number
) {
  const isAutoStart = typeof onComplete === 'function';
  if (isAutoStart && typeof sessionStorage !== 'undefined') {
    try {
      if (sessionStorage.getItem(AUTO_TOUR_SESSION_KEY)) return null;
      sessionStorage.setItem(AUTO_TOUR_SESSION_KEY, '1');
    } catch {
      /* storage unavailable: behave as before */
    }
  }

  endActiveTour(); // tear down any prior/leaked tour before starting a new one

  let currentStep = startIndex || 0;

  const ring = createRing();
  let activeEl: HTMLElement | null = null;
  const reposition = () => { if (activeEl) positionRing(ring, activeEl); };
  // Capture-phase scroll catches scrolling on any nested scroll container, so
  // the ring tracks the target during driver's smoothScroll and any manual scroll.
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  const cleanup = () => {
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    ring.remove();
  };

  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayColor: 'rgba(0, 0, 0, 0)',
    stagePadding: 0,
    stageRadius: 0,
    popoverClass: 'crwn-tour-popover',
    allowClose: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    showButtons: ['next', 'previous', 'close'],
    onHighlighted: (element: any, step: any, opts: any) => {
      currentStep = opts?.state?.activeIndex ?? currentStep;
      const el = element?.element || element;
      if (el && el instanceof HTMLElement) {
        const tourAttr = el.getAttribute('data-tour');
        if (tourAttr && (tourAttr.startsWith('tab-') || tourAttr.startsWith('fan-tab-'))) {
          // Tab buttons get their own gold underline when activated — no ring.
          activeEl = null;
          ring.style.display = 'none';
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          setTimeout(() => el.click(), 300);
        } else {
          // Content elements: driver's smoothScroll doesn't reliably reach
          // sections further down the page (e.g. subscriber metrics, top fans
          // on the analytics tab). Center the highlighted area ourselves, then
          // draw + track the ring over it (repositioned on scroll above).
          activeEl = el;
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          positionRing(ring, el);
        }
      } else {
        // Steps with no target (welcome / closing) — no ring.
        activeEl = null;
        ring.style.display = 'none';
      }
    },
    onDestroyStarted: () => {
      cleanup();
      driverObj.destroy();
      if (activeDriver === driverObj) { activeDriver = null; activeCleanup = null; }
      onComplete?.();
    },
  });

  activeDriver = driverObj;
  activeCleanup = cleanup;
  driverObj.setSteps(steps);
  driverObj.drive(startIndex || 0);
  return driverObj;
}

export { waitForElement };
