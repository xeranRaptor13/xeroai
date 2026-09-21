/* ============ XeroAI Analytics Page ============
   Handles the time-range filter (Today/Week/Month/All Time).
   The underlying numbers are still demonstration data — switching
   ranges doesn't recompute anything yet, it just tells the user
   plainly that live range filtering isn't wired up.
   Everything else on this page (counters, charts, heatmap) is
   already handled by js/dashboard.js, which is shared across the
   dashboard-module pages. */

(function () {
  const buttons = Array.from(document.querySelectorAll('.range-filter-btn'));
  const note = document.getElementById('rangeFilterNote');
  if (!buttons.length) return;

  function setNote(label) {
    if (!note) return;
    note.textContent = `Showing demo data (labeled "${label}") — live range filtering arrives after backend integration.`;
    clearTimeout(note._t);
    note._t = setTimeout(() => { note.textContent = ''; }, 4000);
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      setNote(btn.textContent.trim());
    });
  });
})();
