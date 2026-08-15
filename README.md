# MESH — Morandi Timeline Blog

A personal technology blog prototype using TypeScript + semantic HTML + responsive CSS.

![MESH homepage](docs/assets/home.webp)

## Documentation

| Guide | Contents |
| :--- | :--- |
| [Documentation index](docs/README.md) | Entry point for all project documentation. |
| [Writing blog posts](docs/writing.md) | Front matter, code, tables, Alerts, Figures, Columns, Mermaid, assets, and publishing checks. |
| [Showcase](docs/showcase.md) | Homepage, article, Topics, responsive behavior, and local demos. |
| [Deployment](docs/deployment.md) | Production builds, root-path requirements, GitHub Pages, static hosting, and release checks. |

## Fastest preview

Build the generated site before starting the local preview:

```bash
npm install
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`.

Or open `examples/mesh-demo.html` directly — it is a completely self-contained interactive build.

## Development

```bash
npm install
npm run build
npm run dev
```

`npm run build` validates every Markdown file, renders article HTML, pre-renders the homepage timeline and `/tags/` topic explorer, and generates `articles.json`, `feed.xml`, `sitemap.xml`, and `robots.txt`. The topic graph is derived from tag pairs that occur together on published posts; draft posts do not contribute nodes, counts, or edges. Canonical URLs default to the local preview origin; set the deployment origin when building for production:

The build uses Shiki to add syntax-highlighted HTML to supported code before pages are written. The article runtime is then bundled with esbuild; Mermaid stays in a local, dynamically loaded browser chunk and is downloaded only by articles containing diagrams. No syntax-highlighting or diagram dependency is loaded from a CDN.

```bash
SITE_URL=https://blog.example.com npm run build
```

Run the generated-output contract tests with:

```bash
npm test
```

## Writing articles

Add lowercase kebab-case Markdown files to `content/posts/`. MESH validates front matter, publication timestamps, code languages, Mermaid accessibility titles, and the strict Figure, FigurePair, and Columns container syntax at build time.

See [Writing blog posts](docs/writing.md) for the complete authoring contract and executable showcase articles.

## Deployment

Build with the public HTTPS origin, then publish the complete `dist/` directory:

```bash
SITE_URL=https://blog.example.com npm run build
```

MESH currently uses root-relative URLs and must be hosted at a domain root, not a repository subpath. See [Deployment](docs/deployment.md) for GitHub Pages, managed static platforms, Nginx, and post-deployment checks.


## Design

- Low-saturation Morandi palette anchored in khaki / oat / sage / mist blue
- Large kinetic welcome hero inspired by motion-first editorial sites
- Timeline article feed with sticky search and tag filters
- Shareable search and tag state through `?q=` and `?tag=`
- Static article-card fallback when JavaScript is unavailable
- Mobile-first collapse to a one-column timeline
- System fonts only: no web-font request, no image dependency
- Reduced-motion and reduced-transparency fallbacks

## Structure

Application code, build tooling, content, and generated output are kept in separate top-level areas:

- `docs/` — authoring, showcase, and deployment guides
- `src/client/` — browser TypeScript entry points for the homepage, topics explorer, and article pages
- `src/styles/` — the shared visual system, responsive rules, and accessibility fallbacks
- `src/templates/` — static HTML templates populated by the content build
- `scripts/*.mjs` — browser bundling, site generation, and local preview entry points
- `scripts/lib/` — reusable content metadata and Markdown rendering modules
- `scripts/dev-server.mjs` — tiny local static server for `dist/`
- `content/posts/` — Markdown article source with validated YAML front matter
- `public/` — static assets copied into the generated site
- `tests/` — metadata, Markdown, and generated-output contract tests
- `examples/mesh-demo.html` — standalone single-file interactive preview
- `dist/` — compiled, generated, ready-to-serve build
