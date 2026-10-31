import * as M from './metrics.js';
import { lineChart, stackedBars, stageProfile, spark, legend, dayLabel } from './charts.js';
import { importFiles } from './importers.js';
import { loadAll, saveAll, saveSettings, clearAll, removeItem } from './store.js';
import { DESTINATIONS, FOCUS, monthsLabel, scoreDestination } from './holidays.js';
import { buildSample } from './sample.js';
import { checkWahoo, rememberSeen, forgetSeen } from './wahoo.js';
import { PROFILES, newBuild, addPoint, insertPoint, movePoint, removePoint, fillLegs, summarize, isComplete, drawBuild, searchPlaces, downloadGpx } from './builder.js';

const DAY = 86400000;
const TABS = [
  ['overview', 'Overview', false], ['trends', 'Trends', true], ['zones', 'Zones', true], ['rides', 'Rides', true],
  ['routes', 'Routes and maps', true], ['bests', 'Segments and bests', true], ['holidays', 'Holidays', false], ['data', 'Your data', false],
];
const RANGES = [['6m', '6 months', 182], ['1y', '1 year', 365], ['2y', '2 years', 730], ['all', 'All time', null]];
const KINDS = [['all', 'All rides'], ['outdoor', 'Outdoor'], ['indoor', 'Indoor']];
const POWER_COLORS = ['--z1', '--z2', '--z3', '--z4', '--z5', '--z6', '--z7'].map(v => `var(${v})`);
const HR_COLORS = ['--z1', '--hz2', '--z4', '--z5', '--z6'].map(v => `var(${v})`);

