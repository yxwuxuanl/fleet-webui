FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
COPY server/*.go ./
COPY --from=frontend /src/server/dist ./dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/fleet-webui .

FROM gcr.io/distroless/static-debian12:nonroot
LABEL org.opencontainers.image.source="https://github.com/yxwuxuanl/fleet-webui" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.description="An independent web console for Rancher Fleet"
COPY --from=build /out/fleet-webui /fleet-webui
COPY LICENSE /LICENSE
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/fleet-webui"]
