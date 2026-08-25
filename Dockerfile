FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY main.go ./
COPY web ./web
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/fleet-webui .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/fleet-webui /fleet-webui
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/fleet-webui"]
