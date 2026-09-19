import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";

export function useFleetVersion() {
  const [version, setVersion] = useState<string | null>();

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await api<{ version: string }>("/api/fleet-version", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setVersion(result.version || null);
      } catch {
        if (!controller.signal.aborted) setVersion(null);
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return version;
}
