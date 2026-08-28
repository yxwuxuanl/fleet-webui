import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  RiAlertLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiPauseCircleLine,
  RiSearchLine,
  RiServerLine,
} from "@remixicon/react";
import type { Key } from "react-aria-components";
import {
  StatCards,
  type Stat,
} from "@/components/application/dashboard/stat-cards";
import { Input } from "@/components/base/input/input";
import { Pagination } from "@/components/base/pagination/pagination";
import { Select, SelectItem } from "@/components/base/select/select";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/base/table/table";
import {
  ConditionsList,
  Definition,
  DetailDrawer,
} from "@/src/components/detail-primitives";
import { ErrorBanner } from "@/src/components/error-banner";
import { PageHeading } from "@/src/components/page-heading";
import { RefreshControl } from "@/src/components/refresh-control";
import { StatusChip } from "@/src/components/status-chip";
import { useResourceList } from "@/src/hooks/use-resource-list";
import { api } from "@/src/lib/api";
import { dateLabel, statusKind } from "@/src/lib/format";
import type { ClusterDetail, ClusterView } from "@/src/types";

const PAGE_SIZE = 10;

function ClusterDrawer({
  cluster,
  onClose,
}: {
  cluster: ClusterView | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!cluster) return;
    setDetail(null);
    setError("");
    void api<ClusterDetail>(
      `/api/clusters/${encodeURIComponent(cluster.namespace)}/${encodeURIComponent(cluster.name)}`,
    )
      .then(setDetail)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [cluster]);
  if (!cluster) return null;
  const source = detail ?? cluster;
  return (
    <DetailDrawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={source.name}
      eyebrow={source.namespace}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <StatusChip value={source.state} />
          {source.paused ? <StatusChip value="Paused" /> : null}
        </div>
        {error ? <ErrorBanner messages={[error]} /> : null}
        {source.message ? (
          <div className="rounded-xl border border-status-yellow-border bg-status-yellow-background p-3 text-body-regular text-status-yellow-text">
            {source.message}
          </div>
        ) : null}
        <section>
          <h3 className="text-body-medium text-text-primary">
            Cluster connection
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
            <Definition label="Ready bundles" value={source.readyBundles} />
            <Definition
              label="Last check-in"
              value={dateLabel(source.lastSeen)}
            />
            <Definition
              label="Cluster namespace"
              value={source.clusterNamespace}
              mono
            />
            <Definition
              label="Agent namespace"
              value={source.agentNamespace}
              mono
            />
            <Definition label="Client ID" value={detail?.clientID} mono />
            <Definition label="API server" value={detail?.apiServerURL} />
            <Definition label="Created" value={dateLabel(detail?.createdAt)} />
            <Definition
              label="Resource version"
              value={detail?.resourceVersion}
              mono
            />
          </dl>
        </section>
        {detail && Object.keys(detail.labels ?? {}).length ? (
          <section>
            <h3 className="text-body-medium text-text-primary">Labels</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(detail.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-md bg-background-tertiary-default px-2 py-1 font-mono text-caption-1-regular text-text-secondary"
                >
                  {key}={value}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <h3 className="mb-3 text-body-medium text-text-primary">
            Conditions
          </h3>
          {detail ? (
            <ConditionsList conditions={detail.conditions} />
          ) : (
            <p className="text-body-regular text-text-tertiary">
              Loading current conditions…
            </p>
          )}
        </section>
      </div>
    </DetailDrawer>
  );
}

export default function ClustersView({
  refreshSeconds,
  onRefreshSecondsChange,
  onToast,
}: {
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  onToast: (
    title: string,
    description?: string,
    status?: "neutral" | "information" | "success" | "error",
  ) => void;
}) {
  const { items, error, isRefreshing, lastLoadedAt, load } =
    useResourceList<ClusterView>("/api/clusters", refreshSeconds);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("all");
  const [workspace, setWorkspace] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ClusterView | null>(null);
  const workspaces = useMemo(
    () => Array.from(new Set(items.map((item) => item.namespace))).sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return items
      .filter((cluster) => {
        const kind = statusKind(cluster.state);
        const matchesStatus =
          status === "all" ||
          (status === "ready" && kind === "healthy") ||
          (status === "attention" &&
            (kind === "error" || kind === "warning" || kind === "progress")) ||
          (status === "paused" && cluster.paused);
        return (
          (!query ||
            [
              cluster.name,
              cluster.namespace,
              cluster.clusterNamespace,
              cluster.agentNamespace,
              cluster.message,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
            )) &&
          matchesStatus &&
          (workspace === "all" || cluster.namespace === workspace)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deferredSearch, items, status, workspace]);
  useEffect(() => setPage(1), [deferredSearch, status, workspace]);
  const ready = items.filter(
    (item) => statusKind(item.state) === "healthy",
  ).length;
  const paused = items.filter((item) => item.paused).length;
  const attention = items.length - ready - paused;
  const stats: Stat[] = [
    {
      icon: RiServerLine,
      label: "Clusters",
      value: String(items.length),
      delta: `${workspaces.length} workspaces`,
      deltaColor: "neutral",
    },
    {
      icon: RiCheckboxCircleLine,
      label: "Ready",
      value: String(ready),
      delta: items.length
        ? `${Math.round((ready / items.length) * 100)}% available`
        : "No data",
      deltaColor: "lime",
    },
    {
      icon: RiAlertLine,
      label: "Needs attention",
      value: String(Math.max(0, attention)),
      delta: attention ? "Review check-in" : "All clear",
      deltaColor: attention ? "rose" : "lime",
    },
    {
      icon: RiPauseCircleLine,
      label: "Paused",
      value: String(paused),
      delta: paused ? "Updates stopped" : "None paused",
      deltaColor: "neutral",
    },
  ];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectHandler =
    (setter: (value: string) => void) => (key: Key | null) =>
      setter(String(key ?? "all"));
  async function refresh() {
    const ok = await load();
    onToast(
      ok ? "Clusters refreshed" : "Cluster refresh failed",
      ok
        ? "Latest agent check-ins are now visible."
        : "The Fleet API request did not complete.",
      ok ? "success" : "error",
    );
  }

  return (
    <>
      <ErrorBanner messages={error ? [error] : []} />
      <PageHeading
        title="Clusters"
        description={`Downstream agent health and bundle readiness${lastLoadedAt ? ` · updated ${dateLabel(new Date(lastLoadedAt).toISOString())}` : ""}.`}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={onRefreshSecondsChange}
            isRefreshing={isRefreshing}
            onRefresh={() => void refresh()}
          />
        }
      />
      <StatCards stats={stats} columns={4} className="mb-6" />
      <section className="overflow-hidden rounded-2xl border border-border-primary bg-background-primary-default shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border-primary p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-heading-5 text-text-primary">
              Managed clusters
            </h2>
            <p className="mt-0.5 text-body-regular text-text-tertiary">
              Agent check-in and deployment capacity.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_170px]">
            <Input
              aria-label="Search clusters"
                placeholder="Search clusters"
              leadingIcon={RiSearchLine}
              value={search}
              onChange={setSearch}
              size="small"
            />
            <Select
              aria-label="Filter clusters by status"
              size="sm"
              selectedKey={status}
              onSelectionChange={selectHandler(setStatus)}
            >
              <SelectItem id="all">All statuses</SelectItem>
              <SelectItem id="ready">Ready</SelectItem>
              <SelectItem id="attention">Needs attention</SelectItem>
              <SelectItem id="paused">Paused</SelectItem>
            </Select>
            <Select
              aria-label="Filter clusters by workspace"
              size="sm"
              selectedKey={workspace}
              onSelectionChange={selectHandler(setWorkspace)}
            >
              <SelectItem id="all">All workspaces</SelectItem>
              {workspaces.map((item) => (
                <SelectItem key={item} id={item}>
                  {item}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
        {!visible.length ? (
          <div className="grid min-h-64 place-items-center p-6 text-center text-body-regular text-text-tertiary">
            No clusters match the current filters.
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table size="sm" aria-label="Fleet clusters">
                <TableHeader>
                  <TableColumn isRowHeader>Cluster</TableColumn>
                  <TableColumn>Workspace</TableColumn>
                  <TableColumn>State</TableColumn>
                  <TableColumn>Ready bundles</TableColumn>
                  <TableColumn>Last check-in</TableColumn>
                  <TableColumn>Agent namespace</TableColumn>
                  <TableColumn aria-label="Open" />
                </TableHeader>
                <TableBody>
                  {visible.map((cluster) => (
                    <TableRow
                      key={`${cluster.namespace}/${cluster.name}`}
                      id={`${cluster.namespace}/${cluster.name}`}
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelected(cluster)}
                          className="text-left text-body-medium text-text-primary hover:text-accent-700"
                        >
                          {cluster.name}
                        </button>
                        <p className="font-mono text-caption-1-regular text-text-tertiary">
                          {cluster.clusterNamespace || "—"}
                        </p>
                      </TableCell>
                      <TableCell>{cluster.namespace}</TableCell>
                      <TableCell>
                        <StatusChip value={cluster.state} />
                      </TableCell>
                      <TableCell>{cluster.readyBundles || "—"}</TableCell>
                      <TableCell>{dateLabel(cluster.lastSeen)}</TableCell>
                      <TableCell>{cluster.agentNamespace || "—"}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-label={`Open ${cluster.name}`}
                          onClick={() => setSelected(cluster)}
                          className="grid size-8 place-items-center rounded-lg text-text-tertiary hover:bg-background-secondary-hover"
                        >
                          <RiArrowRightSLine className="size-5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y divide-border-primary md:hidden">
              {visible.map((cluster) => (
                <button
                  type="button"
                  key={`${cluster.namespace}/${cluster.name}`}
                  onClick={() => setSelected(cluster)}
                  className="fleet-list-row block w-full p-4 text-left hover:bg-background-secondary-hover"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-body-medium text-text-primary">
                        {cluster.name}
                      </p>
                      <p className="text-caption-1-regular text-text-tertiary">
                        {cluster.namespace}
                      </p>
                    </div>
                    <RiArrowRightSLine className="size-5 text-text-tertiary" />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusChip value={cluster.state} />
                    <span className="text-caption-1-regular text-text-tertiary">
                      {cluster.readyBundles || "—"} bundles
                    </span>
                  </div>
                  <p className="mt-3 text-caption-1-regular text-text-tertiary">
                    Last check-in {dateLabel(cluster.lastSeen)}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {filtered.length > PAGE_SIZE ? (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      ) : null}
      <ClusterDrawer cluster={selected} onClose={() => setSelected(null)} />
    </>
  );
}
