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

export function startTour(steps: DriveStep[], onComplete?: () => void) {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayColor: 'rgba(0, 0, 0, 0)',
    stagePadding: 0,
    stageRadius: 0,
    popoverClass: 'crwn-tour-popover',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    onHighlighted: (element: any) => {
      const el = element?.element || element;
      if (el && el instanceof HTMLElement) {
        const tourAttr = el.getAttribute('data-tour');
        if (tourAttr && tourAttr.startsWith('tab-')) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          setTimeout(() => el.click(), 300);
        }
      }
    },
    onDestroyStarted: () => {
      driverObj.destroy();
      onComplete?.();
    },
  });

  driverObj.setSteps(steps);
  driverObj.drive();
}

export { waitForElement };
