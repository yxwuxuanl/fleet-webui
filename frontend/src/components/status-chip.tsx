import { Chip } from "@/components/base/badges/chip";
import { statusKind } from "@/src/lib/format";

const colors = {
  healthy: "lime",
  warning: "yellow",
  error: "rose",
  progress: "cyan",
  neutral: "neutral",
} as const;

export function StatusChip({ value }: { value?: string }) {
  const label = value || "Unknown";
  return <Chip color={colors[statusKind(label)]}>{label}</Chip>;
}
