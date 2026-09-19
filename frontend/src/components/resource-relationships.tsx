import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import { deploymentPhase } from "@/src/lib/deployment-state";
import { ResourceLink } from "@/src/components/resource-link";
import { ManagedObjectsPanel } from "@/src/components/managed-objects";
import { ErrorBanner } from "@/src/components/error-banner";
import type { BundleRollout, BundleView } from "@/src/types";

export function RepositoryBundles({ namespace, name }: { namespace: string; name: string }) {
  const [items, setItems] = useState<BundleView[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setItems(null); setError("");
    void api<{ items: BundleView[] }>("/api/bundles", { signal: controller.signal }).then(result => {
      setItems(result.items.filter(b => b.namespace === namespace && b.gitRepo === name));
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [namespace, name]);
  return <section>
    <h3 className="text-body-medium text-text-primary">Generated bundles</h3>
    <ErrorBanner messages={error ? [error] : []} />
    {items === null ? <p className="mt-3 text-text-tertiary">{error ? "Bundle relationships unavailable." : "Loading bundle relationships…"}</p> : !items.length ? <p className="mt-3 text-text-tertiary">No generated bundles reported.</p> :
      <ul className="mt-3 divide-y divide-border-primary rounded-xl border border-border-primary">{items.map(b => <li key={b.name} className="flex flex-wrap justify-between gap-2 p-3">
        <ResourceLink kind="bundle" namespace={b.namespace} name={b.name} />
        <span className="text-caption-1-regular text-text-tertiary">{b.state} · {b.targets} clusters ready</span>
      </li>)}</ul>}
  </section>;
}

export function BundleTargets({ namespace, name }: { namespace: string; name: string }) {
  const [rollout, setRollout] = useState<BundleRollout | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setRollout(null); setError(""); setExpanded(null);
    void api<BundleRollout>(`/api/bundles/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/rollout`, { signal: controller.signal }).then(result => {
      setRollout(result);
      const problem = result.items.find(d => deploymentPhase(d) !== "Ready");
      if (problem) setExpanded(`${problem.namespace}/${problem.name}`);
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [namespace, name]);
  const items = [...(rollout?.items ?? [])].sort((a, b) => Number(deploymentPhase(a) === "Ready") - Number(deploymentPhase(b) === "Ready") || a.cluster.localeCompare(b.cluster));
  return <section>
    <h3 className="text-body-medium text-text-primary">Deployment path</h3>
    <p className="mt-1 text-caption-1-regular text-text-tertiary">Cluster deployment → managed objects → pod diagnostics. Targets needing attention appear first.</p>
    <ErrorBanner messages={error ? [error] : []} />
    {!rollout ? <p className="mt-3 text-text-tertiary">{error ? "Deployment path unavailable." : "Loading target deployments…"}</p> : !items.length ? <p className="mt-3 text-text-tertiary">No target deployments reported yet.</p> :
      <ul className="mt-3 space-y-3">{items.map(d => {
        const id = `${d.namespace}/${d.name}`;
        const phase = deploymentPhase(d);
        return <li key={id} className="rounded-xl border border-border-primary p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ResourceLink kind="deployment" namespace={d.namespace} name={d.name}>{d.cluster} · {d.name}</ResourceLink>
            <span className={`text-caption-1-medium ${phase === "Ready" ? "text-status-lime-text" : "text-status-yellow-text"}`}>{phase}</span>
          </div>
          {d.message ? <p className="mt-2 break-words text-body-regular text-text-secondary">{d.message}</p> : null}
          <button type="button" aria-expanded={expanded === id} onClick={() => setExpanded(expanded === id ? null : id)} className="mt-3 text-body-medium text-accent-700">{expanded === id ? "Hide resources" : "Inspect resources"}</button>
          {expanded === id ? <div className="mt-3 border-l-2 border-border-primary pl-3"><ManagedObjectsPanel deployment={d} active /></div> : null}
        </li>;
      })}</ul>}
  </section>;
}
