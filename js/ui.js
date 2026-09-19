/* UI helpers shared by the three modules. */
const UI = (() => {
  function fmt(v, d = 2) {
    if (v == null || !isFinite(v)) return '–';
    return v.toFixed(d);
  }
  function fmtInt(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '–'; }
  function fmtCount(v) {
    if (!isFinite(v)) return '–';
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  function ci(m, d = 2) {
    if (!isFinite(m.lo) || !isFinite(m.hi)) return `${fmt(m.est, d)} <span class="dim">(point estimate)</span>`;
    return `${fmt(m.est, d)} (${fmt(m.lo, d)}, ${fmt(m.hi, d)})`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function slider({ id, label, min, max, step, value, hint }) {
    return `<div class="ctl">
      <label for="${id}">${label}</label>
      <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label.replace(/<[^>]+>/g, ''))} value">
      <input type="range" id="${id}-r" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label.replace(/<[^>]+>/g, ''))} slider" tabindex="-1">
      ${hint ? `<span class="hint" style="grid-column: 1 / -1">${hint}</span>` : ''}
    </div>`;
  }

  /* Wire every number/range pair inside root; call onChange on any input change. */
  function bindControls(root, onChange) {
    root.querySelectorAll('input[type="number"]').forEach((num) => {
      const range = root.querySelector(`#${CSS.escape(num.id)}-r`);
      if (range) {
        range.addEventListener('input', () => { num.value = range.value; onChange(num.id); });
        num.addEventListener('input', () => { if (num.value !== '') { range.value = num.value; onChange(num.id); } });
        num.addEventListener('change', () => {
          let v = parseFloat(num.value);
          if (!isFinite(v)) v = parseFloat(range.value);
          v = Math.min(parseFloat(num.max), Math.max(parseFloat(num.min), v));
          num.value = v; range.value = v; onChange(num.id);
        });
      } else {
        num.addEventListener('input', () => onChange(num.id));
        num.addEventListener('change', () => onChange(num.id));
      }
    });
    root.querySelectorAll('input[type="checkbox"], input[type="radio"], select').forEach((c) => c.addEventListener('change', () => onChange(c.id)));
  }

  function setVal(root, id, v) {
    const num = root.querySelector(`#${CSS.escape(id)}`);
    if (!num) return;
    if (num.type === 'checkbox') { num.checked = !!v; return; }
    num.value = v;
    const range = root.querySelector(`#${CSS.escape(id)}-r`);
    if (range) range.value = v;
  }
  function num(root, id) { return parseFloat(root.querySelector(`#${CSS.escape(id)}`).value); }
  function chk(root, id) { return root.querySelector(`#${CSS.escape(id)}`).checked; }

  /* 2x2 table. cells = [[a,b],[c,d]] with exposed row first, diseased column first. */
  function table2x2({ title, sub, rows, cols, cells, series, names, foot, decimals }) {
    const [[a, b], [c, d]] = cells;
    const f = (v) => (decimals != null ? (isFinite(v) ? v.toFixed(decimals) : '–') : fmtCount(v));
    const nm = names || [['', ''], ['', '']];
    const cn = (s) => (s ? `<span class="cellname">${s}</span>` : '');
    return `<div class="t22">
      <div class="t22-title">${series ? `<i class="swatch ${series}"></i>` : ''}${title}</div>
      ${sub ? `<div class="t22-sub">${sub}</div>` : ''}
      <table>
        <thead><tr><th></th><th>${cols[0]}</th><th>${cols[1]}</th><th class="tot">Total</th></tr></thead>
        <tbody>
          <tr><th class="rowh">${rows[0]}</th><td>${cn(nm[0][0])}${f(a)}</td><td>${cn(nm[0][1])}${f(b)}</td><td class="tot">${f(a + b)}</td></tr>
          <tr><th class="rowh">${rows[1]}</th><td>${cn(nm[1][0])}${f(c)}</td><td>${cn(nm[1][1])}${f(d)}</td><td class="tot">${f(c + d)}</td></tr>
          <tr><th class="rowh tot">Total</th><td class="tot">${f(a + c)}</td><td class="tot">${f(b + d)}</td><td class="tot">${f(a + b + c + d)}</td></tr>
        </tbody>
      </table>
      ${foot ? `<div class="t22-foot">${foot}</div>` : ''}
    </div>`;
  }

  function measureFoot(m) {
    return `<span>OR <b>${fmt(m.or.est)}</b></span><span>PR <b>${fmt(m.pr.est)}</b></span><span>PD <b>${fmt(m.pd.est * 100, 1)}%</b></span>`;
  }

  /* rows: [{label, series, or, pr, pd, tag, note}] ; truth: {or, pr, pd} for the "covers truth" badge */
  function estimatesTable(rows, truth, opts = {}) {
    const cols = opts.cols || ['or', 'pr', 'pd'];
    const head = { or: 'Prevalence OR', pr: 'Prevalence ratio', pd: 'Prevalence difference', ...(opts.head || {}) };
    const cell = (m, key) => {
      if (!m) return '<td class="num dim">–</td>';
      const d = key === 'pd' ? 3 : 2;
      return `<td class="num">${ci(m, d)}</td>`;
    };
    const badge = (m, tv) => {
      if (!m || tv == null || !isFinite(m.lo)) return '';
      const covers = m.lo <= tv && tv <= m.hi;
      return covers ? '<span class="badge good">CI covers truth</span>' : '<span class="badge crit">CI excludes truth</span>';
    };
    return `<div class="est-wrap"><table class="est">
      <thead><tr><th>Estimate</th>${cols.map((c) => `<th class="num">${head[c]} (95% CI)</th>`).join('')}${truth ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><span class="lbl">${r.series ? `<i class="swatch ${r.series}"></i>` : ''}${r.label}${r.note ? `<span class="dim">${r.note}</span>` : ''}</span></td>
        ${cols.map((c) => cell(r[c], c)).join('')}
        ${truth ? `<td>${r.judge === false ? '' : badge(r[cols[0]], truth[cols[0]])}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function codeBlock(title, sub, code) {
    return `<details class="code">
      <summary>${title}<span class="sub">${sub || ''}</span></summary>
      <div class="codebody"><button class="btn small copy" type="button" data-copy>Copy</button><pre><code>${esc(code)}</code></pre></div>
    </details>`;
  }
  function wireCopy(root) {
    root.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.parentElement.querySelector('code').textContent;
        try { await navigator.clipboard.writeText(code); btn.textContent = 'Copied'; } catch { btn.textContent = 'Select & copy'; }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });
  }

  function exercise(label, text, hintHtml) {
    return `<div class="ex"><div class="exlabel">${label}</div><p>${text}</p>${hintHtml ? `<details><summary>Hint</summary><p>${hintHtml}</p></details>` : ''}</div>`;
  }

  function stat(label, value, detail, small) {
    return `<div class="stat"><span class="sl">${label}</span><span class="sv">${value}${small ? `<small>${small}</small>` : ''}</span>${detail ? `<span class="sd">${detail}</span>` : ''}</div>`;
  }

  return { fmt, fmtInt, fmtCount, ci, esc, slider, bindControls, setVal, num, chk, table2x2, measureFoot, estimatesTable, codeBlock, wireCopy, exercise, stat };
})();
