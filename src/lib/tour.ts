import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export function startTour(steps: DriveStep[], onComplete?: () => void) {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayColor: 'rgba(0, 0, 0, 0)',
    stagePadding: 10,
    stageRadius: 12,
    popoverClass: 'crwn-tour-popover',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    onDestroyStarted: () => {
      driverObj.destroy();
      onComplete?.();
    },
  });

  driverObj.setSteps(steps);
  driverObj.drive();
}
