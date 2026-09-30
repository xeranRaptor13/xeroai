/* XeroAI Firebase initialization + session presence tracking */
const firebaseConfig = {
  apiKey: "AIzaSyBUsrN6E-RXsJh-qmXGTPwXuNNZrLnbrks",
  authDomain: "xeroai-b5f4e.firebaseapp.com",
  projectId: "xeroai-b5f4e",
  storageBucket: "xeroai-b5f4e.firebasestorage.app",
  messagingSenderId: "699065921780",
  appId: "1:699065921780:web:a571d42db7f02fe70f6ea1",
  measurementId: "G-PGRFQYE2M4"
};

firebase.initializeApp(firebaseConfig);
try { if (firebase.analytics) firebase.analytics(); } catch (err) {}

window.xeroaiAuth = firebase.auth();
window.xeroaiDb = firebase.firestore();

window.xeroaiLogActivity = function(uid, message, type) {
  if (!uid || !message) return Promise.resolve();
  return window.xeroaiDb.collection('users').doc(uid).collection('activity').add({
    message: message,
    type: type || 'info',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(){});
};

(function(){
  var auth = window.xeroaiAuth, db = window.xeroaiDb;
  var timer = null, activeUid = null, stopped = false;
  var HEARTBEAT_MS = 60000;

  function presenceRef(uid){
    return db.collection('users').doc(uid).collection('presence').doc('current');
  }

  function heartbeat(uid){
    if (!uid || stopped) return;
    presenceRef(uid).set({
      online: true,
      lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true}).catch(function(){});
  }

  function startPresence(user){
    activeUid = user.uid; stopped = false;
    heartbeat(activeUid);
    clearInterval(timer);
    timer = setInterval(function(){ heartbeat(activeUid); }, HEARTBEAT_MS);

    var touch = function(){
      if(activeUid) heartbeat(activeUid);
    };
    document.addEventListener('visibilitychange', touch);
    window.addEventListener('focus', touch);
    window.addEventListener('pageshow', touch);

    window.__xeroaiStopPresence = function(){
      stopped = true;
      clearInterval(timer);
      timer = null;
      if(activeUid){
        presenceRef(activeUid).set({
          online:false,
          lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true}).catch(function(){});
      }
    };
  }

  function attachLogout(){
    var links = document.querySelectorAll('.sidebar-logout, [data-xeroai-logout]');
    links.forEach(function(link){
      if(link.__xeroaiBound) return;
      link.__xeroaiBound = true;
      link.addEventListener('click', function(e){
        e.preventDefault();
        var user = auth.currentUser;
        var href = link.getAttribute('href') || 'login.html';
        if(!user){ window.location.href = href; return; }
        var p = presenceRef(user.uid).set({
          online:false,
          lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        var a = window.xeroaiLogActivity(user.uid,'Signed out.','info');
        Promise.all([p,a]).catch(function(){}).then(function(){
          return auth.signOut();
        }).then(function(){
          window.location.href = href;
        }).catch(function(){
          window.location.href = href;
        });
      });
    });
  }

  auth.onAuthStateChanged(function(user){
    if(user){
      startPresence(user);
      attachLogout();
    } else {
      stopped = true; clearInterval(timer); timer = null; activeUid = null;
    }
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',attachLogout);
  else attachLogout();
})();
