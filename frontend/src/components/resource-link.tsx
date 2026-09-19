import type { ReactNode } from "react";
import { navigate, resourceURL, type ResourceKind } from "@/src/lib/navigation";

export function ResourceLink({ kind, namespace, name, children }: {
  kind: ResourceKind; namespace: string; name: string; children?: ReactNode;
}) {
  const href = resourceURL(kind, namespace, name);
  return <a href={href} className="break-words text-accent-700 hover:underline" onClick={(event) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }}>{children ?? name}</a>;
}
