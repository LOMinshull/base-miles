// Minimal FIT decoder: reads only the record, session and file_id messages Base Miles needs.
const FIT_EPOCH = 631065600; // seconds between 1970-01-01 and 1989-12-31

const SIZE = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8 };

function readValue(view, pos, type, little) {
  switch (type) {
    case 0: case 2: case 10: case 13: { const v = view.getUint8(pos); return v === 0xff ? null : v; }
    case 1: { const v = view.getInt8(pos); return v === 0x7f ? null : v; }
    case 3: { const v = view.getInt16(pos, little); return v === 0x7fff ? null : v; }
    case 4: case 11: { const v = view.getUint16(pos, little); return v === 0xffff ? null : v; }
    case 5: { const v = view.getInt32(pos, little); return v === 0x7fffffff ? null : v; }
    case 6: case 12: { const v = view.getUint32(pos, little); return v === 0xffffffff ? null : v; }
    case 8: { const v = view.getFloat32(pos, little); return Number.isFinite(v) ? v : null; }
    case 9: { const v = view.getFloat64(pos, little); return Number.isFinite(v) ? v : null; }
    default: return null;
  }
}

const SEMI = 180 / 2147483648;

export function parseFit(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 14) throw new Error('File too short to be FIT');
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const sig = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (sig !== '.FIT') throw new Error('Missing .FIT signature');

  const end = Math.min(headerSize + dataSize, bytes.length);
  const defs = {};
  const records = [];
  let session = null;
  let fileSport = null;
  let lastTimestamp = 0;
  let pos = headerSize;

  while (pos < end) {
    const h = view.getUint8(pos++);
    let local, compressedOffset = null;

    if (h & 0x80) {
      local = (h >> 5) & 0x03;
      compressedOffset = h & 0x1f;
    } else if (h & 0x40) {
      local = h & 0x0f;
      const little = view.getUint8(pos + 1) === 0;
      const global = view.getUint16(pos + 2, little);
      const count = view.getUint8(pos + 4);
      pos += 5;
      const fields = [];
      for (let i = 0; i < count; i++) {
        fields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), type: view.getUint8(pos + 2) & 0x1f });
        pos += 3;
      }
      let devSize = 0;
      if (h & 0x20) {
        const devCount = view.getUint8(pos++);
        for (let i = 0; i < devCount; i++) { devSize += view.getUint8(pos + 1); pos += 3; }
      }
      defs[local] = { little, global, fields, devSize };
      continue;
    } else {
      local = h & 0x0f;
    }

    const def = defs[local];
    if (!def) throw new Error('Data message before its definition');
    const msg = {};
    for (const f of def.fields) {
      if (f.size === SIZE[f.type]) msg[f.num] = readValue(view, pos, f.type, def.little);
      pos += f.size;
    }
    pos += def.devSize;

    if (compressedOffset !== null) {
      let ts = (lastTimestamp & ~0x1f) | compressedOffset;
      if (compressedOffset < (lastTimestamp & 0x1f)) ts += 0x20;
      msg[253] = ts;
    }
    if (msg[253] != null) lastTimestamp = msg[253];

    if (def.global === 20) {
      if (msg[253] == null) continue;
      const alt = msg[78] ?? msg[2];
      const speed = msg[73] ?? msg[6];
      records.push({
        t: msg[253] + FIT_EPOCH,
        lat: msg[0] != null ? msg[0] * SEMI : null,
        lng: msg[1] != null ? msg[1] * SEMI : null,
        alt: alt != null ? alt / 5 - 500 : null,
        dist: msg[5] != null ? msg[5] / 100 : null,
        speed: speed != null ? speed / 1000 : null,
        hr: msg[3] || null,
        cad: msg[4] ?? null,
        pow: msg[7] ?? null,
      });
    } else if (def.global === 18 && !session) {
      session = {
        start: msg[2] != null ? (msg[2] + FIT_EPOCH) * 1000 : null,
        sport: msg[5] ?? null,
        subSport: msg[6] ?? null,
        elapsed: msg[7] != null ? msg[7] / 1000 : null,
        moving: msg[8] != null ? msg[8] / 1000 : null,
        dist: msg[9] != null ? msg[9] / 100 : null,
        maxSpeed: (msg[125] ?? msg[15]) != null ? (msg[125] ?? msg[15]) / 1000 : null,
        gain: msg[22] ?? null,
      };
    } else if (def.global === 12 && fileSport == null) {
      fileSport = msg[0] ?? null; // sport message
    }
  }

  return { records, session, sport: session?.sport ?? fileSport };
}
