import type { BundleView } from "@/src/types";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function dateLabel(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatter.format(date).replace(",", "");
}

export function shortCommit(value?: string): string {
  return value ? value.slice(0, 7) : "—";
}

export function bundleID(
  bundle: Pick<BundleView, "namespace" | "name">,
): string {
  return `${bundle.namespace}/${bundle.name}`;
}

export type StatusKind =
  | "healthy"
  | "warning"
  | "error"
  | "progress"
  | "neutral";

export function statusKind(value?: string): StatusKind {
  const status = String(value || "").toLowerCase();
  if (["healthy", "ready", "current", "completed"].includes(status))
    return "healthy";
  if (["error", "errapplied", "failed", "notready"].includes(status))
    return "error";
  if (["out of sync", "outofsync", "modified"].includes(status))
    return "warning";
  if (
    [
      "reconciling",
      "waitapplied",
      "waitingfordependency",
      "pending",
      "processing",
      "inprogress",
      "in-progress",
      "syncing",
      "waitcheckin",
      "wait-check-in",
    ].includes(status)
  )
    return "progress";
  return "neutral";
}

export function connectionLabel(mode: string): string {
  if (mode === "direct") return "Live Fleet · direct API";
  if (mode === "kubeconfig") return "Kubernetes · kubeconfig";
  if (mode === "in-cluster") return "Kubernetes · in-cluster";
  return "Fleet connection unavailable";
}

export function needsAttention(bundle: BundleView): boolean {
  return (
    statusKind(bundle.health) === "error" ||
    statusKind(bundle.health) === "warning" ||
    statusKind(bundle.state) === "error" ||
    statusKind(bundle.state) === "warning"
  );
}
