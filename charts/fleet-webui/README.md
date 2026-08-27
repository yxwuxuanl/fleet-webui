# fleet-webui Helm chart

Deploys Fleet WebUI using the automatically detected Pod ServiceAccount to access the Fleet CRDs. The default image is `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui:6f05c01`.

## Install

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --create-namespace
```

The chart creates a ClusterRole and ClusterRoleBinding so the WebUI can list Bundle and GitRepo resources across namespaces. The default install is read-only; Bundle patch permission is added only when an authenticated reconcile Secret is configured.

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

## Authenticated reconcile

Create a Secret containing a long random reconcile token:

```sh
kubectl -n cattle-fleet-system create secret generic fleet-webui-reconcile \
  --from-literal=token="$(openssl rand -hex 32)"
```

Enable manual reconcile with that Secret:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set reconcileAuth.existingSecret=fleet-webui-reconcile
```

Users enter the same token in the reconcile dialog. Serve the application over HTTPS so the Bearer token is protected in transit. If `reconcileAuth.existingSecret` is empty, the API and UI remain read-only and the chart does not grant Bundle patch permission.

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

## Common values

| Value | Default | Description |
| --- | --- | --- |
| `image.repository` | `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui` | Container image repository. |
| `image.tag` | `6f05c01` | Container image tag. |
| `rbac.create` | `true` | Create the ClusterRole and ClusterRoleBinding. |
| `fleet.pageSize` | `250` | Maximum Fleet resources requested per upstream page. |
| `fleet.cacheTTLSeconds` | `10` | Shared in-process list cache lifetime. |
| `reconcileAuth.existingSecret` | empty | Secret that enables authenticated reconcile and Bundle patch RBAC. |
| `reconcileAuth.tokenKey` | `token` | Key containing the reconcile Bearer token. |
| `ntfy.enabled` | `false` | Configure the fixed ntfy channel. |
| `ntfy.existingSecret` | empty | Secret containing `ntfy.tokenKey`. |
| `ingress.enabled` | `false` | Create an Ingress resource. |
