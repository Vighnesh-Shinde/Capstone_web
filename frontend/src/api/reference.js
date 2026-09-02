import apiClient from "./client";

/**
 * Reference data — countries, dial codes, session languages, document types.
 *
 * Fetched rather than bundled. The language list in particular is not static
 * data: whether a language can be scored depends on which model weights an
 * administrator has activated on this deployment, so a hardcoded copy in the
 * frontend would confidently offer options the backend then refuses.
 *
 * Cached per page load in module scope. These lists change when an admin
 * uploads models, not while a counselor is filling in a form, so refetching on
 * every mount would be three redundant requests per screen.
 */
const cache = new Map();

async function cached(key, loader) {
  if (!cache.has(key)) {
    // The promise is cached, not the result, so two components mounting at once
    // share one request instead of racing two.
    cache.set(key, loader().catch((err) => {
      cache.delete(key);
      throw err;
    }));
  }
  return cache.get(key);
}

export function getCountries() {
  return cached("countries", async () => {
    const { data } = await apiClient.get("/reference/countries");
    return data;
  });
}

export function getLanguages() {
  return cached("languages", async () => {
    const { data } = await apiClient.get("/reference/languages");
    return data.languages;
  });
}

export function getDocumentTypes() {
  return cached("documentTypes", async () => {
    const { data } = await apiClient.get("/reference/document-types");
    return data;
  });
}

/** Forget everything, so an admin activating new models sees it immediately. */
export function clearReferenceCache() {
  cache.clear();
}
