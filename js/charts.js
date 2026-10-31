// Small SVG chart kit. Colours and type come from CSS tokens, so charts follow the theme.
const NS = 'http://www.w3.org/2000/svg';
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

const observers = new WeakMap();

// Draws now and again whenever the container's width changes.
function mount(el, draw) {
  observers.get(el)?.disconnect();
  let width = 0;
  const run = () => {
    const w = el.clientWidth;
    if (!w || w === width) return;
    width = w;
    el.replaceChildren();
    draw(w);
  };
  const ro = new ResizeObserver(run);
  ro.observe(el);
  observers.set(el, ro);
  run();
}

function niceStep(span, count) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

export function niceTicks(lo, hi, count = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

function timeTicks(lo, hi, width) {
  const months = (hi - lo) / (30.44 * 86400000);
  const room = Math.max(2, Math.floor(width / 70));
  const every = [1, 2, 3, 6, 12, 24].find(n => months / n <= room) || 24;
  const out = [];
  const d = new Date(lo);
  let c = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (c.getMonth() % every !== 0 && every <= 12) c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
  for (; c.getTime() <= hi; c = new Date(c.getFullYear(), c.getMonth() + every, 1)) out.push(c.getTime());
  return out;
}

const timeLabel = (t, wide) => {
  const d = new Date(t);
  return wide || d.getMonth() !== 0 ? `${MONTH[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getFullYear()}`;
};

export const dayLabel = t => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
};

