import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  RiAlertLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiGitBranchLine,
  RiPauseCircleLine,
  RiSearchLine,
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
import type { BundleDeploymentDetail, BundleDeploymentView } from "@/src/types";

const PAGE_SIZE = 10;

function DeploymentDrawer({
  deployment,
  onClose,
}: {
  deployment: BundleDeploymentView | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<BundleDeploymentDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!deployment) return;
    setDetail(null);
    setError("");
    void api<BundleDeploymentDetail>(
      `/api/bundledeployments/${encodeURIComponent(deployment.namespace)}/${encodeURIComponent(deployment.name)}`,
    )
      .then(setDetail)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [deployment]);
  if (!deployment) return null;
  const source = detail ?? deployment;
  return (
    <DetailDrawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={source.bundleName}
      eyebrow={source.cluster}
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
          <h3 className="text-body-medium text-text-primary">Deployment</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
            <Definition
              label="Bundle"
              value={
                source.bundleNamespace
                  ? `${source.bundleNamespace}/${source.bundleName}`
                  : source.bundleName
              }
            />
            <Definition label="Cluster" value={source.cluster} />
            <Definition label="Helm release" value={source.release} mono />
            <Definition
              label="Target namespace"
              value={detail?.targetNamespace}
              mono
            />
            <Definition label="Deployed" value={source.deployed} />
            <Definition label="Monitored" value={source.monitored} />
            <Definition
              label="Last activity"
              value={dateLabel(source.lastActivity)}
            />
            <Definition
              label="Sync generation"
              value={detail?.syncGeneration}
            />
          </dl>
        </section>
        {detail ? (
          <section>
            <h3 className="text-body-medium text-text-primary">
              Resource state
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(detail.resourceCounts).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl bg-background-secondary-default p-3"
                >
                  <p className="text-heading-5 text-text-primary">{value}</p>
                  <p className="mt-1 text-caption-1-regular text-text-tertiary">
                    {key.replace(/([A-Z])/g, " $1")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {detail ? (
          <section>
            <h3 className="text-body-medium text-text-primary">Revisions</h3>
            <dl className="mt-3 grid grid-cols-1 gap-4">
              <Definition
                label="Applied deployment ID"
                value={detail.appliedDeploymentID}
                mono
              />
              <Definition
                label="Current deployment ID"
                value={detail.deploymentID}
                mono
              />
              <Definition
                label="Staged deployment ID"
                value={detail.stagedDeploymentID}
                mono
              />
              <Definition
                label="Force generation"
                value={detail.forceGeneration}
              />
              <Definition
                label="Tracked resources"
                value={detail.resourceTotal}
              />
              <Definition
                label="Resource version"
                value={detail.resourceVersion}
                mono
              />
            </dl>
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

export default function DeploymentsView({
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
    useResourceList<BundleDeploymentView>(
      "/api/bundledeployments",
      refreshSeconds,
    );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BundleDeploymentView | null>(null);
  const clusters = useMemo(
    () => Array.from(new Set(items.map((item) => item.cluster))).sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return items
      .filter((deployment) => {
        const kind = statusKind(deployment.state);
        const matchesStatus =
          status === "all" ||
          (status === "ready" && kind === "healthy") ||
          (status === "attention" &&
            (kind === "error" || kind === "warning" || kind === "progress")) ||
          (status === "paused" && deployment.paused);
        return (
          (!query ||
            [
              deployment.bundleName,
              deployment.bundleNamespace,
              deployment.cluster,
              deployment.release,
              deployment.message,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
            )) &&
          matchesStatus &&
          (cluster === "all" || deployment.cluster === cluster)
        );
      })
      .sort((a, b) => a.bundleName.localeCompare(b.bundleName));
  }, [cluster, deferredSearch, items, status]);
  useEffect(() => setPage(1), [cluster, deferredSearch, status]);
  const ready = items.filter(
    (item) => statusKind(item.state) === "healthy",
  ).length;
  const paused = items.filter((item) => item.paused).length;
  const attention = Math.max(0, items.length - ready - paused);
  const stats: Stat[] = [
    {
      icon: RiGitBranchLine,
      label: "Deployments",
      value: String(items.length),
      delta: `${clusters.length} clusters`,
      deltaColor: "neutral",
    },
    {
      icon: RiCheckboxCircleLine,
      label: "Ready",
      value: String(ready),
      delta: items.length
        ? `${Math.round((ready / items.length) * 100)}% converged`
        : "No data",
      deltaColor: "lime",
    },
    {
      icon: RiAlertLine,
      label: "Needs attention",
      value: String(attention),
      delta: attention ? "Inspect resources" : "All clear",
      deltaColor: attention ? "rose" : "lime",
    },
    {
      icon: RiPauseCircleLine,
      label: "Paused",
      value: String(paused),
      delta: paused ? "Rollout stopped" : "None paused",
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
      ok ? "BundleDeployments refreshed" : "BundleDeployment refresh failed",
      ok
        ? "Latest downstream convergence state is now visible."
        : "The Fleet API request did not complete.",
      ok ? "success" : "error",
    );
  }

  return (
    <>
      <ErrorBanner messages={error ? [error] : []} />
      <PageHeading
        title="BundleDeployments"
        description={`Per-cluster rollout and resource convergence${lastLoadedAt ? ` · updated ${dateLabel(new Date(lastLoadedAt).toISOString())}` : ""}.`}
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
              Downstream deployments
            </h2>
            <p className="mt-0.5 text-body-regular text-text-tertiary">
              Rendered bundle state for every target cluster.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_190px]">
            <Input
              aria-label="Search BundleDeployments"
                placeholder="Search bundle or cluster"
              leadingIcon={RiSearchLine}
              value={search}
              onChange={setSearch}
              size="small"
            />
            <Select
              aria-label="Filter BundleDeployments by status"
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
              aria-label="Filter BundleDeployments by cluster"
              size="sm"
              selectedKey={cluster}
              onSelectionChange={selectHandler(setCluster)}
            >
              <SelectItem id="all">All clusters</SelectItem>
              {clusters.map((item) => (
                <SelectItem key={item} id={item}>
                  {item}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
        {!visible.length ? (
          <div className="grid min-h-64 place-items-center p-6 text-center text-body-regular text-text-tertiary">
            No BundleDeployments match the current filters.
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table size="sm" aria-label="Fleet BundleDeployments">
                <TableHeader>
                  <TableColumn isRowHeader>Bundle</TableColumn>
                  <TableColumn>Cluster</TableColumn>
                  <TableColumn>State</TableColumn>
                  <TableColumn>Deployed</TableColumn>
                  <TableColumn>Monitored</TableColumn>
                  <TableColumn>Release</TableColumn>
                  <TableColumn>Last activity</TableColumn>
                  <TableColumn aria-label="Open" />
                </TableHeader>
                <TableBody>
                  {visible.map((deployment) => (
                    <TableRow
                      key={`${deployment.namespace}/${deployment.name}`}
                      id={`${deployment.namespace}/${deployment.name}`}
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelected(deployment)}
                          className="text-left text-body-medium text-text-primary hover:text-accent-700"
                        >
                          {deployment.bundleName}
                        </button>
                        <p className="text-caption-1-regular text-text-tertiary">
                          {deployment.bundleNamespace || "—"}
                        </p>
                      </TableCell>
                      <TableCell>{deployment.cluster}</TableCell>
                      <TableCell>
                        <StatusChip value={deployment.state} />
                      </TableCell>
                      <TableCell>{deployment.deployed || "—"}</TableCell>
                      <TableCell>{deployment.monitored || "—"}</TableCell>
                      <TableCell>
                        <span className="block max-w-44 truncate font-mono text-caption-1-regular">
                          {deployment.release || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {dateLabel(deployment.lastActivity)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-label={`Open ${deployment.bundleName}`}
                          onClick={() => setSelected(deployment)}
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
              {visible.map((deployment) => (
                <button
                  type="button"
                  key={`${deployment.namespace}/${deployment.name}`}
                  onClick={() => setSelected(deployment)}
                  className="fleet-list-row block w-full p-4 text-left hover:bg-background-secondary-hover"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-body-medium text-text-primary">
                        {deployment.bundleName}
                      </p>
                      <p className="text-caption-1-regular text-text-tertiary">
                        {deployment.bundleNamespace || "—"} ·{" "}
                        {deployment.cluster}
                      </p>
                    </div>
                    <RiArrowRightSLine className="size-5 text-text-tertiary" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusChip value={deployment.state} />
                    <span className="text-caption-1-regular text-text-tertiary">
                      Deployed {deployment.deployed || "—"}
                    </span>
                    <span className="text-caption-1-regular text-text-tertiary">
                      Monitored {deployment.monitored || "—"}
                    </span>
                  </div>
                  <p className="mt-3 text-caption-1-regular text-text-tertiary">
                    Updated {dateLabel(deployment.lastActivity)}
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
      <DeploymentDrawer
        deployment={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
