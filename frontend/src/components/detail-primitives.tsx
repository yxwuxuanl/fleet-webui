import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { CloseButton } from "@/components/base/buttons/close-button";
import { StatusChip } from "@/src/components/status-chip";
import { dateLabel } from "@/src/lib/format";
import type { FleetCondition } from "@/src/types";

export function Definition({
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

export function ConditionsList({
  conditions,
}: {
  conditions: FleetCondition[];
}) {
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

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow: string;
  children: ReactNode;
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
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
