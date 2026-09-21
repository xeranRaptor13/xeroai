/* ============ XeroAI PWA ============
   - Registers the service worker (installability only — no offline caching).
   - Captures the browser's install prompt and drives any button on the
     page marked with [data-pwa-install], instead of relying on the
     native mini-infobar/menu item.
   Works across every page: multiple [data-pwa-install] buttons can exist
   site-wide; this file doesn't care which page it's running on. */

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('XeroAI: service worker registration failed', err);
      });
    });
  }

  let deferredPrompt = null;

  function installButtons() {
    return Array.from(document.querySelectorAll('[data-pwa-install]'));
  }

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function showButtons() {
    if (isStandalone()) return;
    installButtons().forEach((btn) => { btn.hidden = false; });
  }

  function hideButtons() {
    installButtons().forEach((btn) => { btn.hidden = true; });
  }

  // Fires only when Chrome/Edge/Android decide the app meets install
  // criteria (manifest + service worker + engagement heuristics).
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideButtons();
  });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-pwa-install]');
    if (!btn || !deferredPrompt) return;

    btn.disabled = true;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      btn.disabled = false;
      hideButtons();
    });
  });

  // If we're already running installed, never show the button.
  if (isStandalone()) hideButtons();

  // Note: Safari/iOS never fires beforeinstallprompt, so the button
  // simply stays hidden there — no broken/no-op button is shown.
})();
