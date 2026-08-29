# fleet-webui Helm chart

Deploys Fleet WebUI using the automatically detected Pod ServiceAccount to access the Fleet CRDs. The default image is `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui:6f05c01`.

## Install

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --create-namespace
```

The chart creates a ClusterRole and ClusterRoleBinding so the WebUI can list Fleet resources across namespaces. Manual reconcile is enabled by default and adds Bundle `patch` permission.

If the Alibaba Cloud registry is private, create an image-pull Secret and set `imagePullSecrets`:

```sh
kubectl -n cattle-fleet-system create secret docker-registry aliyun-registry \
  --docker-server=registry.cn-shenzhen.aliyuncs.com \
  --docker-username='REPLACE_ME' \
  --docker-password='REPLACE_ME'

helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set 'imagePullSecrets[0].name=aliyun-registry'
```

## Manual reconcile

Opening reconcile displays a confirmation dialog. Confirming it increments the Bundle's `spec.forceSyncGeneration`; no browser or server-side reconcile token is required.

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set reconcile.enabled=false
```

The example above disables the endpoint and removes Bundle `patch` permission for a read-only installation. Because the reconcile endpoint itself has no authentication challenge, expose the console only through your private access-control layer.

## ntfy notifications

Create a Secret with the ntfy token first:

```sh
kubectl -n cattle-fleet-system create secret generic fleet-webui-ntfy \
  --from-literal=token='REPLACE_ME'
```

Then enable it during install or upgrade:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set ntfy.enabled=true \
  --set ntfy.baseURL=https://ntfy.example.com \
  --set ntfy.topic=fleet-reconcile-your-topic \
  --set ntfy.existingSecret=fleet-webui-ntfy
```

## Managed object YAML

The Bundle drawer always lists the Kubernetes objects reported in `BundleDeployment.status.resources`. Live YAML is opt-in because Kubernetes RBAC must grant `get` for arbitrary resource kinds. The API only accepts objects present in the selected BundleDeployment and redacts Secret `data`, `stringData`, and `binaryData` before returning YAML.

For objects deployed to the same Kubernetes API as Fleet WebUI:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set managedObjects.enabled=true
```

For remote Fleet clusters, also allow the server to read the kubeconfig Secret referenced by each Fleet Cluster:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set managedObjects.enabled=true \
  --set managedObjects.downstreamKubeconfigs=true
```

Enabling managed object YAML grants the WebUI ServiceAccount get-only access to arbitrary Kubernetes resource kinds, including Secrets. Enable it only for a private, HTTPS-protected console with tightly controlled access.

## Common values

| Value | Default | Description |
| --- | --- | --- |
| `image.repository` | `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui` | Container image repository. |
| `image.tag` | `6f05c01` | Container image tag. |
| `rbac.create` | `true` | Create the ClusterRole and ClusterRoleBinding. |
| `fleet.pageSize` | `250` | Maximum Fleet resources requested per upstream page. |
| `fleet.cacheTTLSeconds` | `10` | Shared in-process list cache lifetime. |
| `managedObjects.enabled` | `false` | Enable live YAML for Bundle-managed objects and add get-only dynamic-resource RBAC. |
| `managedObjects.downstreamKubeconfigs` | `false` | Read Fleet Cluster kubeconfig Secrets to retrieve YAML from remote clusters. |
| `reconcile.enabled` | `true` | Enable confirmation-based manual reconcile and Bundle patch RBAC. |
| `ntfy.enabled` | `false` | Configure the fixed ntfy channel. |
| `ntfy.existingSecret` | empty | Secret containing `ntfy.tokenKey`. |
| `ingress.enabled` | `false` | Create an Ingress resource. |
