// Invented riding history for previewing the site. It runs through the same pipeline as real files.
import { summarizeStream } from './metrics.js';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOME = [51.72, -2.2];
const ROUTES = [
  { name: 'Valley loop', km: 42, bearing: 40, climbs: [[0.3, 2.4, 0.055], [0.7, 1.5, 0.045]] },
  { name: 'Ridge road', km: 68, bearing: 120, climbs: [[0.22, 3.6, 0.062], [0.5, 2.1, 0.07], [0.78, 1.8, 0.05]] },
  { name: 'Canal flats', km: 55, bearing: 210, climbs: [] },
  { name: 'Hill reps', km: 34, bearing: 300, climbs: [[0.25, 2.4, 0.055], [0.6, 2.4, 0.055]] },
  { name: 'Long Sunday', km: 105, bearing: 75, climbs: [[0.2, 4.2, 0.05], [0.45, 2.6, 0.075], [0.72, 3.1, 0.058]] },
];

function routePoint(route, frac) {
  const b = route.bearing * Math.PI / 180;
  const a = frac * Math.PI * 2;
  const radius = route.km / (2 * Math.PI) / 111;
  const north = radius * (Math.cos(b) * (1 - Math.cos(a)) - Math.sin(b) * Math.sin(a) * 0.7);
  const east = radius * (Math.sin(b) * (1 - Math.cos(a)) + Math.cos(b) * Math.sin(a) * 0.7);
  return [HOME[0] + north, HOME[1] + east / Math.cos(HOME[0] * Math.PI / 180)];
}

function grade(route, km) {
  for (const [at, len, g] of route.climbs) {
    const start = at * route.km;
    if (km >= start && km < start + len) return g;
    if (km >= start + len && km < start + len * 1.2) return -g * 1.2;
  }
  return 0.006 * Math.sin(km / 2.3);
}

function fitnessAt(t, start) {
  const years = (t - start) / (365.25 * 86400000);
  const season = Math.sin((new Date(t).getMonth() - 2) / 12 * 2 * Math.PI);
  return 1 + 0.085 * years + 0.05 * season;
}

function simulate(route, when, kind, fitness, rand) {
  const ftp = 205 * fitness;
  const target = { easy: 0.62, endurance: 0.70, tempo: 0.8, hills: 0.76 }[kind];
  const hrBase = 62 + rand() * 4;
  const heat = rand() * 6;
  const records = [];
  let dist = 0, alt = 95, t = when / 1000;
  const totalM = route.km * 1000 * (0.95 + rand() * 0.1);
  let drift = 0, hr = 95, wobble = 0;
  while (dist < totalM) {
    const km = dist / 1000;
    const g = grade(route, km);
    wobble += (rand() - 0.5) * 0.08 - wobble * 0.15;
    let intensity = target + wobble + (g > 0.03 ? 0.26 : g < -0.02 ? -0.5 : 0);
    if (kind === 'tempo' && Math.floor(km / 7) % 2 === 1) intensity += 0.18;
    const pow = Math.max(0, ftp * intensity);
    const speed = Math.max(2.5, 8.6 * Math.cbrt(Math.max(pow, 30) / 180) * (1 - g * 7.5) * (0.97 + rand() * 0.04));
    const step = 4;
    drift += 0.0009;
    const targetHr = hrBase + heat + 103 * (pow / ftp) * (1.03 / fitness) ** 0.9 + 11 * drift + 14;
    hr += (targetHr - hr) * 0.06;
    const pa = g * speed * step;
    alt += pa;
    const [lat, lng] = routePoint(route, Math.min(1, dist / totalM));
    records.push({
      t, lat, lng, alt, dist, speed,
      hr: Math.min(186, Math.round(hr)),
      cad: pow > 15 ? Math.round(84 + 4 * intensity + rand() * 6 + (fitness - 1) * 18) : 0,
      pow: Math.round(pow),
    });
    dist += speed * step;
    t += step;
  }
  return records;
}

export function buildSample() {
  const rand = rng(20261031);
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  const span = 3 * 365;
  const first = today.getTime() - span * 86400000;
  const rides = [];
  const titles = { easy: 'Easy spin', endurance: 'Endurance ride', tempo: 'Tempo session', hills: 'Hill session' };

  for (let d = 0; d < span; d += 1) {
    const when = first + d * 86400000 + Math.floor(rand() * 7200000);
    const date = new Date(when);
    const day = date.getDay();
    const month = date.getMonth();
    const summer = month >= 3 && month <= 8;
    const chance = day === 0 ? 0.8 : day === 6 ? 0.68 : day === 3 ? 0.5 : day === 2 ? 0.28 : 0.1;
    if (rand() > chance * (summer ? 1 : 0.68)) continue;
    let route, kind;
    if (day === 0) { route = rand() < 0.45 && summer ? ROUTES[4] : ROUTES[1]; kind = 'endurance'; }
    else if (day === 3) { route = rand() < 0.5 ? ROUTES[3] : ROUTES[0]; kind = rand() < 0.5 ? 'hills' : 'tempo'; }
    else { route = rand() < 0.5 ? ROUTES[2] : ROUTES[0]; kind = rand() < 0.5 ? 'easy' : 'endurance'; }
    const stream = simulate(route, when, kind, fitnessAt(when, first), rand);
    const ride = summarizeStream(stream, {
      name: `${titles[kind]}, ${route.name}`, type: 'Ride', source: 'Sample',
    });
    if (ride) rides.push(ride);
  }

  const routes = ROUTES.slice(0, 3).map((r, i) => {
    const pts = [];
    let alt = 95, gain = 0;
    for (let k = 0; k <= 200; k++) {
      const km = r.km * k / 200;
      const g = grade(r, km);
      const dAlt = g * (r.km * 1000 / 200);
      alt += dAlt;
      if (dAlt > 0) gain += dAlt;
      const [lat, lng] = routePoint(r, k / 200);
      pts.push([+lat.toFixed(5), +lng.toFixed(5), +alt.toFixed(1), Math.round(km * 1000)]);
    }
    return { id: `sample-${i}`, name: `Sample route: ${r.name}`, source: 'Strava', km: r.km, gain: Math.round(gain), pts };
  });

  const segments = [
    { id: 'sample-a', name: 'Sample segment: Ridge road climb', kind: 'Starred', url: null },
    { id: 'sample-b', name: 'Sample segment: Canal sprint', kind: 'Starred', url: null },
  ];
  return { rides, routes, segments };
}