const S = {
  stored: { rides: [], routes: [], segments: [], settings: {} }, sample: false, model: null, range: '2y', kind: 'all',
  rideSort: ['start', -1], rideSearch: '', openRide: null, route: null, map: null, mapLayer: null, build: null, building: false,
  holiday: { focus: 'any', month: 0, days: 7 },
  wahoo: { state: 'checking' }, importing: false,
};
const WAHOO_CHECK_MS = 60000;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = v => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));
const fixed = (v, d = 1) => (v == null ? '–' : v.toFixed(d));
const hms = secs => {
  if (secs == null) return '–';
  const s = Math.round(secs), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
const hoursLabel = h => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const monthTick = t => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

function currentRides() {
  const { rides } = S.model;
  const anchor = rides.length ? rides.at(-1).start : Date.now();
  const days = RANGES.find(r => r[0] === S.range)[2];
  return rides.filter(r => (!days || r.start > anchor - days * DAY)
    && (S.kind === 'all' || (S.kind === 'indoor') === r.indoor));
}

function tableDetails(title, headers, rows) {
  return `<details class="as-table"><summary>${esc(title)}</summary><div class="table-wrap"><table><thead><tr>${
    headers.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

function insightList(items) {
  const label = { good: 'Positive', watch: 'Watch', flat: 'Steady' };
  return `<div class="insights">${items.map(i => `<article class="insight"><span class="pill ${i.tone}">${label[i.tone]}</span><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></article>`).join('')}</div>`;
}

/* Overview */
function renderOverview(view) {
  const { rides, load } = S.model;
  if (!rides.length) { view.innerHTML = emptyState(); return; }
  const anchor = rides.at(-1).start;
  const year = rides.filter(r => r.start > anchor - 365 * DAY);
  const prior = rides.filter(r => r.start <= anchor - 365 * DAY && r.start > anchor - 730 * DAY);
  const sum = (list, f) => list.reduce((a, r) => a + (f(r) || 0), 0);
  const delta = (now, then) => (then ? `${now >= then ? '+' : ''}${(100 * (now - then) / then).toFixed(0)}% on prior year` : 'No prior year');
  const totals = [
    ['Time', hoursLabel(sum(year, r => r.hours)), delta(sum(year, r => r.hours), sum(prior, r => r.hours))],
    ['Climbing', `${int(sum(year, r => r.gain))} m`, delta(sum(year, r => r.gain), sum(prior, r => r.gain))],
    ['Rides', int(year.length), delta(year.length, prior.length)],
    ['FTP', S.model.ftp ? `${S.model.ftp} W` : '–', S.model.ftpAuto ? 'From your best efforts' : S.stored.settings.ftpFrom ? 'From Strava settings' : 'Set by you'],
  ];
  const km = sum(year, r => r.km);
  const today = load.at(-1);
  const form = today.tsb > 5 ? 'Fresh' : today.tsb < -20 ? 'Heavily loaded' : today.tsb < -5 ? 'Building' : 'Balanced';
  const recentLoad = load.slice(-365);
  const insights = M.buildInsights(S.model);

  view.innerHTML = `
    <section class="panel stage">
      <div class="stage-head">
        <div><div class="hero-label">Distance, last 12 months</div>
          <div class="hero-value">${int(km)}<small>km</small></div>
          <div class="sub">${delta(km, sum(prior, r => r.km))}</div></div>
        <div class="tiles">${totals.map(([l, v, d]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="delta">${d}</div></div>`).join('')}</div>
      </div>
      <div class="chart" id="stage"></div>
      <p class="sub">Weekly distance, drawn like a stage profile. The flags mark your biggest weeks.</p>
    </section>
    <div class="grid-2">
      <section class="panel">
        <h2>Fitness and fatigue</h2>
        <p class="sub">Fitness is your 6-week training load and fatigue is your 1-week load. Right now: <b>${form}</b>, with fitness ${int(today.ctl)} and fatigue ${int(today.atl)}.</p>
        <div class="chart" id="load"></div>
        ${legend([['Fitness', 'var(--s1)'], ['Fatigue', 'var(--s2)']])}
        ${tableDetails('View by month', ['Month', 'Fitness', 'Fatigue'],
          recentLoad.filter(d => new Date(d.t).getUTCDate() === 1).map(d => [monthTick(d.t), int(d.ctl), int(d.atl)]))}
      </section>
      <section class="panel">
        <h2>Recent rides</h2>
        <div class="table-wrap"><table><thead><tr><th>Ride</th><th class="n">km</th><th class="n">Time</th><th class="n">HR</th><th class="n">W</th></tr></thead><tbody>
        ${[...rides].reverse().slice(0, 7).map(r => `<tr><td>${esc(r.name)}<br><small class="sub">${dayLabel(r.start)}</small></td><td class="n">${fixed(r.km)}</td><td class="n">${hms(r.moving)}</td><td class="n">${int(r.avgHr)}</td><td class="n">${int(r.avgPow)}</td></tr>`).join('')}
        </tbody></table></div>
      </section>
    </div>
    <section class="panel">
      <h2>What is changing</h2>
      <p class="sub">The clearest long-run signals in your riding. See every trend in the <a href="#trends">Trends</a> tab.</p>
      ${insights.length ? insightList(insights.slice(0, 4)) : '<p class="nodata">Trends appear after about 20 rides.</p>'}
    </section>`;

  stageProfile($('#stage', view), M.weeklyTotals(rides, anchor - 364 * DAY, anchor));
  lineChart($('#load', view), {
    label: 'Fitness and fatigue over the last year', yFmt: v => int(v), zero: true,
    series: [
      { name: 'Fatigue', color: 'var(--s2)', points: recentLoad.map(d => [d.t, d.atl]) },
      { name: 'Fitness', color: 'var(--s1)', points: recentLoad.map(d => [d.t, d.ctl]), area: true },
    ],
  });
}

/* Trends */
const TREND_METRICS = [
  ['speed', 'Average speed', 'km/h', r => (r.hours ? r.km / r.hours : null), 1, 'var(--s1)', 'Moving speed, ride by ride. Terrain moves this a lot, so read it alongside efficiency.'],
  ['hr', 'Heart rate', 'bpm', r => r.avgHr, 0, 'var(--s8)', 'Lower heart rate at the same effort usually means better fitness.'],
  ['cad', 'Cadence', 'rpm', r => r.avgCad, 0, 'var(--s3)', 'Pedalling cadence, leaving out time spent coasting.'],
  ['pow', 'Power', 'W', r => r.np || r.avgPow, 0, 'var(--s7)', 'Normalised power where available, which accounts for surges and coasting.'],
  ['ef', 'Aerobic efficiency', 'W/bpm', r => r.ef, 2, 'var(--s1)', 'Normalised power divided by heart rate. A rising line is the strongest sign your aerobic fitness is building.'],
  ['beat', 'Distance per heartbeat', 'm', r => r.metresPerBeat, 2, 'var(--s3)', 'How far you travel on each heartbeat. It needs no power meter, but hills and wind affect it.'],
  ['dec', 'Heart rate drift', '%', r => r.decoupling, 1, 'var(--s2)', 'How much heart rate rises against power in the second half of a ride, on steady rides only. Under 5% suggests strong endurance.'],
  ['km', 'Ride distance', 'km', r => r.km, 0, 'var(--s7)', 'How long each ride was. Longer rides build endurance.'],
];

function renderTrends(view) {
  const rides = currentRides();
  const months = M.monthlyRollup(rides);
  const insights = M.buildInsights(S.model);
  const ftpLine = rides.filter(r => r.ftpEstimate).map(r => [r.start, r.ftpEstimate]);
  const anchor = S.model.rides.at(-1)?.start ?? Date.now();
  const years = [...new Set(S.model.rides.map(r => new Date(r.start).getFullYear()))].slice(-4);
  const yearColors = ['var(--axis)', 'var(--muted)', 'var(--s3)', 'var(--s1)'].slice(-years.length);

  view.innerHTML = `
    <div class="head"><h1>Long-run trends</h1>
      <p>Each dot is a ride and each line is the 8-week median, which shows the direction without the noise of single rides.</p></div>
    <section class="panel"><h2>What the data shows</h2>
      ${insights.length ? insightList(insights) : '<p class="nodata">Trends appear after about 20 rides.</p>'}
      <p class="sub" style="margin-top:10px">Links between training and results are correlations. Weather, kit and terrain can also play a part.</p>
    </section>
    <div class="grid-2">${TREND_METRICS.map(([key, title, unit, , , , sub]) => `
      <section class="panel"><h2>${title} <small class="sub">${unit}</small></h2><p class="sub">${sub}</p><div class="chart" id="t-${key}"></div></section>`).join('')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Estimated FTP</h2><p class="sub">From your best 20 to 60 minute efforts in each rolling 120-day window.</p><div class="chart" id="t-ftp"></div></section>
      <section class="panel"><h2>Distance through the year</h2><p class="sub">Cumulative km by calendar year, in the same order you rode them.</p><div class="chart" id="t-year"></div>
        ${legend(years.map((y, i) => [String(y), yearColors[i]]))}</section>
    </div>
    <section class="panel"><h2>Monthly volume</h2><p class="sub">Hours in the saddle each month.</p><div class="chart" id="t-vol"></div></section>
    <section class="panel"><h2>Monthly averages</h2>
      <div class="table-wrap"><table><thead><tr><th>Month</th><th class="n">Rides</th><th class="n">km</th><th class="n">Hours</th><th class="n">Climbing m</th><th class="n">km/h</th><th class="n">HR</th><th class="n">Cadence</th><th class="n">Power</th><th class="n">W/bpm</th></tr></thead>
      <tbody>${[...months].reverse().map(m => `<tr><td>${monthTick(m.t)}</td><td class="n">${m.rides}</td><td class="n">${int(m.km)}</td><td class="n">${fixed(m.hours)}</td><td class="n">${int(m.gain)}</td><td class="n">${fixed(m.speed)}</td><td class="n">${int(m.hr)}</td><td class="n">${int(m.cad)}</td><td class="n">${int(m.pow)}</td><td class="n">${fixed(m.ef, 2)}</td></tr>`).join('')}</tbody></table></div>
    </section>`;

  for (const [key, title, unit, pick, dp, color] of TREND_METRICS) {
    const pts = rides.filter(r => pick(r) != null && pick(r) !== 0).map(r => [r.start, pick(r)]);
    lineChart($(`#t-${key}`, view), {
      label: `${title} by ride with 8-week median`, h: 200, yFmt: v => `${v.toFixed(Math.min(dp, v % 1 ? dp : 0))}`, breakAt: 90 * DAY,
      series: [
        { name: 'Each ride', color, kind: 'dots', points: pts },
        { name: `8-week median, ${unit}`, color, points: M.rollingMedian(pts) },
      ],
    });
  }
  lineChart($('#t-ftp', view), { label: 'Estimated FTP over time', h: 200, yFmt: v => `${Math.round(v)} W`, series: [{ name: 'Estimated FTP', color: 'var(--s7)', points: ftpLine }] });

  const startOf = y => new Date(y, 0, 1).getTime();
  const yearSeries = years.map((y, i) => {
    let total = 0;
    const pts = [[0, 0]];
    S.model.rides.filter(r => new Date(r.start).getFullYear() === y).forEach(r => {
      total += r.km;
      pts.push([(r.start - startOf(y)) / DAY, total]);
    });
    return { name: String(y), color: yearColors[i], points: pts };
  });
  lineChart($('#t-year', view), {
    label: 'Cumulative distance by calendar year', h: 200, yFmt: v => `${int(v)} km`, xFmt: d => dayLabel(startOf(new Date(anchor).getFullYear()) + d * DAY).replace(/ \d{4}$/, ''),
    xTicks: [0, 90, 181, 273, 364], xTickFmt: d => ['Jan', 'Apr', 'Jul', 'Oct', 'Dec'][[0, 90, 181, 273, 364].indexOf(d)], series: yearSeries,
  });
  stackedBars($('#t-vol', view), {
    label: 'Hours per month', keys: [{ name: 'Hours', color: 'var(--s1)' }], yFmt: v => `${v}`, tipFmt: v => `${v.toFixed(1)} h`,
    bins: months.map(m => ({ label: monthTick(m.t), tick: monthTick(m.t), values: [m.hours] })),
  });
}

/* Zones */
function zoneRanges(zones, ref, suffix) {
  let lo = 0;
  return zones.map(z => {
    const hi = Number.isFinite(z[2]) ? Math.round(ref * z[2]) : null;
    const text = ref ? (hi ? `${lo}–${hi} ${suffix}` : `${lo}+ ${suffix}`) : '–';
    lo = hi ? hi + 1 : lo;
    return text;
  });
}

function zoneRows(zones, secs, colors, ranges) {
  const total = secs.reduce((a, b) => a + b, 0) || 1;
  const top = Math.max(...secs, 1);
  return zones.map((z, i) => `
    <div class="zone-row"><b>${z[0]}</b><span class="name">${z[1]}</span>
      <span class="barcell"><div class="bar" style="width:${(100 * secs[i] / top).toFixed(1)}%;background:${colors[i]}"></div></span>
      <span class="range">${ranges[i]}</span><span class="pct">${(100 * secs[i] / total).toFixed(0)}%</span></div>`).join('');
}

function renderZones(view) {
  const rides = currentRides();
  const months = M.monthlyRollup(rides);
  const pz = M.POWER_ZONES.map((_, z) => rides.reduce((a, r) => a + r.powZones[z], 0));
  const hz = M.HR_ZONES.map((_, z) => rides.reduce((a, r) => a + r.hrZones[z], 0));
  const { ftp, maxHr, ftpAuto, maxHrAuto, restHr } = S.model;
  const curveNow = M.powerCurve(rides), curveAll = M.powerCurve(S.model.rides);
  const toPts = c => M.DURATIONS.filter(d => c[d]).map(d => [d, c[d].watts]);
  const durLabel = d => (d < 60 ? `${d}s` : d < 3600 ? `${d / 60} min` : `${d / 3600} h`);

  view.innerHTML = `
    <div class="head"><h1>Power and heart rate zones</h1><p>How your riding time is spread across effort levels. Change the values below and every chart updates.</p></div>
    <section class="panel"><form class="settings" id="zoneForm">
      <label class="field">FTP (W)<input id="setFtp" type="number" min="50" max="600" placeholder="${ftp ?? ''}" value="${esc(S.stored.settings.ftp ?? '')}"><span class="hint">${ftpAuto ? 'Blank uses your rolling estimate' : S.stored.settings.ftpFrom ? 'From Strava. Clear to estimate it' : 'Fixed for all history'}</span></label>
      <label class="field">Max heart rate<input id="setMax" type="number" min="100" max="240" placeholder="${maxHr ?? ''}" value="${esc(S.stored.settings.maxHr ?? '')}"><span class="hint">${maxHrAuto ? 'Blank uses your ride data' : S.stored.settings.maxHrFrom ? 'From Strava' : 'Set by you'}</span></label>
      <label class="field">Resting heart rate<input id="setRest" type="number" min="30" max="110" placeholder="${restHr}" value="${esc(S.stored.settings.restHr ?? '')}"><span class="hint">Used when a ride has no power</span></label>
      <button class="btn" type="submit">Update zones</button>
    </form></section>
    <div class="grid-2">
      <section class="panel"><h2>Time in power zones</h2><p class="sub">${hoursLabel(pz.reduce((a, b) => a + b, 0) / 3600)} with power data.</p><div style="margin-top:10px">${zoneRows(M.POWER_ZONES, pz, POWER_COLORS, zoneRanges(M.POWER_ZONES, ftp, 'W'))}</div></section>
      <section class="panel"><h2>Time in heart rate zones</h2><p class="sub">${hoursLabel(hz.reduce((a, b) => a + b, 0) / 3600)} with heart rate data.</p><div style="margin-top:10px">${zoneRows(M.HR_ZONES, hz, HR_COLORS, zoneRanges(M.HR_ZONES, maxHr, 'bpm'))}</div></section>
    </div>
    <section class="panel"><h2>Power zones by month</h2><p class="sub">Share of each month's time, using the FTP you had at the time.</p><div class="chart" id="z-pow"></div>
      ${legend(M.POWER_ZONES.map((z, i) => [`${z[0]} ${z[1]}`, POWER_COLORS[i]]))}
      ${tableDetails('View as table', ['Month', ...M.POWER_ZONES.map(z => z[0])], months.map(m => { const t = m.powZones.reduce((a, b) => a + b, 0) || 1; return [monthTick(m.t), ...m.powZones.map(v => `${(100 * v / t).toFixed(0)}%`)]; }))}</section>
    <section class="panel"><h2>Heart rate zones by month</h2><p class="sub">Share of each month's time.</p><div class="chart" id="z-hr"></div>
      ${legend(M.HR_ZONES.map((z, i) => [`${z[0]} ${z[1]}`, HR_COLORS[i]]))}
      ${tableDetails('View as table', ['Month', ...M.HR_ZONES.map(z => z[0])], months.map(m => { const t = m.hrZones.reduce((a, b) => a + b, 0) || 1; return [monthTick(m.t), ...m.hrZones.map(v => `${(100 * v / t).toFixed(0)}%`)]; }))}</section>
    <section class="panel"><h2>Power curve</h2><p class="sub">Your best average power for each duration, in this period against your all-time best.</p><div class="chart" id="z-curve"></div>
      ${legend([['This period', 'var(--s1)'], ['All time', 'var(--s2)']])}
      ${tableDetails('View as table', ['Duration', 'This period', 'All time'], M.DURATIONS.filter(d => curveAll[d]).map(d => [durLabel(d), curveNow[d] ? `${curveNow[d].watts} W` : '–', `${curveAll[d].watts} W`]))}</section>`;

  const zoneBins = key => months.map(m => ({ label: monthTick(m.t), tick: monthTick(m.t), values: m[key] }));
  const pctTip = (v, total) => `${(100 * v / total).toFixed(0)}%`;
  stackedBars($('#z-pow', view), { label: 'Power zone share by month', share: true, keys: M.POWER_ZONES.map((z, i) => ({ name: `${z[0]} ${z[1]}`, color: POWER_COLORS[i] })), bins: zoneBins('powZones'), yFmt: v => `${v}%`, tipFmt: pctTip });
  stackedBars($('#z-hr', view), { label: 'Heart rate zone share by month', share: true, keys: M.HR_ZONES.map((z, i) => ({ name: `${z[0]} ${z[1]}`, color: HR_COLORS[i] })), bins: zoneBins('hrZones'), yFmt: v => `${v}%`, tipFmt: pctTip });
  const ticks = M.DURATIONS.filter(d => [5, 30, 60, 300, 1200, 3600, 7200].includes(d));
  lineChart($('#z-curve', view), {
    label: 'Best power by duration', xLog: true, xTicks: ticks, xTickFmt: durLabel, xFmt: durLabel, yFmt: v => `${Math.round(v)} W`,
    series: [{ name: 'This period', color: 'var(--s1)', points: toPts(curveNow) }, { name: 'All time', color: 'var(--s2)', points: toPts(curveAll) }],
  });

  $('#zoneForm', view).addEventListener('submit', async e => {
    e.preventDefault();
    const value = id => $(id, view).value || null;
    const old = S.stored.settings;
    const [ftp, maxHr] = [value('#setFtp'), value('#setMax')];
    S.stored.settings = {
      ...old, ftp, maxHr, restHr: value('#setRest'),
      ftpFrom: ftp === String(old.ftp) ? old.ftpFrom : null, maxHrFrom: maxHr === String(old.maxHr) ? old.maxHrFrom : null,
    };
    await saveSettings(S.stored.settings);
    rebuild(); render();
  });
}

/* Rides */
const RIDE_COLS = [
  ['start', 'Date', r => dayLabel(r.start), false], ['name', 'Ride', r => r.name, false], ['km', 'km', r => fixed(r.km), true],
  ['moving', 'Time', r => hms(r.moving), true], ['gain', 'Climbing m', r => int(r.gain), true], ['speedKmh', 'km/h', r => fixed(r.speedKmh), true],
  ['avgHr', 'HR', r => int(r.avgHr), true], ['avgCad', 'Cadence', r => int(r.avgCad), true], ['avgPow', 'Power', r => int(r.avgPow), true],
  ['np', 'NP', r => int(r.np), true], ['tss', 'Load', r => int(r.tss), true],
];

function strip(secs, colors) {
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return '<p class="nodata" style="padding:6px 0">No data on this ride.</p>';
  return `<div class="zone-strip">${secs.map((v, i) => (v ? `<span title="Z${i + 1}: ${(100 * v / total).toFixed(0)}%" style="flex:${v};background:${colors[i]}"></span>` : '')).join('')}</div>`;
}

function renderRides(view) {
  const q = S.rideSearch.toLowerCase();
  const rides = currentRides().map(r => ({ ...r, speedKmh: r.hours ? r.km / r.hours : null }))
    .filter(r => !q || `${r.name} ${r.type} ${r.gear || ''}`.toLowerCase().includes(q));
  const [key, dir] = S.rideSort;
  rides.sort((a, b) => {
    const x = a[key] ?? -Infinity, y = b[key] ?? -Infinity;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
  const shown = rides.slice(0, 300);
  view.innerHTML = `
    <div class="head"><h1>All rides</h1><p>Search and sort every ride. Select one to see its zones and details.</p></div>
    <section class="panel">
      <input class="text-input" id="rideSearch" type="search" aria-label="Search rides" placeholder="Search by name, type or bike" value="${esc(S.rideSearch)}" style="max-width:340px">
      <div class="table-wrap"><table><thead><tr>${RIDE_COLS.map(([k, label, , n]) => `<th data-sort="${k}" class="${n ? 'n' : ''}">${label}${k === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.map(r => `<tr class="link" data-ride="${r.start}">${RIDE_COLS.map(([, , f, n]) => `<td class="${n ? 'n' : ''}">${esc(f(r))}</td>`).join('')}</tr>${
        S.openRide === r.start ? `<tr><td colspan="${RIDE_COLS.length}">${rideDetail(r)}</td></tr>` : ''}`).join('')}</tbody></table></div>
      ${rides.length > shown.length ? `<p class="sub" style="margin-top:10px">Showing the first ${shown.length} of ${int(rides.length)}. Narrow the period or search to see more.</p>` : ''}
    </section>`;

  const search = $('#rideSearch', view);
  search.addEventListener('input', () => {
    S.rideSearch = search.value;
    renderRides(view);
    const next = $('#rideSearch', view);
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
  view.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    S.rideSort = [k, S.rideSort[0] === k ? -S.rideSort[1] : -1];
    renderRides(view);
  }));
  view.querySelectorAll('tr[data-ride]').forEach(tr => tr.addEventListener('click', () => {
    const id = +tr.dataset.ride;
    S.openRide = S.openRide === id ? null : id;
    renderRides(view);
  }));
}

function rideDetail(r) {
  const facts = [
    ['Intensity', r.intensity ? fixed(r.intensity, 2) : '–'], ['FTP then', r.ftp ? `${r.ftp} W` : '–'], ['Work', r.kJ ? `${int(r.kJ)} kJ` : '–'],
    ['Efficiency', r.ef ? `${r.ef.toFixed(2)} W/bpm` : '–'], ['HR drift', r.decoupling != null ? `${r.decoupling}%` : '–'],
    ['Load based on', r.tssSource], ['Source', r.source || 'Imported'],
  ];
  return `<div class="grid-2"><div><b>Power zones</b>${strip(r.powZones, POWER_COLORS)}<br><b>Heart rate zones</b>${strip(r.hrZones, HR_COLORS)}</div>
    <div class="facts">${facts.map(([a, b]) => `<span>${a}: ${esc(b)}</span>`).join('')}
    ${r.stravaId ? `<a href="https://www.strava.com/activities/${esc(r.stravaId)}" target="_blank" rel="noopener">Open on Strava</a>` : ''}</div></div>`;
}

/* Routes and maps */
function renderRoutes(view) {
  const rides = currentRides().filter(r => r.track);
  const routes = S.stored.routes;
  const selected = routes.find(r => r.id === S.route) || null;
  view.innerHTML = `
    <div class="head"><h1>Routes and maps</h1><p>Everywhere you have ridden, with your saved routes on top. Build a new route on the map, then download it for your ELEMNT.</p></div>
    <div class="map-layout">
      <div id="map" role="application" aria-label="Map of your rides and routes"></div>
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        ${S.building ? buildPanel() : `<section class="panel"><h2>Route builder</h2>
          <p class="sub" style="margin-top:3px">Click the map and the route follows the roads, with distance and climbing as you go.</p>
          <div class="actions" style="margin-top:10px"><button class="btn primary" id="startBuild">${S.build?.points.length ? 'Continue your route' : 'Build a route'}</button></div>
        </section>`}
        <section class="panel"><h2>Saved routes</h2>
          ${routes.length ? `<div class="route-list">${routes.map(r => `<button class="route-item" data-route="${esc(r.id)}" aria-pressed="${r.id === S.route}"><span>${esc(r.name)}</span><span class="source">${esc(r.source)}</span>${r.km ? `<small>${fixed(r.km)} km, ${int(r.gain)} m climbing</small>` : '<small>Linked route</small>'}</button>`).join('')}</div>`
            : '<p class="sub" style="margin-top:8px">Routes you build appear here. Strava routes arrive with your archive, and you can add GPX files under Your data.</p>'}
        </section>
        <details class="panel"><summary>Link a Ride with GPS route</summary>
          <form class="inline-form" id="rwgpsForm">
            <input class="text-input" id="rwgpsUrl" aria-label="Ride with GPS route link" placeholder="Paste a route link">
            <input class="text-input" id="rwgpsName" aria-label="Route name" placeholder="Name this route">
            <button class="btn" type="submit">Add</button>
          </form>
          <p class="sub" id="rwgpsMsg" style="margin-top:6px;font-size:.84rem">Linked routes must be public or shareable to display here.</p>
        </details>
      </div>
    </div>
    <div id="routeDetail"></div>`;

  if (S.map) { S.map.remove(); S.map = null; }
  const map = L.map('map', { preferCanvas: true });
  S.map = map;
  const roads = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  });
  const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '&copy; OpenStreetMap contributors, SRTM, &copy; OpenTopoMap (CC-BY-SA)',
  });
  const cycling = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 20, attribution: '&copy; OpenStreetMap contributors, CyclOSM',
  });
  const cycleRoutes = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: 'Cycle routes &copy; Waymarked Trails',
  });
  const bases = { Roads: roads, Terrain: terrain, 'Cycling map': cycling };
  (bases[S.mapLayer] || roads).addTo(map);
  map.on('baselayerchange', e => { S.mapLayer = e.name; });
  L.control.layers(bases, { 'Cycle routes': cycleRoutes }, { collapsed: false }).addTo(map);
  const renderer = L.canvas();
  const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--s2').trim();
  const bounds = L.latLngBounds([]);
  for (const r of rides) {
    L.polyline(r.track, { renderer, color: lineColor, weight: rides.length < 100 ? 3 : 2, opacity: rides.length < 100 ? 0.75 : 0.28, interactive: false }).addTo(map);
    r.track.forEach(p => bounds.extend(p));
  }
  if (!S.building && selected?.pts) {
    const line = L.polyline(selected.pts.map(p => [p[0], p[1]]), { color: getComputedStyle(document.documentElement).getPropertyValue('--s1').trim(), weight: 4 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [24, 24] });
  } else if (S.building && S.build.points.length) map.fitBounds(L.latLngBounds(S.build.points), { padding: [40, 40], maxZoom: 14 });
  else if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  else map.setView([50, 5], 4);

  const detail = $('#routeDetail', view);
  if (S.building) {
    wireBuilder(view, map);
  } else if (selected?.pts) {
    const profile = thin(selected.pts).filter(p => p[2] != null).map(p => [p[3] / 1000, p[2]]);
    detail.innerHTML = `<section class="panel"><h2>${esc(selected.name)}</h2><p class="sub">${fixed(selected.km)} km with ${int(selected.gain)} m of climbing.</p><div class="chart" id="routeProfile"></div>
      <div class="actions" style="margin-top:10px">${selected.waypoints ? '<button class="btn" id="editRoute">Edit route</button><button class="btn" id="routeGpx">Download GPX</button>' : ''}<button class="btn danger" id="dropRoute">Remove route</button></div></section>`;
    if (profile.length > 1) elevationChart($('#routeProfile', detail), profile, selected.km);
  } else if (selected) {
    detail.innerHTML = `<section class="panel"><h2>${esc(selected.name)}</h2>
      <p class="sub">If the map stays blank, open the route on Ride with GPS.</p>
      <iframe class="embed" title="${esc(selected.name)} on Ride with GPS" src="https://ridewithgps.com/embeds?type=route&id=${encodeURIComponent(selected.rwgpsId)}&sampleGraph=true"></iframe>
      <div class="actions" style="margin-top:10px"><a class="btn" href="${esc(selected.url)}" target="_blank" rel="noopener">Open on Ride with GPS</a><button class="btn danger" id="dropRoute">Remove route</button></div></section>`;
  }
  $('#startBuild', view)?.addEventListener('click', () => {
    S.build ||= newBuild();
    S.build.autoLocate = !S.build.points.length;
    S.building = true;
    S.route = null;
    renderRoutes(view);
  });
  $('#routeGpx', detail)?.addEventListener('click', () => downloadGpx(selected.name, selected.pts));
  $('#editRoute', detail)?.addEventListener('click', () => {
    const { id, name, profile, waypoints } = selected;
    S.build = { ...newBuild(), id, name, profile, points: waypoints.map(([lat, lng]) => ({ lat, lng })), legs: waypoints.slice(1).map(() => null) };
    S.building = true;
    S.route = null;
    renderRoutes(view);
  });
  $('#dropRoute', detail)?.addEventListener('click', async () => {
    S.stored.routes = S.stored.routes.filter(r => r.id !== selected.id);
    await removeItem('routes', selected.id);
    S.route = null;
    renderRoutes(view);
  });
  view.querySelectorAll('[data-route]').forEach(b => b.addEventListener('click', () => {
    S.route = S.route === b.dataset.route ? null : b.dataset.route;
    renderRoutes(view);
  }));
  $('#rwgpsForm', view).addEventListener('submit', async e => {
    e.preventDefault();
    const url = $('#rwgpsUrl', view).value.trim();
    const id = url.match(/ridewithgps\.com\/routes\/(\d+)/)?.[1];
    if (!id) { $('#rwgpsMsg', view).textContent = 'That does not look like a route link. It should look like ridewithgps.com/routes/12345.'; return; }
    const name = $('#rwgpsName', view).value.trim() || `Route ${id}`;
    const route = { id: `rwgps-${id}`, rwgpsId: id, source: 'Ride with GPS', name, url: `https://ridewithgps.com/routes/${id}` };
    S.stored.routes = [route, ...S.stored.routes.filter(r => r.id !== route.id)];
    await saveAll('routes', [route]);
    S.route = route.id;
    renderRoutes(view);
  });
}

const thin = pts => {
  const step = Math.ceil(pts.length / 600);
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
};

function elevationChart(el, profile, km) {
  const end = Math.ceil(km);
  const step = Math.max(1, Math.ceil(end / 6 / 5) * 5);
  const xTicks = [];
  for (let k = 0; k <= end; k += step) xTicks.push(k);
  lineChart(el, { label: 'Elevation profile', h: 170, xTicks, xTickFmt: k => `${k} km`, xFmt: k => `${k.toFixed(1)} km`, yFmt: v => `${Math.round(v)} m`, series: [{ name: 'Elevation', color: 'var(--s1)', points: profile, area: true }] });
}

function buildPanel() {
  const b = S.build;
  return `<section class="panel" id="buildPanel"><h2>Route builder</h2>
    <form class="place-search" id="placeForm">
      <input class="text-input" id="placeQuery" role="combobox" aria-label="Find a place" aria-autocomplete="list" aria-controls="placeList" aria-expanded="false" autocomplete="off" placeholder="Find a place">
      <ul class="place-list" id="placeList" role="listbox" aria-label="Matching places" hidden></ul>
    </form>
    <div class="seg" role="group" aria-label="Type of route" style="margin-top:10px">${PROFILES.map(([id, label]) => `<button type="button" data-profile="${id}" aria-pressed="${b.profile === id}">${label}</button>`).join('')}</div>
    <p class="build-stats" id="buildStats" aria-live="polite"></p>
    <p class="sub" id="buildMsg" style="font-size:.84rem"></p>
    <div class="actions" style="margin-top:10px">
      <button class="btn" id="buildLocate">Use my location</button>
      <button class="btn" id="buildUndo">Undo</button>
      <button class="btn" id="buildLoop">Back to start</button>
      <button class="btn danger" id="buildClear">Clear</button>
    </div>
    <input class="text-input" id="buildName" aria-label="Route name" placeholder="Name this route" value="${esc(b.name)}" style="margin-top:12px">
    <div class="actions" style="margin-top:10px">
      <button class="btn primary" id="buildSave">Save route</button>
      <button class="btn" id="buildGpx">Download GPX</button>
      <button class="btn" id="buildClose">Close</button>
    </div>
  </section>`;
}

function usualSpeed() {
  const outdoor = S.model.rides.filter(r => !r.indoor && r.avgSpeed).slice(-20);
  return outdoor.length ? outdoor.reduce((sum, r) => sum + r.avgSpeed, 0) / outdoor.length * 3.6 : null;
}

function wirePlaceSearch(view, map) {
  const input = $('#placeQuery', view), list = $('#placeList', view);
  let places = [], active = -1, timer = null, request = null;

  const show = html => {
    list.innerHTML = html;
    list.hidden = !html;
    input.setAttribute('aria-expanded', !list.hidden);
  };
  const close = () => { clearTimeout(timer); request?.abort(); places = []; active = -1; show(''); };
  const highlight = i => {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((el, n) => el.setAttribute('aria-selected', n === i));
    input.setAttribute('aria-activedescendant', i < 0 ? '' : `place-${i}`);
  };
  const pick = place => {
    close();
    S.build.locating = false;
    input.value = place.name;
    if (place.bounds) map.fitBounds(place.bounds, { maxZoom: 13 });
    else map.setView(place.center, 13);
  };

  async function search() {
    clearTimeout(timer);
    request?.abort();
    const query = input.value.trim();
    if (query.length < 3) { close(); return; }
    const mine = request = new AbortController();
    try {
      places = await searchPlaces(query, map.getCenter(), mine.signal);
      active = -1;
      show(places.length ? places.map((p, i) => `<li role="option" id="place-${i}" data-place="${i}" aria-selected="false"><b>${esc(p.name)}</b><small>${esc(p.detail)}</small></li>`).join('')
        : '<li class="none">No places found</li>');
    } catch (err) {
      if (err.name !== 'AbortError') show('<li class="none">Place search is not available right now</li>');
    }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && places.length) {
      e.preventDefault();
      highlight((active + (e.key === 'ArrowDown' ? 1 : places.length - (active < 0 ? 0 : 1))) % places.length);
    }
  });
  // Keeps focus in the box, so the list is still open when the click lands.
  list.addEventListener('pointerdown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const place = places[e.target.closest('[data-place]')?.dataset.place];
    if (place) pick(place);
  });
  $('#placeForm', view).addEventListener('submit', async e => {
    e.preventDefault();
    if (active < 0) await search();
    const place = places[Math.max(active, 0)];
    if (place) pick(place);
  });
}

function wireBuilder(view, map) {
  const b = S.build;
  const group = L.layerGroup().addTo(map);
  const detail = $('#routeDetail', view);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--s1').trim();
  map.getContainer().classList.add('building');
  detail.innerHTML = '<section class="panel" id="buildProfile" hidden><h2>Elevation</h2><div class="chart" id="buildChart"></div></section>';
  const speed = usualSpeed();

  const refill = () => fillLegs(b, () => b.redraw());
  const change = fn => (...args) => { b.message = ''; fn(...args); refill(); update(); };
  const handlers = {
    color,
    onInsert: change((leg, latlng) => insertPoint(b, leg, latlng)),
    onMove: change((i, latlng) => movePoint(b, i, latlng)),
    onRemove: change(i => removePoint(b, i)),
  };

  function update() {
    if (S.build !== b || !$('#buildStats', view)) return;
    drawBuild(b, group, handlers);
    const { pts, km, gain, mainShare } = summarize(b);
    const done = isComplete(b);
    $('#buildStats', view).textContent = pts.length
      ? `${fixed(km)} km, ${int(gain)} m climbing, ${Math.round(mainShare * 100)}% on main roads${speed ? `, about ${hoursLabel(km / speed)} at your usual ${fixed(speed)} km/h` : ''}` : '';
    $('#buildMsg', view).textContent = b.message || (b.locating ? 'Finding your location…' : b.busy ? 'Finding the route…'
      : !b.points.length ? 'Click the map to set your start.'
      : b.points.length === 1 ? 'Click the next point on your route. Drag S to change your start.'
      : 'Click the line to add a point, drag a point to move it, or click a point to remove it.');
    $('#buildUndo', view).disabled = $('#buildClear', view).disabled = !b.points.length;
    $('#buildLoop', view).disabled = b.points.length < 2;
    $('#buildLocate', view).disabled = !!b.locating;
    $('#buildSave', view).disabled = $('#buildGpx', view).disabled = !done;
    const profile = thin(pts).filter(p => p[2] != null).map(p => [p[3] / 1000, p[2]]);
    const card = $('#buildProfile', view);
    card.hidden = profile.length < 2;
    if (!card.hidden) elevationChart($('#buildChart', view), profile, km);
  }

  // Sets the start, or moves it if the route already has one. Anything the rider picks first wins.
  function locate() {
    if (!navigator.geolocation) { b.message = 'This browser cannot share your location. Click the map to set your start.'; update(); return; }
    b.locating = true;
    b.message = '';
    update();
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!b.locating) return;
      b.locating = false;
      const here = { lat: coords.latitude, lng: coords.longitude };
      change(() => (b.points.length ? movePoint(b, 0, here) : addPoint(b, here)))();
      map.setView(here, Math.max(map.getZoom(), 12));
    }, err => {
      if (!b.locating) return;
      b.locating = false;
      b.message = err.code === err.PERMISSION_DENIED
        ? 'Location is blocked for this site. Allow it in your browser, or click the map to set your start.'
        : 'Could not find your location. Click the map to set your start.';
      update();
    }, { timeout: 10000, maximumAge: 300000 });
  }

  map.on('click', e => { b.locating = false; change(addPoint)(b, e.latlng); });
  $('#buildLocate', view).addEventListener('click', locate);
  $('#buildUndo', view).addEventListener('click', change(() => removePoint(b, b.points.length - 1)));
  $('#buildLoop', view).addEventListener('click', change(() => addPoint(b, b.points[0])));
  $('#buildClear', view).addEventListener('click', () => { b.points = []; b.legs = []; b.message = ''; update(); });
  $('#buildClose', view).addEventListener('click', () => { S.building = false; renderRoutes(view); });
  $('#buildName', view).addEventListener('input', e => { b.name = e.target.value; });
  view.querySelectorAll('[data-profile]').forEach(btn => btn.addEventListener('click', change(() => {
    b.profile = btn.dataset.profile;
    b.legs = b.legs.map(() => null);
    view.querySelectorAll('[data-profile]').forEach(x => x.setAttribute('aria-pressed', x === btn));
  })));
  const routeName = () => b.name.trim() || `Route of ${dayLabel(Date.now())}`;
  $('#buildGpx', view).addEventListener('click', () => downloadGpx(routeName(), summarize(b).pts));
  $('#buildSave', view).addEventListener('click', async () => {
    const route = { ...summarize(b), id: b.id || `built-${Date.now()}`, name: routeName(), source: 'Built here', profile: b.profile, waypoints: b.points.map(p => [p.lat, p.lng]) };
    S.stored.routes = [route, ...S.stored.routes.filter(r => r.id !== route.id)];
    await saveAll('routes', [route]);
    S.build = null;
    S.building = false;
    S.route = route.id;
    renderRoutes(view);
  });
  wirePlaceSearch(view, map);
  b.redraw = update;
  if (b.legs.some(l => !l)) refill();
  update();
  if (b.autoLocate) { b.autoLocate = false; locate(); }
}

