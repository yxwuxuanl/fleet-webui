import { ChevronSortDown } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

export type ActivitySortDirection = "asc" | "desc" | null;

export function compareActivity(
  left: string | undefined,
  right: string | undefined,
  direction: Exclude<ActivitySortDirection, null>,
): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  const leftMissing = Number.isNaN(leftTime);
  const rightMissing = Number.isNaN(rightTime);

  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

export function ActivitySortButton({
  direction,
  label,
  onChange,
}: {
  direction: ActivitySortDirection;
  label: string;
  onChange: (direction: Exclude<ActivitySortDirection, null>) => void;
}) {
  const nextDirection = direction === "desc" ? "asc" : "desc";
  const nextDescription = nextDirection === "desc" ? "newest first" : "oldest first";

  return (
    <button
      type="button"
      aria-label={`Sort ${label} ${nextDescription}`}
      title={`Sort ${nextDescription}`}
      onClick={() => onChange(nextDirection)}
      className="flex cursor-pointer items-center gap-0.5 rounded-sm outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <span>{label}</span>
      <ChevronSortDown
        className={cx(
          "size-5 shrink-0 transition-[transform,color] duration-150",
          direction === "asc" && "rotate-180",
          direction ? "text-accent-700" : "text-text-tertiary",
        )}
      />
    </button>
  );
}
