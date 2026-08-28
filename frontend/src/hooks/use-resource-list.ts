import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/src/lib/api";

export function useResourceList<T>(path: string, refreshSeconds: number) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const refreshingRef = useRef(false);

  const load = useCallback(async () => {
    if (refreshingRef.current) return false;
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const result = await api<{ items: T[] }>(path);
      setItems(result.items ?? []);
      setError("");
      setLastLoadedAt(Date.now());
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!refreshSeconds) return;
    const id = window.setInterval(() => void load(), refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshSeconds]);

  return { items, error, isRefreshing, lastLoadedAt, load };
}
