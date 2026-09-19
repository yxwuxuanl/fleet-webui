import type { ComponentType, ReactNode } from "react";
import {
  RiAlertLine,
  RiBox3Line,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiMenuLine,
  RiServerLine,
  RiSettings4Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { connectionLabel } from "@/src/lib/format";
import { useFleetVersion } from "@/src/hooks/use-fleet-version";
import type { HealthStatus } from "@/src/types";
import { cx } from "@/utils/cx";

export type ViewKey =
  | "bundles"
  | "repositories"
  | "clusters"
  | "deployments"
  | "matrix"
  | "settings";

function FleetMark() {
  return (
    <span
      className="grid size-9 place-items-center rounded-xl bg-accent-600 text-white shadow-xs"
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        className="size-6 fill-none stroke-current"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 8.5h22M7 8.5l2.2 14.8h13.6L25 8.5M11 13.5h10M12 18.5h8" />
      </svg>
    </span>
  );
}

const nav: Array<{
  key: ViewKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "bundles", label: "Bundles", icon: RiBox3Line },
  { key: "matrix", label: "Deployment matrix", icon: RiServerLine },
  { key: "deployments", label: "BundleDeployments", icon: RiGitBranchLine },
  { key: "repositories", label: "Git repositories", icon: RiGitRepositoryLine },
  { key: "clusters", label: "Clusters", icon: RiServerLine },
  { key: "settings", label: "Settings", icon: RiSettings4Line },
];

function Sidebar({
  view,
  onViewChange,
  fleetVersion,
  mobile = false,
}: {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  fleetVersion: string | null | undefined;
  mobile?: boolean;
}) {
  return (
    <aside
      className={cx(
        "flex flex-col border-border-primary bg-background-primary-default",
        mobile
          ? "h-full w-[280px] border-r"
          : "fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r lg:flex",
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-border-primary px-5">
        <FleetMark />
        <div>
          <p className="text-body-medium text-text-primary">Fleet Console</p>
          <p className="text-caption-1-regular text-text-tertiary">
            Operations workspace
          </p>
        </div>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-3">
        {nav.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onViewChange(key)}
            className={cx(
              "flex h-10 w-full items-center gap-3 rounded-2lg px-3 text-left text-body-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              view === key
                ? "bg-accent-50 text-accent-800"
                : "text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary",
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
        <div className="my-2 border-t border-border-primary" />
        <div className="flex items-start gap-3 rounded-xl bg-background-secondary-default p-3">
          <RiShieldCheckLine className="mt-0.5 size-5 shrink-0 text-accent-600" />
          <div>
            <p className="text-body-2-medium text-text-primary">
              Private console
            </p>
            <p className="mt-1 text-caption-1-regular text-text-tertiary">
              Credentials stay in this browser session.
            </p>
          </div>
        </div>
      </nav>
      <dl aria-label="Component versions" className="space-y-2 border-t border-border-primary p-4 text-caption-1-regular text-text-tertiary">
        <div className="flex items-center justify-between gap-3">
          <dt>Fleet</dt>
          <dd className="min-w-0 truncate font-mono text-text-secondary" title={fleetVersion || "Fleet controller version unavailable"}>
            {fleetVersion === undefined ? "Loading…" : fleetVersion || "Unavailable"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0">Fleet WebUI</dt>
          <dd className="min-w-0 truncate font-mono text-text-secondary" title={`v${__APP_VERSION__}`}>v{__APP_VERSION__}</dd>
        </div>
      </dl>
    </aside>
  );
}

export function FleetShell({
  children,
  health,
  view,
  onViewChange,
  mobileOpen,
  onMobileOpenChange,
  attentionOnly,
  onAttentionToggle,
}: {
  children: ReactNode;
  health: HealthStatus;
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  attentionOnly: boolean;
  onAttentionToggle: () => void;
}) {
  const fleetVersion = useFleetVersion();
  const connected = !health.connectionError && health.mode !== "unconfigured";
  return (
    <div className="min-h-screen bg-background-secondary-default text-text-primary">
      <Sidebar view={view} onViewChange={onViewChange} fleetVersion={fleetVersion} />
      {mobileOpen ? (
        <div
          className="fleet-overlay z-50 lg:hidden"
          onClick={() => onMobileOpenChange(false)}
        >
          <div className="h-full" onClick={(event) => event.stopPropagation()}>
            <Sidebar
              view={view}
              fleetVersion={fleetVersion}
              onViewChange={(next) => {
                onViewChange(next);
                onMobileOpenChange(false);
              }}
              mobile
            />
          </div>
        </div>
      ) : null}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-primary bg-background-primary-default/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              iconOnly
              leadingIcon={RiMenuLine}
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => onMobileOpenChange(true)}
            />
            <div className="lg:hidden">
              <FleetMark />
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-body-medium text-text-primary">
                {connectionLabel(health.mode)}
              </p>
              <p className="text-caption-1-regular text-text-tertiary">
                Live Kubernetes control plane
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-caption-1-medium sm:flex",
                connected
                  ? "border-status-lime-border bg-status-lime-background text-status-lime-text"
                  : "border-status-rose-border bg-status-rose-background text-status-rose-text",
              )}
            >
              <span
                className={cx(
                  "size-2 rounded-full",
                  connected ? "bg-lime-500" : "bg-rose-500",
                )}
              />
              {connected ? "Connected" : "Disconnected"}
            </span>
            {view === "bundles" ? (
              <Button
                variant={attentionOnly ? "primary" : "secondary"}
                size="small"
                leadingIcon={RiAlertLine}
                onClick={onAttentionToggle}
              >
                Attention
              </Button>
            ) : null}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1540px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
