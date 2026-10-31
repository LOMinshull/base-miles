// Reads Strava archive exports, Wahoo FIT files and Ride with GPS GPX files, entirely in the browser.
import { parseFit } from './fit.js';
import { summarizeStream, haversine } from './metrics.js';

const CYCLING = /ride|cycl|bik|velomobile|handcycle/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const text = bytes => new TextDecoder().decode(bytes);
const basename = p => p.split('/').pop();

export function parseCsv(source) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// activities.csv repeats some headers (Distance in km, then Distance in m). Keep every copy.
function tableFromCsv(source) {
  const [header = [], ...rows] = parseCsv(source.replace(/^﻿/, ''));
  const index = {};
  header.forEach((h, i) => { const k = h.trim().toLowerCase(); (index[k] ||= []).push(i); });
  return rows.map(cells => ({
    first: name => { const i = index[name]?.[0]; return i == null ? '' : cells[i] ?? ''; },
    last: name => { const a = index[name]; return a ? cells[a[a.length - 1]] ?? '' : ''; },
    cells, header,
  }));
}

// Strava writes dates like "Jan 5, 2023, 7:12:33 AM" or "5 Jan 2023, 07:12:33", always in UTC.
export function parseStravaDate(value) {
  const m = value.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?/i);
  const month = value.toLowerCase().match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/);
  const year = value.match(/\b(\d{4})\b/);
  const day = value.replace(/\d{4}/, '').match(/\b(\d{1,2})\b(?!:)/);
  if (!m || !month || !year || !day) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  let hour = +m[1];
  if (m[4]) hour = (hour % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0);
  return Date.UTC(+year[1], MONTHS.indexOf(month[0]), +day[1], hour, +m[2], +m[3]);
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function rideFromRow(row) {
  const type = row.first('activity type');
  if (!CYCLING.test(type)) return null;
  const start = parseStravaDate(row.first('activity date'));
  if (!start) return null;
  const km = num(row.first('distance'));
  const metres = num(row.last('distance'));
  const dist = row.first('distance') !== row.last('distance') ? metres : (km ?? 0) * 1000;
  const moving = num(row.first('moving time')) ?? num(row.first('elapsed time'));
  return {
    start,
    stravaId: row.first('activity id'),
    name: row.first('activity name') || 'Ride',
    type,
    gear: row.first('activity gear') || null,
    commute: /true/i.test(row.first('commute')),
    file: row.first('filename'),
    elapsed: num(row.last('elapsed time')),
    moving,
    dist,
    gain: num(row.first('elevation gain')),
    avgSpeed: num(row.first('average speed')) || (moving && dist ? dist / moving : null),
    maxSpeed: num(row.first('max speed')),
    avgHr: num(row.first('average heart rate')),
    maxHr: num(row.last('max heart rate')) ?? num(row.first('max heart rate')),
    avgCad: num(row.first('average cadence')),
    avgPow: num(row.first('average watts')),
    maxPow: num(row.first('max watts')),
    np: num(row.first('weighted average power')),
    source: 'Strava export',
  };
}

function xmlValue(el, name) {
  const found = el.getElementsByTagNameNS('*', name)[0] || el.getElementsByTagName(name)[0];
  return found ? found.textContent : null;
}

export function parseGpx(source) {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not read GPX file');
  const name = xmlValue(doc.documentElement, 'name');
  const nodes = [...doc.getElementsByTagName('trkpt')];
  const pts = nodes.length ? nodes : [...doc.getElementsByTagName('rtept')];
  const records = pts.map(p => {
    const time = xmlValue(p, 'time');
    return {
      t: time ? Date.parse(time) / 1000 : null,
      lat: +p.getAttribute('lat'), lng: +p.getAttribute('lon'),
      alt: num(xmlValue(p, 'ele')),
      hr: num(xmlValue(p, 'hr')), cad: num(xmlValue(p, 'cad')) ?? num(xmlValue(p, 'cadence')),
      pow: num(xmlValue(p, 'power')) ?? num(xmlValue(p, 'PowerInWatts')),
      dist: null, speed: null,
    };
  });
  return { name, records, timed: records.some(r => r.t != null) };
}

