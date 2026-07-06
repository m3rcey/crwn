'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkReload';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Last-resort recovery for a stale chunk that failed to load outside React's
    // error boundary (e.g. an initial script tag). Heals a stale home-screen PWA.
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.error ?? e.message)) reloadOnceForChunkError();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) reloadOnceForChunkError();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const cleanupWindow = () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };

    if (!('serviceWorker' in navigator)) {
      return cleanupWindow;
    }

    // If the page loaded WITHOUT a controller this is a first-ever SW install; the
    // resulting controllerchange is not a deploy update, so don't reload then.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    // A NEW service worker took control (after a deploy). Reload once so the page
    // runs fresh HTML + chunks — this is what makes deploys reach an installed
    // home-screen PWA without the user clearing Safari's cache.
    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        reg = registration;
        registration.update().catch(() => {});
      })
      .catch(() => {});

    // iOS keeps home-screen PWAs alive across launches; check for a new SW each time
    // the app returns to the foreground so a deploy is picked up promptly (then
    // controllerchange reloads to it).
    const onVisible = () => {
      if (document.visibilityState === 'visible') reg?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cleanupWindow();
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
