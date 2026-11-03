import { useEffect, useState } from "react";
import { errorMessage } from "./api";

/**
 * Loads data when `deps` change and exposes reload(). The loader is intentionally
 * excluded from the effect's dependencies: callers pass what should trigger a refetch.
 */
export function useResource<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({
    data: null,
    error: "",
    loading: true,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loader();
        if (!cancelled) setState({ data, error: "", loading: false });
      } catch (err) {
        if (!cancelled) setState({ data: null, error: errorMessage(err), loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
