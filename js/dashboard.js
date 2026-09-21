/* ==========================================================
   XeroAI — Dashboard Module JavaScript
   Used by: dashboard.html and onboarding-step*.html pages.
   Every feature below guards for missing elements so this one
   file can be safely shared across all dashboard-module pages.
   ========================================================== */

(function(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============ ANIMATED NETWORK BACKGROUND ============ */
  (function(){
    const canvas = document.getElementById('dashNetworkCanvas');
    if(!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0, ch = 0, particles = [], rafId = null;

    function resize(){
      cw = window.innerWidth;
      ch = window.innerHeight;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticles(){
      const density = 18000;
      const count = Math.max(24, Math.min(80, Math.floor((cw * ch) / density)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 0.26,
        vy: (Math.random() - 0.5) * 0.26
      }));
    }

    function drawFrame(){
      ctx.clearRect(0, 0, cw, ch);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if(p.x <= 0 || p.x >= cw) p.vx *= -1;
        if(p.y <= 0 || p.y >= ch) p.vy *= -1;
      });

      for(let i = 0; i < particles.length; i++){
        for(let j = i + 1; j < particles.length; j++){
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if(dist < 130){
            ctx.strokeStyle = 'rgba(94,142,255,' + (0.14 * (1 - dist / 130)) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(138,180,255,0.65)';
        ctx.fill();
      });
    }

    function loop(){
      drawFrame();
      rafId = requestAnimationFrame(loop);
    }

    function start(){
      resize();
      createParticles();
      if(reduceMotion){
        drawFrame();
      }else{
        if(rafId) cancelAnimationFrame(rafId);
        loop();
      }
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(start, 150);
    });

    start();
  })();

  /* ============ SHARED LOADING -> SUCCESS BUTTON HELPER ============ */
  function simulateStepSubmit(btn, onComplete){
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    const loadingDelay = reduceMotion ? 150 : 900;
    setTimeout(() => {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      onComplete();
    }, loadingDelay);
  }

  /* ============ ONBOARDING STEP PROGRESS BAR ============ */
  (function(){
    const fill = document.getElementById('stepProgressFill');
    if(!fill) return;
    const target = fill.dataset.target ? fill.dataset.target + '%' : fill.style.width;
    requestAnimationFrame(() => {
      setTimeout(() => { fill.style.width = target; }, 150);
    });
  })();

  /* ============ ONBOARDING STEP 1: MARKET SELECTION (single-select) ============ */
  (function(){
    const grid = document.querySelector('.step-market-grid');
    if(!grid) return;

    const cards = Array.from(grid.querySelectorAll('.step-market-card'));
    const continueBtn = document.getElementById('step1Continue');
    const hintEl = document.getElementById('step1Hint');

    function selectCard(card){
      cards.forEach(c => {
        const isThis = c === card;
        c.classList.toggle('selected', isThis);
        c.setAttribute('aria-checked', String(isThis));
        c.tabIndex = isThis ? 0 : -1;
      });

      if(continueBtn){
        continueBtn.disabled = false;
        continueBtn.setAttribute('aria-disabled', 'false');
      }
      if(hintEl){
        hintEl.textContent = 'You can add more markets later from your dashboard.';
      }
    }

    cards.forEach((card, index) => {
      card.addEventListener('click', () => selectCard(card));

      card.addEventListener('keydown', (e) => {
        let targetIndex = null;
        if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
          targetIndex = (index + 1) % cards.length;
        }else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
          targetIndex = (index - 1 + cards.length) % cards.length;
        }else if(e.key === ' ' || e.key === 'Enter'){
          e.preventDefault();
          selectCard(card);
          return;
        }
        if(targetIndex !== null){
          e.preventDefault();
          cards[targetIndex].focus();
        }
      });
    });

    if(continueBtn){
      continueBtn.addEventListener('click', () => {
        if(continueBtn.disabled || continueBtn.classList.contains('is-loading')) return;
        const nextPage = continueBtn.dataset.next || 'onboarding-step2.html';
        simulateStepSubmit(continueBtn, () => {
          window.location.href = nextPage;
        });
      });
    }
  })();

  /* ============ ON-LOAD REVEAL ============ */
  (function(){
    const targets = document.querySelectorAll('.reveal-step');
    if(!targets.length) return;

    if(reduceMotion){
      targets.forEach(el => el.classList.add('in-view'));
    }else{
      targets.forEach((el, i) => {
        setTimeout(() => el.classList.add('in-view'), 120 + i * 130);
      });
    }
  })();

  /* ============ APPLICATION SHELL (dashboard framework) ============ */
  (function(){
    const appShell = document.getElementById('appShell');
    if(!appShell) return;

    const reduceMotionApp = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- desktop sidebar collapse ---- */
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    if(collapseBtn){
      collapseBtn.addEventListener('click', () => {
        const collapsed = appShell.classList.toggle('sidebar-collapsed');
        collapseBtn.setAttribute('aria-pressed', String(collapsed));
        collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      });
    }

    /* ---- mobile drawer ---- */
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn');

    function openDrawer(){
      if(!sidebar || !overlay) return;
      sidebar.classList.add('open');
      overlay.classList.add('show');
    }
    function closeDrawer(){
      if(!sidebar || !overlay) return;
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }

    if(menuBtn) menuBtn.addEventListener('click', openDrawer);
    if(overlay) overlay.addEventListener('click', closeDrawer);

    // Close the drawer automatically if the viewport grows back to desktop size
    window.addEventListener('resize', () => {
      if(window.innerWidth > 900) closeDrawer();
    });

    /* ---- placeholder nav links: prevent jump-to-top, no route yet ---- */
    document.querySelectorAll('.sidebar-link[data-placeholder="true"]').forEach(link => {
      link.addEventListener('click', (e) => e.preventDefault());
    });

    /* ---- live date/time in topbar ---- */
    const datetimeEl = document.getElementById('topbarDatetime');
    if(datetimeEl){
      function updateClock(){
        const now = new Date();
        const formatted = now.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        datetimeEl.textContent = formatted;
      }
      updateClock();
      setInterval(updateClock, 30000);
    }

    /* ---- reveal dashboard sections on load ---- */
    const revealTargets = document.querySelectorAll('.reveal-dash');
    if(reduceMotionApp){
      revealTargets.forEach(el => el.classList.add('in-view'));
    }else{
      revealTargets.forEach((el, i) => {
        setTimeout(() => el.classList.add('in-view'), 100 + i * 90);
      });
    }
  })();

  /* ============ TRADING OVERVIEW (Module 2A) ============ */
  (function(){
    const overview = document.getElementById('tradingOverview');
    if(!overview) return;

    const reduceMotionOverview = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startDelay = reduceMotionOverview ? 0 : 500;

    /* ---- animated number counters ---- */
    function animateCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const prefix = el.dataset.prefix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionOverview){
        el.textContent = prefix + target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = prefix + val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    /* ---- AI confidence ring ---- */
    function animateConfidenceRing(){
      const ringFill = document.getElementById('confidenceRingFill');
      const valueEl = document.getElementById('confidenceValue');
      if(!ringFill) return;

      const target = parseInt(ringFill.dataset.target, 10) || 0;
      const circumference = 326.7;
      const offset = circumference * (1 - target / 100);

      if(reduceMotionOverview){
        ringFill.style.strokeDashoffset = offset;
        if(valueEl) valueEl.textContent = target + '%';
        return;
      }

      requestAnimationFrame(() => {
        ringFill.style.strokeDashoffset = offset;
      });

      if(valueEl){
        const start = performance.now();
        const duration = 1400;
        function frame(now){
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          valueEl.textContent = Math.round(target * eased) + '%';
          if(p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }
    }

    /* ---- horizontal progress bars ---- */
    function animateProgressBars(){
      document.querySelectorAll('[data-bar-target]').forEach(bar => {
        const target = parseInt(bar.dataset.barTarget, 10) || 0;
        requestAnimationFrame(() => { bar.style.width = target + '%'; });
      });
    }

    setTimeout(() => {
      overview.querySelectorAll('[data-counter]').forEach(el => animateCounter(el, 1300));
      animateConfidenceRing();
      animateProgressBars();
    }, startDelay);

    /* ---- ripple effect on quick action buttons ---- */
    overview.querySelectorAll('.rippleable').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'dash-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });
    });

    /* ---- quick actions: simulated only, no backend ---- */
    const noteEl = document.getElementById('quickActionsNote');
    const startBtn = document.getElementById('qaStartAi');
    const pauseBtn = document.getElementById('qaPauseAi');
    const engineBadge = document.querySelector('.engine-status-head .badge-pill');
    const bannerBadge = document.querySelector('.welcome-banner-content .badge-pill');

    function flashNote(message){
      if(!noteEl) return;
      noteEl.textContent = message;
      clearTimeout(flashNote._t);
      flashNote._t = setTimeout(() => {
        noteEl.textContent = 'These actions are simulated. No live trading is connected yet.';
      }, 2600);
    }

    function setEngineState(online){
      [engineBadge, bannerBadge].forEach(badge => {
        if(!badge) return;
        badge.classList.toggle('badge-online', online);
        badge.innerHTML = online
          ? '<span class="dot"></span>Online'
          : '<span class="dot"></span>Paused';
      });
      if(startBtn) startBtn.classList.toggle('is-active', online);
      if(pauseBtn) pauseBtn.classList.toggle('is-active', !online);
    }

    /* ---- subscription gate: reads the same demo status subscription.html writes ---- */
    const gateLink = document.getElementById('subscriptionGateLink');

    function getSubscriptionStatus(){
      try { return localStorage.getItem('xeroaiSubscriptionStatus') || 'trial'; }
      catch(e){ return 'trial'; }
    }

    function applySubscriptionGate(){
      const status = getSubscriptionStatus();
      const locked = status === 'pending' || status === 'expired';
      if(startBtn){
        startBtn.disabled = locked;
        startBtn.classList.toggle('is-locked', locked);
      }
      if(gateLink) gateLink.hidden = !locked;
      if(locked && noteEl){
        noteEl.textContent = status === 'pending'
          ? 'AI Engine is locked while your payment is under review.'
          : 'AI Engine is locked — your trial has ended and no active subscription was found.';
      }
    }
    applySubscriptionGate();

    if(startBtn){
      startBtn.addEventListener('click', () => {
        if(startBtn.disabled) return;
        setEngineState(true);
        flashNote('AI Engine started (simulated).');
      });
    }
    if(pauseBtn){
      pauseBtn.addEventListener('click', () => {
        setEngineState(false);
        flashNote('AI Engine paused (simulated).');
      });
    }

    overview.querySelectorAll('[data-action="platforms"]').forEach(btn => {
      btn.addEventListener('click', () => flashNote('Platform management is coming in a future update.'));
    });
  })();

  /* ============ CONNECTED PLATFORMS (Module 2B) ============ */
  (function(){
    const section = document.getElementById('connectedPlatforms');
    if(!section) return;

    const reduceMotionPlatforms = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate the Platform Summary counters ---- */
    function animateSummaryCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;

      if(reduceMotionPlatforms){
        el.textContent = target;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('[data-counter]').forEach(el => animateSummaryCounter(el, 1200));
    }, reduceMotionPlatforms ? 0 : 500);

    /* ---- "Manage Connection" buttons: simulated only, no backend ---- */
    const noteEl = document.getElementById('platformActionNote');
    function flashPlatformNote(message){
      if(!noteEl) return;
      noteEl.textContent = message;
      clearTimeout(flashPlatformNote._t);
      flashPlatformNote._t = setTimeout(() => {
        noteEl.textContent = 'Select "Manage Connection" to view platform details.';
      }, 2600);
    }

    section.querySelectorAll('.btn-manage-connection:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.platformName || 'This platform';
        flashPlatformNote(name + ' connection management is coming in a future update.');
      });
    });
  })();

  /* ============ AI DECISION CENTER & TRADE HISTORY (Module 2C.2) ============ */
  (function(){
    const section = document.getElementById('aiDecisionCenter');
    if(!section) return;

    const reduceMotionDecisions = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate Trade Execution Monitor counters ---- */
    function animateExecutionStat(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const suffix = el.dataset.suffix || '';

      if(reduceMotionDecisions){
        el.textContent = target + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.execution-stat-value[data-counter]').forEach(el => animateExecutionStat(el, 1200));
    }, reduceMotionDecisions ? 0 : 500);
  })();

  /* ============ SYSTEM HEALTH & NOTIFICATIONS (Module 2D) ============ */
  (function(){
    const section = document.getElementById('systemHealthSection');
    if(!section) return;

    const reduceMotionHealth = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate Platform Status Summary counters ---- */
    function animateHealthCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionHealth){
        el.textContent = target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.summary-stat-value[data-counter]').forEach(el => animateHealthCounter(el, 1200));
    }, reduceMotionHealth ? 0 : 500);
  })();

  /* ============ PERFORMANCE OVERVIEW (Module 3A) ============ */
  (function(){
    const section = document.getElementById('performanceOverview');
    if(!section) return;

    const reduceMotionPerf = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate Performance Summary counters ---- */
    function animatePerfCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionPerf){
        el.textContent = prefix + target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = prefix + val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.trading-stat-value[data-counter]').forEach(el => animatePerfCounter(el, 1300));
    }, reduceMotionPerf ? 0 : 500);

    /* ---- weekly performance chart (pure canvas, no libraries) ---- */
    (function(){
      const canvas = document.getElementById('weeklyPerformanceChart');
      if(!canvas || !canvas.getContext) return;

      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const values = [120, 85, 620, -40, 310, 150, -25];
      let progress = reduceMotionPerf ? 1 : 0;

      function resize(){
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(progress);
      }

      function draw(p){
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const paddingBottom = 24;
        const paddingTop = 10;
        const usableHeight = h - paddingBottom - paddingTop;
        const maxAbs = Math.max(...values.map(v => Math.abs(v)));
        const zeroY = paddingTop + usableHeight * (maxAbs / (maxAbs * 2));

        const barCount = values.length;
        const gap = 18;
        const barWidth = (w - gap * (barCount + 1)) / barCount;

        values.forEach((val, i) => {
          const x = gap + i * (barWidth + gap);
          const barHeight = (Math.abs(val) / (maxAbs * 2)) * usableHeight * p;
          const isPositive = val >= 0;

          ctx.fillStyle = isPositive ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)';
          if(isPositive){
            ctx.fillRect(x, zeroY - barHeight, barWidth, barHeight);
          }else{
            ctx.fillRect(x, zeroY, barWidth, barHeight);
          }

          ctx.fillStyle = 'rgba(148,154,170,0.8)';
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(days[i], x + barWidth / 2, h - 6);
        });

        // zero baseline
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.stroke();
      }

      resize();
      window.addEventListener('resize', resize);

      if(!reduceMotionPerf){
        const animStart = performance.now();
        const animDuration = 1200;
        function frame(now){
          progress = Math.min((now - animStart) / animDuration, 1);
          draw(1 - Math.pow(1 - progress, 3));
          if(progress < 1) requestAnimationFrame(frame);
        }
        setTimeout(() => requestAnimationFrame(frame), 400);
      }
    })();

    /* ---- trading activity heatmap (7 days x 24 hours, demo data) ---- */
    (function(){
      const grid = document.getElementById('heatmapGrid');
      if(!grid) return;

      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const hourMarks = [0, 4, 8, 12, 16, 20];

      function activityValue(day, hour){
        const hourFactor = Math.exp(-Math.pow(hour - 14, 2) / 50);
        const weekdayFactor = day < 5 ? 1 : 0.55;
        return Math.min(1, hourFactor * weekdayFactor * 1.1 + 0.05);
      }

      const frag = document.createDocumentFragment();

      // corner + hour header row
      const corner = document.createElement('div');
      corner.className = 'heatmap-corner';
      frag.appendChild(corner);

      for(let hour = 0; hour < 24; hour++){
        const label = document.createElement('div');
        label.className = 'heatmap-hour-label';
        label.textContent = hourMarks.includes(hour) ? hour + ':00' : '';
        frag.appendChild(label);
      }

      // day rows
      dayLabels.forEach((day, dayIndex) => {
        const dayLabel = document.createElement('div');
        dayLabel.className = 'heatmap-day-label';
        dayLabel.textContent = day;
        frag.appendChild(dayLabel);

        for(let hour = 0; hour < 24; hour++){
          const value = activityValue(dayIndex, hour);
          const cell = document.createElement('div');
          cell.className = 'heatmap-cell';
          cell.style.setProperty('--intensity', value.toFixed(2));
          cell.title = day + ' ' + hour + ':00 — activity ' + Math.round(value * 100) + '%';
          frag.appendChild(cell);
        }
      });

      grid.appendChild(frag);

      const cells = grid.querySelectorAll('.heatmap-cell');
      if(reduceMotionPerf){
        cells.forEach(c => c.classList.add('in-view'));
      }else{
        cells.forEach((c, i) => {
          setTimeout(() => c.classList.add('in-view'), 300 + i * 4);
        });
      }
    })();
  })();

  /* ============ PROFIT ANALYTICS (Module 3B) ============ */
  (function(){
    const section = document.getElementById('profitAnalytics');
    if(!section) return;

    const reduceMotionProfit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate Profit Summary counters ---- */
    function animateProfitCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionProfit){
        el.textContent = prefix + target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = prefix + val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.trading-stat-value[data-counter]').forEach(el => animateProfitCounter(el, 1300));
    }, reduceMotionProfit ? 0 : 500);

    /* ---- monthly profit trend (canvas line chart, no libraries) ---- */
    (function(){
      const canvas = document.getElementById('monthlyProfitChart');
      if(!canvas || !canvas.getContext) return;

      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const values = [1200, 1450, 1100, 1600, 1800, 2050, 1950, 2200, 2400, 2150, 2600, 2875];
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);

      function resize(){
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(reduceMotionProfit ? 1 : lastProgress);
      }

      function pointAt(i, w, h, paddingTop, paddingBottom, paddingSide){
        const usableW = w - paddingSide * 2;
        const usableH = h - paddingTop - paddingBottom;
        const x = paddingSide + (usableW / (values.length - 1)) * i;
        const norm = (values[i] - minVal) / (maxVal - minVal || 1);
        const y = paddingTop + usableH * (1 - norm);
        return { x, y };
      }

      let lastProgress = reduceMotionProfit ? 1 : 0;

      function draw(progress){
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const paddingTop = 14;
        const paddingBottom = 24;
        const paddingSide = 6;

        // horizontal gridlines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for(let g = 0; g <= 3; g++){
          const y = paddingTop + ((h - paddingTop - paddingBottom) / 3) * g;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        const visibleCount = Math.max(1, Math.floor(progress * (values.length - 1)) + 1);
        const points = [];
        for(let i = 0; i < visibleCount; i++){
          points.push(pointAt(i, w, h, paddingTop, paddingBottom, paddingSide));
        }

        if(points.length > 1){
          // glow fill under the line
          const gradient = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
          gradient.addColorStop(0, 'rgba(94,142,255,0.22)');
          gradient.addColorStop(1, 'rgba(94,142,255,0)');

          ctx.beginPath();
          ctx.moveTo(points[0].x, h - paddingBottom);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, h - paddingBottom);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          // line
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = 'rgba(94,142,255,0.95)';
          ctx.lineWidth = 2.2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(94,142,255,0.5)';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // end point marker
          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        // month labels
        ctx.fillStyle = 'rgba(148,154,170,0.8)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        months.forEach((m, i) => {
          if(i % 2 === 0){
            const p = pointAt(i, w, h, paddingTop, paddingBottom, paddingSide);
            ctx.fillText(m, p.x, h - 6);
          }
        });
      }

      resize();
      window.addEventListener('resize', resize);

      if(!reduceMotionProfit){
        const animStart = performance.now();
        const animDuration = 1600;
        function frame(now){
          lastProgress = Math.min((now - animStart) / animDuration, 1);
          draw(lastProgress);
          if(lastProgress < 1) requestAnimationFrame(frame);
        }
        setTimeout(() => requestAnimationFrame(frame), 400);
      }
    })();

    /* ---- profit distribution doughnut (canvas, no libraries) ---- */
    (function(){
      const canvas = document.getElementById('profitDoughnutChart');
      if(!canvas || !canvas.getContext) return;

      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const segments = [
        { value: 45, color: 'rgba(217,166,92,0.9)' },
        { value: 30, color: 'rgba(94,142,255,0.9)' },
        { value: 25, color: 'rgba(74,222,128,0.9)' }
      ];
      const total = segments.reduce((sum, s) => sum + s.value, 0);

      function resize(){
        const rect = canvas.parentElement.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(reduceMotionProfit ? 1 : 0);
      }

      function draw(progress){
        const size = canvas.clientWidth;
        const cx = size / 2;
        const cy = size / 2;
        const outerRadius = size / 2 - 4;
        const innerRadius = outerRadius * 0.62;

        ctx.clearRect(0, 0, size, size);

        let startAngle = -Math.PI / 2;
        const sweepTotal = Math.PI * 2 * progress;
        let drawnAngle = 0;

        segments.forEach(seg => {
          const segAngle = (seg.value / total) * Math.PI * 2;
          const thisSweep = Math.min(segAngle, Math.max(0, sweepTotal - drawnAngle));
          if(thisSweep > 0){
            ctx.beginPath();
            ctx.arc(cx, cy, outerRadius, startAngle, startAngle + thisSweep);
            ctx.arc(cx, cy, innerRadius, startAngle + thisSweep, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();
          }
          startAngle += segAngle;
          drawnAngle += segAngle;
        });
      }

      resize();
      window.addEventListener('resize', resize);

      if(!reduceMotionProfit){
        const animStart = performance.now();
        const animDuration = 1300;
        function frame(now){
          const p = Math.min((now - animStart) / animDuration, 1);
          draw(1 - Math.pow(1 - p, 3));
          if(p < 1) requestAnimationFrame(frame);
        }
        setTimeout(() => requestAnimationFrame(frame), 400);
      }
    })();
  })();

  /* ============ AI PERFORMANCE OVERVIEW (Module 3C) ============ */
  (function(){
    const section = document.getElementById('aiPerformanceOverview');
    if(!section) return;

    const reduceMotionAiPerf = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate AI Performance Card counters ---- */
    function animateAiPerfCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionAiPerf){
        el.textContent = target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.trading-stat-value[data-counter]').forEach(el => animateAiPerfCounter(el, 1300));
    }, reduceMotionAiPerf ? 0 : 500);
  })();

  /* ============ AI PREDICTION ANALYTICS (Module 3D) ============ */
  (function(){
    const section = document.getElementById('aiPredictionAnalytics');
    if(!section) return;

    const reduceMotionPrediction = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- 7-day AI confidence trend (canvas line chart, no libraries) ---- */
    (function(){
      const canvas = document.getElementById('confidenceTrendChart');
      if(!canvas || !canvas.getContext) return;

      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const values = [91, 93, 95, 94, 96, 95, 97];
      const maxVal = 100;
      const minVal = 85;

      function resize(){
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(reduceMotionPrediction ? 1 : lastProgress);
      }

      function pointAt(i, w, h, paddingTop, paddingBottom, paddingSide){
        const usableW = w - paddingSide * 2;
        const usableH = h - paddingTop - paddingBottom;
        const x = paddingSide + (usableW / (values.length - 1)) * i;
        const norm = (values[i] - minVal) / (maxVal - minVal);
        const y = paddingTop + usableH * (1 - norm);
        return { x, y };
      }

      let lastProgress = reduceMotionPrediction ? 1 : 0;

      function draw(progress){
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const paddingTop = 14;
        const paddingBottom = 24;
        const paddingSide = 6;

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for(let g = 0; g <= 3; g++){
          const y = paddingTop + ((h - paddingTop - paddingBottom) / 3) * g;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        const visibleCount = Math.max(1, Math.floor(progress * (values.length - 1)) + 1);
        const points = [];
        for(let i = 0; i < visibleCount; i++){
          points.push(pointAt(i, w, h, paddingTop, paddingBottom, paddingSide));
        }

        if(points.length > 1){
          const gradient = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
          gradient.addColorStop(0, 'rgba(74,222,128,0.22)');
          gradient.addColorStop(1, 'rgba(74,222,128,0)');

          ctx.beginPath();
          ctx.moveTo(points[0].x, h - paddingBottom);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, h - paddingBottom);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = 'rgba(74,222,128,0.95)';
          ctx.lineWidth = 2.2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(74,222,128,0.5)';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;

          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(148,154,170,0.8)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        days.forEach((d, i) => {
          const p = pointAt(i, w, h, paddingTop, paddingBottom, paddingSide);
          ctx.fillText(d, p.x, h - 6);
        });
      }

      resize();
      window.addEventListener('resize', resize);

      if(!reduceMotionPrediction){
        const animStart = performance.now();
        const animDuration = 1400;
        function frame(now){
          lastProgress = Math.min((now - animStart) / animDuration, 1);
          draw(lastProgress);
          if(lastProgress < 1) requestAnimationFrame(frame);
        }
        setTimeout(() => requestAnimationFrame(frame), 400);
      }
    })();

    /* ---- AI decision breakdown rings ---- */
    (function(){
      const rings = section.querySelectorAll('.confidence-ring-fill[data-target]');
      if(!rings.length) return;

      const circumference = 2 * Math.PI * 44;

      rings.forEach(ring => {
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference;

        const target = parseInt(ring.dataset.target, 10) || 0;
        const offset = circumference * (1 - target / 100);
        const valueEl = ring.closest('.decision-ring-wrap').querySelector('.decision-ring-value');

        if(reduceMotionPrediction){
          ring.style.strokeDashoffset = offset;
          if(valueEl) valueEl.textContent = target + '%';
          return;
        }

        requestAnimationFrame(() => {
          ring.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1)';
          ring.style.strokeDashoffset = offset;
        });

        if(valueEl){
          const start = performance.now();
          const duration = 1300;
          function frame(now){
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            valueEl.textContent = Math.round(target * eased) + '%';
            if(p < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }
      });
    })();
  })();

  /* ============ AI TIMELINE & RECOMMENDATIONS (Module 3E) ============ */
  (function(){
    const section = document.getElementById('aiTimelineSection');
    if(!section) return;

    const reduceMotionTimeline = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate AI Intelligence Summary counters ---- */
    function animateTimelineCounter(el, duration){
      const target = parseFloat(el.dataset.target);
      if(Number.isNaN(target)) return;
      const suffix = el.dataset.suffix || '';
      const decimals = el.dataset.decimals !== undefined ? parseInt(el.dataset.decimals, 10) : 0;

      if(reduceMotionTimeline){
        el.textContent = target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }

      const start = performance.now();
      function frame(now){
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    setTimeout(() => {
      section.querySelectorAll('.summary-stat-value[data-counter]').forEach(el => animateTimelineCounter(el, 1200));
    }, reduceMotionTimeline ? 0 : 500);
  })();

  /* ============ XERO PAY: SUBSCRIPTION STATUS (Module 4A) ============ */
  (function(){
    const card = document.querySelector('.subscription-status-card');
    if(!card) return;

    const reduceMotionSub = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- animate the trial progress bar (page-scoped; not covered by the
       Trading Overview animator, which only runs on dashboard.html) ---- */
    setTimeout(() => {
      card.querySelectorAll('[data-bar-target]').forEach(bar => {
        const target = parseInt(bar.dataset.barTarget, 10) || 0;
        requestAnimationFrame(() => { bar.style.width = target + '%'; });
      });
    }, reduceMotionSub ? 0 : 500);

    /* ---- ripple effect on the Activate Daily Access button ---- */
    card.querySelectorAll('.rippleable').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'dash-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });
    });

    /* ---- Activate Daily Access modal ---- */
    const activateBtn = document.getElementById('activateDailyAccessBtn');
    const overlay = document.getElementById('xpModalOverlay');
    const closeBtn = document.getElementById('xpModalClose');
    const dismissBtn = document.getElementById('xpModalDismiss');
    if(!overlay) return;

    function openModal(){
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      if(closeBtn) closeBtn.focus();
    }
    function closeModal(){
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      if(activateBtn) activateBtn.focus();
    }

    if(activateBtn) activateBtn.addEventListener('click', openModal);
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    if(dismissBtn) dismissBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if(e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
    });
  })();

  /* ============ XERO PAY: DAILY ACCESS (Module 4B) ============ */
  (function(){
    const card = document.querySelector('.daily-access-card');
    const overlay = document.getElementById('xpModalOverlay');
    if(!card || !overlay) return;

    /* ---- ripple effect on the Daily Access activate button ---- */
    card.querySelectorAll('.rippleable').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'dash-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });
    });

    /* ---- open the shared "coming soon" modal (already wired to
       close/dismiss/Escape/click-outside by the Subscription Status
       module above) ---- */
    const dailyBtn = document.getElementById('dailyAccessActivateBtn');
    if(dailyBtn){
      dailyBtn.addEventListener('click', () => {
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        const closeBtn = document.getElementById('xpModalClose');
        if(closeBtn) closeBtn.focus();
      });
    }
  })();

  /* ============ XERO PAY: XERO WALLET (Module 4C) ============ */
  (function(){
    const section = document.getElementById('xeroWalletSection');
    const overlay = document.getElementById('xpModalOverlay');
    if(!section || !overlay) return;

    const modalText = document.getElementById('xpModalTitle');
    const defaultModalText = modalText ? modalText.textContent : '';
    const walletModalText = 'Wallet funding will become available after Flutterwave integration.';

    /* ---- ripple effect on the Add Funds button ---- */
    section.querySelectorAll('.rippleable').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'dash-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
      });
    });

    /* ---- open the shared modal with wallet-specific copy ---- */
    const addFundsBtn = document.getElementById('addFundsBtn');
    if(addFundsBtn){
      addFundsBtn.addEventListener('click', () => {
        if(modalText) modalText.textContent = walletModalText;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        const closeBtn = document.getElementById('xpModalClose');
        if(closeBtn) closeBtn.focus();
      });
    }

    /* ---- restore the default modal message once it's closed again,
       so the Subscription/Daily Access buttons keep showing their own
       text next time they open it. These listeners only reset the
       text — the existing close/hide behavior is untouched. ---- */
    function restoreDefaultText(){
      if(modalText) modalText.textContent = defaultModalText;
    }
    const closeBtnEl = document.getElementById('xpModalClose');
    const dismissBtnEl = document.getElementById('xpModalDismiss');
    if(closeBtnEl) closeBtnEl.addEventListener('click', restoreDefaultText);
    if(dismissBtnEl) dismissBtnEl.addEventListener('click', restoreDefaultText);
    overlay.addEventListener('click', (e) => {
      if(e.target === overlay) restoreDefaultText();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') restoreDefaultText();
    });
  })();

})();
