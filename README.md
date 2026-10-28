# Rivetin website

An English-only static website for Rivetin, the independently developed CloudTower extension platform. The visual direction uses spacious typography, light surfaces, thin borders and original monochrome illustrations.

## Local development

Requires Node.js 22 or later. No npm dependencies or global installation are needed.

```
npm run build
npm run check
npm run preview
```

Open the Local URL printed by the preview server. The server binds only to loopback and is a development tool, not a production web server.

## Files

- `src/site-v2.mjs`: English page templates and original SVG illustrations.
- `src/extension-copy.mjs`: reviewed English extension capabilities and delivery boundaries, pinned to reviewed source versions.
- `src/documentation.mjs`: installation reference, OS-specific executable examples, plugin workflows, SSH review and recovery.
- `src/project-state.json`: a curated metadata snapshot generated from the main project manifests, package versions, catalog and installer profile.
- `src/styles-v2.css`: responsive typography and layout.
- `src/site-v2.js`: navigation, extension filters, detail dialogs and documentation tabs.
- `src/fonts/`: self-hosted DM Sans and DM Mono from Google Fonts, with their SIL Open Font License notices.
- `scripts/build.mjs`: generates `dist/`; edit sources rather than generated pages.
- `scripts/check.mjs`: local links, anchors, English-only content, source-version synchronization, command placeholders, preview controls and font license checks.
- `scripts/check-interactions.mjs`: optional offline DOM checks using the adjacent framework's existing jsdom installation. It loads only local files, mocks the clipboard in memory, and does not fetch URLs or provide visual-layout verification.
- `scripts/sync-project.mjs`: reads a fixed allowlist of main-project documents and metadata; writes the website snapshot and ignored evidence hashes. It never modifies the main project or reads credentials.
- `scripts/serve.mjs`: local preview server.

`dist/index.html` is the homepage, `dist/guide.html` contains introductory documentation, and `dist/404.html` is the error page. The first design iteration is retained in the source tree and its original source snapshot is under ignored `.local/v1-source/`; it is not included in the current website output.

## Content and release status

Content was reviewed against the framework and plugin documentation, plus the coordinating development chat, on October 28, 2026. The CLI name is `rivetin` and new extension IDs use `rivetin-`. The latest project direction does not promise compatibility with legacy PluginKit IDs or paths.

The renamed repository is https://github.com/sephirothchang/rivetin and remains private; its canonical URL was verified through GitHub metadata. Framework source is 0.1.0; IPMI is 0.1.2, Context Menu 0.2.6, SSH Channel and Disk SMART 0.1.1, and Network Topology and Policy Converter 0.1.0. These are local source versions, not public releases. The catalog has no published entries. The coordinating project confirmed Rivetin 0.1.0 CLI upgrade, API/Kubernetes readback, Island asset byte verification and real browser acceptance in its CloudTower 4.9.0 development/test environment. This is not production or all-version assurance. IPMI 0.1.2 remains enabled; SSH Channel 0.1.1, Disk SMART 0.1.1 and Context Menu 0.2.6 are deployed and enabled. SSH collection settings, credentials, approvals and schedules remain unconfigured, with no real SSH host connected.

IPMI packages provide redirection, without real BMC automatic-login acceptance. SSH connection editing/inventory/draft exit, SMART host/cluster physical-disk page mounting/switching/unbound diagnostics, and Context Menu menus/form input/Cancel/internal expand-collapse passed limited read-only browser acceptance in the coordinating project. No real host collection, SMART samples/history or resource-changing operations were tested. The shared SMART provider and persistent-history consumer have local integration coverage. Context Menu and SMART declare only Tower 4.9.0; Network Topology and Policy Converter still declare no tested builds. Fresh installation, uninstall and other client platforms were not revalidated in this round. Network edits are simulated; policy exports are offline MONITOR review drafts, not Everoute API/import payloads. No public installer or release is advertised.

The website contains no host credentials, real environment data, fabricated metrics or testimonials. Its drawings are original conceptual illustrations, not screenshots of a shipped product.

## Keeping content synchronized

After reviewing changed main-project documentation, run:

```
npm run sync:project -- --reviewed-on YYYY-MM-DD
npm run build
npm run check
```

The default source is the sibling `smartx-extensions` workspace; `--project-root <path>` selects another explicit checkout. Synchronization reads only the six named plugin manifests/package files/READMEs and the shared docs, catalog, framework package and CLI profile. It does not read runtime data or credentials, invoke Git, contact hosts, or run deployment commands.

When a plugin version changes, the build refuses to reuse copy pinned to an older `reviewedVersion`. Review its capabilities and limitations, update `src/extension-copy.mjs`, then rebuild. Behavior can also change without a version bump: review current READMEs and the ignored source-evidence hashes on every synchronization; the version guard does not replace that editorial check. Newly published catalog entries also stop synchronization until release links and acceptance claims are reviewed. Repository visibility, installer availability and live acceptance are explicit reviewed assertions, not inferred from a package version or a local binary.

The installation examples are rendered from the current CLI interface and use reserved hostnames plus visible placeholders. Platform tabs update every applicable executable path; copy buttons copy the currently selected command text. Only the Windows amd64 `help` and `version` commands were executed offline. Examples do not mean real installation, host collection or recovery was tested by this website task.

Optional interaction checks can be run with `npm run check:interactions` when the adjacent framework dependencies are already present. They cover catalog filtering, dropdown reset, detail structure, platform commands, keyboard tabs, copy success/failure and source-version drift. They do not launch a browser, connect to the preview server, or read the system clipboard.

The content-sync iteration passed its build, static checks and seven offline interaction groups. After the user explicitly reauthorized local preview access, the browser origin-permission gate still denied access due to a saved permission setting or managed policy. The expanded documentation, source-version labels and richer dialogs have not received fresh visual QA; earlier screenshots predate this content update.

## Publication

The public website is built for GitHub Pages at https://rivetin.dev/ from this independent repository. Pushes to main run the pinned GitHub Actions workflow in .github/workflows/deploy-pages.yml: build, static checks, upload dist/, then Pages deployment. Pull requests run build and checks without deploying. No private-project credentials or npm installation are required. Only the reviewed source snapshot is used; automatic deployment does not automatically refresh product claims.

Run npm run build:production and npm run check:production for the published output. Normal npm run build retains noindex,nofollow and a blocking robots.txt for local previews. Production pages have canonical URLs, a sitemap and indexing enabled; the error page stays excluded. The optional local interaction check still requires the adjacent framework's existing jsdom installation and is not part of public CI.

Pages must use GitHub Actions as its source with rivetin.dev saved as its custom domain. Cloudflare apex A records point to GitHub Pages, with DNS-only proxy mode during certificate provisioning; www may point to sephirothchang.github.io. Follow GitHub's current DNS instructions when maintaining these records. Keep unrelated mail and verification records intact. HTTPS must be checked after DNS and certificate provisioning complete.

Only dist/ is published. Local .local/ evidence, archives and earlier design sources are excluded from this public source delivery. GitHub Pages manages HTTP response headers; scripts/serve.mjs headers apply only to local preview.

DM Sans and DM Mono are distributed under the SIL Open Font License, included alongside the font files. No reference-site artwork, logos or product copy has been copied.
