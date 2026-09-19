/* Small SVG chart helpers: a forest plot on a log axis and a line chart. */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, parent = null, text = null) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function tooltipFor(container) {
    let t = container.querySelector('.tooltip');
    if (!t) { t = document.createElement('div'); t.className = 'tooltip'; container.appendChild(t); }
    return t;
  }

  function showTip(tip, container, x, y, html) {
    tip.innerHTML = html;
    tip.style.display = 'block';
    const cw = container.clientWidth;
    const tw = tip.offsetWidth;
    let left = x + 12;
    if (left + tw > cw - 4) left = x - tw - 12;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, y - 10)}px`;
  }

  function fmt(v, d = 2) {
    if (!isFinite(v)) return '–';
    return v.toFixed(d);
  }

  function niceLogTicks(lo, hi) {
    const base = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 8, 10, 20, 50];
    const t = base.filter((v) => v >= lo && v <= hi);
    return t.length >= 3 ? t.filter((v) => ![0.25, 5, 8].includes(v) || t.length <= 5) : base.filter((v) => v >= lo / 1.5 && v <= hi * 1.5);
  }

  /* rows: [{label, est, lo, hi, series:'s1'|'s2'|'s3', tag}]; refs: [{value, label, series}] */
  function forest(container, opts) {
    const { rows, refs = [], title, subtitle, xlabel = 'Odds ratio (log scale)', legend = [] } = opts;
    container.innerHTML = '';
    container.classList.add('chart');
    if (title) {
      const t = document.createElement('div'); t.className = 'ctitle';
      t.innerHTML = `${title}${subtitle ? `<span class="sub">${subtitle}</span>` : ''}`;
      container.appendChild(t);
    }
    const width = Math.max(320, container.clientWidth - 12);
    const labelW = width < 480 ? 118 : 170;
    const margin = { top: 8 + 13 * refs.length, right: 24, bottom: 36, left: labelW };
    const rowH = 30;
    const height = margin.top + margin.bottom + rowH * rows.length;
    const plotW = width - margin.left - margin.right;

    const vals = rows.flatMap((r) => [r.lo, r.hi, r.est]).concat(refs.map((r) => r.value)).filter((v) => isFinite(v) && v > 0);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    lo = Math.min(lo, 0.8); hi = Math.max(hi, 1.25);
    lo /= 1.15; hi *= 1.15;
    const x = (v) => margin.left + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * plotW;

    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': title || 'Forest plot' }, container);
    const ticks = niceLogTicks(lo, hi);
    for (const t of ticks) {
      el('line', { x1: x(t), x2: x(t), y1: margin.top, y2: height - margin.bottom, class: 'gridline' }, svg);
      el('text', { x: x(t), y: height - margin.bottom + 16, 'text-anchor': 'middle', class: 'tick' }, svg, String(t));
    }
    el('line', { x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom, class: 'axisline' }, svg);
    el('text', { x: margin.left + plotW / 2, y: height - 4, 'text-anchor': 'middle', class: 'tick' }, svg, xlabel);

    refs.forEach((r, i) => {
      el('line', { x1: x(r.value), x2: x(r.value), y1: margin.top - 2, y2: height - margin.bottom, class: `ref ${r.series || ''}` }, svg);
      const anchor = x(r.value) > margin.left + plotW * 0.6 ? 'end' : 'start';
      el('text', { x: x(r.value) + (anchor === 'end' ? -4 : 4), y: 12 + i * 13, 'text-anchor': anchor, class: 'reflabel' }, svg, `${r.label} ${fmt(r.value)}`);
    });

    const tip = tooltipFor(container);
    rows.forEach((r, i) => {
      const cy = margin.top + rowH * i + rowH / 2;
      const g = el('g', {}, svg);
      el('text', { x: margin.left - 10, y: cy + 4, 'text-anchor': 'end', class: 'rowlabel' }, g, r.label);
      if (isFinite(r.lo) && isFinite(r.hi)) {
        const x1 = Math.max(margin.left, x(r.lo)), x2 = Math.min(width - margin.right, x(r.hi));
        el('line', { x1, x2, y1: cy, y2: cy, class: `ci ${r.series}` }, g);
      }
      if (isFinite(r.est)) el('circle', { cx: x(r.est), cy, r: 5, class: `pt ${r.series}` }, g);
      const hit = el('rect', { x: 0, y: cy - rowH / 2, width, height: rowH, class: 'hit' }, g);
      const html = `<b>${r.label}</b><br>${fmt(r.est)} (95% CI ${fmt(r.lo)} to ${fmt(r.hi)})${r.tag ? `<br>${r.tag}` : ''}`;
      hit.addEventListener('mousemove', (e) => {
        const b = container.getBoundingClientRect();
        showTip(tip, container, e.clientX - b.left, e.clientY - b.top, html);
      });
      hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });

    if (legend.length) {
      const lg = document.createElement('div'); lg.className = 'legend';
      lg.innerHTML = legend.map((l) => `<span><i class="swatch ${l.series}"></i>${l.label}</span>`).join('');
      container.appendChild(lg);
    }
  }

  /* series: [{name, series:'s1', points:[[x,y]]}], xlabel, ylabel, ylog, refs:[{y,label}], marker:{x,y,label} */
  function line(container, opts) {
    const { series, title, subtitle, xlabel, ylabel, ylog = true, xlog = false, refs = [], marker = null, xfmt = (v) => fmt(v, 2), yfmt = (v) => fmt(v, 2) } = opts;
    container.innerHTML = '';
    container.classList.add('chart');
    if (title) {
      const t = document.createElement('div'); t.className = 'ctitle';
      t.innerHTML = `${title}${subtitle ? `<span class="sub">${subtitle}</span>` : ''}`;
      container.appendChild(t);
    }
    const width = Math.max(320, container.clientWidth - 12);
    const height = 250;
    const margin = { top: 14, right: 18, bottom: 40, left: 52 };
    const plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;

    const xs = series.flatMap((s) => s.points.map((p) => p[0]));
    const ys = series.flatMap((s) => s.points.map((p) => p[1])).concat(refs.map((r) => r.y)).filter((v) => isFinite(v) && (!ylog || v > 0));
    if (marker && isFinite(marker.y)) ys.push(marker.y);
    const xlo = Math.min(...xs), xhi = Math.max(...xs);
    let ylo = Math.min(...ys), yhi = Math.max(...ys);
    if (ylog) { ylo /= 1.1; yhi *= 1.1; } else { const pad = (yhi - ylo) * 0.08 || 0.1; ylo -= pad; yhi += pad; }
    const x = (v) => xlog
      ? margin.left + ((Math.log(v) - Math.log(xlo)) / (Math.log(xhi) - Math.log(xlo) || 1)) * plotW
      : margin.left + ((v - xlo) / (xhi - xlo || 1)) * plotW;
    const xinv = (px) => xlog
      ? Math.exp(Math.log(xlo) + ((px - margin.left) / plotW) * (Math.log(xhi) - Math.log(xlo)))
      : xlo + ((px - margin.left) / plotW) * (xhi - xlo);
    const y = (v) => ylog
      ? margin.top + plotH - ((Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo))) * plotH
      : margin.top + plotH - ((v - ylo) / (yhi - ylo)) * plotH;

    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': title || 'Line chart' }, container);
    const yticks = ylog ? niceLogTicks(ylo, yhi) : linTicks(ylo, yhi, 5);
    for (const t of yticks) {
      el('line', { x1: margin.left, x2: width - margin.right, y1: y(t), y2: y(t), class: 'gridline' }, svg);
      el('text', { x: margin.left - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg, yfmt(t));
    }
    const xticks = xlog ? niceLogTicks(xlo, xhi) : linTicks(xlo, xhi, 6);
    for (const t of xticks) {
      el('text', { x: x(t), y: height - margin.bottom + 16, 'text-anchor': 'middle', class: 'tick' }, svg, xfmt(t));
    }
    el('line', { x1: margin.left, x2: width - margin.right, y1: margin.top + plotH, y2: margin.top + plotH, class: 'axisline' }, svg);
    if (xlabel) el('text', { x: margin.left + plotW / 2, y: height - 4, 'text-anchor': 'middle', class: 'tick' }, svg, xlabel);
    if (ylabel) el('text', { x: 12, y: margin.top + plotH / 2, transform: `rotate(-90 12 ${margin.top + plotH / 2})`, 'text-anchor': 'middle', class: 'tick' }, svg, ylabel);

    const placed = [];
    refs.forEach((r) => {
      if (!isFinite(r.y)) return;
      el('line', { x1: margin.left, x2: width - margin.right, y1: y(r.y), y2: y(r.y), class: `ref ${r.series || ''}` }, svg);
      let ly = y(r.y) - 4;
      while (placed.some((p) => Math.abs(p - ly) < 12)) ly -= 12;
      placed.push(ly);
      el('text', { x: width - margin.right - 4, y: ly, 'text-anchor': 'end', class: 'reflabel' }, svg, `${r.label} ${yfmt(r.y)}`);
    });

    for (const s of series) {
      const d = s.points.filter((p) => isFinite(p[1]) && (!ylog || p[1] > 0)).map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
      el('path', { d, class: `ln ${s.series}` }, svg);
    }
    if (marker && isFinite(marker.y)) {
      el('circle', { cx: x(marker.x), cy: y(marker.y), r: 5, class: `pt ${marker.series || 's2'}` }, svg);
      if (marker.label) el('text', { x: x(marker.x) + 8, y: y(marker.y) - 8, class: 'reflabel' }, svg, marker.label);
    }

    const tip = tooltipFor(container);
    const xhair = el('line', { x1: 0, x2: 0, y1: margin.top, y2: margin.top + plotH, class: 'xhair', visibility: 'hidden' }, svg);
    const dots = series.map((s) => el('circle', { r: 4, class: `pt ${s.series}`, visibility: 'hidden' }, svg));
    const hit = el('rect', { x: margin.left, y: margin.top, width: plotW, height: plotH, class: 'hit' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const b = svg.getBoundingClientRect();
      const px = ((e.clientX - b.left) / b.width) * width;
      const xv = xinv(px);
      xhair.setAttribute('x1', x(xv)); xhair.setAttribute('x2', x(xv)); xhair.setAttribute('visibility', 'visible');
      const lines = [`<b>${xlabel || 'x'} = ${xfmt(xv)}</b>`];
      series.forEach((s, i) => {
        let best = s.points[0];
        for (const p of s.points) if (Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p;
        if (isFinite(best[1]) && (!ylog || best[1] > 0)) {
          dots[i].setAttribute('cx', x(best[0])); dots[i].setAttribute('cy', y(best[1])); dots[i].setAttribute('visibility', 'visible');
          lines.push(`${s.name}: ${yfmt(best[1])}`);
        } else dots[i].setAttribute('visibility', 'hidden');
      });
      const cb = container.getBoundingClientRect();
      showTip(tip, container, e.clientX - cb.left, e.clientY - cb.top, lines.join('<br>'));
    });
    hit.addEventListener('mouseleave', () => {
      tip.style.display = 'none'; xhair.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    });

    if (series.length > 1) {
      const lg = document.createElement('div'); lg.className = 'legend';
      lg.innerHTML = series.map((s) => `<span><i class="swatch ${s.series}"></i>${s.name}</span>`).join('');
      container.appendChild(lg);
    }
  }

  function linTicks(lo, hi, n) {
    const span = hi - lo;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  return { forest, line, el, NS };
})();
