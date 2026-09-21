/* ============ XeroAI Settings Page ============
   UI-only for now: nothing here persists past a page refresh.
   Every save/action just simulates a response until a backend
   (Firestore) is connected. */

(function () {

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

  /* ---- Simulated save buttons ---- */
  document.querySelectorAll('.btn-settings-save').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.saveTarget;
      const note = document.querySelector(`[data-save-note="${target}"]`);
      if (!note) return;
      note.textContent = 'Saved locally — not yet connected to a backend.';
      note.classList.add('is-visible');
      clearTimeout(note._t);
      note._t = setTimeout(() => note.classList.remove('is-visible'), 3200);
    });
  });

  /* ---- Sign out of all other sessions (simulated) ---- */
  const signOutAllBtn = document.getElementById('stSignOutAll');
  if (signOutAllBtn) {
    signOutAllBtn.addEventListener('click', () => {
      signOutAllBtn.textContent = 'No other sessions (simulated)';
      signOutAllBtn.disabled = true;
    });
  }

  /* ---- Danger zone actions (simulated, with confirmation) ---- */
  const DANGER_MESSAGES = {
    disconnect: 'Disconnect every connected broker/exchange? This will stop all automation.',
    export: 'Request an export of your account data?',
    delete: 'Permanently delete your XeroAI account? This cannot be undone.',
  };
  const DANGER_RESULT_TEXT = {
    disconnect: 'Disconnected (simulated)',
    export: 'Export requested (simulated)',
    delete: 'Account deletion requested (simulated)',
  };

  document.querySelectorAll('[data-danger-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.dangerAction;
      const confirmed = window.confirm(DANGER_MESSAGES[action] || 'Are you sure?');
      if (!confirmed) return;

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = DANGER_RESULT_TEXT[action] || 'Done (simulated)';

      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
      }, 3200);
    });
  });
})();
