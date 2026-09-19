/* Module 1: selection bias with inverse probability of selection weights. */
const SelectionModule = (() => {
  const POP = { A: 403, B: 4506, C: 357, D: 4592 };
  const PRESETS = {
    srs: { label: 'Simple random sample (all 0.10)', p: [0.1, 0.1, 0.1, 0.1] },
    exposedCases: { label: 'Exposed cases over-recruited (Berkson-like)', p: [0.3, 0.1, 0.1, 0.1] },
    lostExposedCases: { label: 'Exposed cases lost (differential non-response)', p: [0.04, 0.1, 0.1, 0.1] },
    exposureOnly: { label: 'Selection depends on exposure only', p: [0.25, 0.25, 0.08, 0.08] },
    diseaseOnly: { label: 'Selection depends on disease only (case-control style)', p: [0.8, 0.05, 0.8, 0.05] },
    both: { label: 'Depends on both, but independently', p: [0.4, 0.05, 0.2, 0.025] },
  };
  let root, ctl, out, seed = 1, mode = 'expected';
  const $ = (sel) => out.querySelector(sel);

  function controlsHtml() {
    return `
      <div class="ctl-group">
        <div class="ctl-title">Population 2×2 <span class="hint" style="text-transform:none;letter-spacing:0">NHANES 2009–12</span></div>
        <div class="pop-grid">
          <span></span><span class="hd">Diabetes</span><span class="hd">No diabetes</span>
          <span class="rl">Male (exposed)</span><input type="number" id="sel-A" min="1" step="1" value="${POP.A}" aria-label="Cell A"><input type="number" id="sel-B" min="1" step="1" value="${POP.B}" aria-label="Cell B">
          <span class="rl">Female (unexposed)</span><input type="number" id="sel-C" min="1" step="1" value="${POP.C}" aria-label="Cell C"><input type="number" id="sel-D" min="1" step="1" value="${POP.D}" aria-label="Cell D">
        </div>
        <button class="btn small" type="button" id="sel-reset-pop">Reset to NHANES</button>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Selection probabilities</div>
        <select id="sel-preset" aria-label="Preset scenario">
          <option value="">Choose a scenario…</option>
          ${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
        ${UI.slider({ id: 'sel-alpha', label: '<b>α</b> exposed &amp; diseased (A → a)', min: 0.01, max: 1, step: 0.01, value: 0.30 })}
        ${UI.slider({ id: 'sel-beta', label: '<b>β</b> exposed &amp; not diseased (B → b)', min: 0.01, max: 1, step: 0.01, value: 0.10 })}
        ${UI.slider({ id: 'sel-gamma', label: '<b>γ</b> unexposed &amp; diseased (C → c)', min: 0.01, max: 1, step: 0.01, value: 0.10 })}
        ${UI.slider({ id: 'sel-delta', label: '<b>δ</b> unexposed &amp; not diseased (D → d)', min: 0.01, max: 1, step: 0.01, value: 0.10 })}
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Sample counts</div>
        <div class="row">
          <div class="seg" role="group" aria-label="Sampling mode">
            <button type="button" data-mode="expected" aria-pressed="true">Expected (N × p)</button>
            <button type="button" data-mode="random" aria-pressed="false">Random draw</button>
          </div>
          <button class="btn small" type="button" id="sel-redraw" hidden>Redraw (seed <span id="sel-seed">1</span>)</button>
        </div>
        <span class="hint">Expected counts show the bias itself. A random draw (each person kept with probability p) adds sampling variability on top.</span>
      </div>`;
  }

  function init(section) {
    root = section;
    ctl = section.querySelector('.controls');
    out = section.querySelector('.results');
    ctl.innerHTML = controlsHtml();
    out.innerHTML = `
      <div class="panel"><h3>Who gets in <span class="sub">selection probabilities applied to each population cell</span></h3><div class="diagram" id="sel-diagram"></div></div>
      <div class="panel"><h3>Population, sample, and re-weighted sample</h3><div class="tables" id="sel-tables"></div></div>
      <div class="panel"><div class="stat-row" id="sel-stats"></div></div>
      <div class="panel"><h3>Effect measures <span class="sub">exposure = male sex, disease = diabetes</span></h3><div id="sel-est"></div><div id="sel-chart"></div></div>
      <div class="panel"><h3>Which measures survive this selection?</h3><div id="sel-conditions" class="prose"></div></div>
      <div class="panel"><h3>Exercises</h3><div class="exercises">
        ${UI.exercise('Exercise 1.1', 'Change the selection probabilities to get a sample whose 95% CI for the odds ratio does not include the population value of 1.15. Describe what you did and why it makes sense that the estimate is biased.', 'The OR is distorted by the factor αδ / βγ. Any change that breaks that balance (e.g. recruiting exposed cases more eagerly) will do it — but you also need enough people in the sample for the CI to be narrow enough to exclude 1.15.')}
        ${UI.exercise('Exercise 1.2', 'Using the values from your biased sample, apply inverse probability of selection weights by hand: divide each cell by its selection probability and recompute the OR. Explain in plain language why this works.', 'Each sampled person “stands in” for 1/p people like them in the population. Dividing a cell count by its selection probability reconstructs the expected population cell; the OR of the reconstructed table is the population OR. The weights only help if you actually know (or can estimate) the selection probabilities.')}
        ${UI.exercise('Exercise 1.3', 'Find a selection pattern that leaves the OR unbiased but biases the prevalence ratio, and another that biases neither. What do these patterns have in common?', 'Try “selection depends on disease only” (a case-control design): the OR survives because αδ = βγ, but the PR and PD do not because the sample no longer has the population’s disease prevalence within each exposure group.')}
      </div></div>
      <div class="panel" id="sel-code"></div>`;

    UI.bindControls(ctl, render);
    ctl.querySelector('#sel-preset').addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (!p) return;
      ['sel-alpha', 'sel-beta', 'sel-gamma', 'sel-delta'].forEach((id, i) => UI.setVal(ctl, id, p.p[i]));
      render();
    });
    ctl.querySelector('#sel-reset-pop').addEventListener('click', () => {
      UI.setVal(ctl, 'sel-A', POP.A); UI.setVal(ctl, 'sel-B', POP.B); UI.setVal(ctl, 'sel-C', POP.C); UI.setVal(ctl, 'sel-D', POP.D); render();
    });
    ctl.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      ctl.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      ctl.querySelector('#sel-redraw').hidden = mode !== 'random';
      render();
    }));
    ctl.querySelector('#sel-redraw').addEventListener('click', () => { seed += 1; ctl.querySelector('#sel-seed').textContent = seed; render(); });
    render();
  }

  function read() {
    const g = (id) => UI.num(ctl, id);
    return { A: g('sel-A'), B: g('sel-B'), C: g('sel-C'), D: g('sel-D'), alpha: g('sel-alpha'), beta: g('sel-beta'), gamma: g('sel-gamma'), delta: g('sel-delta') };
  }

  function render() {
    const s = read();
    if (![s.A, s.B, s.C, s.D].every((v) => isFinite(v) && v > 0)) return;
    let a, b, c, d;
    if (mode === 'random') {
      const rng = Stats.mulberry32(seed * 7919 + 17);
      a = Stats.binomial(rng, s.A, s.alpha); b = Stats.binomial(rng, s.B, s.beta);
      c = Stats.binomial(rng, s.C, s.gamma); d = Stats.binomial(rng, s.D, s.delta);
    } else {
      a = s.A * s.alpha; b = s.B * s.beta; c = s.C * s.gamma; d = s.D * s.delta;
    }
    const pop = Stats.measures(s.A, s.B, s.C, s.D);
    const smp = Stats.measures(a, b, c, d);
    const biasFactor = (s.alpha * s.delta) / (s.beta * s.gamma);
    const wa = a / s.alpha, wb = b / s.beta, wc = c / s.gamma, wd = d / s.delta;
    const wm = Stats.measures(wa, wb, wc, wd);
    const ipswOr = Stats.scaleOr(smp.or, 1 / biasFactor);
    const ipsw = { or: ipswOr, pr: { est: wm.pr.est, lo: NaN, hi: NaN }, pd: { est: wm.pd.est, lo: NaN, hi: NaN } };

    drawDiagram(s, { a, b, c, d });

    $('#sel-tables').innerHTML = [
      UI.table2x2({ title: 'Population', sub: `n = ${UI.fmtCount(s.A + s.B + s.C + s.D)}`, series: 's1', rows: ['Male', 'Female'], cols: ['Diabetes', 'No diabetes'], cells: [[s.A, s.B], [s.C, s.D]], names: [['A', 'B'], ['C', 'D']], foot: UI.measureFoot(pop) }),
      UI.table2x2({ title: 'Sample', sub: `${mode === 'random' ? 'random draw' : 'expected counts'} · n = ${UI.fmtCount(a + b + c + d)}`, series: 's2', rows: ['Male', 'Female'], cols: ['Diabetes', 'No diabetes'], cells: [[a, b], [c, d]], names: [['a', 'b'], ['c', 'd']], foot: UI.measureFoot(smp) }),
      UI.table2x2({ title: 'IPSW re-weighted sample', sub: 'each cell ÷ its selection probability', series: 's3', rows: ['Male', 'Female'], cols: ['Diabetes', 'No diabetes'], cells: [[wa, wb], [wc, wd]], names: [['a/α', 'b/β'], ['c/γ', 'd/δ']], foot: UI.measureFoot(wm) }),
    ].join('');

    const ratio = smp.or.est / pop.or.est;
    $('#sel-stats').innerHTML = [
      UI.stat('Population OR', UI.fmt(pop.or.est), 'the target'),
      UI.stat('Sample OR', UI.fmt(smp.or.est), `${UI.fmt(smp.or.lo)} to ${UI.fmt(smp.or.hi)}`),
      UI.stat('Selection bias factor', UI.fmt(biasFactor), 'αδ ⁄ βγ — multiplies the true OR', mode === 'random' ? `observed ×${UI.fmt(ratio)}` : ''),
      UI.stat('Sampling fraction', `${UI.fmt(((a + b + c + d) / (s.A + s.B + s.C + s.D)) * 100, 1)}%`, `${UI.fmtCount(a + b + c + d)} of ${UI.fmtCount(s.A + s.B + s.C + s.D)} selected`),
    ].join('');

    const truth = { or: pop.or.est, pr: pop.pr.est, pd: pop.pd.est };
    $('#sel-est').innerHTML = UI.estimatesTable([
      { label: 'Population (truth)', series: 's1', or: pop.or, pr: pop.pr, pd: pop.pd, judge: false },
      { label: 'Biased sample', series: 's2', or: smp.or, pr: smp.pr, pd: smp.pd },
      { label: 'IPSW-corrected', series: 's3', or: ipsw.or, pr: ipsw.pr, pd: ipsw.pd, note: ' CI rescaled' },
    ], truth);

    Charts.forest($('#sel-chart'), {
      title: 'Prevalence odds ratio', subtitle: 'male vs female, diabetes',
      rows: [
        { label: 'Population', est: pop.or.est, lo: pop.or.lo, hi: pop.or.hi, series: 's1' },
        { label: 'Biased sample', est: smp.or.est, lo: smp.or.lo, hi: smp.or.hi, series: 's2', tag: `bias factor ${UI.fmt(biasFactor)}` },
        { label: 'IPSW-corrected', est: ipsw.or.est, lo: ipsw.or.lo, hi: ipsw.or.hi, series: 's3' },
      ],
      refs: [{ value: pop.or.est, label: 'true OR', series: 's1' }],
      legend: [{ series: 's1', label: 'Population' }, { series: 's2', label: 'Sample as drawn' }, { series: 's3', label: 'After IPSW' }],
    });

    const orOk = Math.abs(Math.log(biasFactor)) < 1e-9;
    const prOk = Math.abs(s.alpha - s.beta) < 1e-9 && Math.abs(s.gamma - s.delta) < 1e-9;
    const flag = (ok) => (ok ? '<span class="badge good">unbiased</span>' : '<span class="badge crit">biased</span>');
    $('#sel-conditions').innerHTML = `
      <p>With expected counts, the sample OR is exactly <span class="formula">OR<sub>sample</sub> = OR<sub>pop</sub> × (αδ ⁄ βγ)</span></p>
      <ul>
        <li>${flag(orOk)} <b>Odds ratio</b> — unbiased whenever αδ = βγ, i.e. selection can depend on exposure, on disease, or on both <em>independently</em>; it is only distorted when the two act jointly. Currently αδ ⁄ βγ = ${UI.fmt(biasFactor, 3)}.</li>
        <li>${flag(prOk)} <b>Prevalence ratio and prevalence difference</b> — these need the disease prevalence <em>within each exposure group</em> to be preserved, so selection must not depend on disease at all (α = β and γ = δ). Currently α − β = ${UI.fmt(s.alpha - s.beta)} and γ − δ = ${UI.fmt(s.gamma - s.delta)}.</li>
      </ul>
      <p>This is why case-control studies (selection on disease) can estimate an OR but not a prevalence or risk ratio, and why a cross-sectional survey with response depending on both sex and diabetes status gets neither right.</p>`;

    $('#sel-code').innerHTML = UI.codeBlock('Reproduce in R', 'epiR · matches the current settings', rCode(s));
    UI.wireCopy($('#sel-code'));
  }

  function drawDiagram(s, smp) {
    const box = $('#sel-diagram');
    box.innerHTML = '';
    const W = 470, H = 320;
    const svg = Charts.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Selection diagram: population cells A–D are sampled into a–d with probabilities alpha–delta' }, box);
    const defs = Charts.el('defs', {}, svg);
    const mk = Charts.el('marker', { id: 'sel-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    Charts.el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' }, mk);
    const L = 120, R = 450, T = 44, B = 300, MX = (L + R) / 2, MY = (T + B) / 2;
    Charts.el('rect', { x: L, y: T, width: R - L, height: B - T, class: 'box' }, svg);
    Charts.el('line', { x1: MX, x2: MX, y1: T, y2: B, class: 'box' }, svg);
    Charts.el('line', { x1: L, x2: R, y1: MY, y2: MY, class: 'box' }, svg);
    Charts.el('text', { x: (L + MX) / 2, y: T - 12, 'text-anchor': 'middle', class: 'mid' }, svg, 'Diseased');
    Charts.el('text', { x: (MX + R) / 2, y: T - 12, 'text-anchor': 'middle', class: 'mid' }, svg, 'Not diseased');
    Charts.el('text', { x: L - 10, y: (T + MY) / 2 + 6, 'text-anchor': 'end', class: 'mid' }, svg, 'Exposed');
    Charts.el('text', { x: L - 10, y: (MY + B) / 2 + 6, 'text-anchor': 'end', class: 'mid' }, svg, 'Unexposed');
    const iw = 78, ih = 56;
    Charts.el('rect', { x: MX - iw, y: MY - ih, width: iw * 2, height: ih * 2, class: 'inner' }, svg);
    const corner = [
      { k: 'A', v: s.A, x: L + 22, y: T + 34, cx: MX - iw / 2, cy: MY - ih / 2, g: 'α', p: s.alpha, sv: smp.a, sk: 'a' },
      { k: 'B', v: s.B, x: R - 22, y: T + 34, cx: MX + iw / 2, cy: MY - ih / 2, g: 'β', p: s.beta, sv: smp.b, sk: 'b' },
      { k: 'C', v: s.C, x: L + 22, y: B - 16, cx: MX - iw / 2, cy: MY + ih / 2, g: 'γ', p: s.gamma, sv: smp.c, sk: 'c' },
      { k: 'D', v: s.D, x: R - 22, y: B - 16, cx: MX + iw / 2, cy: MY + ih / 2, g: 'δ', p: s.delta, sv: smp.d, sk: 'd' },
    ];
    for (const c of corner) {
      Charts.el('text', { x: c.x, y: c.y, 'text-anchor': 'middle', class: 'big' }, svg, c.k);
      Charts.el('text', { x: c.x, y: c.y + (c.k < 'C' ? 14 : -22), 'text-anchor': 'middle', class: 'small' }, svg, UI.fmtCount(c.v));
      const sx = c.x + (c.x < MX ? 18 : -18), sy = c.y + (c.k < 'C' ? -4 : -10);
      const ex = c.cx + (c.x < MX ? -22 : 22), ey = c.cy + (c.k < 'C' ? -8 : 8);
      const qx = (sx + ex) / 2 + (c.x < MX ? 14 : -14), qy = (sy + ey) / 2 + (c.k < 'C' ? -8 : 8);
      Charts.el('path', { d: `M${sx},${sy} Q${qx},${qy} ${ex},${ey}`, class: 'arrow', 'marker-end': 'url(#sel-arrow)' }, svg);
      Charts.el('text', { x: qx + (c.x < MX ? 10 : -10), y: qy + (c.k < 'C' ? -6 : 14), 'text-anchor': 'middle', class: 'greek' }, svg, `${c.g} = ${c.p.toFixed(2)}`);
      Charts.el('text', { x: c.cx, y: c.cy + 4, 'text-anchor': 'middle', class: 'mid' }, svg, c.sk);
      Charts.el('text', { x: c.cx, y: c.cy + 20, 'text-anchor': 'middle', class: 'small' }, svg, UI.fmtCount(c.sv));
    }
  }

  function rCode(s) {
    const rnd = mode === 'random';
    return `library(epiR)

# Population (NHANES 2009-12): exposed = male, diseased = diabetes
TAB <- matrix(c(${s.A}, ${s.C}, ${s.B}, ${s.D}), nrow = 2)
rownames(TAB) <- c("Male", "Female")
colnames(TAB) <- c("Diabetes", "No Diabetes")
epi.2by2(TAB, method = "cross.sectional")     # population OR

# Selection probabilities for cells A, B, C, D
alpha <- ${s.alpha}; beta <- ${s.beta}; gamma <- ${s.gamma}; delta <- ${s.delta}
${rnd ? `set.seed(${seed})
a1 <- rbinom(1, TAB[1,1], alpha)               # each person kept with prob. alpha
b1 <- rbinom(1, TAB[1,2], beta)
c1 <- rbinom(1, TAB[2,1], gamma)
d1 <- rbinom(1, TAB[2,2], delta)` : `a1 <- TAB[1,1] * alpha                          # expected counts (not rounded)
b1 <- TAB[1,2] * beta
c1 <- TAB[2,1] * gamma
d1 <- TAB[2,2] * delta`}
TAB1 <- matrix(c(a1, c1, b1, d1), nrow = 2, dimnames = dimnames(TAB))
epi.2by2(round(TAB1), method = "cross.sectional")   # biased sample OR
(a1 * d1) / (b1 * c1)                                # same OR, by hand

# Inverse probability of selection weights: divide each cell by its
# selection probability so it "stands in" for the population cell
TAB_w <- TAB1 / matrix(c(alpha, gamma, beta, delta), nrow = 2)
(TAB_w[1,1] * TAB_w[2,2]) / (TAB_w[1,2] * TAB_w[2,1])   # IPSW-corrected OR
(alpha * delta) / (beta * gamma)                          # bias factor on the OR
`;
  }

  return { init, render };
})();
