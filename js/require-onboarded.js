/* ============ REQUIRE ONBOARDED (dashboard app-shell pages) ============ */
/* Blocks dashboard.html, trading.html, analytics.html, settings.html, and
   subscription.html unless the visitor is signed in AND has completed all
   4 onboarding steps. Not signed in -> login.html. Signed in but
   incomplete -> onboarding-step1.html. Include this script right after
   js/firebase-init.js, before the page's other scripts (dashboard.js etc). */

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

    window.xeroaiDb.collection('users').doc(user.uid).get()
      .then(function (doc) {
        var complete = doc.exists && doc.data().onboardingComplete === true;
        if (!complete) {
          window.location.replace('onboarding-step1.html');
          return;
        }
        removeOverlay();
      })
      .catch(function () {
        // Can't confirm onboarding status — safer to send them back to
        // onboarding than to silently expose the dashboard.
        window.location.replace('onboarding-step1.html');
      });
  });
})();
