import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import type {
  BundleView,
  GitRepoView,
  HealthStatus,
  LoadErrors,
} from "@/src/types";

const initialHealth: HealthStatus = {
  mode: "unconfigured",
  connectionError: "",
  reconcileEnabled: false,
};

export function useFleetData(loadResources: boolean) {
  const [health, setHealth] = useState<HealthStatus>(initialHealth);
  const [bundles, setBundles] = useState<BundleView[]>([]);
  const [repositories, setRepositories] = useState<GitRepoView[]>([]);
  const [errors, setErrors] = useState<LoadErrors>({
    health: "",
    bundles: "",
    repositories: "",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const refreshingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (refreshingRef.current) return { failureCount: 0, skipped: true };
    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const bundleRequest = loadResources
        ? api<{ items: BundleView[] }>("/api/bundles")
        : Promise.resolve<null>(null);
      const repositoryRequest = loadResources
        ? api<{ items: GitRepoView[] }>("/api/gitrepos")
        : Promise.resolve<null>(null);
      const [healthResult, bundlesResult, repositoriesResult] =
        await Promise.allSettled([
          api<HealthStatus>("/api/health"),
          bundleRequest,
          repositoryRequest,
        ]);

      const nextErrors: LoadErrors = {
        health: "",
        bundles: "",
        repositories: "",
      };
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      else
        nextErrors.health =
          healthResult.reason instanceof Error
            ? healthResult.reason.message
            : String(healthResult.reason);

      if (bundlesResult.status === "fulfilled" && bundlesResult.value)
        setBundles(bundlesResult.value.items ?? []);
      else if (bundlesResult.status === "rejected")
        nextErrors.bundles =
          bundlesResult.reason instanceof Error
            ? bundlesResult.reason.message
            : String(bundlesResult.reason);

      if (repositoriesResult.status === "fulfilled" && repositoriesResult.value)
        setRepositories(repositoriesResult.value.items ?? []);
      else if (repositoriesResult.status === "rejected")
        nextErrors.repositories =
          repositoriesResult.reason instanceof Error
            ? repositoriesResult.reason.message
            : String(repositoriesResult.reason);

      setErrors(nextErrors);
      setLastLoadedAt(Date.now());
      return {
        failureCount: Object.values(nextErrors).filter(Boolean).length,
        skipped: false,
      };
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [loadResources]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return {
    health,
    bundles,
    repositories,
    errors,
    isRefreshing,
    lastLoadedAt,
    loadData,
  };
}
