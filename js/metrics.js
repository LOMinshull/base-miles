// Turns raw ride streams into compact ride records, and ride records into training analysis.
export const DURATIONS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200];
export const DISTANCES = [5000, 10000, 20000, 40000];
export const POWER_ZONES = [
  ['Z1', 'Active recovery', 0.55], ['Z2', 'Endurance', 0.75], ['Z3', 'Tempo', 0.90], ['Z4', 'Threshold', 1.05],
  ['Z5', 'VO2 max', 1.20], ['Z6', 'Anaerobic', 1.50], ['Z7', 'Neuromuscular', Infinity],
];
export const HR_ZONES = [
  ['Z1', 'Easy', 0.60], ['Z2', 'Endurance', 0.70], ['Z3', 'Tempo', 0.80], ['Z4', 'Threshold', 0.90], ['Z5', 'Max', Infinity],
];

const DAY = 86400000;
const MAX_GAP = 10;

export function haversine(aLat, aLng, bLat, bLng) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

function fillDistance(recs) {
  if (recs.some(r => r.dist != null)) {
    let last = 0;
    for (const r of recs) { if (r.dist == null) r.dist = last; else last = r.dist; }
    return;
  }
  let total = 0, prev = null;
  for (const r of recs) {
    if (r.lat != null && r.lng != null) {
      if (prev) total += haversine(prev.lat, prev.lng, r.lat, r.lng);
      prev = r;
    } else if (prev && r.speed != null) {
      total += r.speed;
    }
    r.dist = total;
  }
}

function bestRolling(power, secs) {
  if (power.length < secs) return null;
  let sum = 0, best = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i];
    if (i >= secs) sum -= power[i - secs];
    if (i >= secs - 1 && sum > best) best = sum;
  }
  return Math.round(best / secs);
}

function normalizedPower(power) {
  if (power.length < 300) return null;
  let sum = 0, total = 0, n = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i];
    if (i >= 30) sum -= power[i - 30];
    if (i >= 29) { total += (sum / 30) ** 4; n++; }
  }
  return Math.round((total / n) ** 0.25);
}

function bestDistanceTimes(line) {
  const out = {};
  for (const target of DISTANCES) {
    if (!line.length || line[line.length - 1].d < target) continue;
    let best = Infinity, j = 0;
    for (let i = 0; i < line.length; i++) {
      while (j < i && line[i].d - line[j + 1].d >= target) j++;
      if (line[i].d - line[j].d >= target) best = Math.min(best, line[i].t - line[j].t);
    }
    if (best < Infinity) out[target] = Math.round(best);
  }
  return out;
}

// Climb detection: walk an evenly spaced, smoothed altitude profile and cut whenever the road drops
// meaningfully from the high point.
function detectClimbs(recs) {
  const spaced = [];
  let next = 0;
  for (const r of recs) {
    if (r.alt == null || r.lat == null) continue;
    if (r.dist >= next) { spaced.push(r); next = r.dist + 100; }
  }
  if (spaced.length < 10) return [];
  const smooth = spaced.map((r, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(spaced.length - 1, i + 2); k++) { sum += spaced[k].alt; n++; }
    return sum / n;
  });
  const climbs = [];
  let lo = 0, hi = 0;
  const finish = () => {
    // Trim false flats so the road either side of the climb doesn't dilute its gradient.
    const slope = (i, j) => (smooth[j] - smooth[i]) / Math.max(1, spaced[j].dist - spaced[i].dist);
    while (lo + 3 < hi && slope(lo, lo + 3) < 0.02) lo++;
    while (hi - 3 > lo && slope(hi - 3, hi) < 0.02) hi--;
    const a = spaced[lo], b = spaced[hi];
    const gain = smooth[hi] - smooth[lo], len = b.dist - a.dist;
    if (gain >= 60 && len >= 800 && gain / len >= 0.03 && b.t > a.t) {
      climbs.push({
        gain: Math.round(gain), len: Math.round(len), grade: +(100 * gain / len).toFixed(1), secs: b.t - a.t,
        lat: +a.lat.toFixed(5), lng: +a.lng.toFixed(5), endLat: +b.lat.toFixed(5), endLng: +b.lng.toFixed(5),
      });
    }
  };
  for (let i = 1; i < spaced.length; i++) {
    if (smooth[i] > smooth[hi]) hi = i;
    if (smooth[i] <= smooth[lo] && hi === lo) { lo = hi = i; continue; }
    const drop = smooth[hi] - smooth[i];
    const shallow = spaced[i].dist - spaced[hi].dist > 600;
    if (drop > 15 || (shallow && hi > lo)) {
      if (hi > lo) finish();
      lo = hi = i;
    }
  }
  if (hi > lo) finish();
  return climbs;
}

