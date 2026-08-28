import { useEffect, useState } from "react";
import { RiGitRepositoryLine, RiRefreshLine } from "@remixicon/react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Input } from "@/components/base/input/input";
import { StatusChip } from "@/src/components/status-chip";
import { api } from "@/src/lib/api";
import { bundleID, dateLabel, shortCommit } from "@/src/lib/format";
import type {
  BundleDetail,
  BundleView,
  FleetCondition,
  GitRepoDetail,
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

export function RepositoryDetailDrawer({
  repo,
  open,
  onOpenChange,
}: {
  repo: GitRepoView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<GitRepoDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !repo) return;
    setDetail(null);
    setError("");
    void api<GitRepoDetail>(
      `/api/gitrepos/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}`,
    )
      .then(setDetail)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [open, repo]);
  if (!repo) return null;
  const source = detail ?? repo;
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={source?.name ?? "Repository details"}
      eyebrow={source?.namespace ?? "Git repository"}
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
  const [token, setToken] = useState(
    () => window.sessionStorage.getItem("fleet-webui.reconcileToken") ?? "",
  );
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
      window.sessionStorage.setItem("fleet-webui.reconcileToken", token);
      const result = await api<ReconcileResult>(
        `/api/bundles/${encodeURIComponent(bundle.namespace)}/${encodeURIComponent(bundle.name)}/reconcile`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
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
              Request a new force-sync generation for{" "}
              <strong className="text-text-primary">
                {bundle ? bundleID(bundle) : "this bundle"}
              </strong>
              .
            </p>
            <Input
              label="Reconcile token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={setToken}
              placeholder="Enter the server token"
              hint="Stored only in this browser session."
              isRequired
            />
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
              disabled={busy || !token.trim()}
              onClick={() => void submit()}
            >
              {busy ? "Requesting…" : "Reconcile"}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
