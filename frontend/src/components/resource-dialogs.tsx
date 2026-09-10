import { useCallback, useEffect, useRef, useState } from "react";
import {
  RiGitCommitLine,
  RiGitRepositoryLine,
  RiRefreshLine,
} from "@remixicon/react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { ManagedObjectsPanel } from "@/src/components/managed-objects";
import { StatusChip } from "@/src/components/status-chip";
import { api } from "@/src/lib/api";
import { bundleID, dateLabel, shortCommit } from "@/src/lib/format";
import type {
  BundleDetail,
  BundleView,
  FleetCondition,
  GitRepoDetail,
  GitHistory,
  GitRepoView,
  ReconcileResult,
} from "@/src/types";

function Definition({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption-1-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-body-regular text-text-primary ${mono ? "font-mono" : ""}`}
      >
        {value === undefined || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

function Conditions({ conditions }: { conditions: FleetCondition[] }) {
  if (!conditions.length)
    return (
      <p className="text-body-regular text-text-tertiary">
        No conditions reported.
      </p>
    );
  return (
    <div className="space-y-2">
      {conditions.map((condition, index) => (
        <div
          key={`${condition.type}-${index}`}
          className="rounded-xl border border-border-primary bg-background-secondary-default p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-medium text-text-primary">
              {condition.type}
            </p>
            <StatusChip value={condition.status} />
          </div>
          {condition.reason ? (
            <p className="mt-1 text-caption-1-medium text-text-secondary">
              {condition.reason}
            </p>
          ) : null}
          {condition.message ? (
            <p className="mt-1 text-body-regular text-text-secondary">
              {condition.message}
            </p>
          ) : null}
          {condition.lastUpdated ? (
            <p className="mt-2 text-caption-1-regular text-text-tertiary">
              {dateLabel(condition.lastUpdated)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DrawerShell({
  open,
  onOpenChange,
  title,
  eyebrow,
  children,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fleet-overlay justify-end"
    >
      <Modal className="fleet-drawer h-full w-full max-w-[560px] border-l border-border-primary bg-background-primary-default shadow-2xl">
        <Dialog className="flex h-full flex-col outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border-primary p-5">
            <div>
              <p className="text-caption-1-medium uppercase tracking-wide text-accent-700">
                {eyebrow}
              </p>
              <Heading
                slot="title"
                className="mt-1 text-heading-4 text-text-primary"
              >
                {title}
              </Heading>
            </div>
            <CloseButton
              aria-label="Close details"
              onClick={() => onOpenChange(false)}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {actions ? (
            <div className="flex justify-end gap-2 border-t border-border-primary p-4">
              {actions}
            </div>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function BundleDetailDrawer({
  bundle,
  open,
  onOpenChange,
  onReconcile,
}: {
  bundle: BundleView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconcile: (bundle: BundleView) => void;
}) {
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !bundle) return;
    setDetail(null);
    setError("");
    void api<BundleDetail>(
      `/api/bundles/${encodeURIComponent(bundle.namespace)}/${encodeURIComponent(bundle.name)}`,
    )
      .then(setDetail)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [bundle, open]);
  if (!bundle) return null;
  const source = detail ?? bundle;
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={source?.name ?? "Bundle details"}
      eyebrow={source ? source.namespace : "Bundle"}
      actions={
        bundle ? (
          <Button
            leadingIcon={RiRefreshLine}
            onClick={() => onReconcile(bundle)}
          >
            Reconcile
          </Button>
        ) : null
      }
    >
      {error ? (
        <div className="rounded-xl bg-status-rose-background p-3 text-body-regular text-status-rose-text">
          {error}
        </div>
      ) : !bundle ? null : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <StatusChip value={source.health} />
            <StatusChip value={source.state} />
          </div>
          {source.message ? (
            <div className="rounded-xl border border-status-yellow-border bg-status-yellow-background p-3 text-body-regular text-status-yellow-text">
              {source.message}
            </div>
          ) : null}
          <section>
            <h3 className="text-body-medium text-text-primary">Overview</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
              <Definition label="Git repository" value={source.gitRepo} />
              <Definition label="Targets" value={source.targets} />
              <Definition
                label="Commit"
                value={shortCommit(source.commit)}
                mono
              />
              <Definition
                label="Last activity"
                value={dateLabel(source.lastActivity)}
              />
              <Definition
                label="Force generation"
                value={source.forceGeneration}
              />
              <Definition
                label="Observed generation"
                value={detail?.observedGeneration}
              />
              <Definition
                label="Created"
                value={dateLabel(detail?.createdAt)}
              />
              <Definition
                label="Resource version"
                value={detail?.resourceVersion}
                mono
              />
            </dl>
          </section>
          {detail ? (
            <section>
              <h3 className="text-body-medium text-text-primary">
                Deployment summary
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(detail.summary).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl bg-background-secondary-default p-3"
                  >
                    <p className="text-heading-5 text-text-primary">{value}</p>
                    <p className="mt-1 break-words text-caption-1-regular text-text-tertiary">
                      {key.replace(/([A-Z])/g, " $1")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <ManagedObjectsPanel bundle={bundle} active={open} />
          <section>
            <h3 className="mb-3 text-body-medium text-text-primary">
              Conditions
            </h3>
            {detail ? (
              <Conditions conditions={detail.conditions} />
            ) : (
              <p className="text-body-regular text-text-tertiary">
                Loading current conditions…
              </p>
            )}
          </section>
        </div>
      )}
    </DrawerShell>
  );
}

type RepositoryDrawerProps = {
  repo: GitRepoView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RepositoryDetailDrawer(props: RepositoryDrawerProps) {
  if (!props.open || !props.repo) return null;
  return (
    <RepositoryDetailContent
      key={`${props.repo.namespace}/${props.repo.name}`}
      {...props}
    />
  );
}

function RepositoryDetailContent({
  repo,
  open,
  onOpenChange,
}: RepositoryDrawerProps) {
  const [detail, setDetail] = useState<GitRepoDetail | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<GitHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState("");
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const loadRepository = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!repo || !signal || signal.aborted) return;
    const base = `/api/gitrepos/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}`;
    const [detailResult, historyResult] = await Promise.allSettled([
      api<GitRepoDetail>(base, { signal }),
      api<GitHistory>(`${base}/history?limit=10`, { signal }),
    ]);
    if (signal.aborted) return;
    if (detailResult.status === "fulfilled") setDetail(detailResult.value);
    else setError(detailResult.reason instanceof Error ? detailResult.reason.message : String(detailResult.reason));
    if (historyResult.status === "fulfilled") setHistory(historyResult.value);
    else setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : String(historyResult.reason));
  }, [repo]);
  useEffect(() => {
    if (!open || !repo) return;
    const controller = new AbortController();
    lifetime.current = controller;
    setDetail(null);
    setError("");
    setHistory(null);
    setHistoryError("");
    setPendingRevision(null);
    void loadRepository();
    return () => controller.abort();
  }, [loadRepository, open, repo]);

  async function syncNow() {
    const signal = lifetime.current?.signal;
    if (!repo || !signal || signal.aborted) return;
    setBusy("sync");
    setError("");
    try {
      await api(`/api/gitrepos/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}/sync`, { method: "POST", signal });
      if (signal.aborted) return;
      await loadRepository();
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal.aborted) setBusy("");
    }
  }

  async function setRevision(revision: string) {
    const signal = lifetime.current?.signal;
    if (!repo || !signal || signal.aborted) return;
    setBusy(revision || "resume");
    setError("");
    try {
      await api(`/api/gitrepos/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}/revision`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      if (signal.aborted) return;
      setPendingRevision(null);
      await loadRepository();
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal.aborted) setBusy("");
    }
  }
  if (!repo) return null;
  const source = detail ?? repo;
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={source?.name ?? "Repository details"}
      eyebrow={source?.namespace ?? "Git repository"}
      actions={history?.actionsEnabled ? (
        <Button leadingIcon={RiRefreshLine} disabled={Boolean(busy)} onClick={() => void syncNow()}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
      ) : null}
    >
      {error ? (
        <div className="rounded-xl bg-status-rose-background p-3 text-status-rose-text">
          {error}
        </div>
      ) : !source ? null : (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <RiGitRepositoryLine className="size-5 text-text-secondary" />
            <StatusChip value={source.syncState} />
          </div>
          <section>
            <h3 className="text-body-medium text-text-primary">Source</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
              <Definition label="Repository URL" value={source.repo} />
              <Definition label="Branch" value={source.branch} />
              <Definition
                label="Synced commit"
                value={shortCommit(source.syncedCommit)}
                mono
              />
              <Definition
                label="Pending commit"
                value={shortCommit(source.pendingCommit)}
                mono
              />
              <Definition
                label="Latest activity"
                value={dateLabel(source.latestActivity)}
              />
              <Definition label="Revision" value={detail?.revision} mono />
              <Definition
                label="Polling interval"
                value={detail?.pollingInterval}
              />
              <Definition
                label="Ready deployments"
                value={detail?.readyBundleDeployments}
              />
            </dl>
          </section>
          {detail?.paths?.length ? (
            <section>
              <h3 className="text-body-medium text-text-primary">Paths</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.paths.map((path) => (
                  <span
                    key={path}
                    className="rounded-md bg-background-tertiary-default px-2 py-1 font-mono text-caption-1-regular text-text-secondary"
                  >
                    {path}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-body-medium text-text-primary">Revision history</h3>
                <p className="mt-0.5 text-caption-1-regular text-text-tertiary">
                  Recent commits from {history?.branch || source.branch || "the configured branch"}.
                </p>
              </div>
              {history?.revision && history.actionsEnabled ? (
                <Button size="small" variant="secondary" disabled={Boolean(busy)} onClick={() => setPendingRevision("")}>
                  Resume branch
                </Button>
              ) : null}
            </div>
            {history?.revision ? (
              <div className="mt-3 rounded-xl border border-status-yellow-border bg-status-yellow-background p-3 text-body-regular text-status-yellow-text">
                Updates are pinned to <span className="font-mono">{shortCommit(history.revision)}</span>. New branch commits will not deploy until branch tracking is resumed.
              </div>
            ) : null}
            {pendingRevision !== null ? (
              <div className="mt-3 rounded-xl border border-status-yellow-border bg-status-yellow-background p-3">
                <p className="text-body-medium text-status-yellow-text">
                  {pendingRevision ? `Pin deployments to ${shortCommit(pendingRevision)}?` : "Resume following the configured branch?"}
                </p>
                <p className="mt-1 text-body-regular text-text-secondary">
                  {pendingRevision ? "Fleet will reconcile this selected commit and pause normal branch updates. This does not rewrite the Git repository." : "Fleet will accept new commits from the configured branch again."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="small" variant={pendingRevision ? "danger" : "primary"} disabled={Boolean(busy)} onClick={() => void setRevision(pendingRevision)}>{busy ? "Applying…" : "Confirm"}</Button>
                  <Button size="small" variant="secondary" disabled={Boolean(busy)} onClick={() => setPendingRevision(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {history && !history.historyEnabled ? (
              <div className="mt-3 rounded-xl border border-border-primary p-3 text-body-regular text-text-tertiary">
                Commit history is disabled by server configuration.
              </div>
            ) : historyError ? (
              <div className="mt-3 rounded-xl border border-border-primary p-3 text-body-regular text-text-tertiary">
                Commit history unavailable: {historyError}
              </div>
            ) : !history ? (
              <div className="mt-3 rounded-xl border border-border-primary p-3 text-body-regular text-text-tertiary">Loading commit history…</div>
            ) : history.historyEnabled ? (
              <div className="mt-3 max-h-80 divide-y divide-border-primary overflow-y-auto rounded-xl border border-border-primary">
                {history.items.map((commit) => (
                  <div key={commit.hash} className="p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background-tertiary-default text-text-secondary"><RiGitCommitLine className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-caption-1-medium text-text-primary">{commit.shortHash}</span>
                          {commit.current ? <span className="rounded bg-status-lime-background px-1.5 py-0.5 text-caption-1-medium text-status-lime-text">deployed</span> : null}
                          {commit.pinned ? <span className="rounded bg-status-yellow-background px-1.5 py-0.5 text-caption-1-medium text-status-yellow-text">pinned</span> : null}
                        </div>
                        <p className="mt-1 text-body-medium text-text-primary">{commit.subject || "No commit subject"}</p>
                        <p className="mt-1 text-caption-1-regular text-text-tertiary">{commit.author || "Unknown author"} · {dateLabel(commit.authoredAt)}</p>
                      </div>
                      {history.actionsEnabled && !commit.pinned ? (
                        <Button size="xs" variant="ghost" disabled={Boolean(busy)} onClick={() => setPendingRevision(commit.hash)}>Pin</Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          {detail ? (
            <section>
              <h3 className="text-body-medium text-text-primary">Resources</h3>
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
          <section>
            <h3 className="mb-3 text-body-medium text-text-primary">
              Conditions
            </h3>
            {detail ? (
              <Conditions conditions={detail.conditions} />
            ) : (
              <p className="text-body-regular text-text-tertiary">
                Loading current conditions…
              </p>
            )}
          </section>
        </div>
      )}
    </DrawerShell>
  );
}

export function ReconcileDialog({
  bundle,
  open,
  onOpenChange,
  onCompleted,
}: {
  bundle: BundleView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (result: ReconcileResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) setError("");
  }, [open]);
  async function submit() {
    if (!bundle) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<ReconcileResult>(
        `/api/bundles/${encodeURIComponent(bundle.namespace)}/${encodeURIComponent(bundle.name)}/reconcile`,
        { method: "POST" },
      );
      onCompleted(result);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fleet-overlay items-center justify-center p-4"
    >
      <Modal className="fleet-modal w-full max-w-[460px] rounded-2xl border border-border-primary bg-background-primary-default shadow-2xl">
        <Dialog className="outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border-primary p-5">
            <div>
              <p className="text-caption-1-medium uppercase tracking-wide text-accent-700">
                Manual action
              </p>
              <Heading
                slot="title"
                className="mt-1 text-heading-4 text-text-primary"
              >
                Reconcile bundle
              </Heading>
            </div>
            <CloseButton
              aria-label="Close reconcile dialog"
              onClick={() => onOpenChange(false)}
            />
          </div>
          <div className="space-y-4 p-5">
            <p className="text-body-regular text-text-secondary">
              Confirm that you want to request a new force-sync generation for{" "}
              <strong className="text-text-primary">
                {bundle ? bundleID(bundle) : "this bundle"}
              </strong>
              .
            </p>
            <div className="rounded-xl border border-status-yellow-border bg-status-yellow-background p-3 text-body-regular text-status-yellow-text">
              Fleet will increment <code>spec.forceSyncGeneration</code> and
              reconcile this Bundle against its targets.
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-xl bg-status-rose-background p-3 text-body-regular text-status-rose-text"
              >
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border-primary p-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              leadingIcon={RiRefreshLine}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Requesting…" : "Confirm reconcile"}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
