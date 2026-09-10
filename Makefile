IMAGE_REPOSITORY ?= registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui
IMAGE_TAG ?= $(shell git rev-parse --short=7 HEAD)-amd64
IMAGE_PLATFORM ?= linux/amd64
IMAGE = $(IMAGE_REPOSITORY):$(IMAGE_TAG)

.PHONY: run build test frontend-build image image-push image-name

run: frontend-build
	go run .

build: frontend-build
	go build -trimpath -o fleet-webui .

test: frontend-build
	go test -race ./...
	go vet ./...

frontend-build:
	npm --prefix frontend ci
	npm --prefix frontend run build

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
