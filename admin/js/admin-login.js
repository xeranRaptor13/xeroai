/* XeroAI Admin — Google primary + email/password backup authentication */
(function () {
  'use strict';

  var ADMIN_EMAILS = new Set([
    'ezemariaezemaria77@gmail.com',
    'xeranraptor@gmail.com',
    'iamnnenna1@gmail.com',
    'ezechiemeriejohn@gmail.com'
  ]);

  var googleButton = document.getElementById('googleAdminSignIn');
  var googleLabel = document.getElementById('googleButtonLabel');
  var googleSpinner = document.getElementById('googleButtonSpinner');
  var passwordForm = document.getElementById('passwordAdminForm');
  var emailInput = document.getElementById('adminEmail');
  var passwordInput = document.getElementById('adminPassword');
  var passwordButton = document.getElementById('passwordAdminSignIn');
  var passwordLabel = document.getElementById('passwordButtonLabel');
  var passwordSpinner = document.getElementById('passwordButtonSpinner');
  var forgotButton = document.getElementById('forgotPassword');
  var togglePassword = document.getElementById('togglePassword');
  var status = document.getElementById('formStatus');

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isAuthorizedEmail(email) {
    return ADMIN_EMAILS.has(normalizeEmail(email));
  }

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message || '';
    status.className = 'form-status' + (type ? ' is-' + type : '');
  }

  function setGoogleLoading(loading) {
    if (!googleButton) return;
    googleButton.disabled = loading;
    if (googleLabel) googleLabel.textContent = loading ? 'Connecting to Google…' : 'Continue with Google';
    if (googleSpinner) googleSpinner.hidden = !loading;
  }

  function setPasswordLoading(loading) {
    if (!passwordButton) return;
    passwordButton.disabled = loading;
    if (passwordLabel) passwordLabel.textContent = loading ? 'Signing in…' : 'Sign in with email & password';
    if (passwordSpinner) passwordSpinner.hidden = !loading;
  }

  function friendlyError(error) {
    var code = error && error.code;
    var messages = {
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for xeroai.live and try again.',
      'auth/unauthorized-domain': 'xeroai.live is not authorized in Firebase Authentication. Add the domain in Firebase Authentication settings.',
      'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      'auth/account-exists-with-different-credential': 'This email already has a different Firebase sign-in method configured.',
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase Authentication. Enable Email/Password in Sign-in method.',
      'auth/invalid-email': 'Enter a valid admin email address.',
      'auth/invalid-credential': 'The email or password is incorrect, or this admin account does not have a password credential yet.',
      'auth/wrong-password': 'The email or password is incorrect.',
      'auth/user-not-found': 'The email or password is incorrect.',
      'auth/too-many-requests': 'Too many sign-in attempts. Wait a moment and try again.',
      'auth/email-already-in-use': 'That email is already linked to another Firebase account.',
      'auth/requires-recent-login': 'Please sign in with Google again before changing authentication settings.'
    };
    if (error && error.code === 'admin/not-authorized') {
      return 'This account is not authorized for XeroAI admin access.';
    }
    if (error && error.code === 'admin/email-not-verified') {
      return 'The admin email must be verified before access is allowed.';
    }
    return messages[code] || 'Authentication could not be completed. Please try again.';
  }

  function ensureFirebase() {
    return !!(window.firebase && window.xeroaiAuth);
  }

  function authorizeUser(user, methodLabel) {
    var email = normalizeEmail(user && user.email);

    if (!user || !isAuthorizedEmail(email)) {
      return window.xeroaiAuth.signOut().then(function () {
        throw { code: 'admin/not-authorized' };
      });
    }

    if (user.emailVerified === false) {
      return window.xeroaiAuth.signOut().then(function () {
        throw { code: 'admin/email-not-verified' };
      });
    }

    if (typeof window.xeroaiLogActivity === 'function') {
      window.xeroaiLogActivity(user.uid, 'Admin signed in with ' + methodLabel + '.', 'success');
    }

    setStatus('Authentication successful. Opening admin…', 'success');

    setTimeout(function () {
      window.location.href = 'dashboard.html';
    }, 350);
  }

  if (!ensureFirebase()) {
    setStatus('Firebase Authentication is not available. Please refresh the page.', 'error');
    return;
  }

  if (googleButton) {
    googleButton.addEventListener('click', function () {
      setStatus('', '');
      setGoogleLoading(true);

      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      window.xeroaiAuth.signInWithPopup(provider)
        .then(function (result) {
          var user = result && result.user;
          var isGoogleProvider = (user && user.providerData || []).some(function (providerInfo) {
            return providerInfo && providerInfo.providerId === 'google.com';
          });

          if (!isGoogleProvider) {
            return window.xeroaiAuth.signOut().then(function () {
              throw { code: 'admin/google-required' };
            });
          }

          return authorizeUser(user, 'Google');
        })
        .catch(function (error) {
          setGoogleLoading(false);

          if (error && error.code === 'admin/google-required') {
            setStatus('Admin access requires Google sign-in or the email/password backup.', 'error');
            return;
          }

          setStatus(friendlyError(error), 'error');
        });
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', function (event) {
      event.preventDefault();
      setStatus('', '');

      var email = normalizeEmail(emailInput && emailInput.value);
      var password = passwordInput ? passwordInput.value : '';

      if (!email || !password) {
        setStatus('Enter your authorized admin email and password.', 'error');
        return;
      }

      if (!isAuthorizedEmail(email)) {
        setStatus('That email is not authorized for XeroAI admin access.', 'error');
        return;
      }

      setPasswordLoading(true);

      window.xeroaiAuth.signInWithEmailAndPassword(email, password)
        .then(function (result) {
          return authorizeUser(result && result.user, 'email/password');
        })
        .catch(function (error) {
          setPasswordLoading(false);
          setStatus(friendlyError(error), 'error');
        });
    });
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', function () {
      var showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      togglePassword.textContent = showing ? 'Show' : 'Hide';
      togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }


  var setupButton = document.getElementById('setupBackupPassword');
  var setupPanel = document.getElementById('backupSetupPanel');
  var backupPasswordInput = document.getElementById('backupPassword');
  var backupPasswordConfirmInput = document.getElementById('backupPasswordConfirm');
  var saveBackupPasswordButton = document.getElementById('saveBackupPassword');

  if (setupButton) {
    setupButton.addEventListener('click', function () {
      setStatus('', '');
      if (setupPanel) setupPanel.hidden = false;
      setStatus('Sign in with the authorized Google account to set up its backup password.', 'info');
      setGoogleLoading(true);

      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      window.xeroaiAuth.signInWithPopup(provider)
        .then(function (result) {
          var user = result && result.user;
          var isGoogleProvider = (user && user.providerData || []).some(function (providerInfo) {
            return providerInfo && providerInfo.providerId === 'google.com';
          });

          if (!user || !isGoogleProvider) {
            return window.xeroaiAuth.signOut().then(function () {
              throw { code: 'admin/google-required' };
            });
          }

          var email = normalizeEmail(user.email);
          if (!isAuthorizedEmail(email)) {
            return window.xeroaiAuth.signOut().then(function () {
              throw { code: 'admin/not-authorized' };
            });
          }

          if (user.emailVerified === false) {
            return window.xeroaiAuth.signOut().then(function () {
              throw { code: 'admin/email-not-verified' };
            });
          }

          var hasPassword = (user.providerData || []).some(function (providerInfo) {
            return providerInfo && providerInfo.providerId === 'password';
          });

          if (hasPassword) {
            setStatus('This admin account already has a backup password. Use the reset link if you need to change it.', 'success');
            setGoogleLoading(false);
            return;
          }

          setStatus('Google verified. Enter and save the backup password below.', 'success');
          setGoogleLoading(false);
          if (setupPanel) setupPanel.hidden = false;
          if (backupPasswordInput) backupPasswordInput.focus();
        })
        .catch(function (error) {
          setGoogleLoading(false);
          setStatus(friendlyError(error), 'error');
        });
    });
  }

  if (saveBackupPasswordButton) {
    saveBackupPasswordButton.addEventListener('click', function () {
      setStatus('', '');
      var user = window.xeroaiAuth.currentUser;
      var password = backupPasswordInput ? backupPasswordInput.value : '';
      var confirmation = backupPasswordConfirmInput ? backupPasswordConfirmInput.value : '';

      if (!user || !isAuthorizedEmail(user.email)) {
        setStatus('Sign in with the authorized Google account first.', 'error');
        return;
      }

      if (user.emailVerified === false) {
        setStatus('The admin email must be verified before a backup password can be added.', 'error');
        return;
      }

      if (!password || password.length < 6) {
        setStatus('Use a backup password with at least 6 characters.', 'error');
        return;
      }

      if (password !== confirmation) {
        setStatus('The two backup passwords do not match.', 'error');
        return;
      }

      var alreadyLinked = (user.providerData || []).some(function (providerInfo) {
        return providerInfo && providerInfo.providerId === 'password';
      });

      if (alreadyLinked) {
        setStatus('This admin already has a password credential. Use the reset link instead.', 'error');
        return;
      }

      saveBackupPasswordButton.disabled = true;
      var credential = firebase.auth.EmailAuthProvider.credential(user.email, password);

      user.linkWithCredential(credential)
        .then(function (result) {
          if (backupPasswordInput) backupPasswordInput.value = '';
          if (backupPasswordConfirmInput) backupPasswordConfirmInput.value = '';
          setStatus('Backup password created successfully. You can now use this email + password at the admin login.', 'success');
          if (typeof window.xeroaiLogActivity === 'function') {
            window.xeroaiLogActivity(user.uid, 'Admin backup password configured.', 'success');
          }
        })
        .catch(function (error) {
          if (error && error.code === 'auth/credential-already-in-use') {
            setStatus('That email/password credential is already attached to another Firebase account. Do not create another admin account; contact the project administrator to resolve the duplicate account.', 'error');
          } else {
            setStatus(friendlyError(error), 'error');
          }
        })
        .finally(function () {
          saveBackupPasswordButton.disabled = false;
        });
    });
  }

  if (forgotButton) {
    forgotButton.addEventListener('click', function () {
      setStatus('', '');

      var email = normalizeEmail(emailInput && emailInput.value);
      if (!email) {
        setStatus('Enter your authorized admin email first, then click reset.', 'error');
        if (emailInput) emailInput.focus();
        return;
      }

      if (!isAuthorizedEmail(email)) {
        setStatus('That email is not authorized for XeroAI admin access.', 'error');
        return;
      }

      if (!window.xeroaiAuth) {
        setStatus('Firebase Authentication is not available. Please refresh the page.', 'error');
        return;
      }

      forgotButton.disabled = true;
      window.xeroaiAuth.sendPasswordResetEmail(email)
        .then(function () {
          setStatus('Password reset instructions were sent to the authorized admin email.', 'success');
        })
        .catch(function (error) {
          setStatus(friendlyError(error), 'error');
        })
        .finally(function () {
          forgotButton.disabled = false;
        });
    });
  }
})();
