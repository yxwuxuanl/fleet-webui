import { useEffect, useMemo, useState } from "react";
import {
  RiAlertLine,
  RiBox3Line,
  RiCheckboxCircleLine,
  RiGitRepositoryLine,
} from "@remixicon/react";
import {
  StatCards,
  type Stat,
} from "@/components/application/dashboard/stat-cards";
import { PageHeading } from "@/src/components/page-heading";
import { RefreshControl } from "@/src/components/refresh-control";
import {
  BundleDetailDrawer,
  ReconcileDialog,
} from "@/src/components/resource-dialogs";
import { BundleTable } from "@/src/components/resource-tables";
import { dateLabel, needsAttention, statusKind } from "@/src/lib/format";
import type { BundleView, GitRepoView, ReconcileResult } from "@/src/types";

type ToastStatus = "neutral" | "information" | "success" | "error";

export interface BundlesViewProps {
  bundles: BundleView[];
  repositories: GitRepoView[];
  lastLoadedAt: number;
  isRefreshing: boolean;
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  onRefresh: (showToast?: boolean) => Promise<void>;
  attentionOnly: boolean;
  onToast: (title: string, description?: string, status?: ToastStatus) => void;
}

export default function BundlesView({
  bundles,
  repositories,
  lastLoadedAt,
  isRefreshing,
  refreshSeconds,
  onRefreshSecondsChange,
  onRefresh,
  attentionOnly,
  onToast,
}: BundlesViewProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [workspace, setWorkspace] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedID, setSelectedID] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("bundle"),
  );
  const selected = bundles.find(
    (bundle) => `${bundle.namespace}/${bundle.name}` === selectedID,
  ) ?? null;
  function setSelected(bundle: BundleView | null) {
    const id = bundle ? `${bundle.namespace}/${bundle.name}` : null;
    setSelectedID(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("bundle", id);
    else url.searchParams.delete("bundle");
    window.history.replaceState({}, "", url);
  }
  const [reconcileBundle, setReconcileBundle] = useState<BundleView | null>(
    null,
  );

  const workspaces = useMemo(
    () => Array.from(new Set(bundles.map((item) => item.namespace))).sort(),
    [bundles],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bundles
      .filter((bundle) => {
        const matchesSearch =
          !query ||
          [
            bundle.name,
            bundle.namespace,
            bundle.gitRepo,
            bundle.commit,
            bundle.message,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          );
        const kind = statusKind(bundle.health);
        const matchesStatus =
          status === "all" ||
          (status === "healthy" && kind === "healthy") ||
          (status === "attention" && needsAttention(bundle)) ||
          (status === "reconciling" &&
            (kind === "progress" || statusKind(bundle.state) === "progress"));
        return (
          matchesSearch &&
          matchesStatus &&
          (workspace === "all" || bundle.namespace === workspace) &&
          (!attentionOnly || needsAttention(bundle))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [attentionOnly, bundles, search, status, workspace]);
  useEffect(() => setPage(1), [attentionOnly, search, status, workspace]);
  useEffect(() => {
    const onPopState = () => setSelectedID(
      new URLSearchParams(window.location.search).get("bundle"),
    );
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const healthy = bundles.filter(
    (bundle) => statusKind(bundle.health) === "healthy",
  ).length;
  const attention = bundles.filter(needsAttention).length;
  const stats: Stat[] = [
    {
      icon: RiBox3Line,
      label: "Total bundles",
      value: String(bundles.length),
      delta: `${workspaces.length} workspaces`,
      deltaColor: "neutral",
    },
    {
      icon: RiCheckboxCircleLine,
      label: "Healthy",
      value: String(healthy),
      delta: bundles.length
        ? `${Math.round((healthy / bundles.length) * 100)}% ready`
        : "No data",
      deltaColor: "lime",
    },
    {
      icon: RiAlertLine,
      label: "Needs attention",
      value: String(attention),
      delta: attention ? "Review now" : "All clear",
      deltaColor: attention ? "rose" : "lime",
    },
    {
      icon: RiGitRepositoryLine,
      label: "Repositories",
      value: String(repositories.length),
      delta: `${repositories.filter((repo) => statusKind(repo.syncState) === "healthy").length} synced`,
      deltaColor: "neutral",
    },
  ];

  function completed(result: ReconcileResult) {
    const id = `${result.bundle.namespace}/${result.bundle.name}`;
    onToast(
      "Reconcile accepted",
      `${id} moved to generation ${result.generation}.`,
      "information",
    );
    void onRefresh(false);
  }

  return (
    <>
      <PageHeading
        title="Bundles"
        description={`Deployment health at a glance${lastLoadedAt ? ` · updated ${dateLabel(new Date(lastLoadedAt).toISOString())}` : ""}.`}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={onRefreshSecondsChange}
            isRefreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
          />
        }
      />
      <StatCards stats={stats} columns={4} className="mb-6" />
      <BundleTable
        bundles={filtered}
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        workspaces={workspaces}
        page={page}
        onPageChange={setPage}
        onOpen={setSelected}
      />
      <BundleDetailDrawer
        bundle={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onReconcile={setReconcileBundle}
      />
      <ReconcileDialog
        bundle={reconcileBundle}
        open={Boolean(reconcileBundle)}
        onOpenChange={(open) => {
          if (!open) setReconcileBundle(null);
        }}
        onCompleted={completed}
      />
    </>
  );
}
