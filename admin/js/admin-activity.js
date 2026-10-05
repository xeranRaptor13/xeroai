(function(){
  'use strict';
  const ADMINS=['ezemariaezemaria77@gmail.com','xeranraptor@gmail.com','iamnnenna1@gmail.com','ezechiemeriejohn@gmail.com'];
  const auth=window.xeroaiAuth, db=window.xeroaiDb;
  const $=id=>document.getElementById(id);
  let users=[], selectedUid=null, unsubscribe=null;

  function isAdmin(user){return !!user && !!user.email && user.emailVerified && ADMINS.includes(user.email.toLowerCase());}
  function dt(v){
    if(!v)return null;
    if(v.toDate)return v.toDate();
    const d=new Date(v); return isNaN(d)?null:d;
  }
  function state(u){
    const s=String(u.subscriptionStatus||'').toLowerCase(), now=new Date(), exp=dt(u.subscriptionExpiresAt), trial=dt(u.trialEndDate);
    if(s==='active'&&exp&&exp>=now)return'active';
    if(s==='trial'||(!s&&trial&&trial>=now)||(s==='active'&&!exp&&trial&&trial>=now))return'trial';
    if((exp&&exp<now)||s==='expired')return'expired';
    return'inactive';
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function time(v){const d=dt(v);if(!d)return'Unknown time';return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}
  function relative(v){const d=dt(v);if(!d)return'Unknown';const sec=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));if(sec<60)return sec+'s ago';if(sec<3600)return Math.floor(sec/60)+'m ago';if(sec<86400)return Math.floor(sec/3600)+'h ago';if(sec<604800)return Math.floor(sec/86400)+'d ago';return time(v)}

  auth.onAuthStateChanged(async user=>{
    if(!isAdmin(user)){ location.href='login.html'; return; }
    $('adminEmail').textContent=user.email;
    await loadUsers();
  });

  async function loadUsers(){
    $('userList').innerHTML='<div class="loading-row">Loading users…</div>';
    try{
      const snap=await db.collection('users').get();
      users=snap.docs.map(d=>({id:d.id,...d.data()}));
      users.sort((a,b)=>String(a.fullName||a.email||'').localeCompare(String(b.fullName||b.email||'')));
      renderUsers();
      if(selectedUid){const found=users.find(u=>u.id===selectedUid); if(found) selectUser(found);}
    }catch(err){
      console.error(err);
      $('userList').innerHTML='<div class="no-results">Unable to load users. Check Firestore access and admin rules.</div>';
    }
  }

  function renderUsers(){
    const q=$('userSearch').value.trim().toLowerCase();
    const filtered=users.filter(u=>[u.fullName,u.email,u.accountId,u.country,u.defaultMarket,u.id].some(v=>String(v||'').toLowerCase().includes(q)));
    $('userCount').textContent=filtered.length+' of '+users.length;
    if(!filtered.length){$('userList').innerHTML='<div class="no-results">No matching users.</div>';return;}
    $('userList').innerHTML=filtered.map(u=>{
      const s=state(u);
      return `<div class="user-row ${u.id===selectedUid?'active':''}" data-uid="${esc(u.id)}">
        <div class="user-primary"><span class="user-name">${esc(u.fullName||'Unnamed user')}</span><span class="user-status ${s}">${s}</span></div>
        <div class="user-email">${esc(u.email||'No email')}</div>
        <div class="user-id">${esc(u.accountId||u.id)}</div>
      </div>`;
    }).join('');
    document.querySelectorAll('.user-row').forEach(row=>row.addEventListener('click',()=>{const u=users.find(x=>x.id===row.dataset.uid);if(u)selectUser(u);}));
  }

  function selectUser(u){
    selectedUid=u.id; renderUsers();
    $('activityTitle').textContent=u.fullName||u.email||'User activity';
    $('activityMeta').textContent=[u.email,u.accountId?'Account '+u.accountId:''].filter(Boolean).join(' · ')||u.id;
    loadActivity(u);
  }

  function loadActivity(u){
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    $('timeline').className='timeline';
    $('timeline').innerHTML='<div class="loading-row">Loading activity…</div>';
    let query=db.collection('users').doc(u.id).collection('activity').orderBy('createdAt','desc').limit(200);
    unsubscribe=query.onSnapshot(snap=>{
      let items=snap.docs.map(d=>({id:d.id,...d.data()}));
      const type=$('typeFilter').value, days=Number($('dateFilter').value||0), cutoff=days?Date.now()-days*86400000:0;
      items=items.filter(x=>{const okType=type==='all'||String(x.type||'info').toLowerCase()===type;const d=dt(x.createdAt);return okType&&(!cutoff||!d||d.getTime()>=cutoff);});
      renderTimeline(items);
    },err=>{
      console.error(err);
      $('timeline').className='timeline empty-state';
      $('timeline').innerHTML='<div class="empty-icon">!</div><h3>Activity could not be loaded</h3><p>Firestore denied the activity read or the activity collection is unavailable.</p>';
    });
  }

  function renderTimeline(items){
    if(!items.length){$('timeline').className='timeline empty-state';$('timeline').innerHTML='<div class="empty-icon">○</div><h3>No matching activity</h3><p>This account has no activity matching the current filters.</p>';return;}
    $('timeline').className='timeline';
    $('timeline').innerHTML=items.map(x=>{
      const type=['success','info','warning','error'].includes(String(x.type||'').toLowerCase())?String(x.type).toLowerCase():'info';
      const icon=type==='success'?'✓':type==='warning'?'!':type==='error'?'×':'i';
      return `<article class="activity-item"><div class="activity-dot ${type}">${icon}</div><div class="activity-card"><div class="activity-top"><div class="activity-message">${esc(x.message||'Activity recorded')}</div><time class="activity-time" title="${esc(time(x.createdAt))}">${esc(relative(x.createdAt))}</time></div><span class="activity-type">${esc(type)}</span></div></article>`;
    }).join('');
  }

  $('userSearch').addEventListener('input',renderUsers);
  $('typeFilter').addEventListener('change',()=>{if(selectedUid){const u=users.find(x=>x.id===selectedUid);if(u)loadActivity(u);}});
  $('dateFilter').addEventListener('change',()=>{if(selectedUid){const u=users.find(x=>x.id===selectedUid);if(u)loadActivity(u);}});
  $('refreshBtn').addEventListener('click',loadUsers);
  $('signOutBtn').addEventListener('click',()=>auth.signOut().then(()=>location.href='login.html'));
})();
