/* ============================================================
   XeroAI — Subscription page (js/subscription.js)
   Everything here is a client-side demo standing in for a real
   backend. No live payments, no real Telegram delivery, no real
   auth. Keys below are what dashboard.js reads on Trading to
   decide whether the AI Engine toggle is unlocked.
   ============================================================ */
(function(){

  const LS_STATUS = 'xeroaiSubscriptionStatus';       // 'trial' | 'pending' | 'active' | 'expired'
  const LS_ACCOUNT_ID = 'xeroaiAccountId';
  const LS_SUBMISSIONS = 'xeroaiSubmissions';          // JSON array

  /* ---- account id: generate once, persist ---- */
  function getAccountId(){
    let id = localStorage.getItem(LS_ACCOUNT_ID);
    if(!id){
      id = 'XA-' + Math.floor(10000 + Math.random() * 90000);
      localStorage.setItem(LS_ACCOUNT_ID, id);
    }
    return id;
  }

  function getStatus(){
    return localStorage.getItem(LS_STATUS) || 'trial';
  }

  function setStatus(status){
    localStorage.setItem(LS_STATUS, status);
  }

  function getSubmissions(){
    try{
      return JSON.parse(localStorage.getItem(LS_SUBMISSIONS) || '[]');
    }catch(e){
      return [];
    }
  }

  function saveSubmissions(list){
    localStorage.setItem(LS_SUBMISSIONS, JSON.stringify(list));
  }

  /* ---- only run the rest on subscription.html ---- */
  const statusBadge = document.getElementById('subStatusBadge');
  if(!statusBadge) return;

  const accountId = getAccountId();
  const accountIdEl = document.getElementById('subAccountId');
  const receiptAccountIdEl = document.getElementById('receiptAccountId');
  if(accountIdEl) accountIdEl.textContent = accountId;
  if(receiptAccountIdEl) receiptAccountIdEl.value = accountId;

  const engineAccessEl = document.getElementById('subEngineAccess');
  const trialProgressBlock = document.getElementById('trialProgressBlock');
  const goToReceiptBtn = document.getElementById('goToReceiptBtn');

  function renderStatus(){
    const status = getStatus();

    statusBadge.classList.remove('badge-online', 'badge-waiting', 'badge-closed');
    if(status === 'trial'){
      statusBadge.classList.add('badge-online');
      statusBadge.innerHTML = '<span class="dot"></span>Free Trial Active';
      if(trialProgressBlock) trialProgressBlock.hidden = false;
      if(engineAccessEl){ engineAccessEl.textContent = 'Unlocked (Trial)'; engineAccessEl.classList.add('engine-stat-good'); }
      if(goToReceiptBtn) goToReceiptBtn.textContent = 'Submit Payment Receipt';
    } else if(status === 'pending'){
      statusBadge.classList.add('badge-waiting');
      statusBadge.innerHTML = '<span class="dot"></span>Payment Under Review';
      if(trialProgressBlock) trialProgressBlock.hidden = true;
      if(engineAccessEl){ engineAccessEl.textContent = 'Locked (Pending Review)'; engineAccessEl.classList.remove('engine-stat-good'); }
    } else if(status === 'active'){
      statusBadge.classList.add('badge-online');
      statusBadge.innerHTML = '<span class="dot"></span>Subscription Active';
      if(trialProgressBlock) trialProgressBlock.hidden = true;
      if(engineAccessEl){ engineAccessEl.textContent = 'Unlocked'; engineAccessEl.classList.add('engine-stat-good'); }
    } else {
      statusBadge.classList.add('badge-closed');
      statusBadge.innerHTML = '<span class="dot"></span>Trial Expired — Payment Required';
      if(trialProgressBlock) trialProgressBlock.hidden = true;
      if(engineAccessEl){ engineAccessEl.textContent = 'Locked'; engineAccessEl.classList.remove('engine-stat-good'); }
    }
  }

  /* ---- submission history table ---- */
  const historyBody = document.getElementById('submissionHistoryBody');

  function statusBadgeHtml(status){
    if(status === 'approved') return '<span class="badge-pill badge-online"><span class="dot"></span>Approved</span>';
    if(status === 'rejected') return '<span class="badge-pill badge-closed"><span class="dot"></span>Rejected</span>';
    return '<span class="badge-pill badge-waiting"><span class="dot"></span>Pending Review</span>';
  }

  function renderHistory(){
    if(!historyBody) return;
    const submissions = getSubmissions();
    if(submissions.length === 0){
      historyBody.innerHTML = '<tr><td colspan="4" class="wallet-empty-row">No receipts submitted yet.</td></tr>';
      return;
    }
    historyBody.innerHTML = submissions.slice().reverse().map(s => `
      <tr>
        <td class="mono-cell" data-label="Date">${s.date}</td>
        <td data-label="Reference">${s.reference}</td>
        <td data-label="File">${s.fileName || 'No file attached'}</td>
        <td data-label="Status">${statusBadgeHtml(s.status)}</td>
      </tr>
    `).join('');
  }

  /* ---- copy Opay account number ---- */
  const copyBtn = document.getElementById('copyOpayBtn');
  const opayNumberEl = document.getElementById('opayAccountNumber');
  if(copyBtn && opayNumberEl){
    copyBtn.addEventListener('click', () => {
      const text = opayNumberEl.textContent.trim();
      navigator.clipboard?.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = original; }, 1800);
      }).catch(() => {});
    });
  }

  /* ---- receipt file input ---- */
  const dropzone = document.getElementById('receiptDropzone');
  const fileInput = document.getElementById('receiptFile');
  const fileLabel = document.getElementById('receiptFileLabel');
  let chosenFileName = '';

  if(dropzone && fileInput){
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if(fileInput.files && fileInput.files[0]){
        chosenFileName = fileInput.files[0].name;
        fileLabel.textContent = chosenFileName;
      }
    });
  }

  /* ---- receipt form submit ---- */
  const receiptForm = document.getElementById('receiptForm');
  const receiptFormNote = document.getElementById('receiptFormNote');

  if(receiptForm){
    receiptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const reference = document.getElementById('receiptReference').value.trim();
      if(!reference){
        receiptFormNote.textContent = 'Please enter your transaction reference before submitting.';
        return;
      }

      const submissions = getSubmissions();
      submissions.push({
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        reference,
        fileName: chosenFileName,
        status: 'pending'
      });
      saveSubmissions(submissions);
      setStatus('pending');

      renderHistory();
      renderStatus();

      receiptForm.reset();
      if(receiptAccountIdEl) receiptAccountIdEl.value = accountId;
      chosenFileName = '';
      if(fileLabel) fileLabel.textContent = 'Click to choose a file, or drag it here';

      receiptFormNote.textContent = 'Receipt submitted — this is a demo, so no Telegram message was actually sent. In production, the XeroAI team is notified instantly and reviews it from there.';
    });
  }

  /* ---- demo controls ---- */
  const demoApproveBtn = document.getElementById('demoApproveBtn');
  const demoRejectBtn = document.getElementById('demoRejectBtn');
  const demoResetBtn = document.getElementById('demoResetBtn');

  function updateLatestSubmission(newStatus){
    const submissions = getSubmissions();
    if(submissions.length === 0) return false;
    submissions[submissions.length - 1].status = newStatus;
    saveSubmissions(submissions);
    return true;
  }

  if(demoApproveBtn){
    demoApproveBtn.addEventListener('click', () => {
      const updated = updateLatestSubmission('approved');
      setStatus('active');
      renderHistory();
      renderStatus();
      if(!updated) receiptFormNote && (receiptFormNote.textContent = 'No submitted receipt to approve yet — submit one first, or this just activates your subscription directly for testing.');
    });
  }
  if(demoRejectBtn){
    demoRejectBtn.addEventListener('click', () => {
      const updated = updateLatestSubmission('rejected');
      setStatus('expired');
      renderHistory();
      renderStatus();
      if(!updated) receiptFormNote && (receiptFormNote.textContent = 'No submitted receipt to reject yet.');
    });
  }
  if(demoResetBtn){
    demoResetBtn.addEventListener('click', () => {
      setStatus('trial');
      renderStatus();
    });
  }

  renderStatus();
  renderHistory();

})();
