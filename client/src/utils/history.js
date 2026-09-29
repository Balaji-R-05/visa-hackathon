// Saved reports live in this browser only (localStorage); nothing is sent anywhere.
const KEY = "assay_history";
const MAX_ENTRIES = 10;

export const loadHistory = () => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const persist = (list) => {
  // Reports can be large; if the quota is hit, drop the oldest entries until it fits.
  for (let keep = list.length; keep >= 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, keep)));
      return list.slice(0, keep);
    } catch {
      /* try again with fewer entries */
    }
  }
  return [];
};

export const addToHistory = (report) => {
  if (!report) return loadHistory();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
    name: report.dataset?.dataset_name || "dataset",
    source: report.dataset?.source_type || "",
    score: report.composite_dqs ?? null,
    grade: report.grade ?? null,
    report,
  };
  return persist([entry, ...loadHistory()].slice(0, MAX_ENTRIES));
};

export const removeFromHistory = (id) => persist(loadHistory().filter((e) => e.id !== id));

export const clearHistory = () => persist([]);
