import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

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
    doneBtnText: 'Done',
    onHighlightStarted: (element: any) => {
      const el = element?.element || element;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
