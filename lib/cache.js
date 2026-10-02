/* Simple in-memory cache dengan TTL — pengganti CacheService.getScriptCache().
 * Catatan: di Vercel serverless, cache ini hanya hidup per instance (cold start
 * akan mengosongkannya). Untuk TTL kecil (120-600 detik) ini sudah cukup. */
const store = new Map();

export function get(key) {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { store.delete(key); return null; }
  return e.val;
}

export function put(key, val, ttlSeconds) {
  store.set(key, { val, exp: Date.now() + (ttlSeconds * 1000) });
}

export function remove(key) {
  store.delete(key);
}

export function clear() {
  store.clear();
}
