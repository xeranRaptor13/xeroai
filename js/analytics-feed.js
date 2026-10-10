/* XeroAI — Weekly Performance, built from the bot's real closed trades (bot_trades).
   Each of the last 7 days shows its net profit/loss as a bar. A day is GREEN when it
   has more winning trades than losing trades, RED when it has more losing than winning
   (a tie follows the day's net profit). Load AFTER js/firebase-init.js. */
(function () {
  var wrap = document.getElementById('xanWrap');
  if (!wrap || !window.xeroaiDb || !window.xeroaiAuth) return;
  var NS = 'http://www.w3.org/2000/svg', DAYS = 7, DUR = 700;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var db = window.xeroaiDb, started = false;

  function sv(t, a) { var e = document.createElementNS(NS, t); for (var k in (a || {})) e.setAttribute(k, a[k]); return e; }
  function $(id) { return document.getElementById(id); }
  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function money(n) { return (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2); }
  function key(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function tsDate(ts) { return ts && ts.toDate ? ts.toDate() : null; }

  /* ---------- aggregate trades into 7 day buckets ---------- */
  function aggregate(docs) {
    var days = [], now = new Date(), map = {};
    for (var i = DAYS - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var b = { label: d.toLocaleDateString('en-US', { weekday: 'short' }), w: 0, l: 0, n: 0, net: 0 };
      days.push(b); map[key(d)] = b;
    }
    docs.forEach(function (t) {
      if (t.status !== 'closed' || typeof t.profit !== 'number') return;
      var when = tsDate(t.closedAt) || tsDate(t.openedAt); if (!when) return;
      var b = map[key(when)]; if (!b) return;
      b.n++; b.net += t.profit;
      if (t.profit > 0) b.w++; else if (t.profit < 0) b.l++;
    });
    days.forEach(function (b) { b.net = Math.round(b.net * 100) / 100; b.tone = tone(b); });
    return days;
  }
  function tone(b) {
    if (!b.n) return 'none';
    if (b.w > b.l) return 'green';
    if (b.l > b.w) return 'red';
    return b.net > 0 ? 'green' : (b.net < 0 ? 'red' : 'none');
  }

  /* ---------- summary tiles ---------- */
  function summary(days) {
    var n = 0, w = 0, l = 0, net = 0;
    days.forEach(function (b) { n += b.n; w += b.w; l += b.l; net += b.net; });
    net = Math.round(net * 100) / 100;
    $('xanTotal').textContent = n;
    $('xanWins').textContent = w;
    $('xanLosses').textContent = l;
    $('xanRate').textContent = (w + l) ? Math.round(w / (w + l) * 100) + '%' : '\u2014';
    var nn = $('xanNet'); nn.textContent = n ? money(net) : '\u2014';
    nn.className = n ? (net > 0 ? 'xan-pos' : net < 0 ? 'xan-neg' : '') : '';
    var t = days[DAYS - 1], chip = $('xanToday');
    if (!t.n) { chip.textContent = 'Today: no closed trades yet'; chip.className = 'xan-today'; }
    else {
      chip.className = 'xan-today is-' + t.tone;
      chip.textContent = 'Today: ' + t.w + 'W \u00B7 ' + t.l + 'L \u2014 ' +
        (t.tone === 'green' ? 'green day' : t.tone === 'red' ? 'red day' : 'even');
    }
  }

  /* ---------- chart ---------- */
  var svg = sv('svg', { 'class': 'xan-svg', role: 'img', 'aria-label': 'Weekly profit and loss by day' });
  var base = sv('line', { 'class': 'xan-base' }), g = sv('g');
  svg.appendChild(base); svg.appendChild(g); wrap.appendChild(svg);
  var empty = document.createElement('div'); empty.className = 'xan-empty';
  empty.textContent = 'No closed trades yet \u2014 your weekly performance appears here as the bot trades.';
  wrap.appendChild(empty);
  var els = [], days = [], shown = null, raf = null, W = 640, H = 240;

  function build() {
    W = wrap.clientWidth || 640; H = wrap.clientHeight || 240;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    g.textContent = ''; els = [];
    days.forEach(function (b) {
      var o = { bar: sv('rect', { rx: 5 }), val: sv('text', { 'class': 'xan-val' }),
                day: sv('text', { 'class': 'xan-day' }), wl: sv('text', { 'class': 'xan-wl' }) };
      o.day.textContent = b.label;
      o.wl.textContent = b.n ? (W / DAYS < 70 ? b.w + '-' + b.l : b.w + 'W \u00B7 ' + b.l + 'L') : '\u2014';
      o.bar.setAttribute('class', 'xan-bar xan-' + b.tone);
      [o.bar, o.val, o.day, o.wl].forEach(function (n) { g.appendChild(n); });
      els.push(o);
    });
  }
  function frame(v) {                         // v = 7 nets + [yMin, yMax]
    var top = 22, bottom = 46, ph = H - top - bottom, lo = v[DAYS], hi = v[DAYS + 1];
    var y = function (n) { return top + ph * (1 - (n - lo) / (hi - lo)); };
    var y0 = y(0), slot = W / DAYS, bw = Math.min(64, slot * 0.62);
    base.setAttribute('x1', 0); base.setAttribute('x2', W); base.setAttribute('y1', y0); base.setAttribute('y2', y0);
    els.forEach(function (o, i) {
      var cx = slot * i + slot / 2, yv = y(v[i]), h = Math.abs(yv - y0), b = days[i];
      o.bar.setAttribute('x', cx - bw / 2); o.bar.setAttribute('width', bw);
      o.bar.setAttribute('y', v[i] >= 0 ? yv : y0); o.bar.setAttribute('height', b.n ? Math.max(h, 2) : 0);
      o.val.setAttribute('x', cx); o.val.setAttribute('text-anchor', 'middle');
      o.val.setAttribute('y', v[i] >= 0 ? yv - 6 : yv + 14);
      o.val.textContent = b.n ? money(b.net) : '';
      o.day.setAttribute('x', cx); o.day.setAttribute('y', H - 24); o.day.setAttribute('text-anchor', 'middle');
      o.wl.setAttribute('x', cx); o.wl.setAttribute('y', H - 8); o.wl.setAttribute('text-anchor', 'middle');
    });
  }
  function target(d) {
    var nets = d.map(function (b) { return b.net; });
    var mx = Math.max.apply(null, nets.concat([0.5])), mn = Math.min.apply(null, nets.concat([0]));
    var pad = (mx - mn) * 0.12;
    return nets.concat([mn < 0 ? mn - pad : 0, mx + pad]);
  }
  function update(docs) {
    var first = !days.length;
    days = aggregate(docs); summary(days);
    var any = days.some(function (b) { return b.n; });
    empty.style.display = any ? 'none' : 'flex';
    build();
    var to = target(days), from = (shown && !first) ? shown : to.map(function (v, i) { return i < DAYS ? 0 : v; });
    cancelAnimationFrame(raf);
    if (reduce) { shown = to; frame(to); return; }
    var t0 = null;
    (function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR), e = ease(p);
      shown = to.map(function (v, i) { return from[i] + (v - from[i]) * e; }); frame(shown);
      if (p < 1) raf = requestAnimationFrame(step);
    })(performance.now());
  }

  var lastDocs = [];
  function start() {
    if (started) return; started = true;
    var since = new Date(); since.setDate(since.getDate() - (DAYS + 1)); since.setHours(0, 0, 0, 0);
    db.collection('bot_trades').where('openedAt', '>=', since).orderBy('openedAt', 'desc').limit(500)
      .onSnapshot(function (snap) {
        lastDocs = []; snap.forEach(function (d) { lastDocs.push(d.data()); });
        update(lastDocs);
      }, function (err) { console.warn('[analytics]', err && err.message); update([]); });
  }
  if (window.ResizeObserver) new ResizeObserver(function () { if (days.length) { build(); frame(shown || target(days)); } }).observe(wrap);
  update([]);                                  // empty state until the first snapshot
  window.xeroaiAuth.onAuthStateChanged(function (u) { if (u) start(); });
})();
