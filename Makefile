IMAGE_REPOSITORY ?= ghcr.io/yxwuxuanl/fleet-webui
IMAGE_TAG ?= $(shell git rev-parse --short=7 HEAD)-amd64
IMAGE_PLATFORM ?= linux/amd64
IMAGE = $(IMAGE_REPOSITORY):$(IMAGE_TAG)

.PHONY: run build test chart-test frontend-build image image-push image-name

run: frontend-build
	go -C server run .

build: frontend-build
	go -C server build -trimpath -o ../fleet-webui .

test: frontend-build
	go -C server test -race ./...
	go -C server vet ./...

frontend-build:
	npm --prefix frontend ci
	npm --prefix frontend run build

server/dist/index.html:
	$(MAKE) frontend-build

chart-test: server/dist/index.html
	helm lint charts/fleet-webui
	go -C server test -count=1 -run 'Test(HelmConfiguration|ReadOnlyManifest)$$' ./...

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