export function parseTcx(source) {
  const doc = new DOMParser().parseFromString(source.trim(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not read TCX file');
  const records = [...doc.getElementsByTagName('Trackpoint')].map(p => ({
    t: Date.parse(xmlValue(p, 'Time')) / 1000,
    lat: num(xmlValue(p, 'LatitudeDegrees')), lng: num(xmlValue(p, 'LongitudeDegrees')),
    alt: num(xmlValue(p, 'AltitudeMeters')), dist: num(xmlValue(p, 'DistanceMeters')),
    hr: num(xmlValue(p.getElementsByTagName('HeartRateBpm')[0] || p, 'Value')),
    cad: num(xmlValue(p, 'Cadence')), pow: num(xmlValue(p, 'Watts')), speed: num(xmlValue(p, 'Speed')),
  }));
  return { records, sport: doc.getElementsByTagName('Activity')[0]?.getAttribute('Sport') || null };
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Reads the zip's table of contents, then only the entries needed, so multi-gigabyte
// archives full of photos stay out of memory.
async function openZip(file) {
  const tailSize = Math.min(file.size, 65557 + 20);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${file.name} is not a readable zip file`);
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const zip64 = Number(tail.getBigUint64(eocd - 12, true));
    const rec = new DataView(await file.slice(zip64, zip64 + 56).arrayBuffer());
    count = Number(rec.getBigUint64(32, true));
    cdSize = Number(rec.getBigUint64(40, true));
    cdOffset = Number(rec.getBigUint64(48, true));
  }
  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const names = new TextDecoder();
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    const method = cd.getUint16(p + 10, true);
    let compressed = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true), extraLen = cd.getUint16(p + 30, true), commentLen = cd.getUint16(p + 32, true);
    let offset = cd.getUint32(p + 42, true);
    const name = names.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    let x = p + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const tag = cd.getUint16(x, true), len = cd.getUint16(x + 2, true);
      if (tag === 1) {
        let q = x + 4;
        if (size === 0xffffffff) { size = Number(cd.getBigUint64(q, true)); q += 8; }
        if (compressed === 0xffffffff) { compressed = Number(cd.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) offset = Number(cd.getBigUint64(q, true));
      }
      x += 4 + len;
    }
    p = xEnd + commentLen;
    if (name.endsWith('/')) continue;
    entries.push({
      name, size,
      read: async () => {
        const head = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
        const start = offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
        const raw = file.slice(start, start + compressed);
        if (method === 0) return new Uint8Array(await raw.arrayBuffer());
        if (method !== 8) throw new Error(`Unsupported compression in ${name}`);
        return new Uint8Array(await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      },
    });
  }
  return entries;
}

async function collectEntries(files) {
  const entries = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) entries.push(...await openZip(file));
    else entries.push({
      name: file.webkitRelativePath || file.name, size: file.size,
      read: async () => new Uint8Array(await file.arrayBuffer()),
    });
  }
  return entries;
}

const activityFile = /\.(fit|gpx|tcx)(\.gz)?$/i;

async function parseActivity(entry) {
  let bytes = await entry.read();
  const name = entry.name.toLowerCase();
  if (name.endsWith('.gz')) bytes = await gunzip(bytes);
  if (/\.fit(\.gz)?$/.test(name)) {
    const fit = parseFit(bytes);
    if (fit.sport != null && ![0, 2, 21].includes(fit.sport)) return { skip: true };
    const s = fit.session;
    const ride = summarizeStream(fit.records, {
      type: s?.subSport === 58 || s?.subSport === 6 ? 'Virtual Ride' : 'Ride',
      source: 'FIT file',
    });
    if (ride && s) {
      if (s.gain != null) ride.gain = s.gain;
      if (s.moving) ride.moving = Math.round(s.moving);
      if (s.dist) { ride.dist = Math.round(s.dist); ride.avgSpeed = s.dist / (s.moving || ride.moving); }
    }
    return { ride };
  }
  if (/\.tcx(\.gz)?$/.test(name)) {
    const tcx = parseTcx(text(bytes));
    if (tcx.sport && !/bik/i.test(tcx.sport) && tcx.sport !== 'Other') return { skip: true };
    return { ride: summarizeStream(tcx.records, { type: 'Ride', source: 'TCX file' }) };
  }
  const gpx = parseGpx(text(bytes));
  if (!gpx.timed) return { route: routeFromGpx(gpx, entry.name) };
  return { ride: summarizeStream(gpx.records, { type: 'Ride', source: 'GPX file', name: gpx.name }) };
}

export function routeFromGpx(gpx, fileName, source = 'GPX') {
  const pts = gpx.records.filter(r => r.lat != null);
  if (pts.length < 2) return null;
  let total = 0, gain = 0, ref = pts[0].alt;
  const step = Math.max(1, Math.floor(pts.length / 400));
  const out = [];
  pts.forEach((p, i) => {
    if (i) total += haversine(pts[i - 1].lat, pts[i - 1].lng, p.lat, p.lng);
    if (p.alt != null) {
      if (ref == null) ref = p.alt;
      else if (p.alt - ref > 3) { gain += p.alt - ref; ref = p.alt; }
      else if (ref - p.alt > 3) ref = p.alt;
    }
    if (i % step === 0 || i === pts.length - 1) out.push([+p.lat.toFixed(5), +p.lng.toFixed(5), p.alt ?? null, Math.round(total)]);
  });
  const name = gpx.name || basename(fileName).replace(/\.gpx(\.gz)?$/i, '').replace(/[_-]+/g, ' ');
  return { id: `gpx-${name}-${Math.round(total)}`, name, source, km: total / 1000, gain: Math.round(gain), pts: out };
}

function segmentRows(source, kind) {
  const rows = tableFromCsv(source);
  return rows.map(row => {
    const pick = re => { const i = row.header.findIndex(h => re.test(h)); return i < 0 ? '' : row.cells[i] ?? ''; };
    const url = pick(/link|url/i);
    const id = pick(/segment.*id|^id$/i) || url.match(/segments\/(\d+)/)?.[1] || '';
    const name = pick(/name/i) || (id ? `Segment ${id}` : '');
    return name ? { id: `${kind}-${id || name}`, name, kind, url: url || (id ? `https://www.strava.com/segments/${id}` : null) } : null;
  }).filter(Boolean);
}

export function matchKey(start) { return Math.round(start / 300000); }

export function mergeRides(existing, incoming) {
  const index = new Map();
  const put = r => { const k = matchKey(r.start); (index.get(k) || index.set(k, []).get(k)).push(r); };
  existing.forEach(put);
  let added = 0, merged = 0;
  for (const ride of incoming) {
    const k = matchKey(ride.start);
    const match = [k - 1, k, k + 1].flatMap(x => index.get(x) || []).find(r => Math.abs(r.start - ride.start) < 180000);
    if (!match) { put(ride); existing.push(ride); added++; continue; }
    const keepName = match.name && match.name !== 'Ride' ? match.name : null;
    for (const [key, value] of Object.entries(ride)) if (value != null) match[key] = value;
    if (keepName && ride.source !== 'Strava export') match.name = keepName;
    merged++;
  }
  return { added, merged };
}

export async function importFiles(files, existing, onProgress = () => {}) {
  const entries = await collectEntries(files);
  const byName = new Map(entries.map(e => [e.name.replace(/^[^/]*\/(?=activities\/|routes\/)/, ''), e]));
  const find = name => entries.find(e => basename(e.name).toLowerCase() === name);

  const report = { added: 0, merged: 0, summaryOnly: 0, skipped: 0, failed: [], routes: [], segments: [] };
  const incoming = [];
  const used = new Set();

  const csvEntry = find('activities.csv');
  const csvRows = csvEntry ? tableFromCsv(text(await csvEntry.read())) : [];
  const rows = csvRows.map(rideFromRow);
  const listed = rows.filter(Boolean);
  report.skipped += rows.length - listed.length;

  // Non-cycling activities are listed in the CSV too, so their files can be ignored without parsing.
  for (const row of csvRows) {
    const file = row.first('filename');
    const entry = file && byName.get(file);
    if (entry) used.add(entry);
  }

  const allActivityFiles = entries.filter(e => activityFile.test(e.name) && !/(^|\/)routes\//i.test(e.name));

  let done = 0;
  const total = listed.length + allActivityFiles.filter(e => !used.has(e)).length;
  const tick = () => { done++; if (done % 5 === 0) onProgress(done, total); };

  for (const row of listed) {
    const entry = row.file && byName.get(row.file);
    let ride = null;
    if (entry) {
      try {
        const parsed = await parseActivity(entry);
        ride = parsed.ride || null;
      } catch (err) { report.failed.push(`${row.name}: ${err.message}`); }
    }
    if (ride) {
      const overrides = Object.fromEntries(Object.entries(row).filter(([k, v]) =>
        v != null && !['start', 'file', 'avgSpeed', 'maxSpeed'].includes(k)));
      // Strava's weighted power runs well below standard NP, and rides that arrive by Dropbox only
      // have the figure from the file, so that one is used wherever there is a file to keep trends comparable.
      const merged = { ...ride, ...overrides, np: ride.np ?? row.np, start: ride.start, source: 'Strava export' };
      if (merged.dist && merged.moving) merged.avgSpeed = merged.dist / merged.moving;
      incoming.push(merged);
    } else {
      report.summaryOnly++;
      incoming.push({ ...row, hasStreams: false });
    }
    tick();
    if (done % 20 === 0) await new Promise(r => setTimeout(r));
  }

  for (const entry of allActivityFiles) {
    if (used.has(entry)) continue;
    try {
      const parsed = await parseActivity(entry);
      if (parsed.skip) report.skipped++;
      else if (parsed.route) report.routes.push(parsed.route);
      else if (parsed.ride) incoming.push({ ...parsed.ride, name: parsed.ride.name || 'Ride' });
      else report.failed.push(`${basename(entry.name)}: no usable samples`);
    } catch (err) { report.failed.push(`${basename(entry.name)}: ${err.message}`); }
    tick();
    if (done % 20 === 0) await new Promise(r => setTimeout(r));
  }

  for (const entry of entries.filter(e => /(^|\/)routes\/.*\.gpx(\.gz)?$/i.test(e.name))) {
    try {
      let bytes = await entry.read();
      if (entry.name.endsWith('.gz')) bytes = await gunzip(bytes);
      const route = routeFromGpx(parseGpx(text(bytes)), entry.name, 'Strava');
      if (route) report.routes.push(route);
    } catch (err) { report.failed.push(`${basename(entry.name)}: ${err.message}`); }
  }

  for (const [file, kind] of [['starred_segments.csv', 'Starred'], ['segments.csv', 'Created'], ['local_legend_segments.csv', 'Local Legend']]) {
    const entry = find(file);
    if (entry) report.segments.push(...segmentRows(text(await entry.read()), kind));
  }

  const prefsEntry = find('general_preferences.csv');
  if (prefsEntry) {
    const [prefs] = tableFromCsv(text(await prefsEntry.read()));
    const ftp = num(prefs?.first('functional threshold power'));
    const maxHr = num(prefs?.first('maximum heartrate'));
    report.prefs = { ftp: ftp > 0 ? ftp : null, maxHr: maxHr > 0 ? maxHr : null };
  }

  Object.assign(report, mergeRides(existing, incoming));
  report.foundCsv = !!csvEntry;
  onProgress(total, total);
  return report;
}
