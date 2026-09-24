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

        var data = doc.data();

        var nameEl = document.getElementById('topbarUserName');
        if (nameEl) nameEl.textContent = data.fullName || 'Trader';

        // Only present on dashboard.html — harmless no-op elsewhere.
        var heroNameEl = document.getElementById('dashboardHeroName');
        if (heroNameEl) heroNameEl.textContent = data.fullName || 'Trader';

        var idEl = document.getElementById('topbarAccountId');
        var idBtn = document.getElementById('topbarAccountIdBtn');
        if (idEl) idEl.textContent = data.accountId || '—';
        if (idBtn && data.accountId) {
          idBtn.addEventListener('click', function () {
            var finishCopyFeedback = function () {
              idBtn.classList.add('copied');
              var original = idEl.textContent;
              idEl.textContent = 'Copied!';
              setTimeout(function () {
                idEl.textContent = original;
                idBtn.classList.remove('copied');
              }, 1400);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(data.accountId).then(finishCopyFeedback);
            } else {
              // Fallback for browsers without the Clipboard API
              var tempInput = document.createElement('textarea');
              tempInput.value = data.accountId;
              document.body.appendChild(tempInput);
              tempInput.select();
              document.execCommand('copy');
              document.body.removeChild(tempInput);
              finishCopyFeedback();
            }
          });
        }

        removeOverlay();
        loadActivityFeed(user.uid);
      })
      .catch(function () {
        // Can't confirm onboarding status — safer to send them back to
        // onboarding than to silently expose the dashboard.
        window.location.replace('onboarding-step1.html');
      });
  });

  function timeAgo(date){
    if (!date) return '';
    var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + 'd ago';
    return date.toLocaleDateString();
  }

  var DOT_CLASS = { success: 'rp-dot-green', warning: 'rp-dot-gold', info: 'rp-dot-blue' };

  function loadActivityFeed(uid){
    var listEl = document.getElementById('recentActivityList');
    if (!listEl) return;

    window.xeroaiDb.collection('users').doc(uid).collection('activity')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          listEl.innerHTML = '<li class="rp-empty"><span class="rp-text">No recent activity yet.</span></li>';
          return;
        }

        listEl.innerHTML = '';
        snapshot.forEach(function (doc) {
          var d = doc.data();
          var when = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : null;
          var dotClass = DOT_CLASS[d.type] || DOT_CLASS.info;

          var li = document.createElement('li');
          li.innerHTML =
            '<span class="rp-dot ' + dotClass + '"></span>' +
            '<span class="rp-text"></span>' +
            '<span class="rp-time"></span>';
          li.querySelector('.rp-text').textContent = d.message || '';
          li.querySelector('.rp-time').textContent = timeAgo(when);
          listEl.appendChild(li);
        });
      })
      .catch(function () {
        listEl.innerHTML = '<li class="rp-empty"><span class="rp-text">Couldn\'t load recent activity.</span></li>';
      });
  }
})();
