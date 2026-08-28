import { RiAlertLine } from "@remixicon/react";

export function ErrorBanner({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-status-rose-border bg-status-rose-background p-4 text-status-rose-text"
    >
      <RiAlertLine className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="text-body-medium">Some Fleet data could not be loaded</p>
        {messages.map((message, index) => (
          <p key={`${message}-${index}`} className="mt-1 text-body-regular">
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}
