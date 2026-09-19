/* Statistical helpers: seeded RNG, 2x2 effect measures, Mantel-Haenszel,
   weighted logistic regression (IRLS), small linear algebra. */
const Stats = (() => {
  const Z = 1.959964;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function binomial(rng, n, p) {
    if (p <= 0 || n <= 0) return 0;
    if (p >= 1) return n;
    let k = 0;
    for (let i = 0; i < n; i++) if (rng() < p) k++;
    return k;
  }

  function multinomial(rng, n, probs) {
    const out = [];
    let remaining = n;
    let pLeft = 1;
    for (let i = 0; i < probs.length; i++) {
      if (i === probs.length - 1) { out.push(remaining); break; }
      const p = pLeft > 1e-12 ? Math.min(1, Math.max(0, probs[i] / pLeft)) : 0;
      const k = binomial(rng, remaining, p);
      out.push(k);
      remaining -= k;
      pLeft -= probs[i];
    }
    return out;
  }

  const logit = (p) => Math.log(p / (1 - p));
  const expit = (x) => 1 / (1 + Math.exp(-x));

  /* a = exposed & diseased, b = exposed & not, c = unexposed & diseased, d = unexposed & not */
  function measures(a, b, c, d) {
    const zero = [a, b, c, d].some((v) => v <= 0);
    const cc = zero ? 0.5 : 0;
    const A = a + cc, B = b + cc, C = c + cc, D = d + cc;
    const or = (A * D) / (B * C);
    const seOr = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
    const p1 = A / (A + B), p0 = C / (C + D);
    const pr = p1 / p0;
    const sePr = Math.sqrt(1 / A - 1 / (A + B) + 1 / C - 1 / (C + D));
    const n1 = a + b, n0 = c + d;
    const q1 = n1 > 0 ? a / n1 : NaN, q0 = n0 > 0 ? c / n0 : NaN;
    const pd = q1 - q0;
    const sePd = Math.sqrt((p1 * (1 - p1)) / Math.max(n1, 1) + (p0 * (1 - p0)) / Math.max(n0, 1));
    return {
      or: { est: or, lo: or * Math.exp(-Z * seOr), hi: or * Math.exp(Z * seOr), se: seOr },
      pr: { est: pr, lo: pr * Math.exp(-Z * sePr), hi: pr * Math.exp(Z * sePr), se: sePr },
      pd: { est: pd, lo: pd - Z * sePd, hi: pd + Z * sePd, se: sePd },
      p1: q1, p0: q0, n1, n0, n: n1 + n0, continuity: zero,
    };
  }

  function scaleOr(m, factor) {
    return { est: m.est * factor, lo: m.lo * factor, hi: m.hi * factor, se: m.se };
  }

  function mantelHaenszel(strata) {
    let num = 0, den = 0, sPR = 0, sPSQR = 0, sQS = 0;
    for (const s of strata) {
      const n = s.a + s.b + s.c + s.d;
      if (n <= 0) continue;
      const R = (s.a * s.d) / n, S = (s.b * s.c) / n;
      const P = (s.a + s.d) / n, Q = (s.b + s.c) / n;
      num += R; den += S;
      sPR += P * R; sPSQR += P * S + Q * R; sQS += Q * S;
    }
    const or = num / den;
    const v = sPR / (2 * num * num) + sPSQR / (2 * num * den) + sQS / (2 * den * den);
    const se = Math.sqrt(v);
    return { est: or, lo: or * Math.exp(-Z * se), hi: or * Math.exp(Z * se), se };
  }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const p = M[c][c];
      if (Math.abs(p) < 1e-14) return null;
      for (let j = c; j <= n; j++) M[c][j] /= p;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f === 0) continue;
        for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map((row) => row[n]);
  }

  function invert(A) {
    const n = A.length;
    const cols = [];
    for (let j = 0; j < n; j++) {
      const e = new Array(n).fill(0); e[j] = 1;
      const col = solve(A, e);
      if (!col) return null;
      cols.push(col);
    }
    return A.map((_, i) => cols.map((col) => col[i]));
  }

  function matVec(A, v) { return A.map((row) => row.reduce((s, x, j) => s + x * v[j], 0)); }

  /* Weighted logistic regression by IRLS. X: rows of predictors (no intercept), y: 0/1, w: weights. */
  function logistic(X, y, w, maxIter = 50) {
    const p = X[0].length + 1;
    const rows = X.map((r) => [1, ...r]);
    let beta = new Array(p).fill(0);
    let converged = false;
    for (let it = 0; it < maxIter; it++) {
      const XtWX = Array.from({ length: p }, () => new Array(p).fill(0));
      const XtWz = new Array(p).fill(0);
      for (let i = 0; i < rows.length; i++) {
        if (w[i] <= 0) continue;
        const xi = rows[i];
        const eta = xi.reduce((s, x, j) => s + x * beta[j], 0);
        const mu = expit(eta);
        const wi = w[i] * mu * (1 - mu);
        if (wi < 1e-12) continue;
        const z = eta + (y[i] - mu) / (mu * (1 - mu));
        for (let j = 0; j < p; j++) {
          XtWz[j] += xi[j] * wi * z;
          for (let k = 0; k < p; k++) XtWX[j][k] += xi[j] * wi * xi[k];
        }
      }
      const nb = solve(XtWX, XtWz);
      if (!nb) break;
      const diff = Math.max(...nb.map((v, j) => Math.abs(v - beta[j])));
      beta = nb;
      if (diff < 1e-8) { converged = true; break; }
    }
    const XtWX = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < rows.length; i++) {
      if (w[i] <= 0) continue;
      const xi = rows[i];
      const mu = expit(xi.reduce((s, x, j) => s + x * beta[j], 0));
      const wi = w[i] * mu * (1 - mu);
      for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) XtWX[j][k] += xi[j] * wi * xi[k];
    }
    const cov = invert(XtWX);
    const se = cov ? cov.map((row, j) => Math.sqrt(Math.max(row[j], 0))) : beta.map(() => NaN);
    return { beta, se, converged };
  }

  function coefOr(fit, j) {
    const b = fit.beta[j], s = fit.se[j];
    return { est: Math.exp(b), lo: Math.exp(b - Z * s), hi: Math.exp(b + Z * s), se: s };
  }

  return { Z, mulberry32, binomial, multinomial, logit, expit, measures, scaleOr, mantelHaenszel, solve, invert, matVec, logistic, coefOr };
})();
