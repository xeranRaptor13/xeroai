/* XeroAI Admin — Google/Gmail-only authentication */
(function () {
  'use strict';

  var ADMIN_EMAILS = new Set([
    'ezemariaezemaria77@gmail.com',
    'xeranraptor@gmail.com',
    'iamnnenna1@gmail.com'
  ]);

  var button = document.getElementById('googleAdminSignIn');
  var label = document.getElementById('googleButtonLabel');
  var spinner = document.getElementById('googleButtonSpinner');
  var status = document.getElementById('formStatus');

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message || '';
    status.className = 'form-status' + (type ? ' is-' + type : '');
  }

  function setLoading(loading) {
    if (!button) return;
    button.disabled = loading;
    if (label) label.textContent = loading ? 'Connecting to Google…' : 'Continue with Google';
    if (spinner) spinner.hidden = !loading;
  }

  function friendlyError(error) {
    var code = error && error.code;
    var messages = {
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for xeroai.live and try again.',
      'auth/unauthorized-domain': 'xeroai.live is not authorized in Firebase Authentication. Add the domain in Firebase Authentication settings.',
      'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      'auth/account-exists-with-different-credential': 'This Gmail already has a different Firebase sign-in method. The admin account must use Google authentication.'
    };
    return messages[code] || 'Google sign-in could not be completed. Please try again.';
  }

  if (!button) return;

  button.addEventListener('click', function () {
    setStatus('', '');
    setLoading(true);

    if (!window.firebase || !window.xeroaiAuth) {
      setLoading(false);
      setStatus('Firebase Authentication is not available. Please refresh the page.', 'error');
      return;
    }

    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    window.xeroaiAuth.signInWithPopup(provider)
      .then(function (result) {
        var user = result && result.user;
        var email = normalizeEmail(user && user.email);

        if (!user || !ADMIN_EMAILS.has(email)) {
          return window.xeroaiAuth.signOut().then(function () {
            throw { code: 'admin/not-authorized' };
          });
        }

        /*
         * Defense in depth:
         * Admin must have authenticated through Google, not password.
         */
        var isGoogleProvider = (user.providerData || []).some(function (providerInfo) {
          return providerInfo && providerInfo.providerId === 'google.com';
        });

        if (!isGoogleProvider) {
          return window.xeroaiAuth.signOut().then(function () {
            throw { code: 'admin/google-required' };
          });
        }

        if (user.emailVerified === false) {
          return window.xeroaiAuth.signOut().then(function () {
            throw { code: 'admin/email-not-verified' };
          });
        }

        if (typeof window.xeroaiLogActivity === 'function') {
          window.xeroaiLogActivity(user.uid, 'Admin signed in with Google.', 'success');
        }

        setStatus('Google authentication successful. Opening admin…', 'success');

        setTimeout(function () {
          window.location.href = 'dashboard.html';
        }, 350);
      })
      .catch(function (error) {
        setLoading(false);

        if (error && error.code === 'admin/not-authorized') {
          setStatus('This Google account is not authorized for XeroAI admin access.', 'error');
          return;
        }

        if (error && error.code === 'admin/google-required') {
          setStatus('Admin access requires Google/Gmail sign-in.', 'error');
          return;
        }

        if (error && error.code === 'admin/email-not-verified') {
          setStatus('The Google account email must be verified before admin access is allowed.', 'error');
          return;
        }

        setStatus(friendlyError(error), 'error');
      });
  });
})();
