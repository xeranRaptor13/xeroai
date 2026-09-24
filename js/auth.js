/* ==========================================================
   XeroAI — Shared Authentication JavaScript
   Used by: login.html, signup.html, forgot-password.html,
            verify-email.html, trial-started.html, onboarding.html
   Every feature below guards for missing elements so this one
   file can be safely shared across all auth pages.
   ========================================================== */

(function(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============ PASSWORD SHOW / HIDE ============ */
  (function(){
    const toggles = document.querySelectorAll('.toggle-password');
    if(!toggles.length) return;

    toggles.forEach(toggle => {
      const wrap = toggle.closest('.password-wrap');
      const input = wrap ? wrap.querySelector('input') : null;
      if(!input) return;

      toggle.addEventListener('click', () => {
        const showing = toggle.getAttribute('aria-pressed') === 'true';
        toggle.setAttribute('aria-pressed', String(!showing));
        toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        input.type = showing ? 'password' : 'text';
      });
    });
  })();

  /* ============ FIELD VALIDATION HELPERS ============ */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Allows digits plus an optional leading + and common separators (space, dash, dot, parens)
  const PHONE_CHARS_RE = /^\+?[0-9\s\-().]+$/;

  function setFieldError(fieldEl, message){
    if(!fieldEl) return;
    fieldEl.classList.add('has-error');
    const errorEl = fieldEl.querySelector('.field-error');
    if(errorEl) errorEl.textContent = message;
  }

  function clearFieldError(fieldEl){
    if(!fieldEl) return;
    fieldEl.classList.remove('has-error');
    const errorEl = fieldEl.querySelector('.field-error');
    if(errorEl) errorEl.textContent = '';
  }

  function setStatus(statusEl, message, type){
    if(!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('success');
    if(type === 'success') statusEl.classList.add('success');
    statusEl.classList.toggle('show', Boolean(message));
  }

  /* ============ FIREBASE HELPERS (shared by login/signup/google/verify/reset) ============ */
  function generateAccountId(){
    return 'XA-' + Math.floor(10000 + Math.random() * 90000);
  }

  function friendlyAuthError(err){
    const code = err && err.code;
    const map = {
      'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Password is too weak — use at least 6 characters.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/user-not-found': 'No account found with that email.',
      'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled.',
      'auth/network-request-failed': 'Network error — check your connection and try again.'
    };
    return (code && map[code]) || (err && err.message) || 'Something went wrong. Please try again.';
  }

  // Creates the Firestore users/{uid} profile doc. Used at signup and on a
  // brand-new Google sign-in. Returns a Promise resolving to the accountId.
  function createUserProfile(user, extra){
    extra = extra || {};
    const db = window.xeroaiDb;
    const accountId = generateAccountId();
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    const profile = Object.assign({
      fullName: user.displayName || '',
      email: user.email || '',
      phone: '',
      accountId: accountId,
      authProvider: 'password',
      subscriptionStatus: 'trial',
      onboardingComplete: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      trialStartDate: firebase.firestore.FieldValue.serverTimestamp(),
      trialEndDate: firebase.firestore.Timestamp.fromDate(trialEnd)
    }, extra);

    return db.collection('users').doc(user.uid).set(profile).then(() => accountId);
  }

  // Reads the user's onboarding status from Firestore and sends them to the
  // right place — dashboard if they've completed onboarding, back to step 1
  // if they haven't. Falls back to onboarding-step1.html if the read fails
  // for any reason (safer default than accidentally exposing the dashboard).
  function redirectAfterLogin(uid){
    return window.xeroaiDb.collection('users').doc(uid).get()
      .then((doc) => {
        const complete = doc.exists && doc.data().onboardingComplete === true;
        window.location.href = complete ? 'dashboard.html' : 'onboarding-step1.html';
      })
      .catch(() => { window.location.href = 'onboarding-step1.html'; });
  }

  /* ============ LOGIN FORM ============ */
  (function(){
    const form = document.getElementById('loginForm');
    if(!form) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailField = emailInput ? emailInput.closest('.field') : null;
    const passwordField = passwordInput ? passwordInput.closest('.field') : null;
    const submitBtn = document.getElementById('submitBtn');
    const statusEl = document.getElementById('formStatus');

    function validate(){
      let valid = true;
      let firstInvalid = null;

      clearFieldError(emailField);
      clearFieldError(passwordField);

      const emailVal = emailInput ? emailInput.value.trim() : '';
      const passVal = passwordInput ? passwordInput.value : '';

      if(!emailVal){
        setFieldError(emailField, 'Email is required.');
        valid = false;
        firstInvalid = firstInvalid || emailInput;
      }else if(!EMAIL_RE.test(emailVal)){
        setFieldError(emailField, 'Enter a valid email address.');
        valid = false;
        firstInvalid = firstInvalid || emailInput;
      }

      if(!passVal){
        setFieldError(passwordField, 'Password is required.');
        valid = false;
        firstInvalid = firstInvalid || passwordInput;
      }else if(passVal.length < 6){
        setFieldError(passwordField, 'Password must be at least 6 characters.');
        valid = false;
        firstInvalid = firstInvalid || passwordInput;
      }

      if(!valid && firstInvalid) firstInvalid.focus();
      return valid;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if(submitBtn && submitBtn.classList.contains('is-loading')) return;

      setStatus(statusEl, '', null);

      if(!validate()){
        setStatus(statusEl, 'Please fix the highlighted fields.', 'error');
        return;
      }

      if(!submitBtn) return;

      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('aria-busy', 'true');

      const emailVal = emailInput.value.trim();
      const passVal = passwordInput.value;

      window.xeroaiAuth.signInWithEmailAndPassword(emailVal, passVal)
        .then((cred) => {
          if(!cred.user.emailVerified){
            return window.xeroaiAuth.signOut().then(() => {
              try{ sessionStorage.setItem('xeroai_signup_email', emailVal); }catch(err){ /* unavailable */ }
              submitBtn.classList.remove('is-loading');
              submitBtn.removeAttribute('aria-busy');
              setStatus(statusEl, 'Please verify your email before logging in — redirecting to the verification page…', 'error');
              setTimeout(() => { window.location.href = 'verify-email.html'; }, 1400);
            });
          }

          submitBtn.classList.remove('is-loading');
          submitBtn.classList.add('is-success');
          submitBtn.removeAttribute('aria-busy');
          setStatus(statusEl, 'Signed in successfully — redirecting…', 'success');
          window.xeroaiLogActivity(cred.user.uid, 'Signed in.', 'info');
          setTimeout(() => { redirectAfterLogin(cred.user.uid); }, reduceMotion ? 200 : 900);
        })
        .catch((err) => {
          submitBtn.classList.remove('is-loading');
          submitBtn.removeAttribute('aria-busy');
          setStatus(statusEl, friendlyAuthError(err), 'error');
        });
    });

    // Clear a field's error state as soon as the user starts correcting it
    [emailInput, passwordInput].forEach(input => {
      if(!input) return;
      input.addEventListener('input', () => {
        const field = input.closest('.field');
        if(field && field.classList.contains('has-error')) clearFieldError(field);
      });
    });
  })();

  /* ============ GOOGLE SIGN-IN ============ */
  (function(){
    const googleBtns = document.querySelectorAll('.btn-google');
    if(!googleBtns.length) return;

    googleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const statusEl = document.getElementById('formStatus')
          || document.getElementById('signupStatus')
          || document.getElementById('resetStatus');

        if(btn.classList.contains('is-loading')) return;
        btn.classList.add('is-loading');
        setStatus(statusEl, '', null);

        const provider = new firebase.auth.GoogleAuthProvider();

        window.xeroaiAuth.signInWithPopup(provider)
          .then((result) => {
            const isNewUser = Boolean(result.additionalUserInfo && result.additionalUserInfo.isNewUser);

            if(!isNewUser){
              setStatus(statusEl, 'Signed in successfully — redirecting…', 'success');
              window.xeroaiLogActivity(result.user.uid, 'Signed in with Google.', 'info');
              setTimeout(() => { redirectAfterLogin(result.user.uid); }, reduceMotion ? 200 : 700);
              return;
            }

            return createUserProfile(result.user, { authProvider: 'google' }).then(() => {
              window.xeroaiLogActivity(result.user.uid, 'Account created with Google.', 'success');
              setStatus(statusEl, 'Account created — redirecting…', 'success');
              setTimeout(() => { window.location.href = 'trial-started.html'; }, reduceMotion ? 200 : 700);
            });
          })
          .catch((err) => {
            btn.classList.remove('is-loading');
            setStatus(statusEl, friendlyAuthError(err), 'error');
          });
      });
    });
  })();

  /* ============ SHARED: generic loading → success submit-state helper ============ */
  function simulateSubmit(btn, onComplete){
    if(!btn){ if(onComplete) onComplete(); return; }
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');

    const loadingDelay = reduceMotion ? 150 : 1300;
    const afterSuccessDelay = reduceMotion ? 150 : 900;

    setTimeout(() => {
      btn.classList.remove('is-loading');
      btn.classList.add('is-success');
      btn.removeAttribute('aria-busy');
      if(onComplete) setTimeout(onComplete, afterSuccessDelay);
    }, loadingDelay);
  }

  /* ============ ANIMATED AI NETWORK BACKGROUND ============ */
  (function(){
    const canvas = document.getElementById('networkCanvas');
    if(!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0, ch = 0, particles = [], rafId = null;

    function resize(){
      const rect = canvas.parentElement.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticles(){
      const density = 16000;
      const count = Math.max(20, Math.min(70, Math.floor((cw * ch) / density)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28
      }));
    }

    function drawFrame(){
      ctx.clearRect(0, 0, cw, ch);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if(p.x <= 0 || p.x >= cw) p.vx *= -1;
        if(p.y <= 0 || p.y >= ch) p.vy *= -1;
      });

      for(let i = 0; i < particles.length; i++){
        for(let j = i + 1; j < particles.length; j++){
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if(dist < 130){
            ctx.strokeStyle = 'rgba(94,142,255,' + (0.16 * (1 - dist / 130)) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(138,180,255,0.7)';
        ctx.fill();
      });
    }

    function loop(){
      drawFrame();
      rafId = requestAnimationFrame(loop);
    }

    function start(){
      resize();
      createParticles();
      if(reduceMotion){
        drawFrame();
      }else{
        if(rafId) cancelAnimationFrame(rafId);
        loop();
      }
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(start, 150);
    });

    start();
  })();

  /* ============ SIGNUP FORM ============ */
  (function(){
    const form = document.getElementById('signupForm');
    if(!form) return;

    const nameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('signupEmail');
    const phoneInput = document.getElementById('signupPhone');
    const passwordInput = document.getElementById('signupPassword');
    const confirmInput = document.getElementById('confirmPassword');
    const termsInput = document.getElementById('agreeTerms');

    const nameField = nameInput ? nameInput.closest('.field') : null;
    const emailField = emailInput ? emailInput.closest('.field') : null;
    const phoneField = phoneInput ? phoneInput.closest('.field') : null;
    const passwordField = passwordInput ? passwordInput.closest('.field') : null;
    const confirmField = confirmInput ? confirmInput.closest('.field') : null;
    const termsError = document.getElementById('agreeTermsError');

    const submitBtn = document.getElementById('signupSubmit');
    const statusEl = document.getElementById('signupStatus');

    function validate(){
      let valid = true;
      let firstInvalid = null;

      [nameField, emailField, phoneField, passwordField, confirmField].forEach(clearFieldError);
      if(termsError) termsError.textContent = '';

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      const passVal = passwordInput ? passwordInput.value : '';
      const confirmVal = confirmInput ? confirmInput.value : '';

      if(!nameVal){
        setFieldError(nameField, 'Full name is required.');
        valid = false; firstInvalid = firstInvalid || nameInput;
      }

      if(!emailVal){
        setFieldError(emailField, 'Email is required.');
        valid = false; firstInvalid = firstInvalid || emailInput;
      }else if(!EMAIL_RE.test(emailVal)){
        setFieldError(emailField, 'Enter a valid email address.');
        valid = false; firstInvalid = firstInvalid || emailInput;
      }

      if(!phoneVal){
        setFieldError(phoneField, 'Phone number is required.');
        valid = false; firstInvalid = firstInvalid || phoneInput;
      }else if(!PHONE_CHARS_RE.test(phoneVal)){
        setFieldError(phoneField, 'Enter a valid phone number.');
        valid = false; firstInvalid = firstInvalid || phoneInput;
      }else{
        const digitCount = phoneVal.replace(/\D/g, '').length;
        if(digitCount < 7 || digitCount > 15){
          setFieldError(phoneField, 'Phone number should have 7–15 digits.');
          valid = false; firstInvalid = firstInvalid || phoneInput;
        }
      }

      if(!passVal){
        setFieldError(passwordField, 'Password is required.');
        valid = false; firstInvalid = firstInvalid || passwordInput;
      }else if(passVal.length < 6){
        setFieldError(passwordField, 'Password must be at least 6 characters.');
        valid = false; firstInvalid = firstInvalid || passwordInput;
      }

      if(!confirmVal){
        setFieldError(confirmField, 'Please confirm your password.');
        valid = false; firstInvalid = firstInvalid || confirmInput;
      }else if(passVal && confirmVal !== passVal){
        setFieldError(confirmField, 'Passwords do not match.');
        valid = false; firstInvalid = firstInvalid || confirmInput;
      }

      if(termsInput && !termsInput.checked){
        if(termsError) termsError.textContent = 'You must agree to continue.';
        valid = false; firstInvalid = firstInvalid || termsInput;
      }

      if(!valid && firstInvalid) firstInvalid.focus();
      return valid;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if(submitBtn && submitBtn.classList.contains('is-loading')) return;

      setStatus(statusEl, '', null);

      if(!validate()){
        setStatus(statusEl, 'Please fix the highlighted fields.', 'error');
        return;
      }

      if(!submitBtn) return;

      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('aria-busy', 'true');

      const nameVal = nameInput.value.trim();
      const emailVal = emailInput.value.trim();
      const phoneVal = phoneInput.value.trim();
      const passVal = passwordInput.value;

      window.xeroaiAuth.createUserWithEmailAndPassword(emailVal, passVal)
        .then((cred) => {
          return cred.user.updateProfile({ displayName: nameVal })
            .then(() => createUserProfile(cred.user, { fullName: nameVal, phone: phoneVal, authProvider: 'password' }))
            .then(() => window.xeroaiLogActivity(cred.user.uid, 'Account created.', 'success'))
            .then(() => cred.user.sendEmailVerification());
        })
        .then(() => {
          try{
            sessionStorage.setItem('xeroai_signup_email', emailVal);
          }catch(err){ /* sessionStorage unavailable — non-critical */ }

          submitBtn.classList.remove('is-loading');
          submitBtn.classList.add('is-success');
          submitBtn.removeAttribute('aria-busy');
          setStatus(statusEl, 'Account created — redirecting…', 'success');

          setTimeout(() => { window.location.href = 'verify-email.html'; }, reduceMotion ? 200 : 900);
        })
        .catch((err) => {
          submitBtn.classList.remove('is-loading');
          submitBtn.removeAttribute('aria-busy');
          setStatus(statusEl, friendlyAuthError(err), 'error');
        });
    });

    [nameInput, emailInput, phoneInput, passwordInput, confirmInput].forEach(input => {
      if(!input) return;
      input.addEventListener('input', () => {
        const field = input.closest('.field');
        if(field && field.classList.contains('has-error')) clearFieldError(field);
      });
    });

    if(termsInput){
      termsInput.addEventListener('change', () => {
        if(termsInput.checked && termsError) termsError.textContent = '';
      });
    }
  })();

  /* ============ FORGOT PASSWORD FORM ============ */
  (function(){
    const form = document.getElementById('forgotForm');
    if(!form) return;

    const emailInput = document.getElementById('resetEmail');
    const emailField = emailInput ? emailInput.closest('.field') : null;
    const submitBtn = document.getElementById('resetSubmit');
    const statusEl = document.getElementById('resetStatus');

    const requestView = document.getElementById('resetRequestView');
    const sentView = document.getElementById('resetSentView');
    const sentEmailEl = document.getElementById('resetSentEmail');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if(submitBtn && submitBtn.classList.contains('is-loading')) return;

      setStatus(statusEl, '', null);
      clearFieldError(emailField);

      const emailVal = emailInput ? emailInput.value.trim() : '';

      if(!emailVal){
        setFieldError(emailField, 'Email is required.');
        setStatus(statusEl, 'Please fix the highlighted field.', 'error');
        emailInput.focus();
        return;
      }
      if(!EMAIL_RE.test(emailVal)){
        setFieldError(emailField, 'Enter a valid email address.');
        setStatus(statusEl, 'Please fix the highlighted field.', 'error');
        emailInput.focus();
        return;
      }

      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('aria-busy', 'true');

      window.xeroaiAuth.sendPasswordResetEmail(emailVal)
        .then(() => {
          submitBtn.classList.remove('is-loading');
          submitBtn.removeAttribute('aria-busy');
          if(sentEmailEl) sentEmailEl.textContent = emailVal;
          if(requestView) requestView.hidden = true;
          if(sentView) sentView.hidden = false;
        })
        .catch((err) => {
          submitBtn.classList.remove('is-loading');
          submitBtn.removeAttribute('aria-busy');
          // Don't reveal whether an account exists for this email — show the
          // same "sent" state unless it's a genuine input problem.
          if(err && err.code === 'auth/invalid-email'){
            setFieldError(emailField, 'Enter a valid email address.');
            setStatus(statusEl, 'Please fix the highlighted field.', 'error');
            return;
          }
          if(sentEmailEl) sentEmailEl.textContent = emailVal;
          if(requestView) requestView.hidden = true;
          if(sentView) sentView.hidden = false;
        });
    });

    if(emailInput){
      emailInput.addEventListener('input', () => {
        if(emailField && emailField.classList.contains('has-error')) clearFieldError(emailField);
      });
    }
  })();

  /* ============ VERIFY EMAIL PAGE ============ */
  (function(){
    const verifyBtn = document.getElementById('verifySubmit');
    if(!verifyBtn) return;

    const statusEl = document.getElementById('verifyStatus');
    const targetEl = document.getElementById('verifyEmailTarget');
    const resendBtn = document.getElementById('resendBtn');

    let storedEmail = null;
    try{ storedEmail = sessionStorage.getItem('xeroai_signup_email'); }catch(err){ /* unavailable */ }
    if(targetEl && storedEmail) targetEl.textContent = storedEmail;

    // Firebase restores the signed-in user asynchronously on page load.
    window.xeroaiAuth.onAuthStateChanged((user) => {
      if(user && targetEl) targetEl.textContent = user.email;
    });

    verifyBtn.addEventListener('click', () => {
      if(verifyBtn.classList.contains('is-loading')) return;

      const user = window.xeroaiAuth.currentUser;
      if(!user){
        setStatus(statusEl, 'Your session expired — please sign up or log in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1400);
        return;
      }

      verifyBtn.classList.add('is-loading');
      verifyBtn.setAttribute('aria-busy', 'true');
      setStatus(statusEl, 'Checking…', null);

      user.reload()
        .then(() => {
          verifyBtn.classList.remove('is-loading');
          verifyBtn.removeAttribute('aria-busy');

          if(user.emailVerified){
            setStatus(statusEl, 'Verified — redirecting…', 'success');
            setTimeout(() => { window.location.href = 'trial-started.html'; }, reduceMotion ? 200 : 700);
          }else{
            setStatus(statusEl, 'Still not verified — check your inbox and click the link, then try again.', 'error');
          }
        })
        .catch((err) => {
          verifyBtn.classList.remove('is-loading');
          verifyBtn.removeAttribute('aria-busy');
          setStatus(statusEl, friendlyAuthError(err), 'error');
        });
    });

    if(resendBtn){
      let cooldown = 0;
      let cooldownTimer = null;
      const originalLabel = resendBtn.textContent;

      resendBtn.addEventListener('click', () => {
        if(resendBtn.disabled) return;

        const user = window.xeroaiAuth.currentUser;
        if(!user){
          setStatus(statusEl, 'Your session expired — please sign up or log in again.', 'error');
          return;
        }

        user.sendEmailVerification()
          .then(() => setStatus(statusEl, 'Verification email resent.', 'success'))
          .catch((err) => setStatus(statusEl, friendlyAuthError(err), 'error'));

        cooldown = 30;
        resendBtn.disabled = true;

        function tick(){
          resendBtn.textContent = 'Resend available in ' + cooldown + 's';
          if(cooldown <= 0){
            clearInterval(cooldownTimer);
            resendBtn.disabled = false;
            resendBtn.textContent = originalLabel;
            return;
          }
          cooldown--;
        }
        tick();
        cooldownTimer = setInterval(tick, 1000);
      });
    }
  })();

  /* ============ TRIAL STARTED PAGE ============ */
  (function(){
    const expiryEl = document.getElementById('trialExpiry');
    if(!expiryEl) return;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);
    const formatted = expiryDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    expiryEl.textContent = 'Trial ends ' + formatted + ' — no charges until then.';
  })();

  /* ============ ONBOARDING STEP 1 (v2) ============ */
  (function(){
    const shell = document.querySelector('.ob2-shell');
    if(!shell) return;

    /* ---- animated progress bar ---- */
    const fill = document.getElementById('ob2ProgressFill');
    const pct = document.getElementById('ob2ProgressPct');
    if(fill){
      const target = parseInt(fill.dataset.target, 10) || 0;
      requestAnimationFrame(() => {
        setTimeout(() => {
          fill.style.width = target + '%';
          if(pct) pct.textContent = target + '%';
        }, 200);
      });
    }

    /* ---- single-select market cards (Synthetic Indices selected by default; Crypto/Currency Trading are coming soon and not selectable) ---- */
    const cards = Array.from(document.querySelectorAll('.ob2-market-card'));
    const selectableCards = cards.filter(c => !c.classList.contains('is-disabled'));

    function selectCard(card){
      if(card.classList.contains('is-disabled')) return;
      cards.forEach(c => {
        const isThis = c === card;
        c.classList.toggle('selected', isThis);
        c.setAttribute('aria-checked', String(isThis));
        c.tabIndex = isThis ? 0 : -1;
      });
    }

    cards.forEach((card) => {
      if(card.classList.contains('is-disabled')){
        card.tabIndex = -1;
        return;
      }

      card.addEventListener('click', () => selectCard(card));

      card.addEventListener('keydown', (e) => {
        const index = selectableCards.indexOf(card);
        let targetIndex = null;
        if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
          targetIndex = (index + 1) % selectableCards.length;
        }else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
          targetIndex = (index - 1 + selectableCards.length) % selectableCards.length;
        }else if(e.key === ' ' || e.key === 'Enter'){
          e.preventDefault();
          selectCard(card);
          return;
        }
        if(targetIndex !== null){
          e.preventDefault();
          selectableCards[targetIndex].focus();
        }
      });
    });

    /* ---- continue button ---- */
    const continueBtn = document.getElementById('ob2Continue');
    if(continueBtn){
      continueBtn.addEventListener('click', () => {
        if(continueBtn.classList.contains('is-loading')) return;
        const nextPage = continueBtn.dataset.next || 'onboarding-step2.html';
        simulateSubmit(continueBtn, () => {
          window.location.href = nextPage;
        });
      });
    }

    /* ---- reveal on load ---- */
    const revealTargets = document.querySelectorAll('.reveal-ob2');
    if(reduceMotion){
      revealTargets.forEach(el => el.classList.add('in-view'));
    }else{
      revealTargets.forEach((el, i) => {
        setTimeout(() => el.classList.add('in-view'), 120 + i * 100);
      });
    }
  })();

  /* ============ ONBOARDING STEP 2 (platform selection) ============ */
  (function(){
    const platformCards = document.querySelectorAll('.ob2-platform-card');
    if(!platformCards.length) return;

    const continueBtn = document.getElementById('ob2Continue');
    const summaryList = document.getElementById('ob2SummaryList');

    const checkIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

    function updateSummary(){
      const selected = Array.from(platformCards).filter(c => c.classList.contains('selected'));

      if(!continueBtn) return;
      continueBtn.disabled = selected.length === 0;
      continueBtn.setAttribute('aria-disabled', String(selected.length === 0));

      if(!summaryList) return;
      summaryList.innerHTML = '';

      if(selected.length === 0){
        const empty = document.createElement('span');
        empty.className = 'ob2-summary-empty';
        empty.textContent = 'No platform selected.';
        summaryList.appendChild(empty);
        return;
      }

      selected.forEach(card => {
        const chip = document.createElement('span');
        chip.className = 'ob2-summary-chip';
        const h3 = card.querySelector('h3');
        const label = card.dataset.platform || (h3 ? h3.textContent : '');
        chip.innerHTML = checkIconSvg + label;
        summaryList.appendChild(chip);
      });
    }

    platformCards.forEach(card => {
      if(card.classList.contains('is-disabled')) return;
      card.addEventListener('click', () => {
        const nowSelected = !card.classList.contains('selected');
        card.classList.toggle('selected', nowSelected);
        card.setAttribute('aria-checked', String(nowSelected));
        updateSummary();
      });
    });

    updateSummary();
  })();

  /* ============ ONBOARDING STEP 3 (connect trading account) ============ */
  (function(){
    const tabs = document.querySelectorAll('.ob2-tab');
    if(!tabs.length) return;

    const forms = document.querySelectorAll('.ob2-connect-form');
    const continueBtn = document.getElementById('ob2Continue');
    const hintEl = document.getElementById('ob2ConnectHint');
    const connected = new Set();

    /* ---- tab switching ---- */
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const platform = tab.dataset.platform;

        tabs.forEach(t => {
          const isThis = t === tab;
          t.classList.toggle('active', isThis);
          t.setAttribute('aria-selected', String(isThis));
        });

        forms.forEach(form => {
          const isMatch = form.dataset.form === platform;
          form.hidden = !isMatch;
          if(isMatch){
            form.style.animation = 'none';
            // restart the fade-in animation for the newly shown form
            void form.offsetWidth;
            form.style.animation = '';
          }
        });
      });
    });

    /* ---- demo connection simulation (no real API calls) ---- */
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const btn = form.querySelector('.ob2-connect-btn');
        const status = form.querySelector('.ob2-connect-status');
        if(!btn || btn.classList.contains('is-loading')) return;

        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        if(status){
          status.textContent = 'Connecting...';
          status.classList.remove('success');
          status.classList.add('show');
        }

        const stepDelay = reduceMotion ? 120 : 850;

        setTimeout(() => {
          if(status) status.textContent = 'Authenticating...';

          setTimeout(() => {
            btn.classList.remove('is-loading');
            btn.classList.add('is-success');
            btn.removeAttribute('aria-busy');
            if(status){
              status.textContent = 'Connection Successful ✓';
              status.classList.add('success');
            }

            connected.add(form.dataset.form);
            if(continueBtn){
              continueBtn.disabled = false;
              continueBtn.setAttribute('aria-disabled', 'false');
            }
            if(hintEl){
              hintEl.textContent = 'You can connect more accounts anytime from your dashboard.';
            }
          }, stepDelay);
        }, stepDelay);
      });
    });
  })();

  /* ============ ONBOARDING STEP 4 (setup complete) ============ */
  (function(){
    const successCheck = document.getElementById('ob2SuccessCheck');
    if(!successCheck) return;

    /* ---- draw-in animation for the success checkmark ---- */
    const path = successCheck.querySelector('path');
    if(path){
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = reduceMotion ? 0 : len;
      if(!reduceMotion){
        path.style.transition = 'stroke-dashoffset .8s cubic-bezier(.16,1,.3,1) .3s';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { path.style.strokeDashoffset = 0; });
        });
      }
    }

    /* ---- reveal AI status rows one after another ---- */
    const statusRows = document.querySelectorAll('.ob2-status-row');
    if(reduceMotion){
      statusRows.forEach(row => row.classList.add('show'));
    }else{
      statusRows.forEach((row, i) => {
        setTimeout(() => row.classList.add('show'), 700 + i * 450);
      });
    }

    /* ---- go to dashboard ---- */
    const goDashboardBtn = document.getElementById('ob2GoDashboard');
    if(goDashboardBtn){
      goDashboardBtn.addEventListener('click', () => {
        if(goDashboardBtn.classList.contains('is-loading')) return;
        const nextPage = goDashboardBtn.dataset.next || 'dashboard.html';

        goDashboardBtn.classList.add('is-loading');
        goDashboardBtn.setAttribute('aria-busy', 'true');

        const user = window.xeroaiAuth && window.xeroaiAuth.currentUser;
        if(!user){
          // Not signed in somehow — send them to log in rather than letting
          // the button silently fail.
          window.location.href = 'login.html';
          return;
        }

        window.xeroaiDb.collection('users').doc(user.uid)
          .update({ onboardingComplete: true })
          .then(() => window.xeroaiLogActivity(user.uid, 'Onboarding completed.', 'success'))
          .then(() => { window.location.href = nextPage; })
          .catch(() => {
            // Even if the write fails, don't trap the user on this screen —
            // let them through, but they'll be sent back here next time
            // they hit the dashboard since the flag never got set.
            window.location.href = nextPage;
          });
      });
    }
  })();

})();