function downsample(recs, max = 180) {
  const pts = recs.filter(r => r.lat != null && r.lng != null);
  if (!pts.length) return null;
  const step = Math.max(1, Math.floor(pts.length / max));
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push([+pts[i].lat.toFixed(4), +pts[i].lng.toFixed(4)]);
  const last = pts[pts.length - 1];
  out.push([+last.lat.toFixed(4), +last.lng.toFixed(4)]);
  return out;
}

export function summarizeStream(input, base = {}) {
  const recs = input.filter(r => r.t != null).sort((a, b) => a.t - b.t);
  if (recs.length < 30) return null;
  fillDistance(recs);

  const hasPower = recs.filter(r => r.pow > 0).length > recs.length * 0.05;
  const power = [];
  const hrHist = {}, powHist = {};
  const line = [];
  const halves = [];
  let moving = 0, cadSum = 0, cadTime = 0, hrSum = 0, hrTime = 0, powSum = 0, maxHr = 0, maxPow = 0, maxSpeed = 0;
  let climbed = 0, ref = null;

  for (let i = 0; i < recs.length - 1; i++) {
    const r = recs[i], nxt = recs[i + 1];
    const dt = nxt.t - r.t;
    if (dt <= 0) continue;
    if (r.alt != null) {
      if (ref == null) ref = r.alt;
      else if (r.alt - ref > 2) { climbed += r.alt - ref; ref = r.alt; }
      else if (ref - r.alt > 2) ref = r.alt;
    }
    if (dt > MAX_GAP) continue;
    const speed = (nxt.dist - r.dist) / dt;
    const isMoving = nxt.dist > r.dist ? speed > 0.6 : (r.pow > 0 || r.cad > 0);
    if (!isMoving) continue;

    moving += dt;
    line.push({ t: moving, d: r.dist });
    if (speed < 35) maxSpeed = Math.max(maxSpeed, speed);
    if (r.hr) {
      hrSum += r.hr * dt; hrTime += dt; maxHr = Math.max(maxHr, r.hr);
      hrHist[r.hr] = (hrHist[r.hr] || 0) + dt;
    }
    if (r.cad > 0) { cadSum += r.cad * dt; cadTime += dt; }
    if (hasPower) {
      const p = r.pow || 0;
      powSum += p * dt; maxPow = Math.max(maxPow, p);
      const bin = Math.floor(p / 5) * 5;
      powHist[bin] = (powHist[bin] || 0) + dt;
      for (let k = 0; k < dt; k++) power.push(p);
    }
    if (r.hr && hasPower) halves.push({ t: moving, hr: r.hr, pow: r.pow || 0, dt });
  }
  if (moving < 60) return null;

  let decoupling = null;
  // Drift only means something on a steady ride with a reliable heart rate signal. On a ride that
  // goes out hard and comes back easy, it measures the change in effort instead.
  if (halves.length > 100 && moving > 2700 && hrTime >= moving * 0.8) {
    const mid = moving / 2, sum = { a: [0, 0, 0], b: [0, 0, 0] };
    for (const s of halves) {
      const side = s.t <= mid ? sum.a : sum.b;
      side[0] += s.pow * s.dt; side[1] += s.hr * s.dt; side[2] += s.dt;
    }
    const steadyEffort = sum.a[2] && sum.b[2]
      && Math.abs((sum.a[0] / sum.a[2]) / (sum.b[0] / sum.b[2]) - 1) <= 0.12;
    if (steadyEffort) decoupling = +(100 * ((sum.a[0] / sum.a[1]) / (sum.b[0] / sum.b[1]) - 1)).toFixed(1);
  }

  const mmp = {};
  if (hasPower) for (const d of DURATIONS) { const v = bestRolling(power, d); if (v) mmp[d] = v; }

  const distance = recs[recs.length - 1].dist - recs[0].dist;
  const roundHist = h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Math.round(v)]));

  return {
    start: recs[0].t * 1000,
    elapsed: recs[recs.length - 1].t - recs[0].t,
    moving: Math.round(moving),
    dist: Math.round(distance),
    gain: Math.round(climbed),
    avgSpeed: distance / moving,
    maxSpeed: maxSpeed || null,
    avgHr: hrTime ? Math.round(hrSum / hrTime) : null,
    maxHr: maxHr || null,
    avgCad: cadTime ? Math.round(cadSum / cadTime) : null,
    avgPow: hasPower ? Math.round(powSum / moving) : null,
    maxPow: hasPower ? maxPow : null,
    np: hasPower ? normalizedPower(power) : null,
    kJ: hasPower ? Math.round(powSum / 1000) : null,
    hrHist: roundHist(hrHist),
    powHist: roundHist(powHist),
    mmp,
    bestDist: bestDistanceTimes(line),
    climbs: detectClimbs(recs),
    track: downsample(recs),
    decoupling,
    hasStreams: true,
    ...base,
  };
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
export const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export const median = v => quantile(v, 0.5);
export { quantile };

