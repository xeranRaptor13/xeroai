  // Nav background on scroll
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if(window.scrollY > 8){ nav.classList.add('scrolled'); }
    else{ nav.classList.remove('scrolled'); }
  };
  document.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  // Mobile nav toggle (basic — expands links inline)
  const toggle = document.querySelector('.nav-toggle');
  const navLinksEl = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => {
    const open = navLinksEl.style.display === 'flex';
    navLinksEl.style.cssText = open ? '' : 'display:flex; position:absolute; top:76px; left:0; right:0; flex-direction:column; align-items:flex-start; gap:0; background:rgba(8,9,12,0.97); backdrop-filter:blur(16px); border-bottom:1px solid var(--border); padding:8px 32px 20px;';
    if(!open){
      navLinksEl.querySelectorAll('a').forEach(a => a.style.cssText = 'padding:12px 0; width:100%; border-bottom:1px solid rgba(255,255,255,0.06);');
    }
  });

  // Execution ledger — simulated live trade feed
  const assets = ['EUR/USD','BTC/USD','XAU/USD','GBP/JPY','ETH/USD','US30','SOL/USD','USD/CAD'];
  const rowsEl = document.getElementById('ledgerRows');
  const MAX_ROWS = 4;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const checkSvg = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.8 9L10 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function makeRow(){
    const asset = assets[Math.floor(Math.random()*assets.length)];
    const isBuy = Math.random() > 0.45;
    const conf = (85 + Math.random()*14).toFixed(1);
    const latency = Math.floor(3 + Math.random()*9);

    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="side ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'}</span>
      <span class="asset">${asset}</span>
      <span class="conf">${conf}%</span>
      <span class="latency">${latency}ms</span>
      <span class="status">${checkSvg}<span>executed</span></span>
    `;
    return row;
  }

  function pushRow(){
    const row = makeRow();
    rowsEl.prepend(row);
    while(rowsEl.children.length > MAX_ROWS){
      rowsEl.removeChild(rowsEl.lastElementChild);
    }
  }

  // seed initial rows (only on pages that actually have the ledger)
  if(rowsEl){
    for(let i=0;i<MAX_ROWS;i++){ pushRow(); }

    if(!reducedMotion){
      setInterval(pushRow, 2400);
    }
  }

  // ===== "How XeroAI Thinks" — interactive process loop =====
  (function(){
    const stepEls = Array.from(document.querySelectorAll('.step'));
    const spineProgress = document.getElementById('spineProgress');
    const processEl = document.querySelector('.process');
    const counterEl = document.getElementById('pnlCounter');
    const barsEl = document.querySelectorAll('#miniBars span');
    if(!stepEls.length || !spineProgress || !processEl) return;

    const TOTAL = stepEls.length;
    const STEP_MS = 1550;
    const FINALE_EXTRA_MS = 1300;
    const HOLD_MS = 1300;
    const RESUME_AFTER_CLICK_MS = 3600;
    const BAR_TARGETS = [26, 40, 34, 54, 46, 68, 60, 88];
    const PNL_TARGET = 482.30;

    const reduceMotionThinks = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let centers = [];
    let cycleTimer = null;
    let resumeTimer = null;

    function measure(){
      const baseTop = processEl.getBoundingClientRect().top;
      centers = stepEls.map(step => {
        const node = step.querySelector('.node');
        const r = node.getBoundingClientRect();
        return Math.max((r.top + r.height / 2) - baseTop - 8, 0);
      });
    }

    function debounce(fn, wait){
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }

    function setActive(i){
      stepEls.forEach((s, idx) => s.classList.toggle('active', idx === i));
      if(centers[i] !== undefined){
        spineProgress.style.height = centers[i] + 'px';
      }
    }

    function resetVisual(){
      stepEls.forEach(s => s.classList.remove('active'));
      spineProgress.style.height = '0px';
      if(counterEl) counterEl.textContent = '+$0.00';
      barsEl.forEach(b => { b.style.height = '6%'; });
    }

    function animateCounter(target, duration){
      if(!counterEl) return;
      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = (target * eased).toFixed(2);
        counterEl.textContent = '+$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function animateBars(){
      barsEl.forEach((b, i) => {
        setTimeout(() => { b.style.height = BAR_TARGETS[i % BAR_TARGETS.length] + '%'; }, i * 70);
      });
    }

    function runFinale(){
      animateCounter(PNL_TARGET, 1400);
      animateBars();
    }

    function runCycle(){
      measure();
      let i = 0;
      (function next(){
        setActive(i);
        if(i === TOTAL - 1) runFinale();
        const dur = (i === TOTAL - 1) ? STEP_MS + FINALE_EXTRA_MS : STEP_MS;
        cycleTimer = setTimeout(() => {
          i++;
          if(i < TOTAL){
            next();
          }else{
            cycleTimer = setTimeout(() => {
              resetVisual();
              cycleTimer = setTimeout(runCycle, 500);
            }, HOLD_MS);
          }
        }, dur);
      })();
    }

    function jumpTo(idx){
      clearTimeout(cycleTimer);
      clearTimeout(resumeTimer);
      measure();
      resetVisual();
      setActive(idx);
      if(idx === TOTAL - 1) runFinale();
      resumeTimer = setTimeout(runCycle, RESUME_AFTER_CLICK_MS);
    }

    stepEls.forEach((step, idx) => {
      step.addEventListener('click', () => jumpTo(idx));
      step.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); jumpTo(idx); }
      });
    });

    window.addEventListener('resize', debounce(measure, 200));

    if(reduceMotionThinks){
      measure();
      setActive(TOTAL - 1);
      if(counterEl) counterEl.textContent = '+$' + PNL_TARGET.toFixed(2);
      barsEl.forEach((b, i) => { b.style.height = BAR_TARGETS[i % BAR_TARGETS.length] + '%'; });
    }else{
      window.addEventListener('load', () => setTimeout(runCycle, 300));
    }
  })();

  // ===== "Why Traders Trust XeroAI" — reveal + spotlight hover =====
  (function(){
    const cards = document.querySelectorAll('.trust-card');
    const banner = document.querySelector('.trust-banner');
    if(!cards.length && !banner) return;

    const revealTargets = [...cards, banner].filter(Boolean);
    const reduceMotionTrust = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if(reduceMotionTrust){
      revealTargets.forEach(el => el.classList.add('in-view'));
    }else if('IntersectionObserver' in window){
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if(entry.isIntersecting){
            setTimeout(() => entry.target.classList.add('in-view'), i * 70);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
      revealTargets.forEach(el => io.observe(el));
    }else{
      revealTargets.forEach(el => el.classList.add('in-view'));
    }

    // subtle spotlight glow following the cursor on each card
    cards.forEach(card => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  })();

  // ===== "Powerful Features. Intelligent Automation." =====
  (function(){
    const cards = document.querySelectorAll('.feature-card');
    const divider = document.querySelector('.features-divider');
    const statement = document.querySelector('.features-statement');
    if(!cards.length) return;

    const reduceMotionFeatures = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function animateStat(el, duration){
      if(!el) return;
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;
      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = prefix + val.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      if(reduceMotionFeatures){
        el.textContent = prefix + target.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }) + suffix;
      }else{
        requestAnimationFrame(frame);
      }
    }

    function runDemo(card){
      const type = card.dataset.feature;
      const statValues = card.querySelectorAll('.demo-stat-value');

      if(type === 'pattern'){
        const bars = card.querySelectorAll('.mini-candles span');
        const heights = [35, 55, 42, 68, 50, 80, 62];
        bars.forEach((b, i) => setTimeout(() => { b.style.height = heights[i % heights.length] + '%'; }, i * 90));
        const badge = card.querySelector('.signal-badge');
        setTimeout(() => badge && badge.classList.add('show'), 700);
        setTimeout(() => animateStat(statValues[0], 1200), 850);
      }

      if(type === 'execution'){
        const status = card.querySelector('.exec-status');
        const text = card.querySelector('.exec-status-text');
        setTimeout(() => {
          if(status) status.classList.add('confirmed');
          if(text) text.textContent = 'Order confirmed';
        }, 1400);
      }

      if(type === 'risk'){
        const items = card.querySelectorAll('.risk-checks li');
        items.forEach((li, i) => setTimeout(() => li.classList.add('checked'), 300 + i * 350));
      }

      if(type === 'brokers'){
        const status = card.querySelector('.broker-status');
        const text = card.querySelector('.status-text');
        setTimeout(() => {
          if(status) status.classList.add('connected');
          if(text) text.textContent = 'Connected';
        }, 1100);
      }

      if(type === 'portfolio'){
        statValues.forEach((el, i) => setTimeout(() => animateStat(el, 1300), i * 150));
      }

      if(type === 'analytics'){
        const path = card.querySelector('.chart-path');
        if(path){
          const len = path.getTotalLength();
          path.style.strokeDasharray = len;
          path.style.strokeDashoffset = reduceMotionFeatures ? 0 : len;
          if(!reduceMotionFeatures){
            path.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)';
            requestAnimationFrame(() => { path.style.strokeDashoffset = 0; });
          }
        }
        setTimeout(() => animateStat(statValues[0], 1300), 300);
      }
    }

    const revealTargets = [...cards, divider, statement].filter(Boolean);

    if(reduceMotionFeatures || !('IntersectionObserver' in window)){
      revealTargets.forEach(el => el.classList.add('in-view'));
      cards.forEach(runDemo);
    }else{
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if(entry.isIntersecting){
            const el = entry.target;
            setTimeout(() => {
              el.classList.add('in-view');
              if(el.classList.contains('feature-card')) runDemo(el);
            }, i * 60);
            io.unobserve(el);
          }
        });
      }, { threshold: 0.25, rootMargin: '0px 0px -40px 0px' });
      revealTargets.forEach(el => io.observe(el));
    }
  })();

  // ===== Shared reveal-on-scroll (used by Brokers, Pricing, Xero Pay) =====
  (function(){
    const targets = document.querySelectorAll('.reveal-up');
    if(!targets.length) return;

    const reduceMotionReveal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if(reduceMotionReveal || !('IntersectionObserver' in window)){
      targets.forEach(el => el.classList.add('in-view'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => io.observe(el));
  })();

  // ===== Xero Pay wallet mock: balance counter + chart draw =====
  (function(){
    const walletMock = document.querySelector('.wallet-mock');
    if(!walletMock) return;

    const reduceMotionWallet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const balanceEl = walletMock.querySelector('.wallet-balance');
    const chartPath = walletMock.querySelector('.wallet-chart-path');
    let played = false;

    function animateValue(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const prefix = el.dataset.prefix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;
      if(reduceMotionWallet){
        el.textContent = prefix + target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return;
      }
      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + (target * eased).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function playWalletDemo(){
      if(played) return;
      played = true;
      if(balanceEl) animateValue(balanceEl, 1400);
      if(chartPath){
        const len = chartPath.getTotalLength();
        chartPath.style.strokeDasharray = len;
        chartPath.style.strokeDashoffset = reduceMotionWallet ? 0 : len;
        if(!reduceMotionWallet){
          chartPath.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)';
          requestAnimationFrame(() => { chartPath.style.strokeDashoffset = 0; });
        }
      }
    }

    if(reduceMotionWallet || !('IntersectionObserver' in window)){
      playWalletDemo();
    }else{
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if(entry.isIntersecting){
            playWalletDemo();
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      io.observe(walletMock);
    }
  })();

  // ===== Xero Pay roadmap: fill the connecting line once in view =====
  (function(){
    const fill = document.getElementById('roadmapFill');
    const track = document.querySelector('.roadmap-track');
    if(!fill || !track) return;

    const reduceMotionRoadmap = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if(reduceMotionRoadmap || !('IntersectionObserver' in window)){
      fill.classList.add('fill-active');
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          fill.classList.add('fill-active');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    io.observe(track);
  })();

  // ===== FAQ accordion — one open at a time, keyboard accessible via native <button> =====
  (function(){
    const items = document.querySelectorAll('.faq-card');
    if(!items.length) return;

    items.forEach(item => {
      const btn = item.querySelector('.faq-card-head');
      if(!btn) return;

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        items.forEach(other => {
          other.classList.remove('open');
          const otherBtn = other.querySelector('.faq-card-head');
          if(otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });

        if(!isOpen){
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  })();
