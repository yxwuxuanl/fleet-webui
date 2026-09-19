import type { ReactNode } from "react";
import {
  RiArrowDownSLine,
  RiCheckboxCircleLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { PageHeading } from "@/src/components/page-heading";

function ServerSetupGuide({
  environment,
  helmValues,
  requirements,
  verification,
}: {
  environment: string;
  helmValues: string;
  requirements: ReactNode;
  verification: string;
}) {
  return (
    <ol className="list-decimal space-y-4 pl-5 text-body-regular text-text-secondary marker:text-text-tertiary">
      <li className="pl-1">
        <p className="font-medium text-text-primary">Configure the deployment</p>
        <p className="mt-1">Choose the method used to run Fleet WebUI.</p>
        <dl className="mt-3 space-y-3">
          {[
            { label: "Helm · values.yaml", value: helmValues },
            { label: "Server · environment variable", value: environment },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-caption-1-medium text-text-tertiary">{label}</dt>
              <dd className="mt-1">
                <pre className="whitespace-pre-wrap break-all rounded-lg border border-border-primary bg-background-secondary-default p-3 font-mono text-caption-1-regular text-text-primary">
                  <code>{value}</code>
                </pre>
              </dd>
            </div>
          ))}
        </dl>
      </li>
      <li className="pl-1">
        <p className="font-medium text-text-primary">Check permissions and prerequisites</p>
        <div className="mt-1 space-y-2">{requirements}</div>
        <p className="mt-2">
          Helm grants the required permissions when <code>rbac.create=true</code>.
          For other deployments, update the Fleet identity&apos;s permissions.
        </p>
      </li>
      <li className="pl-1">
        <p className="font-medium text-text-primary">Apply and verify</p>
        <p className="mt-1">
          Upgrade your Helm release with the updated values, or restart the server
          with the environment variable. Reload Settings to check the status.
        </p>
        <p className="mt-2">{verification}</p>
      </li>
    </ol>
  );
}

