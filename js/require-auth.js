/* ============ REQUIRE AUTH (onboarding pages) ============ */
/* Blocks access to the onboarding flow unless the visitor is signed in.
   Does NOT check onboarding-completion status — these pages are exactly
   where an incomplete user is supposed to be. Include this script right
   after js/firebase-init.js, before the page's other scripts. */

(function () {
  var overlay = document.createElement('div');
  overlay.id = 'xeroaiAuthGateOverlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999999',
    'background:#08090c', 'display:flex',
    'align-items:center', 'justify-content:center',
    'color:#939aaa', 'font-family:monospace', 'font-size:13px',
    'letter-spacing:0.05em', 'text-transform:uppercase'
  ].join(';');
  overlay.textContent = 'Loading…';
  document.documentElement.appendChild(overlay);

  function removeOverlay(){
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  window.xeroaiAuth.onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    removeOverlay();
  });
})();
