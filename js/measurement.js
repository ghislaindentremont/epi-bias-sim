/* Module 2: measurement (information) bias — misclassification of disease and exposure. */
const MeasurementModule = (() => {
  const POP = { A: 403, B: 4506, C: 357, D: 4592 };
  const PRESETS = {
    perfect: { label: 'Perfect measurement', v: { seD: 1, spD: 1, seE: 1, spE: 1, diffD: false, diffE: false } },
    ndD: { label: 'Non-differential disease misclassification (Se 0.70, Sp 0.95)', v: { seD: 0.7, spD: 0.95, seE: 1, spE: 1, diffD: false, diffE: false } },
    ndDsp: { label: 'Imperfect specificity only (Se 1.00, Sp 0.90)', v: { seD: 1, spD: 0.9, seE: 1, spE: 1, diffD: false, diffE: false } },
    diffD: { label: 'Differential: disease detected more often in exposed', v: { seD: 0.9, spD: 0.97, seD0: 0.6, spD0: 0.97, seE: 1, spE: 1, diffD: true, diffE: false } },
    ndE: { label: 'Non-differential exposure misclassification (Se 0.80, Sp 0.85)', v: { seD: 1, spD: 1, seE: 0.8, spE: 0.85, diffD: false, diffE: false } },
    recall: { label: 'Recall bias: cases report exposure more completely', v: { seD: 1, spD: 1, seE: 0.95, spE: 0.9, seE0: 0.7, spE0: 0.9, diffD: false, diffE: true } },
  };
  let root, ctl, out, seed = 1, mode = 'expected';
  const $ = (sel) => out.querySelector(sel);

  function controlsHtml() {
    return `
      <div class="ctl-group">
        <div class="ctl-title">True population 2×2</div>
        <div class="pop-grid">
          <span></span><span class="hd">Diseased</span><span class="hd">Not diseased</span>
          <span class="rl">Exposed</span><input type="number" id="ms-A" min="1" step="1" value="${POP.A}" aria-label="True cell A"><input type="number" id="ms-B" min="1" step="1" value="${POP.B}" aria-label="True cell B">
          <span class="rl">Unexposed</span><input type="number" id="ms-C" min="1" step="1" value="${POP.C}" aria-label="True cell C"><input type="number" id="ms-D" min="1" step="1" value="${POP.D}" aria-label="True cell D">
        </div>
        <span class="hint">Defaults: NHANES male/female × diabetes (true OR 1.15, prevalence ≈ 8%).</span>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Scenario</div>
        <select id="ms-preset" aria-label="Preset scenario">
          <option value="">Choose a scenario…</option>
          ${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Disease classification <label class="check" style="text-transform:none;letter-spacing:0;font-weight:400"><input type="checkbox" id="ms-diffD"> differential by exposure</label></div>
        <div id="ms-D-nd">
          ${UI.slider({ id: 'ms-seD', label: 'Sensitivity <b>Se<sub>D</sub></b>', min: 0.3, max: 1, step: 0.01, value: 0.70 })}
          ${UI.slider({ id: 'ms-spD', label: 'Specificity <b>Sp<sub>D</sub></b>', min: 0.7, max: 1, step: 0.005, value: 0.95 })}
        </div>
        <div id="ms-D-diff" hidden>
          ${UI.slider({ id: 'ms-seD1', label: 'Se<sub>D</sub> among <b>exposed</b>', min: 0.3, max: 1, step: 0.01, value: 0.90 })}
          ${UI.slider({ id: 'ms-spD1', label: 'Sp<sub>D</sub> among <b>exposed</b>', min: 0.7, max: 1, step: 0.005, value: 0.97 })}
          ${UI.slider({ id: 'ms-seD0', label: 'Se<sub>D</sub> among <b>unexposed</b>', min: 0.3, max: 1, step: 0.01, value: 0.60 })}
          ${UI.slider({ id: 'ms-spD0', label: 'Sp<sub>D</sub> among <b>unexposed</b>', min: 0.7, max: 1, step: 0.005, value: 0.97 })}
        </div>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Exposure classification <label class="check" style="text-transform:none;letter-spacing:0;font-weight:400"><input type="checkbox" id="ms-diffE"> differential by disease</label></div>
        <div id="ms-E-nd">
          ${UI.slider({ id: 'ms-seE', label: 'Sensitivity <b>Se<sub>E</sub></b>', min: 0.3, max: 1, step: 0.01, value: 1 })}
          ${UI.slider({ id: 'ms-spE', label: 'Specificity <b>Sp<sub>E</sub></b>', min: 0.5, max: 1, step: 0.01, value: 1 })}
        </div>
        <div id="ms-E-diff" hidden>
          ${UI.slider({ id: 'ms-seE1', label: 'Se<sub>E</sub> among <b>diseased</b>', min: 0.3, max: 1, step: 0.01, value: 0.95 })}
          ${UI.slider({ id: 'ms-spE1', label: 'Sp<sub>E</sub> among <b>diseased</b>', min: 0.5, max: 1, step: 0.01, value: 0.90 })}
          ${UI.slider({ id: 'ms-seE0', label: 'Se<sub>E</sub> among <b>not diseased</b>', min: 0.3, max: 1, step: 0.01, value: 0.70 })}
          ${UI.slider({ id: 'ms-spE0', label: 'Sp<sub>E</sub> among <b>not diseased</b>', min: 0.5, max: 1, step: 0.01, value: 0.90 })}
        </div>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Bias correction</div>
        <label class="check"><input type="checkbox" id="ms-knowTrue" checked> analyst knows the true Se / Sp (including any differential values)</label>
        <div id="ms-assumed" hidden>
          ${UI.slider({ id: 'ms-aseD', label: 'Assumed Se<sub>D</sub>', min: 0.3, max: 1, step: 0.01, value: 0.70 })}
          ${UI.slider({ id: 'ms-aspD', label: 'Assumed Sp<sub>D</sub>', min: 0.7, max: 1, step: 0.005, value: 0.95 })}
          ${UI.slider({ id: 'ms-aseE', label: 'Assumed Se<sub>E</sub>', min: 0.3, max: 1, step: 0.01, value: 1 })}
          ${UI.slider({ id: 'ms-aspE', label: 'Assumed Sp<sub>E</sub>', min: 0.5, max: 1, step: 0.01, value: 1 })}
          <span class="hint">Assumed values are applied non-differentially, as an analyst typically would.</span>
        </div>
      </div>
      <div class="ctl-group">
        <div class="ctl-title">Observed counts</div>
        <div class="row">
          <div class="seg" role="group" aria-label="Sampling mode">
            <button type="button" data-mode="expected" aria-pressed="true">Expected</button>
            <button type="button" data-mode="random" aria-pressed="false">Random draw</button>
          </div>
          <button class="btn small" type="button" id="ms-redraw" hidden>Redraw (seed <span id="ms-seed">1</span>)</button>
        </div>
      </div>`;
  }

  function init(section) {
    root = section;
    ctl = section.querySelector('.controls');
    out = section.querySelector('.results');
    ctl.innerHTML = controlsHtml();
    out.innerHTML = `
      <div class="panel"><h3>How each true cell is redistributed <span class="sub">classification probabilities, given true status</span></h3><div class="diagram" id="ms-diagram"></div></div>
      <div class="panel"><h3>True, observed, and corrected tables</h3><div class="tables" id="ms-tables"></div></div>
      <div class="panel"><div class="stat-row" id="ms-stats"></div></div>
      <div class="panel"><h3>Effect measures</h3><div id="ms-est"></div><div id="ms-chart"></div></div>
      <div class="panel"><h3>Sensitivity vs. specificity of the disease measure <span class="sub">holding everything else at its current value</span></h3>
        <div class="tables"><div id="ms-curve-se"></div><div id="ms-curve-sp"></div></div>
        <p class="note" id="ms-curve-note"></p></div>
      <div class="panel"><h3>Exercises</h3><div class="exercises">
        ${UI.exercise('Exercise 2.1', 'With perfect exposure measurement, lower the sensitivity of the diabetes measure to 0.60 while keeping specificity at 1.00. Then instead lower specificity to 0.90 with sensitivity at 1.00. Which change moves the OR further, and why does that depend on the prevalence of diabetes?', 'Diabetes prevalence is about 8%. With Sp = 0.90, 10% of the ~9,000 non-diabetics are counted as diabetic — more false positives than there are true cases. Imperfect sensitivity only removes a fraction of 760 true cases. False positives dilute the contrast far more when the disease is rare.')}
        ${UI.exercise('Exercise 2.2', 'Non-differential misclassification of a binary variable is often said to bias ratio measures “toward the null”. Confirm this with several settings, then construct a differential scenario in which the observed OR is further from 1 than the truth.', 'Tick “differential by exposure” and give the exposed a higher sensitivity than the unexposed (e.g. more medical contact → more diagnoses). The exposed group gains apparent cases; the OR inflates away from 1.15.')}
        ${UI.exercise('Exercise 2.3', 'Correct the observed table using assumed sensitivity and specificity. Untick “analyst knows the true Se / Sp” and get the assumed specificity wrong by 0.02. How far off is the corrected OR? Can the corrected table produce impossible counts?', 'Correction inverts the classification matrix; when the assumed specificity is lower than the true one, more observed positives are attributed to false positives than exist, which can push a corrected cell below zero. Small errors in Sp matter most for rare outcomes.')}
      </div></div>
      <div class="panel" id="ms-code"></div>`;

    UI.bindControls(ctl, onChange);
    ctl.querySelector('#ms-preset').addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (!p) return;
      const v = p.v;
      UI.setVal(ctl, 'ms-seD', v.seD); UI.setVal(ctl, 'ms-spD', v.spD); UI.setVal(ctl, 'ms-seE', v.seE); UI.setVal(ctl, 'ms-spE', v.spE);
      UI.setVal(ctl, 'ms-seD1', v.seD); UI.setVal(ctl, 'ms-spD1', v.spD); UI.setVal(ctl, 'ms-seD0', v.seD0 ?? v.seD); UI.setVal(ctl, 'ms-spD0', v.spD0 ?? v.spD);
      UI.setVal(ctl, 'ms-seE1', v.seE); UI.setVal(ctl, 'ms-spE1', v.spE); UI.setVal(ctl, 'ms-seE0', v.seE0 ?? v.seE); UI.setVal(ctl, 'ms-spE0', v.spE0 ?? v.spE);
      UI.setVal(ctl, 'ms-diffD', v.diffD); UI.setVal(ctl, 'ms-diffE', v.diffE);
      onChange('ms-diffD');
    });
    ctl.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      ctl.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      ctl.querySelector('#ms-redraw').hidden = mode !== 'random';
      render();
    }));
    ctl.querySelector('#ms-redraw').addEventListener('click', () => { seed += 1; ctl.querySelector('#ms-seed').textContent = seed; render(); });
    render();
  }

  function onChange(id) {
    const diffD = UI.chk(ctl, 'ms-diffD'), diffE = UI.chk(ctl, 'ms-diffE'), know = UI.chk(ctl, 'ms-knowTrue');
    ctl.querySelector('#ms-D-nd').hidden = diffD; ctl.querySelector('#ms-D-diff').hidden = !diffD;
    ctl.querySelector('#ms-E-nd').hidden = diffE; ctl.querySelector('#ms-E-diff').hidden = !diffE;
    ctl.querySelector('#ms-assumed').hidden = know;
    if (id === 'ms-diffD' && diffD) { UI.setVal(ctl, 'ms-seD1', UI.num(ctl, 'ms-seD')); UI.setVal(ctl, 'ms-spD1', UI.num(ctl, 'ms-spD')); }
    if (id === 'ms-diffE' && diffE) { UI.setVal(ctl, 'ms-seE1', UI.num(ctl, 'ms-seE')); UI.setVal(ctl, 'ms-spE1', UI.num(ctl, 'ms-spE')); }
    if (know) {
      const s = read();
      UI.setVal(ctl, 'ms-aseD', s.seD[1]); UI.setVal(ctl, 'ms-aspD', s.spD[1]); UI.setVal(ctl, 'ms-aseE', s.seE[1]); UI.setVal(ctl, 'ms-aspE', s.spE[1]);
    }
    render();
  }

  /* seD[e] = sensitivity of disease measure given true exposure e; seE[d] given true disease d. */
  function read() {
    const g = (id) => UI.num(ctl, id);
    const diffD = UI.chk(ctl, 'ms-diffD'), diffE = UI.chk(ctl, 'ms-diffE');
    return {
      A: g('ms-A'), B: g('ms-B'), C: g('ms-C'), D: g('ms-D'), diffD, diffE,
      seD: diffD ? [g('ms-seD0'), g('ms-seD1')] : [g('ms-seD'), g('ms-seD')],
      spD: diffD ? [g('ms-spD0'), g('ms-spD1')] : [g('ms-spD'), g('ms-spD')],
      seE: diffE ? [g('ms-seE0'), g('ms-seE1')] : [g('ms-seE'), g('ms-seE')],
      spE: diffE ? [g('ms-spE0'), g('ms-spE1')] : [g('ms-spE'), g('ms-spE')],
      knowTrue: UI.chk(ctl, 'ms-knowTrue'),
      aseD: g('ms-aseD'), aspD: g('ms-aspD'), aseE: g('ms-aseE'), aspE: g('ms-aspE'),
    };
  }

  /* Cells ordered [a, b, c, d] = [(E1,D1), (E1,D0), (E0,D1), (E0,D0)]. Returns M with obs = M · true. */
  function classMatrix(seD, spD, seE, spE) {
    const cells = [[1, 1], [1, 0], [0, 1], [0, 0]];
    const M = cells.map(() => new Array(4).fill(0));
    cells.forEach(([e, d], j) => {
      const pE1 = e ? seE[d] : 1 - spE[d];
      const pD1 = d ? seD[e] : 1 - spD[e];
      cells.forEach(([eo, dobs], i) => {
        M[i][j] = (eo ? pE1 : 1 - pE1) * (dobs ? pD1 : 1 - pD1);
      });
    });
    return M;
  }

  function observe(trueCells, M) {
    if (mode === 'random') {
      const rng = Stats.mulberry32(seed * 104729 + 3);
      const obs = [0, 0, 0, 0];
      trueCells.forEach((n, j) => {
        const draws = Stats.multinomial(rng, Math.round(n), M.map((row) => row[j]));
        draws.forEach((k, i) => { obs[i] += k; });
      });
      return obs;
    }
    return Stats.matVec(M, trueCells);
  }

  function direction(obs, tru) {
    const lo = Math.log(obs), lt = Math.log(tru);
    if (!isFinite(lo) || !isFinite(lt)) return { text: '–', cls: 'neutral' };
    if (Math.abs(lo - lt) < 1e-6) return { text: 'no bias', cls: 'good' };
    if (Math.abs(lt) < 1e-9) return { text: 'away from the null', cls: 'crit' };
    if (Math.sign(lo) !== Math.sign(lt) && Math.abs(lo) > 1e-9) return { text: 'crossed the null', cls: 'crit' };
    return Math.abs(lo) < Math.abs(lt) ? { text: 'toward the null', cls: 'warn' } : { text: 'away from the null', cls: 'crit' };
  }

  function render() {
    const s = read();
    const trueCells = [s.A, s.B, s.C, s.D];
    if (!trueCells.every((v) => isFinite(v) && v > 0)) return;
    const M = classMatrix(s.seD, s.spD, s.seE, s.spE);
    const obs = observe(trueCells, M);
    const Ma = s.knowTrue ? M : classMatrix([s.aseD, s.aseD], [s.aspD, s.aspD], [s.aseE, s.aseE], [s.aspE, s.aspE]);
    const Minv = Stats.invert(Ma);
    const corr = Minv ? Stats.matVec(Minv, obs) : [NaN, NaN, NaN, NaN];
    const tru = Stats.measures(...trueCells);
    const ob = Stats.measures(...obs);
    const negative = corr.some((v) => v < 0);
    const cm = !negative && Minv ? Stats.measures(...corr) : null;
    const corrRow = cm
      ? { or: { est: cm.or.est, lo: NaN, hi: NaN }, pr: { est: cm.pr.est, lo: NaN, hi: NaN }, pd: { est: cm.pd.est, lo: NaN, hi: NaN } }
      : { or: { est: NaN, lo: NaN, hi: NaN }, pr: { est: NaN, lo: NaN, hi: NaN }, pd: { est: NaN, lo: NaN, hi: NaN } };

    drawDiagram(s, M);

    $('#ms-tables').innerHTML = [
      UI.table2x2({ title: 'True classification', series: 's1', rows: ['Exposed', 'Unexposed'], cols: ['Diseased', 'Not diseased'], cells: [[s.A, s.B], [s.C, s.D]], foot: UI.measureFoot(tru) }),
      UI.table2x2({ title: 'Observed (misclassified)', sub: mode === 'random' ? 'random draw' : 'expected counts', series: 's2', rows: ['Exposed*', 'Unexposed*'], cols: ['Diseased*', 'Not diseased*'], cells: [[obs[0], obs[1]], [obs[2], obs[3]]], foot: UI.measureFoot(ob) }),
      UI.table2x2({ title: 'Bias-corrected', sub: s.knowTrue ? `using the true${s.diffD || s.diffE ? ', differential' : ''} Se / Sp` : 'using the analyst’s assumed (non-differential) Se / Sp', series: 's3', rows: ['Exposed', 'Unexposed'], cols: ['Diseased', 'Not diseased'], cells: [[corr[0], corr[1]], [corr[2], corr[3]]], foot: cm ? UI.measureFoot(cm) : '<span class="badge crit">impossible (negative) counts — assumed Se/Sp inconsistent with the data</span>' }),
    ].join('');

    const dir = direction(ob.or.est, tru.or.est);
    const prevTrue = (s.A + s.C) / (s.A + s.B + s.C + s.D), prevObs = (obs[0] + obs[2]) / (obs.reduce((x, y) => x + y, 0));
    $('#ms-stats').innerHTML = [
      UI.stat('True OR', UI.fmt(tru.or.est)),
      UI.stat('Observed OR', UI.fmt(ob.or.est), `<span class="badge ${dir.cls}">${dir.text}</span>`),
      UI.stat('Disease prevalence', `${UI.fmt(prevObs * 100, 1)}%`, `true ${UI.fmt(prevTrue * 100, 1)}% → observed`),
      UI.stat('Exposure prevalence', `${UI.fmt(((obs[0] + obs[1]) / obs.reduce((x, y) => x + y, 0)) * 100, 1)}%`, `true ${UI.fmt(((s.A + s.B) / (s.A + s.B + s.C + s.D)) * 100, 1)}% → observed`),
    ].join('');

    const truth = { or: tru.or.est, pr: tru.pr.est, pd: tru.pd.est };
    $('#ms-est').innerHTML = UI.estimatesTable([
      { label: 'True', series: 's1', or: tru.or, pr: tru.pr, pd: tru.pd, judge: false },
      { label: 'Observed', series: 's2', or: ob.or, pr: ob.pr, pd: ob.pd },
      { label: 'Corrected', series: 's3', or: corrRow.or, pr: corrRow.pr, pd: corrRow.pd, judge: false, note: negative ? ' not estimable' : '' },
    ], truth);

    const rows = [
      { label: 'True', est: tru.or.est, lo: tru.or.lo, hi: tru.or.hi, series: 's1' },
      { label: 'Observed', est: ob.or.est, lo: ob.or.lo, hi: ob.or.hi, series: 's2', tag: dir.text },
    ];
    if (cm) rows.push({ label: 'Corrected', est: cm.or.est, lo: NaN, hi: NaN, series: 's3', tag: 'point estimate' });
    Charts.forest($('#ms-chart'), {
      title: 'Prevalence odds ratio', subtitle: 'true vs observed',
      rows, refs: [{ value: 1, label: 'null' }, { value: tru.or.est, label: 'true OR', series: 's1' }],
      legend: [{ series: 's1', label: 'True' }, { series: 's2', label: 'Observed' }, { series: 's3', label: 'Corrected' }],
    });

    const curve = (key) => {
      const pts = [];
      for (let v = key === 'se' ? 0.3 : 0.7; v <= 1.0001; v += 0.01) {
        const seD = key === 'se' ? [v, v] : s.seD, spD = key === 'sp' ? [v, v] : s.spD;
        const o = Stats.matVec(classMatrix(seD, spD, s.seE, s.spE), trueCells);
        pts.push([+v.toFixed(3), Stats.measures(...o).or.est]);
      }
      return pts;
    };
    Charts.line($('#ms-curve-se'), {
      title: 'Observed OR vs sensitivity', subtitle: `Sp fixed at ${s.diffD ? 'current values' : UI.fmt(s.spD[0], 3)}`,
      series: [{ name: 'Observed OR', series: 's2', points: curve('se') }],
      xlabel: 'Sensitivity of disease measure', ylabel: 'Observed OR', refs: [{ y: tru.or.est, label: 'true', series: 's1' }, { y: 1, label: 'null' }],
      marker: s.diffD ? null : { x: s.seD[0], y: ob.or.est, label: 'current' },
    });
    Charts.line($('#ms-curve-sp'), {
      title: 'Observed OR vs specificity', subtitle: `Se fixed at ${s.diffD ? 'current values' : UI.fmt(s.seD[0], 2)}`,
      series: [{ name: 'Observed OR', series: 's2', points: curve('sp') }],
      xlabel: 'Specificity of disease measure', ylabel: 'Observed OR', refs: [{ y: tru.or.est, label: 'true', series: 's1' }, { y: 1, label: 'null' }],
      marker: s.diffD ? null : { x: s.spD[0], y: ob.or.est, label: 'current' },
    });
    $('#ms-curve-note').textContent = `With disease prevalence around ${UI.fmt(prevTrue * 100, 0)}%, a small loss of specificity manufactures more false cases than a large loss of sensitivity removes true ones — so the specificity curve falls toward the null much faster. Curves use expected counts and hold exposure classification at its current setting.`;

    $('#ms-code').innerHTML = UI.codeBlock('Reproduce in R', 'simulate one row per person, then epiR', rCode(s));
    UI.wireCopy($('#ms-code'));
  }

  function drawDiagram(s, M) {
    const box = $('#ms-diagram');
    box.innerHTML = '';
    const W = 560, H = 230;
    const svg = Charts.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Classification matrix: probability each true cell is observed in each cell' }, box);
    const labels = ['Exposed, diseased (A)', 'Exposed, not (B)', 'Unexposed, diseased (C)', 'Unexposed, not (D)'];
    const obsLabels = ['E*+ D*+', 'E*+ D*−', 'E*− D*+', 'E*− D*−'];
    const x0 = 200, cw = 84, y0 = 46, rh = 40;
    Charts.el('text', { x: x0 + cw * 2, y: 16, 'text-anchor': 'middle', class: 'small' }, svg, 'Observed cell →');
    Charts.el('text', { x: 8, y: 16, class: 'small' }, svg, 'True cell ↓');
    obsLabels.forEach((l, i) => Charts.el('text', { x: x0 + cw * i + cw / 2, y: y0 - 10, 'text-anchor': 'middle', class: 'small' }, svg, l));
    labels.forEach((l, j) => {
      Charts.el('text', { x: x0 - 10, y: y0 + rh * j + rh / 2 + 4, 'text-anchor': 'end' }, svg, l);
      obsLabels.forEach((_, i) => {
        const p = M[i][j];
        const r = Charts.el('rect', { x: x0 + cw * i + 2, y: y0 + rh * j + 2, width: cw - 4, height: rh - 4, rx: 3, fill: 'var(--s2)', 'fill-opacity': (0.08 + 0.72 * p).toFixed(3) }, svg);
        r.setAttribute('stroke', 'var(--surface)');
        Charts.el('text', { x: x0 + cw * i + cw / 2, y: y0 + rh * j + rh / 2 + 4, 'text-anchor': 'middle', class: p > 0.5 ? 'onfill' : '', style: p > 0.5 ? 'fill:#fff' : '' }, svg, p.toFixed(3));
      });
    });
    Charts.el('text', { x: x0 + cw * 2, y: H - 8, 'text-anchor': 'middle', class: 'small' }, svg, 'Each true cell is spread across the observed cells with these probabilities; each row sums to 1.');
  }

  function rCode(s) {
    const v = (arr) => arr[1] === arr[0] ? `${arr[0]}` : `ifelse(pop$E == 1, ${arr[1]}, ${arr[0]})`;
    const vE = (arr) => arr[1] === arr[0] ? `${arr[0]}` : `ifelse(pop$D == 1, ${arr[1]}, ${arr[0]})`;
    return `library(epiR)
set.seed(${seed})

# True population, one row per person (NHANES: exposed = male, diseased = diabetes)
n_cells <- c(A = ${s.A}, B = ${s.B}, C = ${s.C}, D = ${s.D})
pop <- data.frame(E = rep(c(1, 1, 0, 0), times = n_cells),
                  D = rep(c(1, 0, 1, 0), times = n_cells))

# Disease classification: Se/Sp may depend on true exposure (differential)
se_D <- ${v(s.seD)}
sp_D <- ${v(s.spD)}
pop$D_obs <- ifelse(pop$D == 1, rbinom(nrow(pop), 1, se_D),
                                rbinom(nrow(pop), 1, 1 - sp_D))

# Exposure classification: Se/Sp may depend on true disease (recall bias)
se_E <- ${vE(s.seE)}
sp_E <- ${vE(s.spE)}
pop$E_obs <- ifelse(pop$E == 1, rbinom(nrow(pop), 1, se_E),
                                rbinom(nrow(pop), 1, 1 - sp_E))

lv <- function(x, yes, no) factor(x, levels = c(1, 0), labels = c(yes, no))
TAB_true <- table(lv(pop$E, "Exposed", "Unexposed"), lv(pop$D, "Diseased", "Not"))
TAB_obs  <- table(lv(pop$E_obs, "Exposed*", "Unexposed*"), lv(pop$D_obs, "Diseased*", "Not*"))
epi.2by2(TAB_true, method = "cross.sectional")
epi.2by2(TAB_obs,  method = "cross.sectional")

# Simple bias correction assuming known, non-differential Se/Sp.
# Classification matrix M (obs cell x true cell), then true = solve(M) %*% obs.
se_D_a <- ${s.aseD}; sp_D_a <- ${s.aspD}; se_E_a <- ${s.aseE}; sp_E_a <- ${s.aspE}
pE <- function(e) if (e == 1) se_E_a else 1 - sp_E_a    # P(E* = 1 | true E)
pD <- function(d) if (d == 1) se_D_a else 1 - sp_D_a    # P(D* = 1 | true D)
cells <- list(c(1, 1), c(1, 0), c(0, 1), c(0, 0))          # a, b, c, d
M <- sapply(cells, function(tr) sapply(cells, function(ob)
  (if (ob[1] == 1) pE(tr[1]) else 1 - pE(tr[1])) *
  (if (ob[2] == 1) pD(tr[2]) else 1 - pD(tr[2]))))
obs <- c(TAB_obs[1, 1], TAB_obs[1, 2], TAB_obs[2, 1], TAB_obs[2, 2])
corrected <- solve(M, obs)                               # a, b, c, d
(corrected[1] * corrected[4]) / (corrected[2] * corrected[3])   # corrected OR
`;
  }

  return { init, render };
})();
