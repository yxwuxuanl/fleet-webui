IMAGE_REPOSITORY ?= registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui
IMAGE_TAG ?= $(shell git rev-parse --short=7 HEAD)-amd64
IMAGE_PLATFORM ?= linux/amd64
IMAGE = $(IMAGE_REPOSITORY):$(IMAGE_TAG)

.PHONY: image image-push image-name

image:
	docker buildx build \
		--platform "$(IMAGE_PLATFORM)" \
		--provenance=false \
		--sbom=false \
		--load \
		--tag "$(IMAGE)" \
		.

image-push:
	docker buildx build \
		--platform "$(IMAGE_PLATFORM)" \
		--provenance=false \
		--sbom=false \
		--push \
		--tag "$(IMAGE)" \
		.

image-name:
	@printf '%s\n' "$(IMAGE)"