export const isIndoor = r => /virtual|indoor|trainer|zwift|rouvy/i.test(`${r.type || ''} ${r.name || ''}`);

function detectMaxHr(rides) {
  const peaks = rides.map(r => r.maxHr).filter(Boolean).sort((a, b) => b - a);
  if (!peaks.length) return null;
  return peaks[Math.min(2, peaks.length - 1)]; // third-highest ride peak, so a single strap spike can't move every zone
}

function rollingFtp(rides, settings) {
  const fixed = settings.ftp ? +settings.ftp : null;
  let carry = null, tail = 0;
  rides.forEach((r, i) => {
    while (rides[tail].start < r.start - 120 * DAY) tail++;
    let best = 0;
    for (let k = tail; k <= i; k++) {
      const m = rides[k].mmp || {};
      best = Math.max(best, (m[1200] || 0) * 0.95, m[3600] || 0, (m[1800] || 0) * 0.97);
    }
    if (best) carry = Math.round(best);
    r.ftpEstimate = best ? carry : null;
    r.ftp = fixed || carry;
  });
  const first = rides.find(r => r.ftp)?.ftp;
  if (first) rides.forEach(r => { if (!r.ftp) r.ftp = first; });
}

function zoneSeconds(hist, ref, zones) {
  const out = zones.map(() => 0);
  if (!hist || !ref) return out;
  for (const [key, secs] of Object.entries(hist)) {
    const ratio = (+key + (zones === POWER_ZONES ? 2.5 : 0)) / ref;
    const z = zones.findIndex(zone => ratio <= zone[2]);
    out[z === -1 ? zones.length - 1 : z] += secs;
  }
  return out;
}

// Derived fields depend on settings, so they are recalculated from the stored histograms.
export function buildModel(stored, settings) {
  const rides = stored.map(r => ({ ...r })).sort((a, b) => a.start - b.start);
  const maxHr = settings.maxHr ? +settings.maxHr : detectMaxHr(rides);
  const restHr = settings.restHr ? +settings.restHr : 55;
  rollingFtp(rides, settings);

  for (const r of rides) {
    r.indoor = isIndoor(r);
    r.km = (r.dist || 0) / 1000;
    r.hours = (r.moving || r.elapsed || 0) / 3600;
    r.ef = r.np && r.avgHr ? r.np / r.avgHr : null;
    r.hilliness = r.km ? (r.gain || 0) / r.km : null;
    r.metresPerBeat = r.avgHr && r.hours && !r.indoor ? (r.km * 1000) / (r.hours * 60) / r.avgHr : null;
    r.powZones = zoneSeconds(r.powHist, r.ftp, POWER_ZONES);
    r.hrZones = zoneSeconds(r.hrHist, maxHr, HR_ZONES);
    if ((r.np || r.avgPow) && r.ftp) {
      const intensity = (r.np || r.avgPow) / r.ftp;
      r.intensity = intensity;
      r.tss = r.hours * intensity * intensity * 100;
      r.tssSource = 'power';
    } else if (r.avgHr && maxHr) {
      const threshold = maxHr * 0.89;
      const intensity = Math.max(0.3, (r.avgHr - restHr) / (threshold - restHr));
      r.tss = r.hours * intensity * intensity * 100;
      r.tssSource = 'heart rate';
    } else {
      r.tss = r.hours * 50;
      r.tssSource = 'duration';
    }
  }

  const load = trainingLoad(rides);
  const latest = rides.length ? rides[rides.length - 1] : null;
  return { rides, maxHr, restHr, ftp: latest?.ftp ?? null, ftpAuto: !settings.ftp, maxHrAuto: !settings.maxHr, load };
}

