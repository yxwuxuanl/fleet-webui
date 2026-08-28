import {
  RiArrowRightSLine,
  RiGitRepositoryLine,
  RiSearchLine,
} from "@remixicon/react";
import type { Key } from "react-aria-components";
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
import { bundleID, dateLabel, shortCommit } from "@/src/lib/format";
import type { BundleView, GitRepoView } from "@/src/types";
import { StatusChip } from "@/src/components/status-chip";

const PAGE_SIZE = 10;

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-64 place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-background-tertiary-default text-text-secondary">
          <RiSearchLine className="size-5" />
        </div>
        <p className="mt-3 text-body-medium text-text-primary">{title}</p>
        <p className="mt-1 text-body-regular text-text-tertiary">
          {description}
        </p>
      </div>
    </div>
  );
}

export function BundleTable({
  bundles,
  search,
  onSearchChange,
  status,
  onStatusChange,
  workspace,
  onWorkspaceChange,
  workspaces,
  page,
  onPageChange,
  onOpen,
}: {
  bundles: BundleView[];
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  workspace: string;
  onWorkspaceChange: (value: string) => void;
  workspaces: string[];
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (bundle: BundleView) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(bundles.length / PAGE_SIZE));
  const pageItems = bundles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changeKey = (setter: (value: string) => void) => (key: Key | null) =>
    setter(String(key ?? "all"));
  return (
    <section className="overflow-hidden rounded-2xl border border-border-primary bg-background-primary-default shadow-xs">
      <div className="flex flex-col gap-3 border-b border-border-primary p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-heading-5 text-text-primary">Bundles</h2>
          <p className="mt-0.5 text-body-regular text-text-tertiary">
            Deployment state across your Fleet workspaces.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_170px]">
          <Input
            aria-label="Search bundles"
            placeholder="Search bundle or repository"
            leadingIcon={RiSearchLine}
            value={search}
            onChange={onSearchChange}
            size="small"
          />
          <Select
            aria-label="Filter by status"
            size="sm"
            selectedKey={status}
            onSelectionChange={changeKey(onStatusChange)}
          >
            <SelectItem id="all">All statuses</SelectItem>
            <SelectItem id="healthy">Healthy</SelectItem>
            <SelectItem id="attention">Needs attention</SelectItem>
            <SelectItem id="reconciling">Reconciling</SelectItem>
          </Select>
          <Select
            aria-label="Filter by workspace"
            size="sm"
            selectedKey={workspace}
            onSelectionChange={changeKey(onWorkspaceChange)}
          >
            <SelectItem id="all">All workspaces</SelectItem>
            {workspaces.map((item) => (
              <SelectItem id={item} key={item}>
                {item}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
      {!pageItems.length ? (
        <EmptyState
          title="No bundles found"
          description="Adjust the search or filters to see more results."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table size="sm" aria-label="Fleet bundles">
              <TableHeader>
                <TableColumn isRowHeader>Bundle</TableColumn>
                <TableColumn>Workspace</TableColumn>
                <TableColumn>Git repository</TableColumn>
                <TableColumn>Health</TableColumn>
                <TableColumn>State</TableColumn>
                <TableColumn>Targets</TableColumn>
                <TableColumn>Last activity</TableColumn>
                <TableColumn aria-label="Open" />
              </TableHeader>
              <TableBody>
                {pageItems.map((bundle) => (
                  <TableRow key={bundleID(bundle)} id={bundleID(bundle)}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpen(bundle)}
                        className="text-left text-body-medium text-text-primary outline-none hover:text-accent-700 focus-visible:underline"
                      >
                        {bundle.name}
                      </button>
                      <p className="font-mono text-caption-1-regular text-text-tertiary">
                        {shortCommit(bundle.commit)}
                      </p>
                    </TableCell>
                    <TableCell>{bundle.namespace}</TableCell>
                    <TableCell>{bundle.gitRepo || "—"}</TableCell>
                    <TableCell>
                      <StatusChip value={bundle.health} />
                    </TableCell>
                    <TableCell>
                      <StatusChip value={bundle.state} />
                    </TableCell>
                    <TableCell>{bundle.targets || "—"}</TableCell>
                    <TableCell>{dateLabel(bundle.lastActivity)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        aria-label={`Open ${bundle.name}`}
                        onClick={() => onOpen(bundle)}
                        className="grid size-8 place-items-center rounded-lg text-text-tertiary hover:bg-background-secondary-hover hover:text-text-primary"
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
            {pageItems.map((bundle) => (
              <button
                type="button"
                key={bundleID(bundle)}
                onClick={() => onOpen(bundle)}
                className="block w-full p-4 text-left hover:bg-background-secondary-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body-medium text-text-primary">
                      {bundle.name}
                    </p>
                    <p className="mt-0.5 text-caption-1-regular text-text-tertiary">
                      {bundle.namespace} · {bundle.gitRepo || "No repository"}
                    </p>
                  </div>
                  <RiArrowRightSLine className="size-5 text-text-tertiary" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusChip value={bundle.health} />
                  <StatusChip value={bundle.state} />
                  <span className="text-caption-1-regular text-text-tertiary">
                    {bundle.targets || "—"} targets
                  </span>
                </div>
                <p className="mt-3 text-caption-1-regular text-text-tertiary">
                  Updated {dateLabel(bundle.lastActivity)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
      {bundles.length > PAGE_SIZE ? (
        <div className="border-t border-border-primary p-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
          />
        </div>
      ) : null}
    </section>
  );
}

export function RepositoryTable({
  repositories,
  search,
  onSearchChange,
  workspace,
  onWorkspaceChange,
  workspaces,
  onOpen,
}: {
  repositories: GitRepoView[];
  search: string;
  onSearchChange: (value: string) => void;
  workspace: string;
  onWorkspaceChange: (value: string) => void;
  workspaces: string[];
  onOpen: (repo: GitRepoView) => void;
}) {
  const changeKey = (key: Key | null) =>
    onWorkspaceChange(String(key ?? "all"));
  return (
    <section className="overflow-hidden rounded-2xl border border-border-primary bg-background-primary-default shadow-xs">
      <div className="flex flex-col gap-3 border-b border-border-primary p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-heading-5 text-text-primary">Git repositories</h2>
          <p className="mt-0.5 text-body-regular text-text-tertiary">
            Source sync and commit state.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_180px]">
          <Input
            aria-label="Search repositories"
            placeholder="Search repository"
            leadingIcon={RiSearchLine}
            value={search}
            onChange={onSearchChange}
            size="small"
          />
          <Select
            aria-label="Filter by workspace"
            size="sm"
            selectedKey={workspace}
            onSelectionChange={changeKey}
          >
            <SelectItem id="all">All workspaces</SelectItem>
            {workspaces.map((item) => (
              <SelectItem id={item} key={item}>
                {item}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
      {!repositories.length ? (
        <EmptyState
          title="No repositories found"
          description="Adjust the search or workspace filter."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table size="sm" aria-label="Git repositories">
              <TableHeader>
                <TableColumn isRowHeader>Repository</TableColumn>
                <TableColumn>Workspace</TableColumn>
                <TableColumn>Branch</TableColumn>
                <TableColumn>Sync state</TableColumn>
                <TableColumn>Synced commit</TableColumn>
                <TableColumn>Latest activity</TableColumn>
                <TableColumn aria-label="Open" />
              </TableHeader>
              <TableBody>
                {repositories.map((repo) => (
                  <TableRow
                    key={`${repo.namespace}/${repo.name}`}
                    id={`${repo.namespace}/${repo.name}`}
                  >
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpen(repo)}
                        className="text-left text-body-medium text-text-primary hover:text-accent-700"
                      >
                        {repo.name}
                      </button>
                      <p className="max-w-80 truncate text-caption-1-regular text-text-tertiary">
                        {repo.repo || "—"}
                      </p>
                    </TableCell>
                    <TableCell>{repo.namespace}</TableCell>
                    <TableCell>{repo.branch || "—"}</TableCell>
                    <TableCell>
                      <StatusChip value={repo.syncState} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-body-2-medium">
                        {shortCommit(repo.syncedCommit)}
                      </span>
                    </TableCell>
                    <TableCell>{dateLabel(repo.latestActivity)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        aria-label={`Open ${repo.name}`}
                        onClick={() => onOpen(repo)}
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
            {repositories.map((repo) => (
              <button
                key={`${repo.namespace}/${repo.name}`}
                type="button"
                onClick={() => onOpen(repo)}
                className="block w-full p-4 text-left hover:bg-background-secondary-hover"
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-medium text-text-primary">
                      {repo.name}
                    </p>
                    <p className="truncate text-caption-1-regular text-text-tertiary">
                      {repo.repo || "No URL"}
                    </p>
                  </div>
                  <RiGitRepositoryLine className="size-5 shrink-0 text-text-tertiary" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <StatusChip value={repo.syncState} />
                  <span className="font-mono text-caption-1-regular text-text-tertiary">
                    {shortCommit(repo.syncedCommit)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
