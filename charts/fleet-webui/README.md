# fleet-webui Helm chart

Deploys Fleet WebUI using the automatically detected Pod ServiceAccount to access the Fleet CRDs. The default image is `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui:57086c5c`.

## Install

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --create-namespace
```

The chart creates a ClusterRole and ClusterRoleBinding so the WebUI can list Bundle and GitRepo resources across namespaces, and patch Bundles for manual reconcile.

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
| `image.tag` | `57086c5c` | Container image tag. |
| `rbac.create` | `true` | Create the ClusterRole and ClusterRoleBinding. |
| `ntfy.enabled` | `false` | Configure the fixed ntfy channel. |
| `ntfy.existingSecret` | empty | Secret containing `ntfy.tokenKey`. |
| `ingress.enabled` | `false` | Create an Ingress resource. |
