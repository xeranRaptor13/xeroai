/* XeroAI — Recent Trade History live feed.
   Reads bot_trades (written by the trading bot via trade_sync.py) and keeps the
   table on trading.html up to date: a trade appears as "Open" the moment the bot
   opens it and flips to "Closed" with its profit/loss when it closes.
   Load AFTER js/firebase-init.js. */
(function () {
  var body = document.getElementById('tradeHistoryBody');
  if (!body || !window.xeroaiDb || !window.xeroaiAuth) return;
  var db = window.xeroaiDb, rows = {}, started = false, LIMIT = 10;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function td(label, cls) {
    var c = document.createElement('td');
    c.setAttribute('data-label', label);
    if (cls) c.className = cls;
    return c;
  }
  function fmtTime(ts) {
    var d = ts && ts.toDate ? ts.toDate() : null;
    if (!d) return '\u2014';
    var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toDateString() === new Date().toDateString()
      ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t;
  }
  function emptyRow(msg) {
    var tr = el('tr', 'th-empty'), c = el('td', '', msg);
    c.colSpan = 6; tr.appendChild(c); return tr;
  }

  function buildRow() {
    var r = { tr: el('tr', 'th-row') };
    r.time = td('Time', 'mono-cell');
    r.platform = td('Platform');
    r.market = td('Market');
    r.action = td('Action');
    r.result = td('Result');
    r.pnl = td('Profit/Loss', 'mono-cell');
    [r.time, r.platform, r.market, r.action, r.result, r.pnl].forEach(function (c) { r.tr.appendChild(c); });
    return r;
  }
  function fill(r, d) {
    r.time.textContent = fmtTime(d.openedAt);
    r.platform.textContent = d.platform || 'Deriv';
    r.market.textContent = d.market || d.symbol || '\u2014';

    var sell = d.direction === 'SELL';
    r.action.textContent = '';
    r.action.appendChild(el('span', 'direction-badge ' + (sell ? 'direction-sell' : 'direction-buy'), sell ? 'SELL' : 'BUY'));

    var open = d.status !== 'closed';
    r.result.textContent = '';
    if (open) {
      var p = el('span', 'badge-pill badge-open'); p.appendChild(el('span', 'dot')); p.appendChild(document.createTextNode('Open'));
      r.result.appendChild(p);
    } else {
      r.result.appendChild(el('span', 'badge-pill badge-closed', 'Closed'));
    }

    var pnl = r.pnl;
    pnl.className = 'mono-cell';
    if (open || typeof d.profit !== 'number') {
      pnl.textContent = '\u2014';
    } else {
      pnl.textContent = (d.profit < 0 ? '-' : '+') + '$' + Math.abs(d.profit).toFixed(2);
      if (d.profit > 0) pnl.classList.add('pnl-positive');
      else if (d.profit < 0) pnl.classList.add('pnl-negative');
    }
    var sig = (d.status || '') + '|' + d.profit;
    if (r.sig !== undefined && r.sig !== sig) {          // changed since last render -> brief highlight
      r.tr.classList.remove('th-flash'); void r.tr.offsetWidth; r.tr.classList.add('th-flash');
    }
    r.sig = sig;
  }

  function render(snap) {
    var seen = {}, order = [];
    snap.forEach(function (doc) {
      var d = doc.data();
      seen[doc.id] = true;
      if (!rows[doc.id]) rows[doc.id] = buildRow();
      fill(rows[doc.id], d);
      order.push(rows[doc.id].tr);
    });
    Object.keys(rows).forEach(function (id) { if (!seen[id]) delete rows[id]; });
    body.textContent = '';
    if (!order.length) { body.appendChild(emptyRow('No trades yet \u2014 they will appear here as soon as the bot opens one.')); return; }
    order.forEach(function (tr) { body.appendChild(tr); });
  }

  function start() {
    if (started) return; started = true;
    db.collection('bot_trades').orderBy('openedAt', 'desc').limit(LIMIT).onSnapshot(render, function (err) {
      console.warn('[trades]', err && err.message);
      body.textContent = ''; body.appendChild(emptyRow('Trade history is unavailable right now.'));
    });
  }
  window.xeroaiAuth.onAuthStateChanged(function (user) { if (user) start(); });
})();
