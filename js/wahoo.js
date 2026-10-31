// Picks up new Wahoo FIT files that Dropbox has synced to this Mac, through server.py.
import { importFiles } from './importers.js';
import { getValue, setValue } from './store.js';

const SEEN = 'wahooSeen';
const fileKey = f => `${f.name}|${f.mtime}|${f.size}`;

export async function checkWahoo(rides) {
  const result = { state: 'off', folder: null, added: 0, failed: [], checked: Date.now() };
  // The hosted site has no server.py behind it, and Dropbox is only reachable from the Mac.
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return { ...result, state: 'web' };
  let info;
  try {
    const res = await fetch('/api/wahoo');
    if (!res.ok) return result;
    info = await res.json();
  } catch {
    return result;
  }
  result.folder = info.folder;
  result.state = info.folder ? 'ready' : info.dropbox ? 'no-folder' : 'no-dropbox';

  const seen = new Set(await getValue(SEEN) || []);
  for (const file of info.files.filter(f => !seen.has(fileKey(f)))) {
    try {
      const res = await fetch(`/api/wahoo/file?name=${encodeURIComponent(file.name)}`);
      if (!res.ok) throw new Error(`The file could not be opened (${res.status})`);
      const fit = new File([await res.blob()], file.name.split('/').pop());
      const before = rides.length;
      const report = await importFiles([fit], rides);
      // Unreadable files stay unseen, so a file caught mid-sync is retried on the next check.
      if (report.failed.length) { result.failed.push(...report.failed); continue; }
      for (const ride of rides.slice(before)) if (ride.name === 'Ride') ride.name = 'Wahoo ride';
      result.added += report.added + report.merged;
      seen.add(fileKey(file));
    } catch (err) {
      result.failed.push(`${file.name}: ${err.message}`);
    }
  }
  result.seen = [...seen];
  return result;
}

export const rememberSeen = keys => setValue(SEEN, keys);
export const forgetSeen = () => setValue(SEEN, []);
