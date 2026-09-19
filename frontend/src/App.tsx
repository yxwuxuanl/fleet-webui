import { SyncTrackingProvider } from "@/src/components/sync-tracker";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { NotificationStatus } from "@/components/base/notification/notification";
import { ErrorBanner } from "@/src/components/error-banner";
import { FleetShell, type ViewKey } from "@/src/components/fleet-shell";
import type { ToastItem } from "@/src/components/toast-stack";
import { useFleetData } from "@/src/hooks/use-fleet-data";

const MatrixView = lazy(() => import("@/src/features/matrix/matrix-view"));
const BundlesView = lazy(() => import("@/src/features/bundles/bundles-view"));
const RepositoriesView = lazy(
  () => import("@/src/features/repositories/repositories-view"),
);
const ClustersView = lazy(
  () => import("@/src/features/clusters/clusters-view"),
);
const DeploymentsView = lazy(
  () => import("@/src/features/deployments/deployments-view"),
);
const SettingsView = lazy(
  () => import("@/src/features/settings/settings-view"),
);
const ToastStack = lazy(() => import("@/src/components/toast-stack"));

const REFRESH_KEY = "fleet-webui.refreshIntervalSeconds";
const BROWSER_ALERT_KEY = "fleet-webui.browserNotificationsEnabled";
const VIEWS = new Set<ViewKey>([
  "bundles",
  "repositories",
  "clusters",
  "deployments",
  "matrix",
  "settings",
]);

function initialView(): ViewKey {
  const params = new URLSearchParams(window.location.search);
  if (params.has("bundle")) return "bundles";
  const requested = params.get("view") as ViewKey | null;
  return requested && VIEWS.has(requested) ? requested : "bundles";
}

function ModuleLoading() {
  return (
    <div className="space-y-4" aria-label="Loading module">
      <div className="h-20 animate-pulse rounded-xl bg-background-tertiary-default" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-2xl bg-background-tertiary-default"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-background-tertiary-default" />
    </div>
  );
}

export default function App() {
  const [view, setViewState] = useState<ViewKey>(initialView);
  const {
    health,
    bundles,
    repositories,
    errors,
    isRefreshing,
    lastLoadedAt,
    loadData,
  } = useFleetData(view === "bundles" || view === "repositories");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(() =>
    Number(window.localStorage.getItem(REFRESH_KEY) ?? 30),
  );
  const [browserAlerts, setBrowserAlerts] = useState(
    () =>
      window.localStorage.getItem(BROWSER_ALERT_KEY) === "true" &&
      "Notification" in window &&
      window.Notification.permission === "granted",
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (title: string, description = "", status: NotificationStatus = "neutral") =>
      setToasts((current) => [
        ...current,
        { id: Date.now() + Math.random(), title, description, status },
      ]),
    [],
  );
  const refreshFleetData = useCallback(
    async (showToast = true) => {
      const result = await loadData();
      if (showToast)
        pushToast(
          result.failureCount ? "Refresh incomplete" : "Fleet data refreshed",
          result.failureCount
            ? `${result.failureCount} request${result.failureCount === 1 ? "" : "s"} failed.`
            : "Latest control-plane state is now visible.",
          result.failureCount ? "error" : "success",
        );
    },
    [loadData, pushToast],
  );

  useEffect(() => {
    window.localStorage.setItem(REFRESH_KEY, String(refreshSeconds));
  }, [refreshSeconds]);
  useEffect(() => {
    if (!refreshSeconds || (view !== "bundles" && view !== "repositories"))
      return;
    const id = window.setInterval(
      () => void refreshFleetData(false),
      refreshSeconds * 1000,
    );
    return () => window.clearInterval(id);
  }, [refreshFleetData, refreshSeconds, view]);
  useEffect(() => {
    const onPopState = () => setViewState(initialView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setView = useCallback((next: ViewKey) => {
    setViewState(next);
    const url = new URL(window.location.href);
    if (next === "bundles") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    for (const key of ["bundle", "repository", "deployment", "cluster"]) url.searchParams.delete(key);
    window.history.pushState({}, "", url);
  }, []);

  async function toggleBrowserAlerts() {
    if (browserAlerts) {
      setBrowserAlerts(false);
      window.localStorage.setItem(BROWSER_ALERT_KEY, "false");
      pushToast("Browser alerts turned off");
      return;
    }
    if (!("Notification" in window)) {
      pushToast(
        "Browser alerts unavailable",
        "This browser does not support system notifications.",
        "error",
      );
      return;
    }
    const permission = await window.Notification.requestPermission();
    const active = permission === "granted";
    setBrowserAlerts(active);
    window.localStorage.setItem(BROWSER_ALERT_KEY, String(active));
    pushToast(
      active ? "Browser alerts enabled" : "Browser alerts were not enabled",
      active
        ? "Reconcile outcomes can now appear as system notifications."
        : "Permission was not granted.",
      active ? "success" : "error",
    );
  }

  const baseErrors =
    view === "bundles" || view === "repositories"
      ? Object.values(errors).filter(Boolean)
      : errors.health
        ? [errors.health]
        : [];

  return (
    <FleetShell
      health={health}
      view={view}
      onViewChange={setView}
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
      attentionOnly={attentionOnly}
      onAttentionToggle={() => setAttentionOnly((value) => !value)}
    >
      <SyncTrackingProvider browserAlerts={browserAlerts} onToast={pushToast}>
        <ErrorBanner messages={baseErrors} />
        <Suspense fallback={<ModuleLoading />}>
          {view === "bundles" ? (
            <BundlesView
              bundles={bundles}
              repositories={repositories}
              lastLoadedAt={lastLoadedAt}
              isRefreshing={isRefreshing}
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshFleetData}
              attentionOnly={attentionOnly}
              onToast={pushToast}
            />
          ) : null}
          {view === "repositories" ? (
            <RepositoriesView
              repositories={repositories}
              isRefreshing={isRefreshing}
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={() => refreshFleetData()}
            />
          ) : null}
          {view === "clusters" ? (
            <ClustersView
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onToast={pushToast}
            />
          ) : null}
          {view === "deployments" ? (
            <DeploymentsView
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onToast={pushToast}
            />
          ) : null}
          {view === "matrix" ? <MatrixView refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} /> : null}
          {view === "settings" ? (
            <SettingsView
              reconcileEnabled={health.reconcileEnabled}
              gitHistoryEnabled={Boolean(health.gitHistoryEnabled)}
              gitRepoActionsEnabled={Boolean(health.gitRepoActionsEnabled)}
              browserAlerts={browserAlerts}
              onBrowserAlertsChange={() => void toggleBrowserAlerts()}
            />
          ) : null}
        </Suspense>
        {toasts.length ? (
          <Suspense fallback={null}>
            <ToastStack
              items={toasts}
              onDismiss={(id) =>
                setToasts((current) => current.filter((item) => item.id !== id))
              }
            />
          </Suspense>
        ) : null}
      </SyncTrackingProvider>
    </FleetShell>
  );
}
