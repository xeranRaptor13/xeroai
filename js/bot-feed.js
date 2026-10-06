/* XeroAI — live bot feed: Firestore -> dashboard cards.
   Reads (all written by the Python bot via firebase_sync.py):
     bot_signals            -> Live AI Signals card
     bot_daily (last 7)     -> AI Confidence Trend + AI Decision Breakdown
     bot_status/current     -> LIVE / OFFLINE pill
   Load AFTER js/firebase-init.js and js/dashboard.js. */
(function () {
  if (!window.xeroaiDb || !window.xeroaiAuth || !window.XeroAISignals) return;
  var db = window.xeroaiDb, started = false;
  var STALE_MS = 90000;   // no heartbeat change for 90s => OFFLINE

  function startFeeds() {
    if (started) return; started = true;

    /* ---- Live AI Signals: newest signal per symbol, top 3 ---- */
    db.collection('bot_signals').orderBy('createdAt', 'desc').limit(12).onSnapshot(function (snap) {
      var seen = {}, list = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        if (!d.symbol || seen[d.symbol] || !d.createdAt) return;
        seen[d.symbol] = true;
        var buy = d.direction !== 'SELL';
        list.push({
          symbol: d.symbol, name: d.name || '', assetType: d.assetType || 'synthetic',
          direction: buy ? 'LONG' : 'SHORT', action: buy ? 'BUY' : 'SELL',
          confidence: typeof d.confidence === 'number' ? d.confidence : 0,
          timeframe: d.timeframe || '', timestamp: d.createdAt
        });
      });
      XeroAISignals.update(list.slice(0, 3));
    }, function () { XeroAISignals.update([]); });

    /* ---- Trend + Decision rings from the last 7 daily docs ---- */
    db.collection('bot_daily').orderBy('date', 'desc').limit(7)
      .onSnapshot(function (snap) {
        var days = [];
        snap.forEach(function (doc) { days.push({ id: doc.id, d: doc.data() }); });
        days.reverse();   // oldest -> newest
        var trend = [], buy = 0, sell = 0, hold = 0;
        days.forEach(function (x) {
          var d = x.d;
          buy += d.buy || 0; sell += d.sell || 0; hold += d.hold || 0;
          if (d.fireCount > 0) {
            trend.push({
              label: new Date(x.id + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
              value: Math.round((d.confSum / d.fireCount) * 10) / 10
            });
          }
        });
        if (window.XeroAITrend) XeroAITrend.update(trend);
        if (window.XeroAIDecisions) XeroAIDecisions.update({ buy: buy, sell: sell, hold: hold });
      }, function (e) { console.warn('bot_daily feed error:', e && e.code, e && e.message); });

    /* ---- LIVE / OFFLINE from the bot heartbeat ---- */
    var online = false, lastSeen = 0, lastHb = null, first = true;
    function evalStatus() { XeroAISignals.setStatus(online && Date.now() - lastSeen < STALE_MS ? 'live' : 'offline'); }
    db.doc('bot_status/current').onSnapshot(function (snap) {
      var d = snap.exists ? snap.data() : null;
      online = !!(d && d.online);
      var hb = d && d.lastHeartbeat && d.lastHeartbeat.toMillis ? d.lastHeartbeat.toMillis() : null;
      if (hb !== null && hb !== lastHb) {
        // first snapshot: trust only a recent heartbeat; later: any new heartbeat means the bot is alive
        lastSeen = (!first || Math.abs(Date.now() - hb) < 120000) ? Date.now() : 0;
        lastHb = hb;
      }
      first = false; evalStatus();
    }, function () { online = false; evalStatus(); });
    setInterval(evalStatus, 15000);
  }

  window.xeroaiAuth.onAuthStateChanged(function (user) { if (user) startFeeds(); });
})();