/* Segments and bests */
function renderBests(view) {
  const rides = currentRides();
  const curve = M.powerCurve(rides), times = M.bestTimes(rides), climbs = M.repeatClimbs(rides);
  const durLabel = d => (d < 60 ? `${d} sec` : d < 3600 ? `${d / 60} min` : `${d / 3600} h`);
  const segs = S.stored.segments;
  view.innerHTML = `
    <div class="head"><h1>Segments and bests</h1>
      <p>Your best efforts in this period, worked out from your ride files. Change the period above to compare.</p></div>
    <section class="panel"><h2>Your climbs</h2>
      <p class="sub">Base Miles finds climbs in your GPS tracks and matches repeat efforts, so these work like Strava segments. Your Strava segment times themselves are not included in Strava's archive.</p>
      ${climbs.length ? `<div class="table-wrap"><table><thead><tr><th>Climb</th><th class="n">Length</th><th class="n">Grade</th><th class="n">Gain</th><th class="n">Efforts</th><th class="n">Best</th><th class="n">Best date</th><th class="n">Latest</th><th class="n">m/h</th></tr></thead><tbody>
      ${climbs.slice(0, 25).map(c => `<tr><td><a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=14/${c.lat}/${c.lng}" target="_blank" rel="noopener">Starts ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}</a></td><td class="n">${(c.len / 1000).toFixed(1)} km</td><td class="n">${c.grade}%</td><td class="n">${c.gain} m</td><td class="n">${c.efforts.length}</td><td class="n">${hms(c.best.secs)}</td><td class="n">${dayLabel(c.best.t)}</td><td class="n">${hms(c.latest.secs)}</td><td class="n">${int(c.best.vam)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="nodata">No climbs found in this period. Climbs need GPS and elevation data.</p>'}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Best power</h2>
        ${Object.keys(curve).length ? `<div class="table-wrap"><table><thead><tr><th>Duration</th><th class="n">Watts</th><th>Ride</th></tr></thead><tbody>
        ${M.DURATIONS.filter(d => curve[d]).map(d => `<tr><td>${durLabel(d)}</td><td class="n">${curve[d].watts}</td><td>${esc(curve[d].ride.name)}<br><small class="sub">${dayLabel(curve[d].ride.start)}</small></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="nodata">No power data in this period.</p>'}</section>
      <section class="panel"><h2>Fastest distances</h2>
        ${Object.keys(times).length ? `<div class="table-wrap"><table><thead><tr><th>Distance</th><th class="n">Time</th><th class="n">km/h</th><th>Ride</th></tr></thead><tbody>
        ${M.DISTANCES.filter(d => times[d]).map(d => `<tr><td>${d / 1000} km</td><td class="n">${hms(times[d].secs)}</td><td class="n">${(d / times[d].secs * 3.6).toFixed(1)}</td><td>${esc(times[d].ride.name)}<br><small class="sub">${dayLabel(times[d].ride.start)}</small></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="nodata">No ride files with distance in this period.</p>'}</section>
    </div>
    <section class="panel"><h2>Strava segments</h2>
      <p class="sub">Segments you have starred on Strava, taken from your archive.</p>
      ${segs.length ? `<div class="table-wrap"><table><thead><tr><th>Segment</th><th>Type</th></tr></thead><tbody>${segs.map(s => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.kind)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="nodata">No starred segments found in your archive.</p>'}
    </section>`;
}

/* Holidays */
function renderHolidays(view) {
  const profile = M.riderProfile(S.model.rides);
  if (!profile) { view.innerHTML = emptyState(); return; }
  const prefs = S.holiday;
  const ranked = DESTINATIONS.map(d => scoreDestination(d, profile, prefs)).sort((a, b) => b.score - a.score);
  const months = ['Any month', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  view.innerHTML = `
    <div class="head"><h1>Cycling holidays</h1><p>Destinations ranked against how you actually ride. Typical days and climb figures are rounded, and fit scores are a guide.</p></div>
    <section class="panel"><h2>What Base Miles knows about you</h2>
      <div class="facts" style="margin-top:8px;font-size:.88rem">
        <span>${fixed(profile.weeklyHours)} h a week</span><span>Long ride ${int(profile.longKm)} km</span><span>Longest ${int(profile.maxKm)} km</span>
        <span>Big climbing day ${int(profile.longGain)} m</span><span>${int(profile.hilliness)} m climbing per km</span>
        <span>${profile.vam ? `Climbing rate ${int(profile.vam)} m/h` : 'Climbing rate unknown'}</span></div>
      <form class="settings" id="holidayForm" style="margin-top:14px">
        <label class="field">Looking for<select id="hFocus">${FOCUS.map(([k, l]) => `<option value="${k}" ${prefs.focus === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">When<select id="hMonth">${months.map((m, i) => `<option value="${i}" ${prefs.month === i ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="field">Riding days<select id="hDays">${[3, 4, 5, 7, 10].map(d => `<option ${prefs.days === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      </form></section>
    <div class="holiday-grid">${ranked.slice(0, 8).map(d => `
      <article class="panel holiday">
        <div class="holiday-top"><div><h2>${esc(d.name)}</h2><div class="country">${esc(d.country)}</div></div>
          <div class="score"><b>${d.score}</b><span>${esc(d.fit)}</span></div></div>
        <div class="facts"><span>${esc(monthsLabel(d.months))}</span><span>About ${d.kmDay} km a day</span><span>${d.gainDay.toLocaleString('en-GB')} m a day</span></div>
        <p>${esc(d.pitch)}</p>
        <div><h3>Why it fits you</h3><ul>${d.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
        ${d.cautions.length ? `<div class="caution"><h3>Keep in mind</h3><ul>${d.cautions.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
        <p class="logistics">${esc(d.logistics)}</p>
      </article>`).join('')}</div>`;
  $('#holidayForm', view).addEventListener('change', () => {
    S.holiday = { focus: $('#hFocus', view).value, month: +$('#hMonth', view).value, days: +$('#hDays', view).value };
    renderHolidays(view);
  });
}

/* Your data */
function renderData(view) {
  const realRides = S.sample ? 0 : S.stored.rides.length;
  view.innerHTML = `
    <div class="head"><h1>Your data</h1><p>Files are read in this browser and stay on this computer. Nothing is uploaded.</p></div>
    <section class="panel">
      <label class="dropzone" id="drop"><input id="fileInput" type="file" multiple accept=".zip,.fit,.gpx,.tcx,.gz,.csv">
        <b>Drop your Strava archive here</b><span class="sub">Or choose files. ZIP, FIT, GPX, TCX and activities.csv all work.</span></label>
      <div class="actions" style="margin-top:10px">
        <label class="btn" for="folderInput">Choose an unzipped folder</label>
        <input id="folderInput" type="file" webkitdirectory hidden>
        ${realRides ? '<button class="btn danger" id="clearData">Remove all imported data</button>' : ''}
      </div>
      <div class="progress" id="progress" hidden><div></div></div>
      <div class="import-result" id="importResult"></div>
      <p class="sub" style="margin-top:10px">${realRides ? `${int(realRides)} rides stored in this browser.` : 'No rides imported yet.'}</p>
    </section>
    <section class="panel"><h2>Connecting your accounts</h2>
      <div class="status-row"><div><div class="svc">Strava</div><span class="pill">Manual archive</span></div>
        <div><p>A free archive covers your ride history, Strava routes and starred segments.</p>
        <ol><li>Sign in, then open <a href="https://www.strava.com/athlete/delete_your_account" target="_blank" rel="noopener">Download or Delete Your Account</a>.</li>
        <li>Under Download Request, choose <b>Request Your Archive</b>. Do not use the delete option.</li>
        <li>Strava emails a download link, usually within a few hours.</li><li>Drop the ZIP above. Repeat whenever you want to catch up, and duplicates are merged.</li></ol></div></div>
      <div class="status-row" id="wahooStatus">${wahooRow()}</div>
      <div class="status-row"><div><div class="svc">Ride with GPS</div><span class="pill">Link or GPX</span></div>
        <div><p>Build routes on Ride with GPS, then paste the route link in <a href="#routes">Routes and maps</a> or export a GPX file and drop it above. Link your Wahoo account in Ride with GPS to send routes to your ELEMNT.</p></div></div>
    </section>`;

  const handle = async files => {
    if (!files.length) return;
    const bar = $('#progress', view), result = $('#importResult', view);
    S.importing = true;
    bar.hidden = false;
    result.textContent = 'Reading your files.';
    try {
      const existing = S.sample ? [] : S.stored.rides;
      const report = await importFiles([...files], existing, (done, total) => {
        bar.firstElementChild.style.width = `${total ? 100 * done / total : 100}%`;
        result.textContent = `Processed ${int(done)} of ${int(total)} activities.`;
      });
      if (report.added + report.merged + report.routes.length + report.segments.length === 0) {
        result.innerHTML = `<b>No rides found.</b> ${report.skipped ? `${int(report.skipped)} non-cycling activities were skipped. ` : ''}Check the file is your Strava archive or a ride file.`;
        return;
      }
      await saveAll('rides', existing, { replace: true });
      if (report.routes.length) await saveAll('routes', report.routes);
      if (report.segments.length) await saveAll('segments', report.segments);
      // Strava's saved values beat estimates from a few rides, but never replace ones entered here.
      const s = { ...S.stored.settings };
      if (!s.ftp && report.prefs?.ftp) Object.assign(s, { ftp: report.prefs.ftp, ftpFrom: 'Strava' });
      if (!s.maxHr && report.prefs?.maxHr) Object.assign(s, { maxHr: report.prefs.maxHr, maxHrFrom: 'Strava' });
      await saveSettings(s);
      await reload();
      renderData(view);
      const count = (n, one, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
      $('#importResult', view).innerHTML = `<b>Import finished.</b> ${count(report.added, 'new ride')}, ${int(report.merged)} updated, ${count(report.routes.length, 'route')} and ${count(report.segments.length, 'segment')}.
        ${report.summaryOnly ? `${count(report.summaryOnly, 'ride')} had no ride file, so only totals are available.` : ''}
        ${report.skipped ? `${count(report.skipped, 'non-cycling activity', 'non-cycling activities')} skipped.` : ''}
        ${report.failed.length ? `${count(report.failed.length, 'file')} could not be read:<ul>${report.failed.slice(0, 40).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}`;
    } catch (err) {
      result.innerHTML = `<b>Import stopped.</b> ${esc(err.message)}`;
    } finally {
      S.importing = false;
      const b = $('#progress', view);
      if (b) b.hidden = true;
    }
  };

  const drop = $('#drop', view);
  $('#fileInput', view).addEventListener('change', e => handle(e.target.files));
  $('#folderInput', view).addEventListener('change', e => handle(e.target.files));
  ['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handle(e.dataTransfer.files));

  const clear = $('#clearData', view);
  clear?.addEventListener('click', async () => {
    if (clear.dataset.armed !== 'yes') {
      clear.dataset.armed = 'yes';
      clear.textContent = 'Select again to remove everything';
      return;
    }
    await clearAll();
    const { ftp, ftpFrom, maxHr, maxHrFrom, ...kept } = S.stored.settings;
    await saveSettings({ ...kept, ...(ftpFrom ? {} : { ftp }), ...(maxHrFrom ? {} : { maxHr }) });
    await forgetSeen();
    await reload();
    renderData(view);
  });
}

const timeLabel = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function wahooRow() {
  const w = S.wahoo;
  const steps = `<ol><li>Install Dropbox on this Mac and sign in.</li>
    <li>In the Wahoo app, open Profile, then Linked Accounts, and authorise Dropbox.</li>
    <li>Turn on auto-share for Dropbox if your app shows that option.</li>
    <li>Finish a ride and let your ELEMNT sync. It appears here automatically.</li></ol>`;
  const body = {
    checking: ['Checking', '<p>Looking for your Wahoo rides.</p>'],
    off: ['Off', '<p>Automatic updates need the Base Miles server. Close this page, then double-click <b>start.command</b> in the base-miles folder.</p>'],
    web: ['Manual', '<p>To add new rides, drop a fresh Strava archive or a ride&rsquo;s FIT file above. Duplicates are merged.</p>'],
    'no-dropbox': ['Set up needed', `<p>Dropbox is not on this Mac yet. New rides will arrive automatically once these steps are done.</p>${steps}`],
    'no-folder': ['Waiting for first ride', `<p>Dropbox is on this Mac, but there is no Wahoo folder yet. It appears after your first ride is shared.</p>${steps}`],
    ready: ['Automatic', `<p>Watching <code>${esc(w.folder)}</code> for new rides.${w.checked ? ` Last checked at ${timeLabel(w.checked)}.` : ''}${w.lastAdded ? ` Last new ride added at ${timeLabel(w.lastAdded)}.` : ''}</p>
      <p class="sub">The site catches up on any new rides each time you open it. Your ride names and non-Wahoo rides still come from a Strava archive.</p>`],
  }[w.state];
  const failed = w.failed?.length ? `<p class="sub">${w.failed.length === 1 ? '1 file' : `${w.failed.length} files`} could not be read and will be retried.</p>` : '';
  return `<div><div class="svc">Wahoo ELEMNT</div><span class="pill ${w.state === 'ready' ? 'good' : ''}">${body[0]}</span></div><div>${body[1]}${failed}</div>`;
}

function showWahooStatus() {
  const row = $('#wahooStatus');
  if (row) row.innerHTML = wahooRow();
  const note = S.wahoo.lastAdded ? ` New ride added at ${timeLabel(S.wahoo.lastAdded)}.` : '';
  $('#railNote').textContent = `${railText()}${note}`;
}

async function syncWahoo() {
  if (S.importing || S.syncing) return;
  S.syncing = true;
  try {
    const wasSample = S.sample;
    const rides = wasSample ? [] : S.stored.rides;
    const result = await checkWahoo(rides);
    if (result.added) await saveAll('rides', rides, { replace: true });
    if (result.seen) await rememberSeen(result.seen);
    S.wahoo = { ...result, lastAdded: result.added ? Date.now() : S.wahoo.lastAdded };
    if (result.added) {
      await reload();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    showWahooStatus();
  } finally {
    S.syncing = false;
  }
}

const emptyState = () => '<section class="panel"><h2>No rides yet</h2><p class="sub">Import your Strava archive under <a href="#data">Your data</a>.</p></section>';

/* Shell */
const RENDER = { overview: renderOverview, trends: renderTrends, zones: renderZones, rides: renderRides, routes: renderRoutes, bests: renderBests, holidays: renderHolidays, data: renderData };

function currentTab() {
  const id = location.hash.slice(1);
  return TABS.find(t => t[0] === id) || TABS[0];
}

function renderFilters(tab) {
  const el = $('#filters');
  if (!tab[2]) { el.replaceChildren(); return; }
  const seg = (items, value, attr, label) => `<div class="seg" role="group" aria-label="${label}">${items.map(([k, l]) => `<button data-${attr}="${k}" aria-pressed="${k === value}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `${seg(RANGES, S.range, 'range', 'Period')}${seg(KINDS, S.kind, 'kind', 'Ride type')}<span class="count">${int(currentRides().length)} rides</span>`;
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.range) S.range = b.dataset.range;
    if (b.dataset.kind) S.kind = b.dataset.kind;
    render();
  }));
}

function render() {
  const tab = currentTab();
  document.title = tab[0] === 'overview' ? 'Base Miles' : `${tab[1]} · Base Miles`;
  $('#nav').innerHTML = TABS.map(([id, label]) => `<a href="#${id}" ${id === tab[0] ? 'aria-current="page"' : ''}>${label}</a>`).join('');
  $('#sampleBanner').hidden = !S.sample || tab[0] === 'data';
  renderFilters(tab);
  if (S.map && tab[0] !== 'routes') { S.map.remove(); S.map = null; }
  const view = $('#view');
  view.replaceChildren();
  RENDER[tab[0]](view);
}

const railText = () => {
  const count = S.stored.rides.length;
  return S.sample ? 'Showing sample rides.' : `${int(count)} ${count === 1 ? 'ride' : 'rides'}, stored only in this browser.`;
};

function rebuild() {
  S.model = M.buildModel(S.stored.rides, S.stored.settings);
  $('#railNote').textContent = railText();
}

async function reload() {
  const stored = await loadAll();
  S.sample = !stored.rides.length;
  if (S.sample) {
    const sample = buildSample();
    S.stored = { ...sample, routes: [...stored.routes, ...sample.routes], settings: stored.settings };
  } else S.stored = stored;
  S.route = null;
  rebuild();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

await reload();
render();
syncWahoo();
setInterval(syncWahoo, WAHOO_CHECK_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncWahoo(); });
