import { useEffect, useState } from "react";

/**
 * Load one reference list, with the three states every fetch actually has.
 *
 * `error` is surfaced rather than swallowed: a country picker that silently
 * renders empty looks like a broken form, while "couldn't load countries" tells
 * the person what went wrong and that retrying may help.
 */
export default function useReferenceData(loader, fallback = []) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loader()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this list. Check your connection and reload.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The loader functions are module-level constants, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}
