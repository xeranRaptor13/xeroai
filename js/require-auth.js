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
    'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:16px'
  ].join(';');

  // Recreates the .logo-mark shape from css/main.css (blue gradient
  // square with a diagonal cutout) at splash size, entirely via inline
  // styles — so it renders correctly here even though this overlay can
  // appear on pages that never load main.css.
  var logoBox = document.createElement('div');
  logoBox.style.cssText = [
    'width:72px', 'height:72px', 'border-radius:19px',
    'background:linear-gradient(145deg,#5e8eff,#2f4fb0)',
    'position:relative', 'flex-shrink:0',
    'box-shadow:0 0 0 1px rgba(255,255,255,0.08) inset, 0 8px 28px rgba(94,142,255,0.35)',
    'animation:xeroaiLogoPulse 1.6s ease-in-out infinite'
  ].join(';');

  var logoCut = document.createElement('div');
  logoCut.style.cssText = [
    'position:absolute', 'inset:19px', 'border-radius:8px',
    'background:#08090c',
    'clip-path:polygon(0 0, 45% 0, 100% 100%, 55% 100%)'
  ].join(';');
  logoBox.appendChild(logoCut);

  // @keyframes can't be set via inline style, so this one small <style>
  // tag is unavoidable — everything else about the mark is inline.
  if (!document.getElementById('xeroaiLogoPulseKeyframes')) {
    var styleTag = document.createElement('style');
    styleTag.id = 'xeroaiLogoPulseKeyframes';
    styleTag.textContent = '@keyframes xeroaiLogoPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.7;transform:scale(0.93);}}';
    document.head.appendChild(styleTag);
  }

  overlay.appendChild(logoBox);
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
