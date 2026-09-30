(function(){
  'use strict';

  var AUTH_EMAILS = [
    'ezemariaezemaria77@gmail.com',
    'xeranraptor@gmail.com'
  ];

  var db = window.xeroaiDb;
  var auth = window.xeroaiAuth;
  var rows = [];
  var filtered = [];

  function isAdmin(user){
    return user && user.emailVerified && AUTH_EMAILS.indexOf(String(user.email || '').toLowerCase()) !== -1;
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function dateValue(v){
    if(!v) return null;
    if(v.toDate) return v.toDate();
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmt(v){
    var d = dateValue(v);
    if(!d) return '—';
    return d.toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  function within(d, filter){
    if(filter === 'all') return true;
    if(!d) return false;
    var now = new Date();
    if(filter === 'today') return d.toDateString() === now.toDateString();
    var days = Number(filter);
    return d.getTime() >= now.getTime() - days * 86400000;
  }

  function render(){
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    var af = document.getElementById('adminFilter').value;
    var xf = document.getElementById('actionFilter').value;
    var tf = document.getElementById('timeFilter').value;

    filtered = rows.filter(function(r){
      var d = dateValue(r.createdAt);
      if(af && r.adminEmail !== af) return false;
      if(xf && r.action !== xf) return false;
      if(!within(d, tf)) return false;
      if(q){
        var hay = [r.action,r.adminEmail,r.targetEmail,r.targetUserId,r.targetName].join(' ').toLowerCase();
        if(hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    document.getElementById('resultCount').textContent = filtered.length + ' event' + (filtered.length === 1 ? '' : 's');

    var body = document.getElementById('auditBody');
    if(!filtered.length){
      body.innerHTML = '<tr><td colspan="6" class="empty">No audit events match the current filters.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map(function(r){
      return '<tr>' +
        '<td>' + esc(fmt(r.createdAt)) + '</td>' +
        '<td class="mono">' + esc(r.adminEmail || '—') + '</td>' +
        '<td><span class="action-badge">' + esc(r.action || 'admin_action') + '</span></td>' +
        '<td>' + esc(r.targetName || r.targetUserId || '—') + '</td>' +
        '<td>' + esc(r.targetEmail || '—') + '</td>' +
        '<td class="mono">' + esc(r.targetUserId || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function populateFilters(){
    var admins = {};
    var actions = {};
    rows.forEach(function(r){
      if(r.adminEmail) admins[r.adminEmail] = true;
      if(r.action) actions[r.action] = true;
    });

    var a = document.getElementById('adminFilter');
    a.innerHTML = '<option value="">All admins</option>' +
      Object.keys(admins).sort().map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>';}).join('');

    var x = document.getElementById('actionFilter');
    x.innerHTML = '<option value="">All actions</option>' +
      Object.keys(actions).sort().map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');
  }

  function updateStats(){
    document.getElementById('totalActions').textContent = rows.length;
    var now = new Date();
    document.getElementById('todayActions').textContent = rows.filter(function(r){
      var d = dateValue(r.createdAt);
      return d && d.toDateString() === now.toDateString();
    }).length;
    document.getElementById('activeAdmins').textContent =
      new Set(rows.filter(function(r){return within(dateValue(r.createdAt),'30');}).map(function(r){return r.adminEmail;}).filter(Boolean)).size;
    var latest = rows.length ? dateValue(rows[0].createdAt) : null;
    document.getElementById('latestAction').textContent = latest ? fmt(latest) : '—';
  }

  async function load(){
    try{
      var snap = await db.collection('admin_audit').orderBy('createdAt','desc').limit(500).get();
      rows = snap.docs.map(function(doc){
        var d = doc.data() || {};
        d.id = doc.id;
        return d;
      });
      populateFilters();
      updateStats();
      render();
    }catch(err){
      console.error(err);
      document.getElementById('auditBody').innerHTML =
        '<tr><td colspan="6" class="empty">Unable to load the audit log. Check the deployed Firestore rules and admin account.</td></tr>';
    }
  }

  function bind(){
    ['searchInput','adminFilter','actionFilter','timeFilter'].forEach(function(id){
      document.getElementById(id).addEventListener('input', render);
      document.getElementById(id).addEventListener('change', render);
    });
    document.getElementById('signOutBtn').addEventListener('click', function(){
      auth.signOut().then(function(){ location.href='login.html'; });
    });
  }

  auth.onAuthStateChanged(function(user){
    if(!isAdmin(user)){
      if(user) auth.signOut();
      location.href='login.html';
      return;
    }
    document.getElementById('adminEmail').textContent = user.email;
    bind();
    load();
  });
})();