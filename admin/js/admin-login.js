/* ==========================================================
   XeroAI Admin — Login
   Step 1: administrator authentication only.

   IMPORTANT:
   This page intentionally does not grant Firestore admin powers.
   Admin-only database operations will be protected by server-side
   authorization in the later admin/backend steps.
   ========================================================== */
(function () {
  'use strict';

  // Exact administrator allowlist supplied by the project owner.
  const ADMIN_EMAILS = new Set([
    'ezemariaezemaria77@gmail.com',
    'xeranraptor@gmail.com'
  ]);

  const form = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const togglePassword = document.getElementById('togglePassword');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const submitSpinner = document.getElementById('submitSpinner');
  const formStatus = document.getElementById('formStatus');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function setStatus(message, type) {
    formStatus.textContent = message || '';
    formStatus.className = 'form-status' + (type ? ' is-' + type : '');
  }

  function clearErrors() {
    emailError.textContent = '';
    passwordError.textContent = '';
    emailInput.classList.remove('has-error');
    passwordInput.classList.remove('has-error');
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.setAttribute('aria-busy', String(loading));
    submitSpinner.hidden = !loading;
    submitLabel.textContent = loading ? 'Authenticating…' : 'Sign In';
  }

  function friendlyError(error) {
    switch (error && error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'The email or password is incorrect.';
      case 'auth/too-many-requests':
        return 'Too many unsuccessful attempts. Please wait and try again later.';
      case 'auth/network-request-failed':
        return 'A network error occurred. Check your connection and try again.';
      default:
        return 'Unable to sign in right now. Please try again.';
    }
  }

  togglePassword.addEventListener('click', function () {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    togglePassword.textContent = showing ? 'Show' : 'Hide';
    togglePassword.setAttribute('aria-pressed', String(!showing));
    togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();
    setStatus('', '');

    const email = normalizeEmail(emailInput.value);
    const password = passwordInput.value;

    if (!email) {
      emailInput.classList.add('has-error');
      emailError.textContent = 'Enter your administrator email.';
      emailInput.focus();
      return;
    }

    if (!ADMIN_EMAILS.has(email)) {
      emailInput.classList.add('has-error');
      emailError.textContent = 'This account is not authorized for admin access.';
      emailInput.focus();
      return;
    }

    if (!password) {
      passwordInput.classList.add('has-error');
      passwordError.textContent = 'Enter your password.';
      passwordInput.focus();
      return;
    }

    setLoading(true);

    window.xeroaiAuth.signInWithEmailAndPassword(email, password)
      .then(function (credential) {
        const user = credential.user;
        const signedInEmail = normalizeEmail(user && user.email);

        // Defense in depth: check the actual Firebase account email too.
        if (!user || !ADMIN_EMAILS.has(signedInEmail)) {
          return window.xeroaiAuth.signOut().then(function () {
            throw { code: 'admin/not-authorized' };
          });
        }

        if (!user.emailVerified) {
          return window.xeroaiAuth.signOut().then(function () {
            throw { code: 'admin/email-not-verified' };
          });
        }

        setStatus('Admin authentication successful.', 'success');

        // The admin dashboard will be added in the next step.
        // Keep this redirect isolated to the admin area.
        window.location.href = 'dashboard.html';
      })
      .catch(function (error) {
        setLoading(false);

        if (error && error.code === 'admin/not-authorized') {
          setStatus('This Firebase account is not authorized for admin access.', 'error');
          return;
        }

        if (error && error.code === 'admin/email-not-verified') {
          setStatus('Verify the administrator email before signing in.', 'error');
          return;
        }

        setStatus(friendlyError(error), 'error');
      });
  });
})();
