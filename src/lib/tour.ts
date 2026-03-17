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
    onHighlighted: (element: any) => {
      // Click the tab to make it active and scroll into view
      const el = element?.element || element;
      if (el && el instanceof HTMLElement) {
        const tourAttr = el.getAttribute('data-tour');
        if (tourAttr && tourAttr.startsWith('tab-')) {
          el.click();
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
