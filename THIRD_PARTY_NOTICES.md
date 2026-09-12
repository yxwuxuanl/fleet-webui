# Third-party notices

The root MIT license applies to project-owned code. Dependencies keep their own licenses and copyright notices. This inventory records direct frontend dependencies from the installed packages; it is not a replacement for their full license texts or a complete transitive-dependency inventory.

## Direct frontend dependencies

| Package | Installed version | Declared license |
| --- | --- | --- |
| `@internationalized/date` | `3.12.3` | Apache-2.0 |
| `@remixicon/react` | `4.9.0` | Remix Icon License 1.0 |
| `@tailwindcss/postcss` | `4.3.3` | MIT |
| `@tanstack/react-table` | `8.21.3` | MIT |
| `motion` | `12.43.0` | MIT |
| `react` | `19.2.8` | MIT |
| `react-aria-components` | `1.20.0` | Apache-2.0 |
| `react-dom` | `19.2.8` | MIT |
| `tailwind-merge` | `3.6.0` | MIT |

Remix Icon is distributed under **Remix Icon License 1.0**, not MIT. See the [upstream license](https://github.com/Remix-Design/RemixIcon/blob/master/License) and the notices for the specific installed release.

## Go dependencies

`go.mod` and `go.sum` record the Go dependency graph. Main dependencies include go-git, Kubernetes client-go/apimachinery, go-difflib and sigs.k8s.io/yaml. Their own license and notice files remain authoritative. Before distributing binaries or containers, include the notices required by the exact bundled versions.

## Components and visual assets

Preserve attribution for any imported code or assets. A reference to a design pattern does not establish an upstream code license. Changes that import third-party material should document its source in the pull request.
