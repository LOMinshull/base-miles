// Route builder: click the map, and BRouter snaps each leg to roads and adds elevation.
// Only clicked points and place searches leave the browser, and rides are never sent.
import { haversine } from './metrics.js';

const ROUTER = 'https://brouter.de/brouter';
const SEARCH = 'https://photon.komoot.io/api/';
const NOT_PLACES = new Set(['amenity', 'shop', 'highway', 'railway', 'building', 'office', 'craft', 'aeroway', 'public_transport']);
export const PROFILES = [['fastbike', 'Road'], ['fastbike-lowtraffic', 'Quiet roads'], ['gravel', 'Gravel']];

export const newBuild = () => ({ id: null, name: '', profile: PROFILES[0][0], points: [], legs: [], message: '', busy: false });

class NoRoute extends Error {}

async function fetchLeg(a, b, profile) {
  const lonlats = `${a.lng.toFixed(6)},${a.lat.toFixed(6)}|${b.lng.toFixed(6)},${b.lat.toFixed(6)}`;
  const res = await fetch(`${ROUTER}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`);
  if (!res.ok) throw new NoRoute(/killed|timeout/i.test(await res.text())
    ? 'That point is too far to route in one go. Click somewhere closer and build up in shorter steps.'
    : 'No route to that point. Try somewhere closer to a road.');
  const coords = (await res.json()).features?.[0]?.geometry?.coordinates;
  if (!coords?.length) throw new NoRoute('No route to that point. Try somewhere closer to a road.');
  return coords.map(([lng, lat, ele]) => [lat, lng, ele ?? null]);
}

export function removePoint(build, i) {
  const last = build.points.length - 1;
  const inner = i > 0 && i < last;
  build.points.splice(i, 1);
  if (last > 0) build.legs.splice(i === 0 ? 0 : i - 1, inner ? 2 : 1, ...(inner ? [null] : []));
}

export function addPoint(build, latlng) {
  build.points.push({ lat: latlng.lat, lng: latlng.lng });
  if (build.points.length > 1) build.legs.push(null);
}

export function insertPoint(build, leg, latlng) {
  build.points.splice(leg + 1, 0, { lat: latlng.lat, lng: latlng.lng });
  build.legs.splice(leg, 1, null, null);
}

export function movePoint(build, i, latlng) {
  build.points[i] = { lat: latlng.lat, lng: latlng.lng };
  if (i > 0) build.legs[i - 1] = null;
  if (i < build.legs.length) build.legs[i] = null;
}

// Routes the missing legs one at a time, so a burst of clicks does not flood a free service.
export async function fillLegs(build, onChange) {
  if (build.busy) return;
  build.busy = true;
  onChange();
  for (;;) {
    const i = build.legs.findIndex(l => !l);
    if (i < 0) break;
    const from = build.points[i], to = build.points[i + 1];
    try {
      const coords = await fetchLeg(from, to, build.profile);
      if (build.points[i] === from && build.points[i + 1] === to) build.legs[i] = coords;
      build.message = '';
    } catch (err) {
      if (!(err instanceof NoRoute)) {
        build.message = 'The routing service could not be reached. Check your connection, then try again.';
        break;
      }
      if (build.points[i + 1] === to) removePoint(build, i + 1);
      build.message = err.message;
    }
    onChange();
  }
  build.busy = false;
  onChange();
}

export function summarize(build) {
  const pts = [];
  let total = 0, gain = 0, ref = null;
  build.legs.filter(Boolean).flat().forEach(([lat, lng, ele], i, all) => {
    if (i) total += haversine(all[i - 1][0], all[i - 1][1], lat, lng);
    if (ele != null) {
      if (ref == null) ref = ele;
      else if (ele - ref > 3) { gain += ele - ref; ref = ele; }
      else if (ref - ele > 3) ref = ele;
    }
    pts.push([+lat.toFixed(6), +lng.toFixed(6), ele, Math.round(total)]);
  });
  return { pts, km: total / 1000, gain: Math.round(gain) };
}

export const isComplete = build => build.legs.length > 0 && build.legs.every(Boolean) && !build.busy;

export function drawBuild(build, group, { color, onInsert, onMove, onRemove }) {
  group.clearLayers();
  build.legs.forEach((leg, i) => {
    if (!leg) {
      L.polyline([build.points[i], build.points[i + 1]], { color, weight: 3, opacity: 0.6, dashArray: '6 8', interactive: false }).addTo(group);
      return;
    }
    const line = L.polyline(leg.map(p => [p[0], p[1]]), { color, weight: 5, opacity: 0.95 }).addTo(group);
    line.on('click', e => { L.DomEvent.stop(e); onInsert(i, e.latlng); });
  });
  const last = build.points.length - 1;
  build.points.forEach((p, i) => {
    const end = i === 0 ? 'S' : i === last ? 'F' : '';
    const icon = L.divIcon({ className: '', html: `<span class="way${end ? ' end' : ''}">${end}</span>`, iconSize: end ? [24, 24] : [16, 16] });
    const marker = L.marker(p, { icon, draggable: true, title: 'Drag to move, click to remove', keyboard: false }).addTo(group);
    marker.on('dragend', () => onMove(i, marker.getLatLng()));
    marker.on('click', e => { L.DomEvent.stop(e); onRemove(i); });
  });
}

// Results are ranked around the map's centre, rounded to about 10 km, so nearby places come first.
export async function searchPlaces(query, center, signal) {
  const params = new URLSearchParams({ q: query, limit: 20, lang: 'en', zoom: 9, lat: center.lat.toFixed(1), lon: center.lng.toFixed(1) });
  const res = await fetch(`${SEARCH}?${params}`, { signal });
  if (!res.ok) throw new Error('search failed');
  const { features } = await res.json();
  const places = features.filter(f => !NOT_PLACES.has(f.properties.osm_key));
  const seen = new Set();
  return (places.length ? places : features).map(({ properties: p, geometry }) => {
    const detail = [...new Set([p.city, p.county, p.state, p.country])].filter(v => v && v !== p.name).join(', ');
    const [west, north, east, south] = p.extent || [];
    return {
      name: p.name || p.street || p.city, detail,
      center: [geometry.coordinates[1], geometry.coordinates[0]],
      bounds: p.extent ? [[south, west], [north, east]] : null,
    };
  }).filter(place => {
    const key = `${place.name}|${place.detail}`;
    return place.name && !seen.has(key) && seen.add(key);
  }).slice(0, 6);
}

const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function downloadGpx(name, pts) {
  const trkpts = pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ''}</trkpt>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Base Miles" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${xml(name)}</name><trkseg>
${trkpts}
</trkseg></trk>
</gpx>
`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  link.download = `${name.replace(/[^\w -]+/g, '').trim() || 'route'}.gpx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
