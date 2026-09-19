export type ResourceKind = "bundle" | "repository" | "deployment" | "cluster";
const views = { bundle: "bundles", repository: "repositories", deployment: "deployments", cluster: "clusters" };

export function resourceURL(kind: ResourceKind, namespace: string, name: string): string {
  return `?${new URLSearchParams({ view: views[kind], [kind]: `${namespace}/${name}` })}`;
}

export function navigate(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
