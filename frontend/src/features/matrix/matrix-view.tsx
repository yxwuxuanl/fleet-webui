import { useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Pagination } from "@/components/base/pagination/pagination";
import { ErrorBanner } from "@/src/components/error-banner";
import { PageHeading } from "@/src/components/page-heading";
import { RefreshControl } from "@/src/components/refresh-control";
import { ResourceLink } from "@/src/components/resource-link";
import { useResourceList } from "@/src/hooks/use-resource-list";
import { deploymentPhase, indexDeployments } from "@/src/lib/deployment-state";
import { dateLabel } from "@/src/lib/format";
import type { BundleView, BundleDeploymentView, ClusterView, ClusterGroupView } from "@/src/types";

const selectStyle = "rounded-lg border border-border-primary bg-background-primary-default px-3 py-2 text-body-regular text-text-primary";
export default function MatrixView({ refreshSeconds, onRefreshSecondsChange }: {
  refreshSeconds: number; onRefreshSecondsChange: (seconds: number) => void;
}) {
  const bundles = useResourceList<BundleView>("/api/bundles", refreshSeconds);
  const deployments = useResourceList<BundleDeploymentView>("/api/bundledeployments", refreshSeconds);
  const clusters = useResourceList<ClusterView>("/api/clusters", refreshSeconds);
  const groups = useResourceList<ClusterGroupView>("/api/clustergroups", refreshSeconds);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [clusterSearch, setClusterSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [label, setLabel] = useState("all");
  const [attention, setAttention] = useState(false);
  const [page, setPage] = useState(1);
  const [columnPage, setColumnPage] = useState(1);
  const index = useMemo(() => indexDeployments(deployments.items), [deployments.items]);
  const workspaces = useMemo(() => [...new Set(bundles.items.map(b => b.namespace))].sort(), [bundles.items]);
  const labels = useMemo(() => [...new Set(clusters.items.flatMap(c => Object.entries(c.labels ?? {}).map(([k, v]) => `${k}=${v}`)))].sort(), [clusters.items]);
  const columns = useMemo(() => {
    const known = new Map(clusters.items.filter(c => c.clusterNamespace).map(c => [c.clusterNamespace!, c]));
    for (const item of deployments.items) {
      if (!known.has(item.namespace)) known.set(item.namespace, {
        name: item.cluster, namespace: "", clusterNamespace: item.namespace,
        state: "Unknown", readyBundles: "", paused: false,
      });
    }
    return [...known.values()].filter(c =>
      `${c.namespace}/${c.name}`.toLowerCase().includes(clusterSearch.toLowerCase()) &&
      (groups.error || group === "all" || (groups.items.find(g => `${g.namespace}/${g.name}` === group)?.clusterNamespaces ?? []).includes(c.clusterNamespace!)) &&
      (label === "all" || Object.entries(c.labels ?? {}).some(([k, v]) => `${k}=${v}` === label)),
    ).sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`));
  }, [clusters.items, deployments.items, clusterSearch, label, group, groups.items, groups.error]);
  const rows = useMemo(() => bundles.items.filter(b => {
    if (workspace !== "all" && b.namespace !== workspace) return false;
    if (!`${b.namespace}/${b.name} ${b.gitRepo}`.toLowerCase().includes(search.toLowerCase())) return false;
    return !attention || columns.some(c => (index.get(`${b.namespace}/${b.name}`)?.get(c.clusterNamespace!) ?? []).some(d => deploymentPhase(d) !== "Ready"));
  }).sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`)), [bundles.items, workspace, search, attention, columns, index]);
  const rowPages = Math.max(1, Math.ceil(rows.length / 15));
  const columnPages = Math.max(1, Math.ceil(columns.length / 8));
  const currentPage = Math.min(page, rowPages);
  const currentColumnPage = Math.min(columnPage, columnPages);
  const visibleColumns = columns.slice((currentColumnPage - 1) * 8, currentColumnPage * 8);
  const errors = [bundles.error, deployments.error, clusters.error].filter(Boolean);
  const loading = !bundles.lastLoadedAt || !deployments.lastLoadedAt || !clusters.lastLoadedAt;
  const updated = Math.min(bundles.lastLoadedAt, deployments.lastLoadedAt, clusters.lastLoadedAt);
  return <>
    <PageHeading title="Deployment matrix" description="Compare actual deployment state across clusters. Select a cell to investigate." actions={
      <RefreshControl refreshSeconds={refreshSeconds} onRefreshSecondsChange={onRefreshSecondsChange}
        isRefreshing={bundles.isRefreshing || deployments.isRefreshing || clusters.isRefreshing}
        onRefresh={() => void Promise.all([bundles.load(), deployments.load(), clusters.load(), groups.load()])} />
    } />
    <ErrorBanner messages={errors} />
    <section className="overflow-hidden rounded-2xl border border-border-primary bg-background-primary-default shadow-xs">
      <div className="grid gap-3 border-b border-border-primary p-4 sm:grid-cols-2 xl:grid-cols-3">
        <Input aria-label="Search bundles in matrix" placeholder="Bundle or repository" value={search} onChange={v => { setSearch(v); setPage(1); }} size="small" />
        <Input aria-label="Search matrix clusters" placeholder="Cluster name" value={clusterSearch} onChange={v => { setClusterSearch(v); setColumnPage(1); }} size="small" />
        <select aria-label="Matrix workspace" value={workspace} onChange={e => { setWorkspace(e.target.value); setPage(1); }} className={selectStyle}>
          <option value="all">All workspaces</option>{workspaces.map(w => <option key={w}>{w}</option>)}
        </select>
        <select aria-label="Cluster label" value={label} onChange={e => { setLabel(e.target.value); setColumnPage(1); }} className={selectStyle}>
          <option value="all">All cluster labels</option>{labels.map(l => <option key={l}>{l}</option>)}
        </select>
        <select aria-label="Cluster group" value={groups.error ? "all" : group} disabled={Boolean(groups.error)} onChange={e => { setGroup(e.target.value); setColumnPage(1); }} className={selectStyle}>
          <option value="all">{groups.error ? "ClusterGroups unavailable" : "All cluster groups"}</option>{groups.items.map(g => <option key={`${g.namespace}/${g.name}`} value={`${g.namespace}/${g.name}`}>{g.namespace}/{g.name}</option>)}
        </select>
        <Button size="small" variant={attention ? "primary" : "secondary"} onClick={() => { setAttention(!attention); setPage(1); }}>{attention ? "Showing attention" : "Needs attention"}</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 text-caption-1-regular text-text-tertiary">
        <span>{rows.length} bundles · {columns.length} clusters{updated ? ` · updated ${dateLabel(new Date(updated).toISOString())}` : ""}</span>
        <span>Versions are Fleet deployment IDs, not Git commits.</span>
      </div>
      {groups.error ? <p className="px-4 pb-4 text-caption-1-regular text-status-yellow-text">ClusterGroup filtering is unavailable. Check access to Fleet ClusterGroups; other filters remain available.</p> : null}
      {errors.length ? <p role="status" className="px-4 pb-4 text-status-yellow-text">Some data could not be refreshed. Previously loaded values may be stale.</p> : null}
      {loading ? <p className="p-8 text-text-tertiary">{errors.length ? "Matrix unavailable until resource data can be loaded." : "Loading deployment matrix…"}</p> : !rows.length || !columns.length ? <p className="p-8 text-text-tertiary">No bundles or clusters match these filters.</p> :
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scrollable deployment matrix">
          <table className="w-full border-collapse text-left text-body-regular" aria-label="Bundle by cluster deployment matrix">
            <thead><tr className="border-y border-border-primary bg-background-secondary-default">
              <th scope="col" className="sticky left-0 z-10 min-w-48 bg-background-secondary-default p-4">Bundle / Cluster</th>
              {visibleColumns.map(c => <th scope="col" key={c.clusterNamespace} className="min-w-52 p-4">
                {c.namespace ? <ResourceLink kind="cluster" namespace={c.namespace} name={c.name} /> : c.name}
                <div className="mt-1 text-caption-1-regular text-text-tertiary">{c.namespace || "Cluster identity unavailable"}</div>
              </th>)}
            </tr></thead>
            <tbody>{rows.slice((currentPage - 1) * 15, currentPage * 15).map(b => <tr key={`${b.namespace}/${b.name}`} className="border-b border-border-primary">
              <th scope="row" className="sticky left-0 z-10 max-w-64 bg-background-primary-default p-4">
                <ResourceLink kind="bundle" namespace={b.namespace} name={b.name} />
                <div className="mt-1 text-caption-1-regular text-text-tertiary">{b.namespace}</div>
              </th>
              {visibleColumns.map(c => {
                const items = index.get(`${b.namespace}/${b.name}`)?.get(c.clusterNamespace!) ?? [];
                return <td key={c.clusterNamespace} className="p-2 align-top">{items.length ? items.map(d => {
                  const phase = deploymentPhase(d);
                  const tone = phase === "Ready" ? "bg-status-lime-background text-status-lime-text" : phase === "Failed" || phase === "Not ready" ? "bg-status-rose-background text-status-rose-text" : "bg-status-yellow-background text-status-yellow-text";
                  return <div key={`${d.namespace}/${d.name}`} className={`mb-1 rounded-lg p-3 ${tone}`}>
                    <ResourceLink kind="deployment" namespace={d.namespace} name={d.name}><span className="font-medium">{phase}</span></ResourceLink>
                    <div title={d.appliedDeploymentID} className="mt-1 max-w-56 truncate font-mono text-caption-1-regular">Applied: {d.appliedDeploymentID || "Not reported"}</div>
                    {phase !== "Ready" ? <div title={d.stagedDeploymentID || d.deploymentID} className="max-w-56 truncate font-mono text-caption-1-regular">Target: {d.stagedDeploymentID || d.deploymentID || "Not reported"}</div> : null}
                    {d.message && phase !== "Ready" ? <p className="mt-1 line-clamp-2 max-w-56 text-caption-1-regular" title={d.message}>{d.message}</p> : null}
                  </div>;
                }) : <span className="block p-3 text-caption-1-regular text-text-tertiary">No deployment</span>}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="p-4 text-caption-1-regular text-text-tertiary">No deployment means no BundleDeployment was reported for this pair; it does not confirm whether the cluster matches the target selector.</p>
    </section>
    <div className="mt-4 flex flex-wrap justify-between gap-4">
      {rowPages > 1 ? <div><p className="mb-2 text-caption-1-regular text-text-tertiary">Bundles</p><Pagination page={currentPage} totalPages={rowPages} onChange={setPage} /></div> : null}
      {columnPages > 1 ? <div><p className="mb-2 text-caption-1-regular text-text-tertiary">Clusters</p><Pagination page={currentColumnPage} totalPages={columnPages} onChange={setColumnPage} /></div> : null}
    </div>
  </>;
}
