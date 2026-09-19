/* Page wiring: hash navigation, theme toggle, module init, re-render on resize. */
(() => {
  const modules = { selection: SelectionModule, measurement: MeasurementModule, confounding: ConfoundingModule };
  const ids = ['overview', ...Object.keys(modules)];

  function show(id) {
    if (!ids.includes(id)) id = 'overview';
    document.querySelectorAll('.module').forEach((m) => m.classList.toggle('active', m.id === id));
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (modules[id]) modules[id].render();
    window.scrollTo({ top: 0 });
  }

  function route() { show((location.hash || '#overview').slice(1)); }

  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch { /* storage unavailable */ }
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    for (const [id, mod] of Object.entries(modules)) mod.init(document.getElementById(id));
    initTheme();
    window.addEventListener('hashchange', route);
    route();
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { const active = document.querySelector('.module.active'); if (active && modules[active.id]) modules[active.id].render(); }, 150);
    });
  });
})();
