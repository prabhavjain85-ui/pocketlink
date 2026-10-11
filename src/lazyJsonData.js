/**
 * Fetch large static JSON from `public/data/` at runtime (not bundled in main.js).
 * Use for datasets over ~100 KB. CRA serves `public/` at the site root.
 *
 * @param {string} filename - e.g. "approvedDrugs.json" (under public/data/)
 * @returns {Promise<unknown>}
 */
const cache = new Map();

export async function loadJsonFromPublic(filename) {
  const key = String(filename || "").replace(/^\//, "");
  if (!key) throw new Error("loadJsonFromPublic: filename required");
  if (cache.has(key)) {
    const hit = cache.get(key);
    return hit instanceof Promise ? hit : Promise.resolve(hit);
  }
  const base = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
  const url = `${base}/data/${key}`;
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cache.set(key, data);
      return data;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, promise);
  return promise;
}

/** Test-only: inject parsed JSON without fetch. */
export function seedJsonFromPublic(filename, data) {
  cache.set(String(filename || "").replace(/^\//, ""), data);
}

/** Test-only: clear module cache between tests. */
export function clearJsonFromPublicCache() {
  cache.clear();
}
