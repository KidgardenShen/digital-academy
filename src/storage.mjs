import { validateEdition } from './validate.mjs';

export const keyOf = p => [p.work.work_id, p.edition.edition_id, p.data_version];
export const editionKey = p => JSON.stringify(keyOf(p));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

export function openShelf(name = 'jingdu-local-shelf-v1') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('editions');
      store.createIndex('work', 'work.work_id');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export function listEditions(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('editions').objectStore('editions').getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function importEdition(db, pkg) {
  validateEdition(pkg);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('editions', 'readwrite');
    const store = tx.objectStore('editions');
    const req = store.index('work').getAll(pkg.work.work_id);
    let outcome = 'added';
    let reason;
    tx.oncomplete = () => resolve(outcome);
    tx.onabort = () => reject(reason ?? tx.error ?? new Error('保存失败，请检查浏览器存储空间。'));
    req.onsuccess = () => {
      try {
        const previous = req.result.find(p => editionKey(p) === editionKey(pkg));
        if (previous) {
          if (JSON.stringify(canonical(previous)) !== JSON.stringify(canonical(pkg))) {
            throw Error('/data_version · 同一注本修订号已有不同内容，请使用新修订号。');
          }
          outcome = 'existing';
          return;
        }
        if (req.result.some(p => p.work.title !== pkg.work.title)) throw Error('/work/title · 同一经典标识已有其他书名。');
        store.add(pkg, keyOf(pkg));
      } catch (error) {
        reason = error;
        tx.abort();
      }
    };
  });
}
