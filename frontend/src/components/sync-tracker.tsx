import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/src/lib/api";
import { evaluateSync, newSyncTask, syncReadError, type SyncTask } from "@/src/lib/sync-state";
import { deploymentPhase } from "@/src/lib/deployment-state";
import { ResourceLink } from "@/src/components/resource-link";
import type { BundleRollout, RepositoryRollout, RepositorySyncResult, ReconcileResult } from "@/src/types";

const KEY = "fleet-webui.syncTasks.v1";
const labels = { running: "In progress", succeeded: "Succeeded", failed: "Failed", partial: "Partially completed", "timed-out": "Timed out", superseded: "Superseded" };
const Context = createContext<(result: ReconcileResult | RepositorySyncResult) => void>(() => {});
export const useSyncTracking = () => useContext(Context);

function restore(): SyncTask[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((t): t is SyncTask => t && typeof t.id === "string" && typeof t.startedAt === "number" &&
      t.request && ["bundle", "repository"].includes(t.request.kind) && typeof t.request.name === "string" && typeof t.request.namespace === "string" &&
      typeof t.request.generation === "number" && t.outcome in labels && Array.isArray(t.targets) && Array.isArray(t.deployments)).slice(-30);
  } catch { return []; }
}

export function SyncTrackingProvider({ children, browserAlerts, onToast }: {
  children: ReactNode; browserAlerts: boolean;
  onToast: (title: string, description: string, status: "success" | "error" | "information") => void;
}) {
  const [tasks, setTasks] = useState<SyncTask[]>(restore);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const feedback = useRef({ browserAlerts, onToast });
  feedback.current = { browserAlerts, onToast };
  const announced = useRef(new Set(tasks.filter(t => t.outcome !== "running").map(t => t.id)));
  const [expanded, setExpanded] = useState(false);
  const start = useCallback((result: ReconcileResult | RepositorySyncResult) => {
    setTasks(current => [...current.filter(t => t.outcome === "running" || Date.now() - t.startedAt < 24 * 60 * 60 * 1000), newSyncTask(result, Date.now())]);
    setExpanded(true);
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(tasks)); } catch { /* Tracking still works when storage is unavailable. */ }
    for (const task of tasks) {
      if (task.outcome === "running" || announced.current.has(task.id)) continue;
      announced.current.add(task.id);
      const title = `${task.request.kind === "repository" ? "Repository sync" : "Reconcile"} ${labels[task.outcome].toLowerCase()}`;
      const description = `${task.request.namespace}/${task.request.name} · ${task.ready}/${task.total} ready`;
      feedback.current.onToast(title, description, task.outcome === "succeeded" ? "success" : task.outcome === "superseded" ? "information" : "error");
      if (feedback.current.browserAlerts && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(title, { body: description, tag: task.id }); } catch { /* In-page result remains available. */ }
      }
    }
  }, [tasks]);
  const hasRunning = tasks.some(t => t.outcome === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const active = tasksRef.current.filter(t => t.outcome === "running");
      // One snapshot per Bundle, even when it has multiple pending requests.
      const snapshots = new Map<string, Promise<BundleRollout | RepositoryRollout>>();
      const results = await Promise.all(active.map(async task => {
        const b = task.request;
        const path = `/api/${b.kind === "bundle" ? "bundles" : "gitrepos"}/${encodeURIComponent(b.namespace)}/${encodeURIComponent(b.name)}/rollout`;
        let snapshot = snapshots.get(path);
        if (!snapshot) { snapshot = api<BundleRollout | RepositoryRollout>(path, { signal: controller.signal }); snapshots.set(path, snapshot); }
        try { return evaluateSync(task, await snapshot, Date.now()); }
        catch (reason) { return syncReadError(task, reason instanceof Error ? reason.message : String(reason), Date.now()); }
      }));
      if (controller.signal.aborted) return;
      const byID = new Map(results.map(t => [t.id, t]));
      setTasks(current => current.map(t => byID.get(t.id) ?? t));
      timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [hasRunning]);
  const running = tasks.filter(t => t.outcome === "running").length;
  return <Context.Provider value={start}>
    {tasks.length ? <section className="mb-6 rounded-xl border border-border-primary bg-background-primary-default p-4" aria-label="Sync activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="text-body-medium text-text-primary">Sync activity · {running} active / {tasks.length} tracked {expanded ? "▴" : "▾"}</button>
        {tasks.some(t => t.outcome !== "running") ? <button type="button" onClick={() => setTasks(current => current.filter(t => t.outcome === "running"))} className="text-caption-1-medium text-accent-700">Clear finished</button> : null}
      </div>
      {expanded ? <div className="mt-3 space-y-3">
        <p className="text-caption-1-regular text-text-tertiary">Checked every 5 seconds while this console is open. Restored on reload in this tab. Observation stops after 15 minutes; Fleet keeps running.</p>
        {[...tasks].reverse().map(t => <article key={t.id} className="rounded-lg border border-border-primary p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <ResourceLink kind={t.request.kind} namespace={t.request.namespace} name={t.request.name} />
            <span className={t.outcome === "succeeded" ? "text-status-lime-text" : t.outcome === "running" ? "text-text-secondary" : "text-status-yellow-text"}>{labels[t.outcome]}</span>
          </div>
          <p className="mt-2 text-body-regular text-text-secondary" role="status">{t.stage}</p>
          <div className="mt-2 flex items-center gap-3"><progress className="h-2 min-w-0 flex-1 accent-lime-600" max={Math.max(1, t.total)} value={t.ready} aria-label={`Ready deployments for ${t.request.name}`} /><span className="text-caption-1-regular text-text-tertiary">{t.ready}/{t.total} ready · {Math.floor(((t.finishedAt ?? Date.now()) - t.startedAt) / 1000)}s</span></div>
          <p className="mt-1 text-caption-1-regular text-text-tertiary">Generation {t.request.generation}{t.checkedAt ? ` · last checked ${new Date(t.checkedAt).toLocaleTimeString()}` : " · awaiting first check"}</p>
          {t.error ? <p role="alert" className="mt-2 break-words text-status-yellow-text">Cannot confirm current state: {t.error}</p> : null}
          {t.deployments.length ? <details className="mt-2 text-caption-1-regular"><summary className="cursor-pointer text-accent-700">Target details</summary><ul className="mt-2 space-y-2">{t.deployments.map(d => <li key={`${d.namespace}/${d.name}`}>
            <ResourceLink kind="deployment" namespace={d.namespace} name={d.name}>{d.cluster}</ResourceLink> · {deploymentPhase(d)}{d.forceGeneration !== t.request.generation ? " · awaiting this request" : ""}{d.message ? ` · ${d.message}` : ""}
          </li>)}</ul></details> : null}
        </article>)}
      </div> : null}
    </section> : null}
    {children}
  </Context.Provider>;
}
