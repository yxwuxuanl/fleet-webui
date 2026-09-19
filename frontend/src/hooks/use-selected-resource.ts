import { useEffect, useState } from "react";
import type { ResourceKind } from "@/src/lib/navigation";

export function useSelectedResource<T extends { namespace: string; name: string }>(kind: ResourceKind, items: T[]) {
  const read = () => new URLSearchParams(window.location.search).get(kind);
  const [id, setID] = useState(read);
  useEffect(() => {
    const update = () => setID(read());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [kind]);
  const select = (item: T | null) => {
    const next = item ? `${item.namespace}/${item.name}` : null;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set(kind, next);
    else url.searchParams.delete(kind);
    window.history.replaceState({}, "", url);
    setID(next);
  };
  return [items.find((item) => `${item.namespace}/${item.name}` === id) ?? null, select] as const;
}
