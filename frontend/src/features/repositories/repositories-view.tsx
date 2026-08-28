import { useMemo, useState } from "react";
import { PageHeading } from "@/src/components/page-heading";
import { RefreshControl } from "@/src/components/refresh-control";
import { RepositoryDetailDrawer } from "@/src/components/resource-dialogs";
import { RepositoryTable } from "@/src/components/resource-tables";
import type { GitRepoView } from "@/src/types";

export default function RepositoriesView({
  repositories,
  isRefreshing,
  refreshSeconds,
  onRefreshSecondsChange,
  onRefresh,
}: {
  repositories: GitRepoView[];
  isRefreshing: boolean;
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [selected, setSelected] = useState<GitRepoView | null>(null);
  const workspaces = useMemo(
    () =>
      Array.from(new Set(repositories.map((item) => item.namespace))).sort(),
    [repositories],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return repositories
      .filter(
        (repo) =>
          (!query ||
            [
              repo.name,
              repo.namespace,
              repo.repo,
              repo.branch,
              repo.syncedCommit,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
            )) &&
          (workspace === "all" || repo.namespace === workspace),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [repositories, search, workspace]);
  return (
    <>
      <PageHeading
        title="Git repositories"
        description="Track source polling, synced commits and generated BundleDeployments."
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={onRefreshSecondsChange}
            isRefreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
          />
        }
      />
      <RepositoryTable
        repositories={filtered}
        search={search}
        onSearchChange={setSearch}
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        workspaces={workspaces}
        onOpen={setSelected}
      />
      <RepositoryDetailDrawer
        repo={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