function tooltip(el) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  el.appendChild(tip);
  return (html, x, y, width) => {
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, x + 14 + w > width ? x - w - 14 : x + 14)}px`;
    tip.style.top = `${Math.max(0, y)}px`;
  };
}

const swatch = color => `<span class="key" style="background:${color}"></span>`;

function nearest(points, x) {
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (points[m][0] < x) lo = m; else hi = m; }
  return Math.abs(points[lo][0] - x) <= Math.abs(points[hi][0] - x) ? points[lo] : points[hi];
}

export function legend(items) {
  return `<div class="legend">${items.map(([name, color]) => `<span>${swatch(color)}${name}</span>`).join('')}</div>`;
}

// series: [{ name, color, points: [[x, y]], kind: 'line' | 'dots', area: bool }]
export function lineChart(el, { series, h = 220, yFmt = String, xFmt = dayLabel, xLog = false, xTicks, xTickFmt, zero = false, label, breakAt = Infinity }) {
  const shown = series.filter(s => s.points.length);
  if (!shown.length) { el.innerHTML = '<p class="nodata">No data for this period.</p>'; return; }
  mount(el, width => {
    const m = { t: 12, r: 14, b: 26, l: 44 };
    const pw = width - m.l - m.r, ph = h - m.t - m.b;
    const xs = shown.flatMap(s => s.points.map(p => p[0]));
    const lines = shown.filter(s => s.kind !== 'dots');
    const scaleFrom = (lines.length ? lines : shown).flatMap(s => s.points.map(p => p[1]));
    let lo = Math.min(...scaleFrom), hi = Math.max(...scaleFrom);
    const dots = shown.filter(s => s.kind === 'dots').flatMap(s => s.points.map(p => p[1])).sort((a, b) => a - b);
    if (dots.length) { lo = Math.min(lo, dots[Math.floor(dots.length * 0.02)]); hi = Math.max(hi, dots[Math.floor(dots.length * 0.98)]); }
    if (zero) lo = Math.min(0, lo);
    const ticks = niceTicks(lo, hi, 4);
    const yLo = ticks[0], yHi = ticks[ticks.length - 1];
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const fx = xLog
      ? v => m.l + pw * (Math.log(v) - Math.log(xLo)) / (Math.log(xHi) - Math.log(xLo) || 1)
      : v => m.l + pw * (v - xLo) / ((xHi - xLo) || 1);
    const fy = v => m.t + ph * (1 - (v - yLo) / ((yHi - yLo) || 1));

    const svg = svgEl('svg', { width, height: h, viewBox: `0 0 ${width} ${h}`, role: 'img', 'aria-label': label || 'Chart' }, el);
    for (const t of ticks) {
      svgEl('line', { x1: m.l, x2: width - m.r, y1: fy(t), y2: fy(t), class: t === yLo ? 'axis' : 'grid' }, svg);
      svgEl('text', { x: m.l - 8, y: fy(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = yFmt(t);
    }
    const xt = xTicks || timeTicks(xLo, xHi, pw);
    if (!xTicks && xt.length < 2) {
      // A short span may cross no month boundary, so label its first and last days instead.
      [[xLo, 'start'], [xHi, 'end']].forEach(([t, anchor]) => {
        svgEl('text', { x: fx(t), y: h - 7, 'text-anchor': anchor, class: 'tick' }, svg).textContent = dayLabel(t).replace(/ \d{4}$/, '');
      });
    } else xt.forEach(t => {
      const x = fx(t);
      if (x < m.l - 1 || x > width - m.r + 1) return;
      const node = svgEl('text', { x, y: h - 7, 'text-anchor': 'middle', class: 'tick' }, svg);
      node.textContent = xTickFmt ? xTickFmt(t) : timeLabel(t, true);
    });

    for (const s of shown) {
      if (s.kind === 'dots') {
        const sparse = s.points.length < 60;
        const g = svgEl('g', { fill: s.color, opacity: sparse ? 0.75 : 0.32 }, svg);
        for (const [x, y] of s.points) if (y >= yLo && y <= yHi) svgEl('circle', { cx: fx(x), cy: fy(y), r: sparse ? 3.5 : 2 }, g);
        continue;
      }
      const d = s.points.map(([x, y], i) => {
        const join = i && x - s.points[i - 1][0] <= breakAt;
        return `${join ? 'L' : 'M'}${fx(x).toFixed(1)} ${fy(y).toFixed(1)}`;
      }).join('');
      if (s.area) {
        svgEl('path', { d: `${d}L${fx(s.points.at(-1)[0]).toFixed(1)} ${fy(yLo)}L${fx(s.points[0][0]).toFixed(1)} ${fy(yLo)}Z`, fill: s.color, opacity: 0.1 }, svg);
      }
      svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const [ex, ey] = s.points.at(-1);
      svgEl('circle', { cx: fx(ex), cy: fy(ey), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    }

    const cross = svgEl('line', { y1: m.t, y2: m.t + ph, class: 'cross', visibility: 'hidden' }, svg);
    const show = tooltip(el);
    const hit = svgEl('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
    const invert = px => {
      const f = (px - m.l) / pw;
      return xLog ? Math.exp(Math.log(xLo) + f * (Math.log(xHi) - Math.log(xLo))) : xLo + f * (xHi - xLo);
    };
    const anchor = (lines[0] || shown[0]).points;
    hit.addEventListener('pointermove', e => {
      const box = svg.getBoundingClientRect();
      const px = e.clientX - box.left;
      const p = nearest(anchor, invert(px));
      cross.setAttribute('x1', fx(p[0])); cross.setAttribute('x2', fx(p[0]));
      cross.setAttribute('visibility', 'visible');
      const rows = (lines.length ? lines : shown).map(s => {
        const v = nearest(s.points, p[0]);
        return `<div>${swatch(s.color)}${s.name}<b>${yFmt(v[1])}</b></div>`;
      }).join('');
      show(`<strong>${xFmt(p[0])}</strong>${rows}`, fx(p[0]), m.t, width);
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); show(null); });
  });
}

// bins: [{ label, tick, values: [] }], keys: [{ name, color }]
export function stackedBars(el, { bins, keys, h = 220, share = false, yFmt = String, tipFmt, label }) {
  if (!bins.length) { el.innerHTML = '<p class="nodata">No data for this period.</p>'; return; }
  mount(el, width => {
    const m = { t: 12, r: 8, b: 26, l: 44 };
    const pw = width - m.l - m.r, ph = h - m.t - m.b;
    const totals = bins.map(b => b.values.reduce((a, v) => a + v, 0));
    const top = share ? 100 : Math.max(...totals, 1);
    const ticks = share ? [0, 25, 50, 75, 100] : niceTicks(0, top, 4);
    const yHi = ticks[ticks.length - 1];
    const fy = v => m.t + ph * (1 - v / yHi);
    const svg = svgEl('svg', { width, height: h, viewBox: `0 0 ${width} ${h}`, role: 'img', 'aria-label': label || 'Chart' }, el);
    for (const t of ticks) {
      svgEl('line', { x1: m.l, x2: width - m.r, y1: fy(t), y2: fy(t), class: t === 0 ? 'axis' : 'grid' }, svg);
      svgEl('text', { x: m.l - 8, y: fy(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = yFmt(t);
    }
    const slot = pw / bins.length;
    const barW = Math.max(1.5, Math.min(24, slot - 2));
    const labelEvery = Math.ceil(52 / slot);
    const show = tooltip(el);

    bins.forEach((bin, i) => {
      const cx = m.l + slot * (i + 0.5);
      const x = cx - barW / 2;
      const total = totals[i];
      let acc = 0;
      const visible = bin.values.map((v, k) => [v, k]).filter(([v]) => v > 0);
      visible.forEach(([v, k], n) => {
        const scaled = share ? (total ? v / total * 100 : 0) : v;
        const y1 = fy(acc), y0 = fy(acc + scaled);
        acc += scaled;
        const isTop = n === visible.length - 1;
        const height = Math.max(0, y1 - y0 - (isTop ? 0 : 2));
        const r = isTop ? Math.min(4, barW / 2, height) : 0;
        const y = y0 + (isTop ? 0 : 2);
        svgEl('path', {
          d: `M${x} ${y + height}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + barW - r}Q${x + barW} ${y} ${x + barW} ${y + r}V${y + height}Z`,
          fill: keys[k].color,
        }, svg);
      });
      if (i % labelEvery === 0 && bin.tick) {
        svgEl('text', { x: cx, y: h - 7, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = bin.tick;
      }
      const hit = svgEl('rect', { x: m.l + slot * i, y: m.t, width: slot, height: ph, fill: 'transparent' }, svg);
      hit.addEventListener('pointerenter', () => {
        const rows = keys.map((key, k) => (bin.values[k] > 0
          ? `<div>${swatch(key.color)}${key.name}<b>${tipFmt ? tipFmt(bin.values[k], total) : bin.values[k]}</b></div>` : '')).reverse().join('');
        show(`<strong>${bin.label}</strong>${rows}`, cx, m.t, width);
      });
      hit.addEventListener('pointerleave', () => show(null));
    });
  });
}

// Weekly distance drawn like the stage profile from a race road book, with the biggest weeks flagged as summits.
export function stageProfile(el, weeks) {
  if (!weeks.length) { el.innerHTML = '<p class="nodata">Import rides to draw your profile.</p>'; return; }
  mount(el, width => {
    const h = 190;
    const m = { t: 38, r: 14, b: 22, l: 14 };
    const pw = width - m.l - m.r, ph = h - m.t - m.b;
    const hi = Math.max(...weeks.map(w => w.km), 1);
    const fx = i => m.l + pw * i / Math.max(1, weeks.length - 1);
    const fy = v => m.t + ph * (1 - v / hi);
    const svg = svgEl('svg', { width, height: h, viewBox: `0 0 ${width} ${h}`, role: 'img', 'aria-label': 'Weekly distance over the last year' }, el);
    const top = weeks.map((w, i) => `${i ? 'L' : 'M'}${fx(i).toFixed(1)} ${fy(w.km).toFixed(1)}`).join('');
    const floor = fy(0);
    svgEl('path', { d: `${top}L${fx(weeks.length - 1)} ${floor}L${fx(0)} ${floor}Z`, class: 'stage-fill' }, svg);
    weeks.forEach((w, i) => {
      if (i % 4 === 0 && w.km > 0) svgEl('line', { x1: fx(i), x2: fx(i), y1: fy(w.km) + 2, y2: floor, class: 'stage-rib' }, svg);
    });
    svgEl('path', { d: top, class: 'stage-line' }, svg);
    svgEl('line', { x1: m.l, x2: width - m.r, y1: floor, y2: floor, class: 'axis' }, svg);

    let lastMonth = -1, lastX = -99;
    weeks.forEach((w, i) => {
      const month = new Date(w.t).getMonth();
      if (month !== lastMonth && fx(i) - lastX > 34) {
        svgEl('text', { x: fx(i), y: h - 6, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = MONTH[month];
        lastX = fx(i);
      }
      lastMonth = month;
    });

    const minGap = width < 520 ? 150 : 170;
    const flags = [];
    [...weeks.keys()].sort((a, b) => weeks[b].km - weeks[a].km).forEach(i => {
      if (flags.length < (width < 420 ? 1 : width < 520 ? 2 : 3) && weeks[i].km >= hi * 0.5 && flags.every(f => Math.abs(fx(f) - fx(i)) > minGap)) flags.push(i);
    });
    flags.forEach((i, rank) => {
      const x = fx(i), y = fy(weeks[i].km);
      svgEl('line', { x1: x, x2: x, y1: 22, y2: y, class: 'flag' }, svg);
      svgEl('circle', { cx: x, cy: y, r: 4, class: 'flag-dot' }, svg);
      const anchor = x > width - 90 ? 'end' : x < 90 ? 'start' : 'middle';
      const label = svgEl('text', { x, y: 15, 'text-anchor': anchor, class: 'flag-label' }, svg);
      label.textContent = `${Math.round(weeks[i].km)} km, ${dayLabel(weeks[i].t).replace(/ \d{4}$/, '')}`;
      if (rank === 0) label.classList.add('flag-top');
    });

    const show = tooltip(el);
    const dot = svgEl('circle', { r: 4, class: 'flag-dot', visibility: 'hidden' }, svg);
    const hit = svgEl('rect', { x: 0, y: 0, width, height: h, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', e => {
      const px = e.clientX - svg.getBoundingClientRect().left;
      const i = Math.max(0, Math.min(weeks.length - 1, Math.round((px - m.l) / pw * (weeks.length - 1))));
      const w = weeks[i];
      dot.setAttribute('cx', fx(i)); dot.setAttribute('cy', fy(w.km)); dot.setAttribute('visibility', 'visible');
      show(`<strong>Week of ${dayLabel(w.t)}</strong><div>Distance<b>${Math.round(w.km)} km</b></div><div>Time<b>${w.hours.toFixed(1)} h</b></div><div>Climbing<b>${Math.round(w.gain).toLocaleString()} m</b></div>`, fx(i), 26, width);
    });
    hit.addEventListener('pointerleave', () => { dot.setAttribute('visibility', 'hidden'); show(null); });
  });
}

export function spark(values, width = 96, height = 26) {
  const clean = values.filter(v => v != null);
  if (clean.length < 2) return '';
  const lo = Math.min(...clean), hi = Math.max(...clean);
  const fx = i => 2 + (width - 6) * i / (values.length - 1);
  const fy = v => 3 + (height - 6) * (1 - (v - lo) / ((hi - lo) || 1));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${fx(i).toFixed(1)} ${fy(v ?? lo).toFixed(1)}`).join('');
  return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/><circle cx="${fx(values.length - 1)}" cy="${fy(values.at(-1) ?? lo)}" r="3" fill="var(--s1)"/></svg>`;
}
