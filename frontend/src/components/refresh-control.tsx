import { RiRefreshLine } from "@remixicon/react";
import type { Key } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Select, SelectItem } from "@/components/base/select/select";

export function RefreshControl({
  refreshSeconds,
  onRefreshSecondsChange,
  isRefreshing,
  onRefresh,
}: {
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <Select
        aria-label="Auto-refresh interval"
        size="sm"
        selectedKey={String(refreshSeconds)}
        onSelectionChange={(key: Key | null) =>
          onRefreshSecondsChange(Number(key ?? 0))
        }
      >
        <SelectItem id="0">Manual</SelectItem>
        <SelectItem id="15">Every 15 sec</SelectItem>
        <SelectItem id="30">Every 30 sec</SelectItem>
        <SelectItem id="60">Every minute</SelectItem>
        <SelectItem id="300">Every 5 min</SelectItem>
      </Select>
      <Button
        variant="secondary"
        size="small"
        leadingIcon={RiRefreshLine}
        disabled={isRefreshing}
        onClick={onRefresh}
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </Button>
    </>
  );
}
