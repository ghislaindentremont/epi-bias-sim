/* Module 3: confounding — stratification, Mantel-Haenszel, regression adjustment, IPTW. */
const ConfoundingModule = (() => {
  const PRESETS = {
    lab: { label: 'Physical activity → diabetes, confounded by age/BMI (lab-like)', v: { n: 8245, pz: 0.5, px0: 0.70, orZX: 0.30, py00: 0.02, orXY: 0.80, orZY: 8, orInt: 1 } },
    none: { label: 'No confounding, only non-collapsibility (OR Z→X = 1)', v: { n: 8245, pz: 0.5, px0: 0.55, orZX: 1, py00: 0.05, orXY: 2, orZY: 8, orInt: 1 } },
    positive: { label: 'Strong positive confounding, null true effect', v: { n: 8245, pz: 0.4, px0: 0.20, orZX: 5, py00: 0.04, orXY: 1, orZY: 5, orInt: 1 } },
    negative: { label: 'Negative confounding masks a harmful exposure', v: { n: 8245, pz: 0.5, px0: 0.50, orZX: 0.25, py00: 0.03, orXY: 1.8, orZY: 4, orInt: 1 } },
    interaction: { label: 'Effect modification by Z (OR differs by stratum)', v: { n: 8245, pz: 0.5, px0: 0.40, orZX: 2, py00: 0.04, orXY: 1.2, orZY: 3, orInt: 2.5 } },
  };
  let root, ctl, out, seed = 1, mode = 'expected';
  const $ = (sel) => out.querySelector(sel);

  function controlsHtml() {
    return `
      <div class="ctl-group">
        <div class="ctl-title">Scenario</div>
        <select id="cf-preset" aria-label="Preset scenario">
          <option value="">Choose a scenario…</option>
          ${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Population</div>
        ${UI.slider({ id: 'cf-n', label: 'Sample size <b>n</b>', min: 200, max: 50000, step: 100, value: 8245 })}
        ${UI.slider({ id: 'cf-pz', label: 'P(<b>Z</b> = 1) confounder prevalence', min: 0.02, max: 0.98, step: 0.01, value: 0.5 })}
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Confounder → exposure</div>
        ${UI.slider({ id: 'cf-px0', label: 'P(X = 1 | Z = 0) baseline exposure', min: 0.02, max: 0.98, step: 0.01, value: 0.70 })}
        ${UI.slider({ id: 'cf-orZX', label: 'OR <b>Z → X</b>', min: 0.1, max: 10, step: 0.05, value: 0.30, hint: '1 = Z is not associated with exposure (no confounding)' })}
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Outcome model (logistic)</div>
        ${UI.slider({ id: 'cf-py00', label: 'P(Y = 1 | X = 0, Z = 0) baseline risk', min: 0.005, max: 0.6, step: 0.005, value: 0.02 })}
        ${UI.slider({ id: 'cf-orXY', label: 'OR <b>X → Y</b> true effect (Z = 0)', min: 0.2, max: 5, step: 0.05, value: 0.80 })}
        ${UI.slider({ id: 'cf-orZY', label: 'OR <b>Z → Y</b>', min: 0.2, max: 20, step: 0.1, value: 8 })}
        ${UI.slider({ id: 'cf-orInt', label: 'OR <b>X × Z</b> interaction', min: 0.2, max: 5, step: 0.05, value: 1, hint: 'Ratio of the X → Y odds ratio in Z = 1 vs Z = 0. Keep at 1 for a single conditional OR.' })}
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Counts</div>
        <div class="row">
          <div class="seg" role="group" aria-label="Sampling mode">
            <button type="button" data-mode="expected" aria-pressed="true">Expected</button>
            <button type="button" data-mode="random" aria-pressed="false">Random draw</button>
          </div>
          <button class="btn small" type="button" id="cf-redraw" hidden>Redraw (seed <span id="cf-seed">1</span>)</button>
        </div>
      </div>`;
  }

  function init(section) {
    root = section;
    ctl = section.querySelector('.controls');
    out = section.querySelector('.results');
    ctl.innerHTML = controlsHtml();
    out.innerHTML = `
      <div class="panel"><h3>Causal structure</h3><div class="diagram" id="cf-dag"></div></div>
      <div class="panel"><div class="stat-row" id="cf-stats"></div></div>
      <div class="panel"><h3>Crude and stratum-specific tables <span class="sub">X = exposure, Y = disease</span></h3><div class="tables" id="cf-tables"></div></div>
      <div class="panel"><h3>Estimates of the X → Y odds ratio</h3><div id="cf-est"></div><div id="cf-chart"></div><p class="note" id="cf-note"></p></div>
      <div class="panel"><h3>How the crude OR drifts with the confounder–exposure association <span class="sub">everything else at its current value</span></h3><div id="cf-curve"></div></div>
      <div class="panel"><h3>Exercises</h3><div class="exercises">
        ${UI.exercise('Exercise 3.1', 'Load the lab-like scenario. The crude OR for physical activity is around 0.45 while the adjusted OR is about 0.8 — the same pattern as the NHANES models m1 and m2. Explain, using the Z → X and Z → Y odds ratios, why the crude estimate exaggerates the protective effect.', 'Older, higher-BMI people (Z = 1) are both less active (OR Z→X = 0.3) and much more likely to have diabetes (OR Z→Y = 8). The inactive group is therefore enriched with high-risk people, which makes activity look more protective than it is.')}
        ${UI.exercise('Exercise 3.2', 'Set OR Z → X to exactly 1 so Z is no longer a confounder. The crude and adjusted ORs still differ. Why is this not confounding, and what would you expect if you compared prevalence ratios instead?', 'This is non-collapsibility of the odds ratio: even without confounding, the marginal OR is closer to 1 than the conditional OR whenever Z strongly predicts Y. The prevalence (risk) ratio is collapsible, so crude and standardized PRs agree in this setting. It is also why the sex–diabetes OR in the NHANES lab moved from 1.15 to 1.16 once age was in the model.')}
        ${UI.exercise('Exercise 3.3', 'Load the effect-modification scenario. The IPTW estimate and the regression-adjusted estimate now disagree even though both “adjust” for Z. Which population-level quantity does each one target?', 'Regression with X + Z (no interaction) forces one conditional OR and returns a variance-weighted compromise between the stratum ORs. IPTW re-weights each stratum to the whole population and estimates the marginal (population-average) OR — the standardized truth on the plot. With no interaction and a rare outcome they nearly coincide; with interaction they answer different questions.')}
      </div></div>
      <div class="panel" id="cf-code"></div>`;

    UI.bindControls(ctl, render);
    ctl.querySelector('#cf-preset').addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (!p) return;
      for (const [k, v] of Object.entries(p.v)) UI.setVal(ctl, `cf-${k}`, v);
      render();
    });
    ctl.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      ctl.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      ctl.querySelector('#cf-redraw').hidden = mode !== 'random';
      render();
    }));
    ctl.querySelector('#cf-redraw').addEventListener('click', () => { seed += 1; ctl.querySelector('#cf-seed').textContent = seed; render(); });
    render();
  }

  function read() {
    const g = (id) => UI.num(ctl, id);
    return { n: g('cf-n'), pz: g('cf-pz'), px0: g('cf-px0'), orZX: g('cf-orZX'), py00: g('cf-py00'), orXY: g('cf-orXY'), orZY: g('cf-orZY'), orInt: g('cf-orInt') };
  }

  /* Returns joint probabilities keyed by `${z}${x}${y}` and the conditional risks. */
  function joint(s) {
    const pX = [Stats.expit(Stats.logit(s.px0)), Stats.expit(Stats.logit(s.px0) + Math.log(s.orZX))];
    const risk = (x, z) => Stats.expit(Stats.logit(s.py00) + x * Math.log(s.orXY) + z * Math.log(s.orZY) + x * z * Math.log(s.orInt));
    const p = {};
    for (const z of [0, 1]) for (const x of [0, 1]) for (const y of [0, 1]) {
      const pz = z ? s.pz : 1 - s.pz;
      const px = x ? pX[z] : 1 - pX[z];
      const r = risk(x, z);
      p[`${z}${x}${y}`] = pz * px * (y ? r : 1 - r);
    }
    return { p, pX, risk };
  }

  function counts(s, J) {
    const keys = Object.keys(J.p);
    if (mode === 'random') {
      const rng = Stats.mulberry32(seed * 65537 + 11);
      const draws = Stats.multinomial(rng, Math.round(s.n), keys.map((k) => J.p[k]));
      return Object.fromEntries(keys.map((k, i) => [k, draws[i]]));
    }
    return Object.fromEntries(keys.map((k) => [k, J.p[k] * s.n]));
  }

  function estimate(s, N) {
    const strat = [0, 1].map((z) => ({ a: N[`${z}11`], b: N[`${z}10`], c: N[`${z}01`], d: N[`${z}00`] }));
    const crudeCells = { a: strat[0].a + strat[1].a, b: strat[0].b + strat[1].b, c: strat[0].c + strat[1].c, d: strat[0].d + strat[1].d };
    const crude = Stats.measures(crudeCells.a, crudeCells.b, crudeCells.c, crudeCells.d);
    const stratum = strat.map((t) => Stats.measures(t.a, t.b, t.c, t.d));
    const mh = Stats.mantelHaenszel(strat);
    const X = [], y = [], w = [], wIptw = [];
    const pX1 = [0, 1].map((z) => (strat[z].a + strat[z].b) / (strat[z].a + strat[z].b + strat[z].c + strat[z].d));
    for (const z of [0, 1]) for (const x of [0, 1]) for (const yy of [0, 1]) {
      X.push([x, z]); y.push(yy); w.push(N[`${z}${x}${yy}`]);
      wIptw.push(N[`${z}${x}${yy}`] / (x ? pX1[z] : 1 - pX1[z]));
    }
    const adj = Stats.logistic(X, y, w);
    const iptw = Stats.logistic(X.map((r) => [r[0]]), y, wIptw);
    return { strat, crudeCells, crude, stratum, mh, adj: Stats.coefOr(adj, 1), iptw: Stats.coefOr(iptw, 1), pX1 };
  }

  function truths(s, J) {
    const r1 = J.risk(1, 0) * (1 - s.pz) + J.risk(1, 1) * s.pz;
    const r0 = J.risk(0, 0) * (1 - s.pz) + J.risk(0, 1) * s.pz;
    return { condOr0: s.orXY, condOr1: s.orXY * s.orInt, margOr: (r1 / (1 - r1)) / (r0 / (1 - r0)), margRr: r1 / r0, r1, r0 };
  }

  function render() {
    const s = read();
    if (!Object.values(s).every((v) => isFinite(v))) return;
    const J = joint(s);
    const N = counts(s, J);
    const E = estimate(s, N);
    const T = truths(s, J);
    const noInt = Math.abs(Math.log(s.orInt)) < 1e-9;

    drawDag(s);

    const confRatio = E.crude.or.est / E.mh.est;
    $('#cf-stats').innerHTML = [
      UI.stat('Crude OR', UI.fmt(E.crude.or.est), 'ignores Z'),
      UI.stat('Adjusted OR (MH)', UI.fmt(E.mh.est), 'conditional on Z'),
      UI.stat('Crude ⁄ adjusted', UI.fmt(confRatio), `${Math.abs(Math.log(confRatio)) < 0.1 ? '<span class="badge good">little confounding</span>' : '<span class="badge crit">confounded</span>'} &nbsp;10% rule of thumb`),
      UI.stat('True marginal OR', UI.fmt(T.margOr), `standardized over Z · RR ${UI.fmt(T.margRr)}`),
    ].join('');

    $('#cf-tables').innerHTML = [
      UI.table2x2({ title: 'Crude (collapsed over Z)', series: 's2', rows: ['X = 1', 'X = 0'], cols: ['Y = 1', 'Y = 0'], cells: [[E.crudeCells.a, E.crudeCells.b], [E.crudeCells.c, E.crudeCells.d]], foot: UI.measureFoot(E.crude) }),
      UI.table2x2({ title: 'Stratum Z = 0', sub: `P(X = 1 | Z = 0) = ${UI.fmt(E.pX1[0], 3)}`, series: 's3', rows: ['X = 1', 'X = 0'], cols: ['Y = 1', 'Y = 0'], cells: [[E.strat[0].a, E.strat[0].b], [E.strat[0].c, E.strat[0].d]], foot: UI.measureFoot(E.stratum[0]) }),
      UI.table2x2({ title: 'Stratum Z = 1', sub: `P(X = 1 | Z = 1) = ${UI.fmt(E.pX1[1], 3)}`, series: 's3', rows: ['X = 1', 'X = 0'], cols: ['Y = 1', 'Y = 0'], cells: [[E.strat[1].a, E.strat[1].b], [E.strat[1].c, E.strat[1].d]], foot: UI.measureFoot(E.stratum[1]) }),
    ].join('');

    const truthOr = noInt ? T.condOr0 : T.margOr;
    $('#cf-est').innerHTML = UI.estimatesTable([
      { label: 'Crude', series: 's2', or: E.crude.or },
      { label: 'Stratum Z = 0', series: 's3', or: E.stratum[0].or, note: ` truth ${UI.fmt(T.condOr0)}` },
      { label: 'Stratum Z = 1', series: 's3', or: E.stratum[1].or, note: ` truth ${UI.fmt(T.condOr1)}` },
      { label: 'Mantel–Haenszel', series: 's3', or: E.mh },
      { label: 'Logistic Y ~ X + Z', series: 's3', or: E.adj },
      { label: 'IPTW logistic Y ~ X', series: 's3', or: E.iptw, note: ' naive SE' },
    ], { or: truthOr }, { cols: ['or'], head: { or: 'Odds ratio' } });

    const refs = [{ value: T.margOr, label: 'marginal truth' }];
    if (noInt) refs.push({ value: T.condOr0, label: 'conditional truth', series: 's1' });
    Charts.forest($('#cf-chart'), {
      title: 'X → Y odds ratio', subtitle: noInt ? 'badges compare each CI with the conditional truth' : 'with effect modification, badges compare with the marginal truth',
      rows: [
        { label: 'Crude', est: E.crude.or.est, lo: E.crude.or.lo, hi: E.crude.or.hi, series: 's2' },
        { label: 'Stratum Z = 0', est: E.stratum[0].or.est, lo: E.stratum[0].or.lo, hi: E.stratum[0].or.hi, series: 's3' },
        { label: 'Stratum Z = 1', est: E.stratum[1].or.est, lo: E.stratum[1].or.lo, hi: E.stratum[1].or.hi, series: 's3' },
        { label: 'Mantel–Haenszel', est: E.mh.est, lo: E.mh.lo, hi: E.mh.hi, series: 's3' },
        { label: 'Logistic X + Z', est: E.adj.est, lo: E.adj.lo, hi: E.adj.hi, series: 's3' },
        { label: 'IPTW', est: E.iptw.est, lo: E.iptw.lo, hi: E.iptw.hi, series: 's3', tag: 'naive SE, as in glm(weights = )' },
      ],
      refs,
      legend: [{ series: 's2', label: 'Crude' }, { series: 's3', label: 'Adjusted for Z' }],
    });
    $('#cf-note').innerHTML = noInt
      ? `The conditional truth is the OR you set (${UI.fmt(T.condOr0)}), identical in both strata. The marginal truth (${UI.fmt(T.margOr)}) is what you would see if everyone were exposed vs. no one — it sits closer to 1 whenever Z strongly predicts Y, even with no confounding. Stratified, MH and regression estimates target the conditional OR; IPTW targets the marginal one. With a rare outcome the two are close.`
      : `The X → Y odds ratio is ${UI.fmt(T.condOr0)} when Z = 0 and ${UI.fmt(T.condOr1)} when Z = 1, so there is no single conditional truth. MH and the main-effects logistic model average the strata; IPTW estimates the marginal OR (${UI.fmt(T.margOr)}), the population-average effect.`;

    const pts = [];
    for (let lg = Math.log(0.1); lg <= Math.log(10) + 1e-9; lg += (Math.log(10) - Math.log(0.1)) / 60) {
      const s2 = { ...s, orZX: Math.exp(lg) };
      const j2 = joint(s2);
      const cells = { a: 0, b: 0, c: 0, d: 0 };
      for (const z of [0, 1]) { cells.a += j2.p[`${z}11`]; cells.b += j2.p[`${z}10`]; cells.c += j2.p[`${z}01`]; cells.d += j2.p[`${z}00`]; }
      pts.push([Math.exp(lg), (cells.a * cells.d) / (cells.b * cells.c)]);
    }
    Charts.line($('#cf-curve'), {
      title: 'Crude OR as a function of OR Z → X', subtitle: 'expected counts, large-sample',
      series: [{ name: 'Crude OR', series: 's2', points: pts }],
      xlabel: 'OR Z → X (log scale)', ylabel: 'Crude OR', xlog: true,
      refs: [{ y: T.margOr, label: 'marginal truth' }].concat(noInt ? [{ y: T.condOr0, label: 'conditional truth', series: 's1' }] : []),
      marker: { x: s.orZX, y: E.crude.or.est, label: 'current' },
    });

    $('#cf-code').innerHTML = UI.codeBlock('Reproduce in R', 'simulate, then crude / adjusted / MH / IPTW as in the lab', rCode(s));
    UI.wireCopy($('#cf-code'));
  }

  function drawDag(s) {
    const box = $('#cf-dag');
    box.innerHTML = '';
    const W = 420, H = 200;
    const svg = Charts.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'DAG: Z causes X and Y; X causes Y' }, box);
    const defs = Charts.el('defs', {}, svg);
    for (const k of ['on', 'off', 'conf']) {
      const mk = Charts.el('marker', { id: `cf-head-${k}`, viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
      Charts.el('path', { d: 'M0,0 L10,5 L0,10 z', class: `ehead ${k === 'on' ? '' : k}` }, mk);
    }
    const nodes = { Z: [210, 44], X: [70, 156], Y: [350, 156] };
    const r = 22;
    const edge = (from, to, cls, label, lx, ly) => {
      const [x1, y1] = nodes[from], [x2, y2] = nodes[to];
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      const sx = x1 + (dx / d) * (r + 2), sy = y1 + (dy / d) * (r + 2), ex = x2 - (dx / d) * (r + 4), ey = y2 - (dy / d) * (r + 4);
      const head = cls.includes('off') ? 'off' : cls.includes('conf') ? 'conf' : 'on';
      Charts.el('line', { x1: sx, y1: sy, x2: ex, y2: ey, class: `edge ${cls}`, 'marker-end': `url(#cf-head-${head})` }, svg);
      Charts.el('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'edgelabel' }, svg, label);
    };
    const zxOff = Math.abs(Math.log(s.orZX)) < 1e-9, zyOff = Math.abs(Math.log(s.orZY)) < 1e-9;
    edge('Z', 'X', zxOff ? 'off' : 'conf', `OR ${UI.fmt(s.orZX)}`, 108, 88);
    edge('Z', 'Y', zyOff ? 'off' : 'conf', `OR ${UI.fmt(s.orZY)}`, 316, 88);
    edge('X', 'Y', '', `OR ${UI.fmt(s.orXY)}${Math.abs(Math.log(s.orInt)) > 1e-9 ? ` (Z=0) · ${UI.fmt(s.orXY * s.orInt)} (Z=1)` : ''}`, 210, 182);
    for (const [k, [x, y]] of Object.entries(nodes)) {
      Charts.el('circle', { cx: x, cy: y, r, class: `node ${k === 'Z' ? 'z' : ''}` }, svg);
      Charts.el('text', { x, y: y + 6, 'text-anchor': 'middle', class: 'mid' }, svg, k);
    }
    Charts.el('text', { x: 210, y: 14, 'text-anchor': 'middle', class: 'small' }, svg, `Z · confounder (prevalence ${UI.fmt(s.pz, 2)})`);
    Charts.el('text', { x: 70, y: 192, 'text-anchor': 'middle', class: 'small' }, svg, 'X · exposure');
    Charts.el('text', { x: 350, y: 192, 'text-anchor': 'middle', class: 'small' }, svg, 'Y · disease');
    Charts.el('text', { x: 20, y: 20, class: 'small' }, svg, zxOff ? 'Z → X switched off: no confounding' : '');
  }

  function rCode(s) {
    return `set.seed(${seed})
n <- ${Math.round(s.n)}

# Confounder, exposure given confounder, outcome given both (logistic models)
Z <- rbinom(n, 1, ${s.pz})
X <- rbinom(n, 1, plogis(qlogis(${s.px0}) + log(${s.orZX}) * Z))
Y <- rbinom(n, 1, plogis(qlogis(${s.py00}) + log(${s.orXY}) * X + log(${s.orZY}) * Z + log(${s.orInt}) * X * Z))
df <- data.frame(X, Y, Z)

# Crude and covariate-adjusted logistic regression (as in m1 and m2)
m1 <- glm(Y ~ X,     family = "binomial", data = df); exp(coef(m1)["X"])
m2 <- glm(Y ~ X + Z, family = "binomial", data = df); exp(coef(m2)["X"])

# Stratified 2x2 tables and Mantel-Haenszel
tab <- table(X = factor(df$X, levels = c(1, 0)), Y = factor(df$Y, levels = c(1, 0)), Z = df$Z)
tab[, , "0"]; tab[, , "1"]
mantelhaen.test(tab)

# Inverse probability of treatment weights (as in m_PT and m_IPTWs)
m_PT <- glm(X ~ Z, family = "binomial", data = df)
df$probs <- predict(m_PT, type = "response")
df$IPTWs <- ifelse(df$X == 1, 1 / df$probs, 1 / (1 - df$probs))
m_IPTWs <- glm(Y ~ X, data = df, weights = IPTWs, family = "binomial")
exp(coef(m_IPTWs)["X"])        # marginal OR; the SE printed by summary() is biased

# Truths implied by the data-generating model
risk <- function(x, z) plogis(qlogis(${s.py00}) + log(${s.orXY}) * x + log(${s.orZY}) * z + log(${s.orInt}) * x * z)
r1 <- risk(1, 0) * (1 - ${s.pz}) + risk(1, 1) * ${s.pz}   # everyone exposed
r0 <- risk(0, 0) * (1 - ${s.pz}) + risk(0, 1) * ${s.pz}   # no one exposed
(r1 / (1 - r1)) / (r0 / (1 - r0))                        # marginal OR
`;
  }

  return { init, render };
})();