function trainingLoad(rides) {
  if (!rides.length) return [];
  const startDay = Math.floor(rides[0].start / DAY);
  const endDay = Math.max(Math.floor(rides[rides.length - 1].start / DAY), Math.floor(Date.now() / DAY));
  const daily = new Float64Array(endDay - startDay + 1);
  for (const r of rides) daily[Math.floor(r.start / DAY) - startDay] += r.tss;
  const out = [];
  let ctl = 0, atl = 0;
  for (let i = 0; i < daily.length; i++) {
    ctl += (daily[i] - ctl) / 42;
    atl += (daily[i] - atl) / 7;
    out.push({ t: (startDay + i) * DAY, ctl, atl, tsb: ctl - atl });
  }
  return out;
}

export function loadAt(load, t) {
  let lo = 0, hi = load.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (load[m].t <= t) lo = m; else hi = m - 1;
  }
  return load[lo];
}

export function weekStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function monthStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function weeklyTotals(rides, from, to = Date.now()) {
  const weeks = new Map();
  for (let w = weekStart(from); w <= to; w = weekStart(w + 8 * DAY)) weeks.set(w, { t: w, km: 0, hours: 0, gain: 0, rides: 0, tss: 0 });
  for (const r of rides) {
    const b = weeks.get(weekStart(r.start));
    if (!b) continue;
    b.km += r.km; b.hours += r.hours; b.gain += r.gain || 0; b.rides++; b.tss += r.tss;
  }
  return [...weeks.values()];
}

export function monthlyRollup(rides) {
  const months = new Map();
  for (const r of rides) {
    const key = monthStart(r.start);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(r);
  }
  const weighted = (list, f) => {
    let sum = 0, w = 0;
    for (const r of list) { const v = f(r); if (v) { sum += v * r.hours; w += r.hours; } }
    return w ? sum / w : null;
  };
  // Months with no riding stay in the list, so a break shows up as a break.
  const keys = [...months.keys()].sort((a, b) => a - b);
  for (let t = keys[0]; t < keys[keys.length - 1]; t = monthStart(t + 32 * DAY)) if (!months.has(t)) months.set(t, []);
  return [...months.entries()].sort((a, b) => a[0] - b[0]).map(([t, list]) => {
    const hours = list.reduce((a, r) => a + r.hours, 0);
    const km = list.reduce((a, r) => a + r.km, 0);
    return {
      t, rides: list.length, hours, km,
      gain: list.reduce((a, r) => a + (r.gain || 0), 0),
      speed: hours ? km / hours : null,
      hr: weighted(list, r => r.avgHr),
      cad: weighted(list, r => r.avgCad),
      pow: weighted(list, r => r.avgPow),
      np: weighted(list, r => r.np),
      ef: weighted(list, r => r.ef),
      powZones: POWER_ZONES.map((_, z) => list.reduce((a, r) => a + r.powZones[z], 0)),
      hrZones: HR_ZONES.map((_, z) => list.reduce((a, r) => a + r.hrZones[z], 0)),
    };
  });
}

// Rolling median by time window, sampled at each ride, for the trend line through per-ride dots.
export function rollingMedian(points, windowDays = 56) {
  const out = [];
  let tail = 0;
  for (let i = 0; i < points.length; i++) {
    while (points[tail][0] < points[i][0] - windowDays * DAY) tail++;
    if (i - tail + 1 >= 3) out.push([points[i][0], median(points.slice(tail, i + 1).map(p => p[1]))]);
  }
  return out;
}

function compareSpans(rides, pick, end, span, offset, minRides, basis) {
  const values = (hi) => rides.filter(r => r.start > hi - span && r.start <= hi && pick(r) != null).map(pick);
  const a = values(end), b = values(end - offset);
  if (a.length < minRides || b.length < minRides) return null;
  const ma = mean(a), mb = mean(b);
  const se = v => { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) / v.length); };
  const noise = Math.sqrt(se(a) ** 2 + se(b) ** 2);
  return { recent: ma, prior: mb, pct: 100 * (ma - mb) / mb, clear: Math.abs(ma - mb) > 2 * noise, nA: a.length, nB: b.length, basis };
}

// Year on year is the fairest test because it cancels out the seasons. Without a comparable
// year, fall back to the previous three months and say so.
function compareWindows(rides, pick, end) {
  return compareSpans(rides, pick, end, 183 * DAY, 365 * DAY, 8, 'the same six months last year')
    || compareSpans(rides, pick, end, 91 * DAY, 91 * DAY, 4, 'the three months before, so season may play a part');
}

