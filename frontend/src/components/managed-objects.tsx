import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  RiCodeBoxLine,
  RiFileList2Line,
  RiHistoryLine,
  RiSearchLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Input } from "@/components/base/input/input";
import { api } from "@/src/lib/api";
import { dateLabel } from "@/src/lib/format";
import type {
  BundleView,
  ManagedObjectView,
  ManagedObjectYAML,
} from "@/src/types";

const MAX_VISIBLE_OBJECTS = 100;

function objectLabel(object: ManagedObjectView): string {
  return object.namespace ? `${object.namespace}/${object.name}` : object.name;
}

function yamlURL(object: ManagedObjectView): string {
  const query = new URLSearchParams({
    apiVersion: object.apiVersion,
    kind: object.kind,
    namespace: object.namespace ?? "",
    name: object.name,
  });
  return `/api/bundledeployments/${encodeURIComponent(object.deploymentNamespace)}/${encodeURIComponent(object.deploymentName)}/managed-object?${query}`;
}

function ObjectYAMLDialog({
  object,
  onClose,
}: {
  object: ManagedObjectView | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ManagedObjectYAML | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"diff" | "desired" | "live" | "diagnostics">("diff");
  const [logs, setLogs] = useState<{ label: string; value: string } | null>(null);
  const [logsBusy, setLogsBusy] = useState("");
  useEffect(() => {
    if (!object) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    setTab("diff");
    setLogs(null);
    void api<ManagedObjectYAML>(yamlURL(object), {
      signal: controller.signal,
    })
      .then(setResult)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [object]);

  async function loadLogs(pod: string, container: string) {
    if (!object) return;
    setLogsBusy(`${pod}/${container}`);
    setError("");
    const query = new URLSearchParams({
      apiVersion: object.apiVersion,
      kind: object.kind,
      namespace: object.namespace ?? "",
      name: object.name,
      pod,
      container,
    });
    try {
      const response = await api<{ logs: string }>(
        `/api/bundledeployments/${encodeURIComponent(object.deploymentNamespace)}/${encodeURIComponent(object.deploymentName)}/managed-object/logs?${query}`,
      );
      setLogs({ label: `${pod} · ${container}`, value: response.logs });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLogsBusy("");
    }
  }

  const tabs = [
    { id: "diff" as const, label: "Diff" },
    { id: "desired" as const, label: "Desired" },
    { id: "live" as const, label: "Live" },
    { id: "diagnostics" as const, label: "Diagnostics" },
  ];

  return (
    <ModalOverlay
      isOpen={Boolean(object)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fleet-overlay items-center justify-center p-3 sm:p-6"
    >
      <Modal className="fleet-modal flex max-h-[calc(100vh-1.5rem)] w-full max-w-[960px] rounded-2xl border border-border-primary bg-background-primary-default shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <Dialog className="flex min-h-0 w-full flex-col outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border-primary p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-caption-1-medium uppercase tracking-wide text-accent-700">
                {object?.kind ?? "Kubernetes object"} · {object?.apiVersion}
              </p>
              <Heading
                slot="title"
                className="mt-1 truncate text-heading-4 text-text-primary"
              >
                {object ? objectLabel(object) : "Object YAML"}
              </Heading>
              <p className="mt-1 text-caption-1-regular text-text-tertiary">
                {object?.cluster}
              </p>
            </div>
            <CloseButton aria-label="Close object YAML" onClick={onClose} />
          </div>
          {result?.redacted ? (
            <div className="border-b border-status-yellow-border bg-status-yellow-background px-4 py-2.5 text-body-regular text-status-yellow-text sm:px-5">
              Secret values are redacted by the server.
            </div>
          ) : null}
          <div className="border-b border-border-primary px-3 sm:px-5">
            <div className="flex gap-1 overflow-x-auto py-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setLogs(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-body-medium outline-none transition-colors ${tab === item.id ? "bg-accent-50 text-accent-700" : "text-text-secondary hover:bg-background-secondary-hover"}`}
                >
                  {item.label}
                  {item.id === "diagnostics" && result
                    ? ` (${(result.events ?? []).length + (result.pods ?? []).length})`
                    : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
            {error ? (
              <div role="alert" className="rounded-xl bg-status-rose-background p-3 text-body-regular text-status-rose-text">
                {error}
              </div>
            ) : !result ? (
              <div className="grid min-h-72 place-items-center rounded-xl border border-border-primary bg-background-secondary-default text-body-regular text-text-tertiary">
                Loading object diagnostics…
              </div>
            ) : tab === "diagnostics" ? (
              <div className="space-y-5">
                {logs ? (
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-body-medium text-text-primary">Container logs</h3>
                        <p className="mt-0.5 text-caption-1-regular text-text-tertiary">{logs.label} · last 200 lines</p>
                      </div>
                      <button type="button" onClick={() => setLogs(null)} className="text-body-medium text-accent-700">Back</button>
                    </div>
                    <pre className="min-h-72 overflow-auto rounded-xl border border-border-primary bg-background-secondary-default p-4 font-mono text-[12px] leading-5 text-text-primary"><code>{logs.value || "No log output."}</code></pre>
                  </section>
                ) : (
                  <>
                    <section>
                      <div className="flex items-center gap-2">
                        <RiTerminalBoxLine className="size-5 text-text-secondary" />
                        <h3 className="text-body-medium text-text-primary">Workload pods</h3>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(result.pods ?? []).length ? (result.pods ?? []).map((pod) => (
                          <div key={pod.name} className="rounded-xl border border-border-primary bg-background-secondary-default p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-mono text-body-medium text-text-primary">{pod.name}</p>
                                <p className="mt-1 text-caption-1-regular text-text-tertiary">{pod.phase} · {pod.ready}/{pod.containers} ready · {pod.restarts} restarts</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {pod.containerNames.map((container) => (
                                  <button key={container} type="button" disabled={Boolean(logsBusy)} onClick={() => void loadLogs(pod.name, container)} className="rounded-lg border border-border-primary bg-background-primary-default px-2.5 py-1.5 text-caption-1-medium text-accent-700 hover:bg-background-secondary-hover disabled:opacity-60">
                                    {logsBusy === `${pod.name}/${container}` ? "Loading…" : `${container} logs`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )) : <p className="rounded-xl border border-border-primary p-3 text-body-regular text-text-tertiary">No workload pods were found for this object.</p>}
                      </div>
                    </section>
                    <section>
                      <div className="flex items-center gap-2">
                        <RiHistoryLine className="size-5 text-text-secondary" />
                        <h3 className="text-body-medium text-text-primary">Kubernetes events</h3>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(result.events ?? []).length ? (result.events ?? []).map((event, index) => (
                          <div key={`${event.reason}-${event.lastSeen}-${index}`} className="rounded-xl border border-border-primary p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-body-medium text-text-primary">{event.reason || event.type || "Event"}</p>
                              <span className={`text-caption-1-medium ${event.type === "Warning" ? "text-status-rose-text" : "text-text-tertiary"}`}>{event.type}{event.count > 1 ? ` ×${event.count}` : ""}</span>
                            </div>
                            <p className="mt-1 text-body-regular text-text-secondary">{event.message}</p>
                            <p className="mt-2 text-caption-1-regular text-text-tertiary">{event.lastSeen ? dateLabel(event.lastSeen) : "Time unavailable"}{event.source ? ` · ${event.source}` : ""}</p>
                          </div>
                        )) : <p className="rounded-xl border border-border-primary p-3 text-body-regular text-text-tertiary">No Kubernetes events are currently reported for this object.</p>}
                      </div>
                    </section>
                  </>
                )}
              </div>
            ) : result.desiredError && tab !== "live" ? (
              <div className="rounded-xl border border-status-yellow-border bg-status-yellow-background p-4 text-body-regular text-status-yellow-text">
                Desired state is unavailable: {result.desiredError}
              </div>
            ) : tab === "diff" && !result.diff ? (
              <div className="grid min-h-72 place-items-center rounded-xl border border-status-lime-border bg-status-lime-background p-4 text-center">
                <div>
                  <RiFileList2Line className="mx-auto size-7 text-status-lime-text" />
                  <p className="mt-2 text-body-medium text-status-lime-text">Desired and Live match</p>
                  <p className="mt-1 text-body-regular text-text-secondary">Runtime metadata and status fields are ignored.</p>
                </div>
              </div>
            ) : (
              <pre className="min-h-72 overflow-auto rounded-xl border border-border-primary bg-background-secondary-default p-4 font-mono text-[12px] leading-5 text-text-primary">
                <code>{tab === "diff" ? result.diff : tab === "desired" ? result.desiredYAML : result.liveYAML || result.yaml}</code>
              </pre>
            )}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function ManagedObjectsPanel({
  bundle,
  active,
}: {
  bundle: BundleView;
  active: boolean;
}) {
  const [objects, setObjects] = useState<ManagedObjectView[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [yamlEnabled, setYAMLEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selected, setSelected] = useState<ManagedObjectView | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setObjects([]);
    setError("");
    setLoading(true);
    void api<{ items: ManagedObjectView[]; yamlEnabled: boolean }>(
      `/api/bundles/${encodeURIComponent(bundle.namespace)}/${encodeURIComponent(bundle.name)}/managed-objects`,
      { signal: controller.signal },
    )
      .then((result) => {
        setObjects(result.items);
        setYAMLEnabled(result.yamlEnabled);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, bundle.name, bundle.namespace]);

  useEffect(() => {
    if (!active) {
      setSelected(null);
      setSearch("");
    }
  }, [active]);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return objects;
    return objects.filter((object) =>
      [
        object.kind,
        object.apiVersion,
        object.name,
        object.namespace,
        object.cluster,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [deferredSearch, objects]);
  const visible = filtered.slice(0, MAX_VISIBLE_OBJECTS);

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-body-medium text-text-primary">
            Managed objects
          </h3>
          <p className="mt-0.5 text-caption-1-regular text-text-tertiary">
            {loading
              ? "Loading deployed resources…"
              : `${objects.length} objects across ${new Set(objects.map((object) => object.cluster)).size} clusters`}
          </p>
        </div>
      </div>
      {objects.length > 8 ? (
        <div className="mt-3">
          <Input
            aria-label="Search managed objects"
            placeholder="Search kind, name or cluster"
            leadingIcon={RiSearchLine}
            value={search}
            onChange={setSearch}
            size="small"
          />
        </div>
      ) : null}
      {!loading && objects.length && !yamlEnabled ? (
        <div className="mt-3 rounded-xl border border-status-yellow-border bg-status-yellow-background p-3 text-body-regular text-status-yellow-text">
          Object metadata is available, but live YAML is disabled on this
          server.
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 rounded-xl bg-status-rose-background p-3 text-body-regular text-status-rose-text">
          {error}
        </div>
      ) : loading ? (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-border-primary text-body-regular text-text-tertiary">
          Loading managed objects…
        </div>
      ) : !filtered.length ? (
        <div className="mt-3 rounded-xl border border-border-primary p-4 text-center text-body-regular text-text-tertiary">
          {objects.length
            ? "No managed objects match this search."
            : "Fleet has not reported managed objects for this Bundle yet."}
        </div>
      ) : (
        <div className="mt-3 max-h-80 divide-y divide-border-primary overflow-y-auto rounded-xl border border-border-primary">
          {visible.map((object) => (
            <button
              type="button"
              key={`${object.deploymentNamespace}/${object.deploymentName}/${object.apiVersion}/${object.kind}/${object.namespace}/${object.name}`}
              aria-label={`View YAML for ${object.kind} ${objectLabel(object)}`}
              disabled={!yamlEnabled}
              onClick={() => setSelected(object)}
              className="fleet-list-row flex w-full items-center gap-3 p-3 text-left outline-none hover:bg-background-secondary-hover focus-visible:bg-background-secondary-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background-tertiary-default text-text-secondary">
                <RiCodeBoxLine className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-background-secondary-default px-1.5 py-0.5 font-mono text-caption-1-medium text-text-secondary">
                    {object.kind}
                  </span>
                  <span className="truncate text-body-medium text-text-primary">
                    {objectLabel(object)}
                  </span>
                </span>
                <span className="mt-1 block truncate text-caption-1-regular text-text-tertiary">
                  {object.cluster} · {object.apiVersion}
                  {object.createdAt
                    ? ` · created ${dateLabel(object.createdAt)}`
                    : ""}
                </span>
              </span>
              <span className="text-caption-1-medium text-accent-700">
                {yamlEnabled ? "YAML" : "Disabled"}
              </span>
            </button>
          ))}
        </div>
      )}
      {filtered.length > MAX_VISIBLE_OBJECTS ? (
        <p className="mt-2 text-caption-1-regular text-text-tertiary">
          Showing the first {MAX_VISIBLE_OBJECTS} of {filtered.length} matches.
          Refine the search to find another object.
        </p>
      ) : null}
      <ObjectYAMLDialog object={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
