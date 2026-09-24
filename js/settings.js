/* ============ XeroAI Settings Page ============
   Profile fields, security preferences, and notification preferences
   are real — they read from and write to the signed-in user's Firestore
   profile (users/{uid}) and persist across logout/login.

   Still simulated, because there's nothing real for them to act on yet:
   - "Sign Out of All Other Sessions" (no cross-device session tracking exists)
   - "Disconnect All Platforms" (no real broker connection is ever stored)
   - The notification toggles control *preferences only* — no actual
     email/SMS/Telegram sending system exists yet to honor them.
   - "Two-Factor Authentication" stores a preference only — it does not
     enforce a real second factor at login.
*/

(function () {

  const db = window.xeroaiDb;
  const auth = window.xeroaiAuth;

  /* ---- Tab switching ---- */
  const tabs = Array.from(document.querySelectorAll('.settings-tab'));
  const panels = Array.from(document.querySelectorAll('.settings-panel'));

  function activateTab(tabName) {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const isActive = panel.id === `panel-${tabName}`;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  function showNote(target, message, isError){
    const note = document.querySelector(`[data-save-note="${target}"]`);
    if (!note) return;
    note.textContent = message;
    note.classList.toggle('is-error', Boolean(isError));
    note.classList.add('is-visible');
    clearTimeout(note._t);
    note._t = setTimeout(() => note.classList.remove('is-visible'), 3200);
  }

  function friendlyAuthError(err){
    const code = err && err.code;
    const map = {
      'auth/wrong-password': 'Current password is incorrect.',
      'auth/invalid-credential': 'Current password is incorrect.',
      'auth/weak-password': 'New password is too weak — use at least 6 characters.',
      'auth/requires-recent-login': 'Please sign out and back in, then try again.',
      'auth/too-many-requests': 'Too many attempts — wait a moment and try again.',
      'auth/popup-closed-by-user': 'Cancelled.'
    };
    return (code && map[code]) || (err && err.message) || 'Something went wrong. Please try again.';
  }

  /* ---- Field references ---- */
  const fields = {
    fullName: document.getElementById('stFullName'),
    email: document.getElementById('stEmail'),
    phone: document.getElementById('stPhone'),
    country: document.getElementById('stCountry'),
    timezone: document.getElementById('stTimezone'),
    defaultMarket: document.getElementById('stDefaultMarket'),
    twoFactor: document.getElementById('stTwoFactor'),
    loginAlerts: document.getElementById('stLoginAlerts')
  };

  const notifChannels = {
    email: document.getElementById('notifyChannelEmail'),
    sms: document.getElementById('notifyChannelSms'),
    telegram: document.getElementById('notifyChannelTelegram'),
    inApp: document.getElementById('notifyChannelInApp')
  };
  const notifEvents = {
    tradeExecuted: document.getElementById('notifyEventTradeExecuted'),
    riskLimit: document.getElementById('notifyEventRiskLimit'),
    automationPaused: document.getElementById('notifyEventAutomationPaused'),
    connectionLost: document.getElementById('notifyEventConnectionLost'),
    billing: document.getElementById('notifyEventBilling')
  };

  let currentUser = null;
  let profileAvatarEl = document.querySelector('.settings-avatar');

  function selectValueIfPresent(selectEl, value){
    if (!selectEl || !value) return;
    const match = Array.from(selectEl.options).some(opt => opt.value === value || opt.textContent === value);
    if (match) selectEl.value = value;
  }

  /* ---- Load existing data once signed in (require-onboarded.js confirms auth) ---- */
  auth.onAuthStateChanged((user) => {
    if (!user) return; // require-onboarded.js already handles the redirect
    currentUser = user;

    if (fields.email) fields.email.value = user.email || '';

    db.collection('users').doc(user.uid).get().then((doc) => {
      if (!doc.exists) return;
      const data = doc.data();

      if (fields.fullName) fields.fullName.value = data.fullName || '';
      if (fields.phone) fields.phone.value = data.phone || '';
      selectValueIfPresent(fields.country, data.country);
      selectValueIfPresent(fields.timezone, data.timezone);
      selectValueIfPresent(fields.defaultMarket, data.defaultMarket);

      if (fields.twoFactor) fields.twoFactor.checked = Boolean(data.twoFactorEnabled);
      if (fields.loginAlerts) fields.loginAlerts.checked = data.loginAlerts !== false; // default true

      const n = data.notifications || {};
      const ch = n.channels || {};
      const ev = n.events || {};
      if (notifChannels.email) notifChannels.email.checked = ch.email !== false;
      if (notifChannels.sms) notifChannels.sms.checked = Boolean(ch.sms);
      if (notifChannels.telegram) notifChannels.telegram.checked = Boolean(ch.telegram);
      if (notifChannels.inApp) notifChannels.inApp.checked = ch.inApp !== false;
      if (notifEvents.tradeExecuted) notifEvents.tradeExecuted.checked = ev.tradeExecuted !== false;
      if (notifEvents.riskLimit) notifEvents.riskLimit.checked = ev.riskLimit !== false;
      if (notifEvents.automationPaused) notifEvents.automationPaused.checked = ev.automationPaused !== false;
      if (notifEvents.connectionLost) notifEvents.connectionLost.checked = ev.connectionLost !== false;
      if (notifEvents.billing) notifEvents.billing.checked = ev.billing !== false;

      if (profileAvatarEl && data.fullName){
        const initials = data.fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        if (initials) profileAvatarEl.textContent = initials;
      }
    });
  });

  /* ---- Save: Profile ---- */
  const profileSaveBtn = document.querySelector('[data-save-target="profile"]');
  if (profileSaveBtn){
    profileSaveBtn.addEventListener('click', () => {
      if (!currentUser) return;
      profileSaveBtn.disabled = true;

      const updates = {
        fullName: fields.fullName ? fields.fullName.value.trim() : '',
        phone: fields.phone ? fields.phone.value.trim() : '',
        country: fields.country ? fields.country.value : '',
        timezone: fields.timezone ? fields.timezone.value : '',
        defaultMarket: fields.defaultMarket ? fields.defaultMarket.value : ''
      };

      db.collection('users').doc(currentUser.uid).update(updates)
        .then(() => currentUser.updateProfile({ displayName: updates.fullName }).catch(() => {}))
        .then(() => {
          showNote('profile', 'Saved.');
          const nameEl = document.getElementById('topbarUserName');
          if (nameEl && updates.fullName) nameEl.textContent = updates.fullName;
          const heroNameEl = document.getElementById('dashboardHeroName');
          if (heroNameEl && updates.fullName) heroNameEl.textContent = updates.fullName;
        })
        .catch((err) => showNote('profile', friendlyAuthError(err), true))
        .finally(() => { profileSaveBtn.disabled = false; });
    });
  }

  /* ---- Save: Password ---- */
  const passwordSaveBtn = document.querySelector('[data-save-target="password"]');
  if (passwordSaveBtn){
    const currentPassEl = document.getElementById('stCurrentPass');
    const newPassEl = document.getElementById('stNewPass');
    const confirmPassEl = document.getElementById('stConfirmPass');

    passwordSaveBtn.addEventListener('click', () => {
      if (!currentUser) return;

      const isGoogleAccount = currentUser.providerData.some(p => p.providerId === 'google.com')
        && !currentUser.providerData.some(p => p.providerId === 'password');
      if (isGoogleAccount){
        showNote('password', "Your account uses Google Sign-In — there's no XeroAI password to change here.", true);
        return;
      }

      const currentPass = currentPassEl ? currentPassEl.value : '';
      const newPass = newPassEl ? newPassEl.value : '';
      const confirmPass = confirmPassEl ? confirmPassEl.value : '';

      if (!currentPass || !newPass){
        showNote('password', 'Fill in your current and new password.', true);
        return;
      }
      if (newPass.length < 6){
        showNote('password', 'New password must be at least 6 characters.', true);
        return;
      }
      if (newPass !== confirmPass){
        showNote('password', "New password and confirmation don't match.", true);
        return;
      }

      passwordSaveBtn.disabled = true;
      const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPass);

      currentUser.reauthenticateWithCredential(credential)
        .then(() => currentUser.updatePassword(newPass))
        .then(() => {
          showNote('password', 'Password updated.');
          if (currentPassEl) currentPassEl.value = '';
          if (newPassEl) newPassEl.value = '';
          if (confirmPassEl) confirmPassEl.value = '';
        })
        .catch((err) => showNote('password', friendlyAuthError(err), true))
        .finally(() => { passwordSaveBtn.disabled = false; });
    });
  }

  /* ---- Save: Security preferences (2FA pref + login alerts) ---- */
  [fields.twoFactor, fields.loginAlerts].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', () => {
      if (!currentUser) return;
      db.collection('users').doc(currentUser.uid).update({
        twoFactorEnabled: Boolean(fields.twoFactor && fields.twoFactor.checked),
        loginAlerts: Boolean(fields.loginAlerts && fields.loginAlerts.checked)
      }).catch(() => { /* best-effort; toggle stays as the user left it visually */ });
    });
  });

  /* ---- Save: Notifications ---- */
  const notifSaveBtn = document.querySelector('[data-save-target="notifications"]');
  if (notifSaveBtn){
    notifSaveBtn.addEventListener('click', () => {
      if (!currentUser) return;
      notifSaveBtn.disabled = true;

      const notifications = {
        channels: {
          email: Boolean(notifChannels.email && notifChannels.email.checked),
          sms: Boolean(notifChannels.sms && notifChannels.sms.checked),
          telegram: Boolean(notifChannels.telegram && notifChannels.telegram.checked),
          inApp: Boolean(notifChannels.inApp && notifChannels.inApp.checked)
        },
        events: {
          tradeExecuted: Boolean(notifEvents.tradeExecuted && notifEvents.tradeExecuted.checked),
          riskLimit: Boolean(notifEvents.riskLimit && notifEvents.riskLimit.checked),
          automationPaused: Boolean(notifEvents.automationPaused && notifEvents.automationPaused.checked),
          connectionLost: Boolean(notifEvents.connectionLost && notifEvents.connectionLost.checked),
          billing: Boolean(notifEvents.billing && notifEvents.billing.checked)
        }
      };

      db.collection('users').doc(currentUser.uid).update({ notifications: notifications })
        .then(() => showNote('notifications', 'Saved.'))
        .catch((err) => showNote('notifications', friendlyAuthError(err), true))
        .finally(() => { notifSaveBtn.disabled = false; });
    });
  }

  /* ---- Sign out of all other sessions (simulated — no session tracking backend) ---- */
  const signOutAllBtn = document.getElementById('stSignOutAll');
  if (signOutAllBtn) {
    signOutAllBtn.addEventListener('click', () => {
      signOutAllBtn.textContent = 'No other sessions (simulated)';
      signOutAllBtn.disabled = true;
    });
  }

  /* ---- Danger zone ---- */
  function reauthenticate(){
    if (!currentUser) return Promise.reject(new Error('Not signed in.'));

    const isGoogleAccount = currentUser.providerData.some(p => p.providerId === 'google.com')
      && !currentUser.providerData.some(p => p.providerId === 'password');

    if (isGoogleAccount){
      const provider = new firebase.auth.GoogleAuthProvider();
      return currentUser.reauthenticateWithPopup(provider);
    }

    const pass = window.prompt('For your security, please re-enter your password to continue:');
    if (!pass) return Promise.reject(new Error('cancelled'));
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, pass);
    return currentUser.reauthenticateWithCredential(credential);
  }

  function downloadJson(filename, dataObj){
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const DANGER_MESSAGES = {
    disconnect: 'Disconnect every connected broker/exchange? This will stop all automation.',
    export: 'Download a copy of your account data now?',
    delete: 'Permanently delete your XeroAI account? This cannot be undone.',
  };

  document.querySelectorAll('[data-danger-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.dangerAction;
      const confirmed = window.confirm(DANGER_MESSAGES[action] || 'Are you sure?');
      if (!confirmed || !currentUser) return;

      if (action === 'disconnect'){
        // No real broker connection is ever stored server-side yet — nothing to actually revoke.
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Disconnected (simulated)';
        setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 3200);
        return;
      }

      if (action === 'export'){
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Preparing…';
        db.collection('users').doc(currentUser.uid).get()
          .then((doc) => {
            const data = doc.exists ? doc.data() : {};
            downloadJson('xeroai-account-data.json', {
              uid: currentUser.uid,
              email: currentUser.email,
              exportedAt: new Date().toISOString(),
              profile: data
            });
            btn.textContent = 'Downloaded';
          })
          .catch(() => { btn.textContent = 'Failed — try again'; })
          .finally(() => {
            setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 3200);
          });
        return;
      }

      if (action === 'delete'){
        if (!window.confirm('This is permanent and cannot be undone. Delete your account for real?')) return;

        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Deleting…';

        reauthenticate()
          .then(() => db.collection('users').doc(currentUser.uid).delete())
          .then(() => currentUser.delete())
          .then(() => { window.location.href = 'index.html'; })
          .catch((err) => {
            if (err && err.message !== 'cancelled'){
              alert(friendlyAuthError(err));
            }
            btn.disabled = false;
            btn.textContent = original;
          });
      }
    });
  });
})();
