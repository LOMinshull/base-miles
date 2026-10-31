// Everything lives in this browser's IndexedDB. Nothing is uploaded anywhere.
const DB = 'base-miles';
const STORES = ['rides', 'routes', 'segments'];

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('rides', { keyPath: 'start' });
      db.createObjectStore('routes', { keyPath: 'id' });
      db.createObjectStore('segments', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = tx.onabort = () => reject(tx.error);
});

export async function loadAll() {
  const db = await open();
  const tx = db.transaction([...STORES, 'kv']);
  const get = name => new Promise(resolve => { tx.objectStore(name).getAll().onsuccess = e => resolve(e.target.result); });
  const settings = new Promise(resolve => { tx.objectStore('kv').get('settings').onsuccess = e => resolve(e.target.result || {}); });
  const [rides, routes, segments, s] = await Promise.all([get('rides'), get('routes'), get('segments'), settings]);
  db.close();
  return { rides, routes, segments, settings: s };
}

export async function saveAll(store, items, { replace = false } = {}) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  if (replace) os.clear();
  for (const item of items) os.put(item);
  await done(tx);
  db.close();
}

export async function removeItem(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
  db.close();
}

export async function saveSettings(settings) {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(settings, 'settings');
  await done(tx);
  db.close();
}

export async function getValue(key) {
  const db = await open();
  const value = await new Promise(resolve => {
    db.transaction('kv').objectStore('kv').get(key).onsuccess = e => resolve(e.target.result);
  });
  db.close();
  return value;
}

export async function setValue(key, value) {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  await done(tx);
  db.close();
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  STORES.forEach(s => tx.objectStore(s).clear());
  await done(tx);
  db.close();
}
