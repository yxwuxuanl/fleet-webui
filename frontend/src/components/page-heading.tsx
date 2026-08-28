import type { ReactNode } from "react";

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-caption-1-medium uppercase tracking-[0.12em] text-accent-700">
          Fleet management
        </p>
        <h1 className="mt-1 text-heading-2 text-text-primary">{title}</h1>
        <p className="mt-2 text-body-regular text-text-secondary">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
