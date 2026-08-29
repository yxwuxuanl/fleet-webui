import { RiCheckboxCircleLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { PageHeading } from "@/src/components/page-heading";

export default function SettingsView({
  notificationConfigured,
  reconcileEnabled,
  browserAlerts,
  onBrowserAlertsChange,
}: {
  notificationConfigured: boolean;
  reconcileEnabled: boolean;
  browserAlerts: boolean;
  onBrowserAlertsChange: () => void;
}) {
  const cards = [
    {
      title: "Manual reconcile",
      enabled: reconcileEnabled,
      enabledText: "Enabled",
      disabledText: "Disabled",
      body: "Reconcile requests require an explicit confirmation in the Bundle dialog. No browser token is required.",
    },
    {
      title: "ntfy delivery",
      enabled: notificationConfigured,
      enabledText: "Configured",
      disabledText: "Not configured",
      body: "The backend can send the outcome of confirmed reconcile requests to a private ntfy topic.",
    },
    {
      title: "Browser alerts",
      enabled: browserAlerts,
      enabledText: "Enabled",
      disabledText: "Off",
      body: "Optional system notifications for manual reconcile outcomes on this device.",
      action: true,
    },
  ];
  return (
    <>
      <PageHeading
        title="Settings"
        description="Runtime capabilities and notification preferences."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <section
            key={card.title}
            className="rounded-2xl border border-border-primary bg-background-primary-default p-5 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-700">
                <RiCheckboxCircleLine className="size-5" />
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-caption-1-medium ${card.enabled ? "bg-status-lime-background text-status-lime-text" : "bg-background-tertiary-default text-text-tertiary"}`}
              >
                {card.enabled ? card.enabledText : card.disabledText}
              </span>
            </div>
            <h2 className="mt-4 text-heading-5 text-text-primary">
              {card.title}
            </h2>
            <p className="mt-2 min-h-16 text-body-regular text-text-secondary">
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
          </section>
        ))}
      </div>
    </>
  );
}
