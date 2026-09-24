/* ============ FIREBASE INITIALIZATION (shared across pages) ============ */
/* Uses the Firebase compat SDK so it works with plain <script> tags —
   no bundler/module system needed for this static site. */

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

// Analytics only works over https (not file:// or during local testing),
// so guard it to avoid a console error breaking anything else.
try {
  if (firebase.analytics) firebase.analytics();
} catch (err) {
  /* analytics unavailable in this environment — non-critical */
}

// Shared instances other scripts (auth.js) read from.
window.xeroaiAuth = firebase.auth();
window.xeroaiDb = firebase.firestore();

// Writes one entry to users/{uid}/activity — the real event log that
// powers the "Recent Notifications" panel. type controls the color dot:
// 'success' (green), 'info' (blue, default), or 'warning' (gold).
window.xeroaiLogActivity = function (uid, message, type) {
  if (!uid || !message) return Promise.resolve();
  return window.xeroaiDb.collection('users').doc(uid).collection('activity').add({
    message: message,
    type: type || 'info',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function () {
    // Logging failures should never break the user-facing action that
    // triggered them.
  });
};
