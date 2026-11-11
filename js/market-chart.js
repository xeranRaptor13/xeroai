/* XeroAI live market chart.
   Connects straight from the browser to Deriv's public market-data WebSocket (no login, no token).
   Draws candles with TradingView's open-source Lightweight Charts. No bot, GitHub Actions or Firestore involved. */
(function () {
  'use strict';

  var card = document.getElementById('marketChartCard');
  if (!card) return;

  var box = card.querySelector('.mc-chart');
  var msgEl = card.querySelector('.mc-msg');
  var statusEl = card.querySelector('.mc-status');
  var statusTxt = statusEl.querySelector('span');
  var priceEl = card.querySelector('.mc-price');
  var chgEl = card.querySelector('.mc-chg');
  var symBtns = card.querySelectorAll('.mc-chip');
  var tfBtns = card.querySelectorAll('.mc-tf');

  /* Tried in order. The first is Deriv's current public gateway, the second is the older one as a fallback. */
  var ENDPOINTS = [
    'wss://api.derivws.com/trading/v1/options/ws/public',
    'wss://ws.derivws.com/websockets/v3?app_id=1089'
  ];
  var DECIMALS = { R_10: 3, R_100: 2, frxEURUSD: 5, frxGBPUSD: 5, cryBTCUSD: 2 };
  var CANDLES = 200;
  var MAX_HISTORY = 5000;                  /* most ticks Deriv returns in one request */
  var TZ_SHIFT = -new Date().getTimezoneOffset() * 60;   /* show the viewer's local time on the axis */

  var state = { symbol: 'R_10', n: 5 };   /* n = ticks per candle */
  var chart = null, series = null, ws = null;
  var gen = 0, epIdx = 0, retry = 0, retryTimer = null, pingTimer = null;
  var firstClose = null;
  var bars = [], cur = null, curN = 0, lastTime = 0;

  function showMsg(t) { msgEl.textContent = t; msgEl.hidden = false; }
  function hideMsg() { msgEl.hidden = true; }
  function setStatus(kind, text) { statusEl.className = 'mc-status is-' + kind; statusTxt.textContent = text; }

  if (!window.LightweightCharts) { setStatus('off', 'Unavailable'); showMsg('Chart library could not load. Check your connection and refresh.'); return; }

  /* ---------- chart ---------- */
  chart = LightweightCharts.createChart(box, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#939aaa', fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 },
    grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false, rightOffset: 4 },
    crosshair: { mode: 0 }
  });
  series = chart.addCandlestickSeries({
    upColor: '#4ade80', downColor: '#f87171',
    borderUpColor: '#4ade80', borderDownColor: '#f87171',
    wickUpColor: '#4ade80', wickDownColor: '#f87171'
  });

  function applyPrecision() {
    var d = DECIMALS[state.symbol] || 2;
    series.applyOptions({ priceFormat: { type: 'price', precision: d, minMove: 1 / Math.pow(10, d) } });
  }

  /* Adds one tick to the candle being built; starts a new candle after every n ticks. */
  function feed(p, epoch) {
    if (!cur || curN >= state.n) {
      var t = (+epoch) + TZ_SHIFT;
      if (t <= lastTime) t = lastTime + 1;         /* candle times must keep increasing */
      lastTime = t;
      cur = { time: t, open: p, high: p, low: p, close: p };
      curN = 0;
      bars.push(cur);
      if (bars.length > 3000) bars.shift();
    } else {
      if (p > cur.high) cur.high = p;
      if (p < cur.low) cur.low = p;
      cur.close = p;
    }
    curN++;
    return cur;
  }

  function readout(close) {
    var d = DECIMALS[state.symbol] || 2;
    priceEl.textContent = close.toFixed(d);
    if (firstClose) {
      var pct = (close - firstClose) / firstClose * 100;
      chgEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      chgEl.className = 'mc-chg ' + (pct >= 0 ? 'up' : 'down');
    }
  }

  /* ---------- socket ---------- */
  function teardown() {
    clearInterval(pingTimer);
    gen++;                                  /* anything still arriving from the old socket is ignored */
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  }

  function request() {
    ws.send(JSON.stringify({
      ticks_history: state.symbol, style: 'ticks',
      count: Math.min(MAX_HISTORY, state.n * CANDLES), end: 'latest', subscribe: 1
    }));
  }

  function scheduleRetry() {
    setStatus('wait', 'Reconnecting');
    retry++;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(1000 * Math.pow(2, retry - 1), 15000));
  }

  function connect() {
    clearTimeout(retryTimer);
    teardown();
    var my = gen, opened = false, sock;
    setStatus('wait', 'Connecting');
    try { sock = new WebSocket(ENDPOINTS[epIdx]); } catch (e) { epIdx = (epIdx + 1) % ENDPOINTS.length; return scheduleRetry(); }
    ws = sock;
    sock.onopen = function () {
      if (my !== gen) return;
      opened = true; retry = 0;
      request();
      pingTimer = setInterval(function () { try { sock.send('{"ping":1}'); } catch (e) {} }, 30000);
    };
    sock.onmessage = function (ev) { if (my === gen) onMessage(ev.data); };
    sock.onclose = function () {
      if (my !== gen) return;
      clearInterval(pingTimer);
      if (!opened) epIdx = (epIdx + 1) % ENDPOINTS.length;   /* never connected: try the other endpoint next */
      scheduleRetry();
    };
    sock.onerror = function () {};
  }

  function onMessage(raw) {
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.error) {
      setStatus('off', 'Unavailable');
      showMsg((m.error.message || 'Market data is unavailable right now.'));
      return;
    }
    if (m.msg_type === 'history' && m.history && m.history.prices && m.history.prices.length) {
      var req = m.echo_req || {};
      if (req.ticks_history && req.ticks_history !== state.symbol) return;
      bars = []; cur = null; curN = 0; lastTime = 0;
      var pr = m.history.prices, tm = m.history.times;
      for (var i = 0; i < pr.length; i++) feed(+pr[i], tm[i]);
      var shown = bars.slice(-CANDLES);
      series.setData(shown);
      chart.timeScale().fitContent();
      firstClose = shown[0].close;
      readout(cur.close);
      hideMsg();
      var age = Date.now() / 1000 - (+tm[tm.length - 1]);
      if (age > 120) setStatus('closed', 'Market closed'); else setStatus('live', 'Live');
    } else if (m.msg_type === 'tick' && m.tick) {
      if (m.tick.symbol !== state.symbol || !bars.length) return;
      var b = feed(+m.tick.quote, m.tick.epoch);
      series.update(b);
      readout(b.close);
      hideMsg();
      setStatus('live', 'Live');
    }
  }

  /* ---------- controls ---------- */
  function select(btns, attr, value) {
    btns.forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute(attr) === String(value))); });
  }

  function reload() {
    series.setData([]);
    bars = []; cur = null; curN = 0; lastTime = 0;
    firstClose = null;
    priceEl.textContent = '--';
    chgEl.textContent = '';
    chgEl.className = 'mc-chg';
    showMsg('Loading chart');
    applyPrecision();
    connect();
  }

  symBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var s = b.getAttribute('data-symbol');
      if (s === state.symbol) return;
      state.symbol = s; select(symBtns, 'data-symbol', s); reload();
    });
  });
  tfBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-n');
      if (n === state.n) return;
      state.n = n; select(tfBtns, 'data-n', n); reload();
    });
  });

  /* Stop streaming while the tab is hidden, resume when it comes back. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(retryTimer); teardown(); setStatus('wait', 'Paused'); }
    else { reload(); }
  });

  applyPrecision();
  showMsg('Loading chart');
  connect();
})();
