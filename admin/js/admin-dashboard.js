(function(){
  'use strict';

  const ADMIN_EMAILS = new Set(['ezemariaezemaria77@gmail.com','xeranraptor@gmail.com','iamnnenna1@gmail.com','ezechiemeriejohn@gmail.com']);
  const auth = window.xeroaiAuth;
  const db = window.xeroaiDb;
  const $ = id => document.getElementById(id);
  let allUsers = [];
  let allPayments = [];
  let currentUser = null;
  let adminEmail = '';

  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dateValue = value => value && typeof value.toDate === 'function' ? value.toDate() : (value ? new Date(value) : null);
  const formatDate = value => { const d=dateValue(value); return d && !isNaN(d) ? d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '—'; };
  const formatDateTime = value => { const d=dateValue(value); return d && !isNaN(d) ? d.toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'; };
  const statusOf = u => String(u.subscriptionStatus || '').toLowerCase();
  const isActive = u => statusOf(u) === 'active' && (!u.subscriptionExpiresAt || (dateValue(u.subscriptionExpiresAt) || new Date(0)) > new Date());
  const isTrial = u => { const d=dateValue(u.trialEndDate); return !isActive(u) && !!d && d > new Date(); };
  const displayStatus = u => isActive(u) ? ['active','Active'] : isTrial(u) ? ['trial','Trial'] : ['inactive', u.subscriptionStatus ? String(u.subscriptionStatus) : 'Inactive'];
  const sortNewest = (a,b) => (dateValue(b.createdAt)?.getTime()||0) - (dateValue(a.createdAt)?.getTime()||0);

  function showNotice(message, target='notice', kind=''){ const n=$(target); if(!n)return; n.textContent=message; n.className='notice'+(kind?' '+kind:''); n.hidden=false; setTimeout(()=>{ if(n.textContent===message)n.hidden=true; },6000); }
  function setText(id,v){ if($(id))$(id).textContent=String(v ?? '—'); }

  function renderUsers(list){
    const tbody=$('usersTable');
    if(!list.length){ tbody.innerHTML='<tr><td colspan="6" class="empty">No users found.</td></tr>'; return; }
    tbody.innerHTML=list.slice(0,200).map(u=>{
      const [cls,label]=displayStatus(u);
      return `<tr class="clickable-row" data-user-id="${esc(u.id)}"><td><div class="user-name">${esc(u.fullName || 'Unnamed user')}</div><div class="user-email">${esc(u.email || 'No email stored')}</div></td><td class="mono">${esc(u.accountId || '—')}</td><td><span class="status ${cls}">${esc(label)}</span></td><td>${isTrial(u) ? formatDate(u.trialEndDate) : (u.subscriptionExpiresAt ? formatDate(u.subscriptionExpiresAt) : '—')}</td><td>${formatDate(u.createdAt)}</td><td><button class="row-action" data-open-user="${esc(u.id)}">View</button></td></tr>`;
    }).join('');
    tbody.querySelectorAll('[data-open-user]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openUser(e.currentTarget.dataset.openUser);}));
    tbody.querySelectorAll('.clickable-row').forEach(row=>row.addEventListener('click',()=>openUser(row.dataset.userId)));
  }

  function renderPayments(list){
    const el=$('paymentsList');
    const pending=list.filter(p=>!p.status);
    setText('paymentCount', `${pending.length} pending`);
    if(!list.length){el.innerHTML='<div class="empty">No payment confirmations found.</div>';return;}
    el.innerHTML=list.slice(0,12).map(p=>{
      const status=p.status==='approved'?'approved':p.status==='rejected'?'rejected':'pending';
      const label=status==='approved'?'Approved':status==='rejected'?'Rejected':'Pending review';
      return `<div class="payment-item"><div><div class="payment-title">${esc(p.userName || p.userEmail || p.userId)}</div><div class="payment-meta">${esc(p.userEmail||'')} · ${esc(formatDateTime(p.createdAt))}</div></div><div class="payment-actions"><span class="status ${status}">${label}</span><button class="row-action" data-payment-user="${esc(p.userId)}">Review</button></div></div>`;
    }).join('');
    el.querySelectorAll('[data-payment-user]').forEach(btn=>btn.addEventListener('click',()=>openUser(btn.dataset.paymentUser)));
  }

  function renderStats(){
    const total=allUsers.length, active=allUsers.filter(isActive).length, trial=allUsers.filter(isTrial).length, inactive=Math.max(0,total-active-trial), pending=allPayments.filter(p=>!p.status).length;
    setText('totalUsers',total); setText('activeSubscriptions',active); setText('trialUsers',trial); setText('pendingPayments',pending);
    const pct=n=>total?Math.round(n/total*100):0;
    const a=pct(active),t=pct(trial),i=pct(inactive);
    setText('barActive',a+'%');setText('barTrial',t+'%');setText('barInactive',i+'%');
    $('barActiveFill').style.width=a+'%';$('barTrialFill').style.width=t+'%';$('barInactiveFill').style.width=i+'%';
  }

  async function loadPayments(){
    try{
      const snap=await db.collectionGroup('receipts').get();
      const usersById=new Map(allUsers.map(u=>[u.id,u]));
      allPayments=snap.docs.map(d=>({id:d.id,userId:d.ref.parent.parent.id,...d.data()})).sort((a,b)=>(dateValue(b.createdAt)?.getTime()||0)-(dateValue(a.createdAt)?.getTime()||0));
      allPayments.forEach(p=>{const u=usersById.get(p.userId);if(u){p.userName=u.fullName;p.userEmail=u.email;}});
      renderPayments(allPayments);renderStats();
    }catch(error){console.error(error);allPayments=[];renderPayments([]);showNotice('Users loaded, but payment records could not be read. Deploy the included admin Firestore rules.');}
  }

  async function loadData(){
    $('refreshBtn').disabled=true;
    try{
      const snap=await db.collection('users').get();
      allUsers=snap.docs.map(d=>({id:d.id,...d.data()})).sort(sortNewest);
      renderUsers(allUsers);renderStats();
      await loadPayments();
      await loadAdminActivity();
    }catch(error){
      console.error(error);showNotice('The dashboard could not read the admin data. Deploy the included Firestore rules and confirm the signed-in email is authorized.');
      $('usersTable').innerHTML='<tr><td colspan="6" class="empty">Unable to load users.</td></tr>';
    }finally{$('refreshBtn').disabled=false;}
  }

  async function loadAdminActivity(){
    try{
      const snap=await db.collection('admin_audit').orderBy('createdAt','desc').limit(12).get();
      const el=$('adminActivityList');
      if(snap.empty){el.innerHTML='<div class="empty">No admin actions recorded yet.</div>';return;}
      el.innerHTML=snap.docs.map(d=>{const x=d.data();return `<div class="payment-item"><div><div class="payment-title">${esc(x.action||'Admin action')}</div><div class="payment-meta">${esc(x.targetEmail||x.targetUserId||'')} · ${esc(formatDateTime(x.createdAt))}</div></div><span class="status approved">Admin</span></div>`;}).join('');
    }catch(e){ /* optional panel; don't block dashboard */ }
  }

  async function audit(action,user){
    try{await db.collection('admin_audit').add({action,targetUserId:user?.id||'',targetEmail:user?.email||'',adminEmail,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){console.warn('Audit write failed',e);}
  }

  function fillUserModal(user){
    currentUser=user;
    setText('modalTitle',user.fullName||'Unnamed user');
    setText('modalSubtitle',user.email||'No email stored');
    setText('detailAccountId',user.accountId||'—');
    setText('detailCountry',user.country||'—');
    setText('detailStatus',displayStatus(user)[1]);
    setText('detailExpiry',formatDate(user.subscriptionExpiresAt));
    setText('detailTrialEnd',formatDate(user.trialEndDate));
    setText('detailJoined',formatDate(user.createdAt));
  }

  async function openUser(userId){
    const user=allUsers.find(u=>u.id===userId);if(!user)return;
    fillUserModal(user);$('userModal').hidden=false;document.body.classList.add('modal-open');
    $('detailPayments').innerHTML='<div class="empty">Loading…</div>';$('detailActivity').innerHTML='<div class="empty">Loading…</div>';
    const userPayments=allPayments.filter(p=>p.userId===user.id).sort((a,b)=>(dateValue(b.createdAt)?.getTime()||0)-(dateValue(a.createdAt)?.getTime()||0));
    renderUserPayments(userPayments);
    try{
      const snap=await db.collection('users').doc(user.id).collection('activity').orderBy('createdAt','desc').limit(10).get();
      const el=$('detailActivity');
      if(snap.empty){el.innerHTML='<div class="empty">No activity recorded.</div>';return;}
      el.innerHTML=snap.docs.map(d=>{const x=d.data();return `<div class="detail-item"><div>${esc(x.message||'Activity')}</div><small>${esc(formatDateTime(x.createdAt))}</small></div>`;}).join('');
    }catch(e){$('detailActivity').innerHTML='<div class="empty">Activity could not be loaded.</div>';}
  }

  function renderUserPayments(list){
    const el=$('detailPayments');
    const pending=list.find(p=>!p.status);
    setText('detailPaymentState',pending?'Payment pending review':list.length?'Submission history':'No submissions');
    if(!list.length){el.innerHTML='<div class="empty">No payment submissions.</div>';return;}
    el.innerHTML=list.map(p=>{
      const status=p.status==='approved'?'Approved':p.status==='rejected'?'Rejected':'Pending review';
      const cls=p.status==='approved'?'approved':p.status==='rejected'?'rejected':'pending';
      return `<div class="detail-item payment-detail"><div><strong>${status}</strong><small>${esc(formatDateTime(p.createdAt))}</small></div><div class="payment-actions">${!p.status?`<button class="primary-btn small" data-approve="${esc(p.id)}">Approve</button><button class="danger-btn small" data-reject="${esc(p.id)}">Reject</button>`:`<span class="status ${cls}">${status}</span>`}</div></div>`;
    }).join('');
    el.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>approvePayment(b.dataset.approve)));
    el.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>rejectPayment(b.dataset.reject)));
  }

  async function approvePayment(receiptId){
    if(!currentUser)return;
    const days=Number($('subscriptionDuration').value)||30;
    const now=new Date();const expiry=new Date(now.getTime()+days*86400000);
    const batch=db.batch();
    batch.update(db.collection('users').doc(currentUser.id),{subscriptionStatus:'active',subscriptionExpiresAt:firebase.firestore.Timestamp.fromDate(expiry)});
    batch.update(db.collection('users').doc(currentUser.id).collection('receipts').doc(receiptId),{status:'approved',reviewedAt:firebase.firestore.FieldValue.serverTimestamp(),reviewedBy:adminEmail});
    try{
      await batch.commit();await audit('Payment approved',currentUser);showNotice('Payment approved and subscription activated.', 'userNotice','success');
      await loadData();const fresh=allUsers.find(u=>u.id===currentUser.id);if(fresh)await openUser(fresh.id);
    }catch(e){console.error(e);showNotice('Approval failed. Check the deployed Firestore rules.','userNotice');}
  }

  async function rejectPayment(receiptId){
    if(!currentUser)return;
    if(!confirm('Reject this payment submission?'))return;
    try{
      await db.collection('users').doc(currentUser.id).collection('receipts').doc(receiptId).update({status:'rejected',reviewedAt:firebase.firestore.FieldValue.serverTimestamp(),reviewedBy:adminEmail});
      await audit('Payment rejected',currentUser);showNotice('Payment marked as rejected.','userNotice','success');await loadData();await openUser(currentUser.id);
    }catch(e){console.error(e);showNotice('Could not reject the payment. Check the deployed Firestore rules.','userNotice');}
  }

  async function activateSubscription(){
    if(!currentUser)return;const days=Number($('subscriptionDuration').value)||30;const base=isActive(currentUser)&&dateValue(currentUser.subscriptionExpiresAt)>new Date()?dateValue(currentUser.subscriptionExpiresAt):new Date();const expiry=new Date(base.getTime()+days*86400000);
    try{await db.collection('users').doc(currentUser.id).update({subscriptionStatus:'active',subscriptionExpiresAt:firebase.firestore.Timestamp.fromDate(expiry)});await audit(`Subscription activated for ${days} days`,currentUser);showNotice('Subscription activated.','userNotice','success');await loadData();await openUser(currentUser.id);}catch(e){console.error(e);showNotice('Could not update the subscription. Check Firestore rules.','userNotice');}
  }

  async function deactivateSubscription(){
    if(!currentUser)return;if(!confirm('Deactivate this subscription?'))return;
    try{await db.collection('users').doc(currentUser.id).update({subscriptionStatus:'inactive',subscriptionExpiresAt:null});await audit('Subscription deactivated',currentUser);showNotice('Subscription deactivated.','userNotice','success');await loadData();await openUser(currentUser.id);}catch(e){console.error(e);showNotice('Could not deactivate the subscription.','userNotice');}
  }

  async function setTrial(){
    if(!currentUser)return;const days=Number($('trialDuration').value)||3;const end=new Date(Date.now()+days*86400000);
    try{await db.collection('users').doc(currentUser.id).update({trialStartDate:firebase.firestore.FieldValue.serverTimestamp(),trialEndDate:firebase.firestore.Timestamp.fromDate(end),subscriptionStatus:'trial'});await audit(`Trial set for ${days} days`,currentUser);showNotice('Trial period updated.','userNotice','success');await loadData();await openUser(currentUser.id);}catch(e){console.error(e);showNotice('Could not update the trial.','userNotice');}
  }

  auth.onAuthStateChanged(async user=>{
    if(!user){location.href='login.html';return;}
    adminEmail=String(user.email||'').toLowerCase();
    if(!ADMIN_EMAILS.has(adminEmail)||!user.emailVerified){await auth.signOut();location.href='login.html';return;}
    setText('adminEmail',adminEmail);setText('adminAvatar',adminEmail.charAt(0).toUpperCase());await loadData();
  });

  $('logoutBtn').addEventListener('click',()=>auth.signOut().then(()=>location.href='login.html'));
  $('refreshBtn').addEventListener('click',loadData);
  $('userSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();renderUsers(!q?allUsers:allUsers.filter(u=>[u.fullName,u.email,u.accountId,u.country,u.subscriptionStatus].some(v=>String(v||'').toLowerCase().includes(q))));});
  $('mobileMenu').addEventListener('click',()=> $('sidebar').classList.toggle('open'));
  $('closeUserModal').addEventListener('click',()=>{ $('userModal').hidden=true;document.body.classList.remove('modal-open');currentUser=null; });
  $('userModal').addEventListener('click',e=>{if(e.target===$('userModal')){$('userModal').hidden=true;document.body.classList.remove('modal-open');currentUser=null;}});
  $('activateBtn').addEventListener('click',activateSubscription);
  $('deactivateBtn').addEventListener('click',deactivateSubscription);
  $('trialBtn').addEventListener('click',setTrial);
})();