export function pearson(pairs) {
  if (pairs.length < 12) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

const describeR = r => {
  const size = Math.abs(r);
  return size >= 0.6 ? 'strong' : size >= 0.35 ? 'moderate' : 'weak';
};

export function buildInsights(model) {
  const { rides, load } = model;
  if (rides.length < 20) return [];
  const end = rides[rides.length - 1].start;
  const out = [];
  const add = (key, cmp, label, fmt, higherIsGood, hint) => {
    if (!cmp) return;
    const dir = !cmp.clear ? 'flat' : (cmp.pct > 0) === higherIsGood ? 'good' : 'watch';
    const change = `${fmt(cmp.prior)} to ${fmt(cmp.recent)}`;
    out.push({
      key, tone: dir,
      title: cmp.clear ? `${label} ${cmp.pct > 0 ? 'up' : 'down'} ${Math.abs(cmp.pct).toFixed(1)}%` : `${label} holding steady`,
      body: cmp.clear
        ? `${change} compared with ${cmp.basis} (${cmp.nA} and ${cmp.nB} rides). ${hint}`
        : `${change} compared with ${cmp.basis}. That gap is within normal ride-to-ride variation.`,
    });
  };

  const steady = r => (r.hours >= 1 && r.intensity && r.intensity < 0.85 ? r.ef : null);
  add('ef', compareWindows(rides, steady, end), 'Aerobic efficiency', v => `${v.toFixed(2)} W/bpm`, true,
    'More power for each heartbeat on steady rides is the clearest long-run sign that your aerobic base is improving.');

  // Works without a power meter, so it covers more rides. Flatter rides only, because hills slow you down at any heart rate.
  const perBeat = r => (r.hours >= 1 && r.hilliness != null && r.hilliness < 12 ? r.metresPerBeat : null);
  add('beat', compareWindows(rides, perBeat, end), 'Distance per heartbeat', v => `${v.toFixed(2)} m`, true,
    'Covering more ground on each heartbeat on flatter rides points to better aerobic fitness, though wind and drafting also affect it.');

  const likeSpeed = r => (!r.indoor && r.km >= 20 && r.hilliness != null && r.hilliness < 12 ? r.avgSpeed * 3.6 : null);
  add('speed', compareWindows(rides, likeSpeed, end), 'Speed on flatter rides', v => `${v.toFixed(1)} km/h`, true,
    'Only outdoor rides over 20 km with under 12 m of climbing per km are counted, so hills do not distort this.');

  add('volume', compareWindows(rides, r => r.hours, end), 'Average ride length', v => `${v.toFixed(1)} h`, true,
    'Longer rides are the main driver of your fitness score below.');

  add('cadence', compareWindows(rides, r => r.avgCad, end), 'Cadence', v => `${v.toFixed(0)} rpm`, true,
    'A cadence change usually reflects a shift in terrain, gearing or habit.');

  const ftps = rides.filter(r => r.ftp);
  if (ftps.length && model.ftpAuto) {
    const now = ftps[ftps.length - 1].ftp;
    const ago = [...ftps].reverse().find(r => r.start < end - 365 * DAY)?.ftp;
    if (ago && Math.abs(now - ago) >= 3) {
      const up = now > ago;
      out.push({
        key: 'ftp', tone: up ? 'good' : 'watch',
        title: `Estimated FTP ${up ? 'up' : 'down'} ${Math.abs(now - ago)} W in a year`,
        body: `${ago} W to ${now} W, taken from your best 20 to 60 minute efforts in each 120-day window. It only moves when you ride hard enough to show it.`,
      });
    }
  }

  const recent = rides.filter(r => r.start > end - 90 * DAY && r.hrZones.some(Boolean));
  if (recent.length >= 5) {
    const zones = HR_ZONES.map((_, z) => recent.reduce((a, r) => a + r.hrZones[z], 0));
    const total = zones.reduce((a, b) => a + b, 0);
    const easy = 100 * (zones[0] + zones[1]) / total, mid = 100 * zones[2] / total, hard = 100 * (zones[3] + zones[4]) / total;
    const heavyMiddle = mid > easy * 0.6;
    out.push({
      key: 'balance', tone: heavyMiddle ? 'watch' : 'flat',
      title: `${easy.toFixed(0)}% easy, ${mid.toFixed(0)}% tempo, ${hard.toFixed(0)}% hard`,
      body: heavyMiddle
        ? 'Over the last 90 days a large share of your time sits in the tempo middle, which is tiring without being a strong training signal. Easier easy days and harder hard days would give clearer returns.'
        : 'Over the last 90 days most of your time is easy with a smaller share of hard work, the balance endurance athletes tend to do best on.',
    });
  }

  const pairsFor = pick => rides.filter(pick).map(x => [loadAt(load, x.start - DAY).ctl, pick(x)]);
  const powerPairs = pairsFor(steady);
  const pairs = powerPairs.length >= 12 ? powerPairs : pairsFor(perBeat);
  const r = pearson(pairs);
  if (r != null) {
    const size = describeR(r);
    out.push({
      key: 'loadEf', tone: r > 0.2 ? 'good' : 'flat',
      title: `Fitness and efficiency: ${size} link (r = ${r.toFixed(2)})`,
      body: r > 0.2
        ? `Across ${pairs.length} steady rides, you get more from each heartbeat when your training load is higher. This shows the two move together, which supports your training paying off without proving it.`
        : `Across ${pairs.length} steady rides, efficiency has not tracked your training load closely. Heat, fatigue and ride type may be masking it.`,
    });
  }

  const weeks = weeklyTotals(rides, end - 365 * DAY, end);
  const active = weeks.filter(w => w.hours >= 3).length;
  out.push({
    key: 'consistency', tone: active / weeks.length >= 0.7 ? 'good' : 'flat',
    title: `${active} of ${weeks.length} weeks had 3+ hours`,
    body: 'Consistency over the last 12 months. Steady weeks tend to build more fitness than occasional huge ones.',
  });

  const order = { good: 0, watch: 1, flat: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function powerCurve(rides) {
  const out = {};
  for (const d of DURATIONS) {
    let best = null;
    for (const r of rides) {
      const v = r.mmp?.[d];
      if (v && (!best || v > best.watts)) best = { watts: v, ride: r };
    }
    if (best) out[d] = best;
  }
  return out;
}

export function bestTimes(rides) {
  const out = {};
  for (const d of DISTANCES) {
    let best = null;
    for (const r of rides) {
      const v = r.bestDist?.[d];
      if (v && (!best || v < best.secs)) best = { secs: v, ride: r };
    }
    if (best) out[d] = best;
  }
  return out;
}

// Groups detected climbs that share a start and finish, giving a repeatable, Strava-segment-like record.
export function repeatClimbs(rides) {
  const groups = [];
  for (const r of rides) {
    for (const c of r.climbs || []) {
      const g = groups.find(x =>
        haversine(x.lat, x.lng, c.lat, c.lng) < 250 && haversine(x.endLat, x.endLng, c.endLat, c.endLng) < 250);
      const effort = { secs: c.secs, ride: r, t: r.start, vam: c.gain / c.secs * 3600 };
      if (g) g.efforts.push(effort);
      else groups.push({ ...c, efforts: [effort] });
    }
  }
  for (const g of groups) {
    g.efforts.sort((a, b) => a.secs - b.secs);
    g.best = g.efforts[0];
    g.latest = g.efforts.reduce((a, b) => (b.t > a.t ? b : a));
  }
  return groups.sort((a, b) => b.efforts.length - a.efforts.length || b.gain - a.gain);
}

export function riderProfile(rides) {
  const end = rides.length ? rides[rides.length - 1].start : Date.now();
  const year = rides.filter(r => r.start > end - 365 * DAY && !r.indoor);
  const use = year.length >= 10 ? year : rides.filter(r => !r.indoor);
  if (!use.length) return null;
  const weeks = weeklyTotals(rides, end - 91 * DAY, end);
  const climbs = use.flatMap(r => (r.climbs || []).filter(c => c.gain >= 100).map(c => c.gain / c.secs * 3600));
  const maxKm = Math.max(...use.map(r => r.km));
  const maxGain = Math.max(...use.map(r => r.gain || 0));
  // With few rides a percentile misses what someone has proved they can do, so three quarters of
  // the biggest ride sets a floor on what counts as a long day.
  return {
    weeklyHours: mean(weeks.map(w => w.hours)),
    longKm: Math.max(quantile(use.map(r => r.km), 0.9), maxKm * 0.75),
    maxKm,
    longGain: Math.max(quantile(use.map(r => r.gain || 0), 0.9), maxGain * 0.75),
    maxGain,
    hilliness: mean(use.map(r => r.hilliness).filter(v => v != null)),
    speed: median(use.map(r => r.km / r.hours).filter(Boolean)),
    vam: climbs.length >= 3 ? median(climbs) : null,
    rides: use.length,
  };
}