export default function SettingsView({
  reconcileEnabled,
  gitHistoryEnabled,
  gitRepoActionsEnabled,
  browserAlerts,
  onBrowserAlertsChange,
}: {
  reconcileEnabled: boolean;
  gitHistoryEnabled: boolean;
  gitRepoActionsEnabled: boolean;
  browserAlerts: boolean;
  onBrowserAlertsChange: () => void;
}) {
  const cards = [
    {
      id: "manual-reconcile",
      title: "Manual reconcile",
      enabled: reconcileEnabled,
      enabledText: "Enabled",
      disabledText: "Disabled",
      body: "Reconcile requests require an explicit confirmation in the Bundle dialog. No browser token is required.",
      guide: (
        <ServerSetupGuide
          environment="RECONCILE_ENABLED=true"
          helmValues={"reconcile:\n  enabled: true"}
          requirements={
            <p>
              Allow <code>patch</code> on <code>bundles</code> in the
              {" "}<code>fleet.cattle.io</code> API group.
            </p>
          }
          verification="Open a Bundle, select Reconcile, and confirm the request to start a sync."
        />
      ),
    },
    {
      id: "git-history",
      title: "Git commit history",
      enabled: gitHistoryEnabled,
      enabledText: "Enabled",
      disabledText: "Disabled",
      body: "Loads recent commits server-side using each GitRepo credential Secret. Credentials never reach the browser.",
      guide: (
        <ServerSetupGuide
          environment="GIT_HISTORY_ENABLED=true"
          helmValues={"gitHistory:\n  enabled: true"}
          requirements={
            <>
              <p>
                Public repositories can be read without a credential Secret.
                For private repositories, set <code>GitRepo.spec.clientSecretName</code>
                {" "}to a Secret in the GitRepo&apos;s namespace and allow
                {" "}<code>get</code> on that Secret.
              </p>
              <p>
                Reading Secrets requires Kubernetes API mode. Use a kubeconfig or
                the Pod ServiceAccount, or configure a direct Kubernetes API connection.
              </p>
              <p>
                SSH Secrets need <code>ssh-privatekey</code> and <code>known_hosts</code>.
                HTTPS Secrets use <code>username</code> with <code>password</code>
                {" "}or <code>token</code>.
              </p>
            </>
          }
          verification="Open a repository from Git repositories and check its Revision history."
        />
      ),
    },
    {
      id: "gitrepo-controls",
      title: "GitRepo controls",
      enabled: gitRepoActionsEnabled,
      enabledText: "Enabled",
      disabledText: "Read only",
      body: "Allows sync now plus confirmed revision pinning and branch resume operations.",
      guide: (
        <ServerSetupGuide
          environment="GIT_REPO_ACTIONS_ENABLED=true"
          helmValues={"gitRepoActions:\n  enabled: true"}
          requirements={
            <>
              <p>
                Allow <code>patch</code> on <code>gitrepos</code> in the
                {" "}<code>fleet.cattle.io</code> API group.
              </p>
              <p>
                Revision pinning also requires Git commit history. Follow its
                guide to enable history and configure repository credentials.
              </p>
            </>
          }
          verification="Open a repository to use Sync now. With history enabled, select Pin beside a commit and confirm. Resume branch becomes available when a revision is pinned."
        />
      ),
    },
    {
      id: "browser-alerts",
      title: "Browser alerts",
      enabled: browserAlerts,
      enabledText: "Enabled",
      disabledText: "Off",
      body: "Optional system notifications for the final observed result of manual Bundle reconciles and repository syncs while this console is open.",
      action: true,
      guide: (
        <div className="space-y-4 text-body-regular text-text-secondary">
          <ol className="list-decimal space-y-3 pl-5 marker:text-text-tertiary">
            <li className="pl-1">
              Open the console over HTTPS (or localhost) in a browser that supports
              system notifications.
            </li>
            <li className="pl-1">
              Select <strong className="font-medium text-text-primary">Enable alerts</strong>
              {" "}and allow notifications in the browser permission prompt.
            </li>
            <li className="pl-1">
              Keep the console open. With Manual reconcile enabled, confirm a
              Bundle reconcile request to receive an alert when its final outcome is observed.
            </li>
          </ol>
          <p className="rounded-lg bg-background-secondary-default p-3">
            If permission was blocked, open this site&apos;s permissions in your browser,
            allow notifications, reload the page, and select Enable alerts again.
            Also allow your browser&apos;s notifications in your device settings.
          </p>
          <p>
            This preference is saved in this browser on this device. Use Turn off
            alerts to stop notifications here.
          </p>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Settings"
        description="Runtime capabilities and notification preferences."
        actions={
          <ButtonLink
            variant="secondary"
            href="https://github.com/yxwuxuanl/fleet-webui/blob/main/docs/CONFIGURATION.md"
            target="_blank"
            rel="noreferrer"
            trailingIcon={RiExternalLinkLine}
          >
            Configuration docs
          </ButtonLink>
        }
      />
      <p className="mb-5 text-body-regular text-text-secondary">
        Server features are managed in your deployment. Open a guide for the
        configuration and access each feature needs. Manage browser alerts on this
        device.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <section
            key={card.id}
            aria-labelledby={`${card.id}-title`}
            className="min-w-0 rounded-2xl border border-border-primary bg-background-primary-default p-5 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-700">
                <RiCheckboxCircleLine className="size-5" aria-hidden />
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-caption-1-medium ${card.enabled ? "bg-status-lime-background text-status-lime-text" : "bg-background-tertiary-default text-text-tertiary"}`}
              >
                {card.enabled ? card.enabledText : card.disabledText}
              </span>
            </div>
            <h2 id={`${card.id}-title`} className="mt-4 text-heading-5 text-text-primary">
              {card.title}
            </h2>
            <p className="mt-2 text-body-regular text-text-secondary">
              {card.body}
            </p>
            {card.action ? (
              <Button
                className="mt-4"
                variant="secondary"
                onClick={onBrowserAlertsChange}
              >
                {browserAlerts ? "Turn off alerts" : "Enable alerts"}
              </Button>
            ) : null}
            <details
              open={!card.enabled}
              className="group mt-5 border-t border-border-primary pt-4"
            >
              <summary
                aria-label={`How to enable ${card.title}`}
                className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-body-medium text-accent-700 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden"
              >
                How to enable
                <RiArrowDownSLine className="size-5 shrink-0 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-4 break-words">{card.guide}</div>
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
