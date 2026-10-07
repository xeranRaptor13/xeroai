/* ============================================================
   XeroAI — Subscription page (js/subscription.js)

   Everything shown here comes from Firestore:
     users/{uid}                    -> trialStartDate, trialEndDate,
                                       subscriptionStatus, accountId,
                                       subscriptionExpiresAt (optional)
     users/{uid}/receipts/{id}      -> one doc per "I've made my payment"
                                       click (createdAt, and later a
                                       "status" field set by the XeroAI
                                       team in the Firebase Console)

   The user's browser can only CREATE a receipt (see firestore.rules).
   It can never write subscriptionStatus, trial dates, or a receipt's
   status — those are changed only by the XeroAI team in the Console —
   so nothing on this page can be faked from dev tools.

   The status shown here is what the user SEES. It is not what decides
   whether trades execute; that must be enforced server-side.
   ============================================================ */
(function(){

  const statusBadge = document.getElementById('subStatusBadge');
  if(!document.getElementById('paymentSection')) return;   // only run on subscription.html
  if(!window.xeroaiAuth || !window.xeroaiDb) return;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_TRIAL_DAYS = 3;

  /* The free trial ends for everyone (old and new members) at this moment,
     even if their saved trial end date is later. */
  const TRIAL_CUTOFF = new Date('2026-10-09T23:59:59+01:00');

  function cappedTrialEnd(d){
    if(!d) return null;
    return d > TRIAL_CUTOFF ? TRIAL_CUTOFF : d;
  }

  /* ---- elements ---- */
  const el = {
    accountId:      document.getElementById('subAccountId'),
    payAccountId:   document.getElementById('payAccountId'),
    trialBlock:     document.getElementById('trialProgressBlock'),
    trialTitle:     document.getElementById('trialProgressTitle'),
    trialText:      document.getElementById('trialProgressText'),
    trialFill:      document.getElementById('trialProgressFill'),
    trialStart:     document.getElementById('subTrialStart'),
    trialEnd:       document.getElementById('subTrialEnd'),
    daysRemaining:  document.getElementById('subDaysRemaining'),
    engineAccess:   document.getElementById('subEngineAccess'),
    subscribeBtn:   document.getElementById('goToPaymentBtn'),
    copyBtn:        document.getElementById('copyAccountIdBtn'),
    paidBtn:        document.getElementById('paidBtn'),
    paymentNote:    document.getElementById('paymentNote'),
    historyBody:    document.getElementById('submissionHistoryBody')
  };

  /* ---- state ---- */
  let uid = null;
  let userData = null;      // users/{uid} document data
  let receipts = [];        // newest first
  let receiptsError = false;

  const DEFAULT_PAYMENT_NOTE = el.paymentNote ? el.paymentNote.textContent : '';

  /* ---- helpers ---- */
  function toDate(ts){
    return ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  }

  function fmtDate(d){
    return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';
  }

  function fmtDateTime(d){
    return d
      ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '\u2014';
  }

  function plural(n, word){
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function setText(node, text){
    if(node) node.textContent = text;
  }

  /* ---- work out what state the account is in ----
     Order matters:
       active   paid and (no expiry set, or expiry still in the future)
       trial    trial end date is still in the future
       pending  trial is over, and the latest payment submission has not
                been reviewed yet (no "status" field on it)
       expired  none of the above                                        */
  function computeState(){
    if(!userData) return null;
    const now = new Date();
    const trialEnd = cappedTrialEnd(toDate(userData.trialEndDate));
    const expiresAt = toDate(userData.subscriptionExpiresAt);

    const paidActive = userData.subscriptionStatus === 'active' && (!expiresAt || expiresAt > now);
    if(paidActive) return 'active';

    if(trialEnd && trialEnd > now) return 'trial';

    if(hasUnreviewedReceipt()) return 'pending';
    return 'expired';
  }

  function hasUnreviewedReceipt(){
    return receipts.length > 0 && !receipts[0].status;
  }

  /* ---- render: status card ---- */
  function renderStatus(){
    const state = computeState();
    if(!state) return;

    const trialStart = toDate(userData.trialStartDate);
    const trialEnd = cappedTrialEnd(toDate(userData.trialEndDate));
    const now = new Date();

    setText(el.accountId, userData.accountId || '\u2014');
    setText(el.payAccountId, userData.accountId || '\u2014');
    setText(el.trialStart, fmtDate(trialStart));
    setText(el.trialEnd, fmtDate(trialEnd));

    /* days math (only meaningful while a trial exists) */
    const remaining = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / DAY_MS)) : 0;
    const totalDays = (trialStart && trialEnd)
      ? Math.max(1, Math.round((trialEnd - trialStart) / DAY_MS))
      : DEFAULT_TRIAL_DAYS;
    const usedDays = Math.min(totalDays, Math.max(0, totalDays - remaining));

    /* badge (status card may not exist on the page) */
    if(statusBadge){
      statusBadge.classList.remove('badge-online', 'badge-waiting', 'badge-closed');
      if(state === 'trial'){
        statusBadge.classList.add('badge-online');
        statusBadge.innerHTML = '<span class="dot"></span>Free Trial Active';
      }else if(state === 'pending'){
        statusBadge.classList.add('badge-waiting');
        statusBadge.innerHTML = '<span class="dot"></span>Payment Under Review';
      }else if(state === 'active'){
        statusBadge.classList.add('badge-online');
        statusBadge.innerHTML = '<span class="dot"></span>Subscription Active';
      }else{
        statusBadge.classList.add('badge-closed');
        statusBadge.innerHTML = '<span class="dot"></span>Trial Expired \u2014 Payment Required';
      }
    }

    /* trial progress bar: only while the trial is running */
    if(el.trialBlock) el.trialBlock.hidden = state !== 'trial';
    if(state === 'trial'){
      setText(el.trialTitle, totalDays + '-Day Free Trial');
      setText(el.trialText, plural(usedDays, 'Day') + ' Used \u00B7 ' + plural(remaining, 'Day') + ' Remaining');
      let pct = 0;
      if(trialStart && trialEnd && trialEnd > trialStart){
        pct = Math.min(100, Math.max(0, ((now - trialStart) / (trialEnd - trialStart)) * 100));
      }else{
        pct = (usedDays / totalDays) * 100;
      }
      if(el.trialFill){
        el.trialFill.dataset.barTarget = String(Math.round(pct));
        el.trialFill.style.width = pct + '%';
      }
    }

    /* days remaining / engine access */
    if(state === 'trial'){
      setText(el.daysRemaining, plural(remaining, 'Day'));
    }else if(state === 'active'){
      const expiresAt = toDate(userData.subscriptionExpiresAt);
      setText(el.daysRemaining, expiresAt ? 'Until ' + fmtDate(expiresAt) : '\u2014');
    }else{
      setText(el.daysRemaining, '0 Days');
    }

    if(el.engineAccess){
      el.engineAccess.classList.remove('engine-stat-good');
      if(state === 'trial'){
        el.engineAccess.textContent = 'Unlocked (Trial)';
        el.engineAccess.classList.add('engine-stat-good');
      }else if(state === 'active'){
        el.engineAccess.textContent = 'Unlocked';
        el.engineAccess.classList.add('engine-stat-good');
      }else if(state === 'pending'){
        el.engineAccess.textContent = 'Locked (Pending Review)';
      }else{
        el.engineAccess.textContent = 'Locked';
      }
    }

    /* "Subscribe Now" jump button: hide once there's nothing to subscribe to */
    if(el.subscribeBtn) el.subscribeBtn.hidden = (state === 'active' || state === 'pending');

    renderPaymentControls(state);
  }

  /* ---- render: payment card controls + note ---- */
  function renderPaymentControls(state){
    if(el.paidBtn){
      el.paidBtn.disabled = hasUnreviewedReceipt();
    }
    if(!el.paymentNote) return;

    const latest = receipts[0];
    if(hasUnreviewedReceipt()){
      el.paymentNote.textContent = 'Your payment has been submitted and is waiting for review. You don\u2019t need to submit it again.';
    }else if(latest && latest.status === 'rejected' && state !== 'active'){
      el.paymentNote.textContent = 'We couldn\u2019t verify your last payment submission. Please check that you entered your Account ID correctly at checkout, then try again or contact support.';
    }else if(receiptsError){
      el.paymentNote.textContent = 'We couldn\u2019t load your payment submissions right now. Please refresh the page.';
    }else{
      el.paymentNote.textContent = DEFAULT_PAYMENT_NOTE;
    }
  }

  /* ---- render: submissions table ---- */
  function statusBadgeHtml(status){
    if(status === 'approved') return '<span class="badge-pill badge-online"><span class="dot"></span>Approved</span>';
    if(status === 'rejected') return '<span class="badge-pill badge-closed"><span class="dot"></span>Not Verified</span>';
    return '<span class="badge-pill badge-waiting"><span class="dot"></span>Under Review</span>';
  }

  function renderHistory(){
    if(!el.historyBody) return;
    if(receipts.length === 0){
      el.historyBody.innerHTML = '<tr><td colspan="2" class="wallet-empty-row">No payments submitted yet.</td></tr>';
      return;
    }
    el.historyBody.innerHTML = receipts.map(r => (
      '<tr>' +
        '<td class="mono-cell" data-label="Date">' + fmtDateTime(toDate(r.createdAt)) + '</td>' +
        '<td data-label="Status">' + statusBadgeHtml(r.status) + '</td>' +
      '</tr>'
    )).join('');
  }

  function renderAll(){
    renderStatus();
    renderHistory();
  }

  /* ---- copy Account ID ---- */
  if(el.copyBtn){
    el.copyBtn.addEventListener('click', () => {
      const text = (el.payAccountId && el.payAccountId.textContent || '').trim();
      if(!text || text === '\u2014') return;

      const done = () => {
        const original = el.copyBtn.textContent;
        el.copyBtn.textContent = 'Copied!';
        setTimeout(() => { el.copyBtn.textContent = original; }, 1800);
      };

      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(done).catch(() => {});
      }else{
        const tmp = document.createElement('textarea');
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        try{ document.execCommand('copy'); done(); }catch(e){ /* nothing else to try */ }
        document.body.removeChild(tmp);
      }
    });
  }

  /* ---- "I've Made My Payment" ----
     Writes ONE small document (just a server timestamp). That is the only
     thing the browser is allowed to write here; approval is done by the
     XeroAI team in the Firebase Console. */
  if(el.paidBtn){
    el.paidBtn.addEventListener('click', () => {
      if(!uid || el.paidBtn.disabled) return;

      const sure = window.confirm('Only continue if you have already completed your payment on Packet Africa.\n\nSubmit your payment for review?');
      if(!sure) return;

      el.paidBtn.disabled = true;
      window.xeroaiDb.collection('users').doc(uid).collection('receipts').add({
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        window.xeroaiLogActivity(uid, 'Payment submitted for review.', 'info');
        // The live listener below refreshes the page state on its own.
      }).catch(() => {
        el.paidBtn.disabled = false;
        if(el.paymentNote){
          el.paymentNote.textContent = 'We couldn\u2019t record your payment right now. Please check your connection and try again.';
        }
      });
    });
  }

  /* ---- load real data, live ---- */
  window.xeroaiAuth.onAuthStateChanged((user) => {
    if(!user) return;            // require-onboarded.js redirects signed-out visitors
    uid = user.uid;

    const userRef = window.xeroaiDb.collection('users').doc(uid);

    userRef.onSnapshot((doc) => {
      userData = doc.exists ? doc.data({ serverTimestamps: 'estimate' }) : {};
      renderAll();
    }, () => {
      setText(el.engineAccess, 'Unavailable');
    });

    userRef.collection('receipts')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .onSnapshot((snapshot) => {
        receiptsError = false;
        receipts = snapshot.docs.map(d => d.data({ serverTimestamps: 'estimate' }));
        renderAll();
      }, () => {
        receiptsError = true;
        receipts = [];
        renderAll();
      });
  });

})();
