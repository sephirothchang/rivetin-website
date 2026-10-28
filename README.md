# Rivetin website

The English-language website and installation guide for Rivetin, an independently developed CloudTower extension platform.

- Website: https://rivetin.dev/
- Hosting: GitHub Pages
- Product repository: https://github.com/sephirothchang/rivetin (currently private)

This repository contains the static website only. It does not contain the framework, plugin packages, credentials or deployment data for CloudTower. Product source versions and limited validation scopes are described on the website; they do not imply public releases, vendor certification or general production support.

## Development

Use Node.js 22 or later. No npm dependencies or global installation are required for the build and static checks.

```sh
npm run build
npm run check
npm run preview
```

The preview binds only to loopback. Preview builds keep noindex,nofollow and disallow crawling.

For production output:

```sh
npm run build:production
npm run check:production
```

The output is dist/: the homepage, guide, custom error page and self-hosted assets. Production builds also include canonical URLs, robots.txt and a sitemap. The error page stays excluded from indexing and resolves assets from the site root for nested missing routes.

## Source layout

- src/site-v2.mjs: page templates and original SVG illustrations.
- src/styles-v2.css and src/site-v2.js: responsive styles, navigation, filters, dialogs, platform tabs and command copying.
- src/documentation.mjs: installation reference and delivery boundaries.
- src/extension-copy.mjs: reviewed capabilities pinned to source versions.
- src/project-state.json: reviewed product metadata used without accessing the private product repository during CI.
- src/fonts/: self-hosted DM Sans and DM Mono with their SIL Open Font License notices.
- scripts/build.mjs and scripts/check.mjs: dependency-free generation and static verification.

Edit sources and regenerate dist/; generated output is not committed.

## Automatic deployment

.github/workflows/deploy-pages.yml runs on pushes to main and manual dispatch. It builds production output, checks content, links, assets and indexing mode, uploads dist/, then deploys through the github-pages environment. Pull requests run the build and checks without deployment.

Actions are pinned to reviewed commit SHAs. The build has read-only repository access; only the deploy job receives pages:write and id-token:write. No custom access token, Cloudflare credential or private-project checkout is required.

## Custom domain

The repository Pages source is GitHub Actions and its custom domain is rivetin.dev. Cloudflare serves DNS with these website records in DNS-only mode:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | sephirothchang.github.io |
| TXT | _github-pages-challenge-sephirothchang | GitHub-provided ownership verification value |

Keep the ownership TXT record to retain GitHub domain verification. GitHub manages the certificate and HTTPS enforcement; verify both root-domain access and the www redirect after DNS or Pages changes. Follow GitHub's current instructions before changing IPs, and preserve unrelated mail or service records.

## Updating product content

Review the current product documentation before changing capabilities or acceptance claims. If an authorized sibling smartx-extensions checkout is available, synchronize the fixed metadata allowlist:

```sh
npm run sync:project -- --reviewed-on YYYY-MM-DD
npm run build:production
npm run check:production
```

The script also accepts --project-root. It does not connect to hosts, read credentials, deploy plugins or publish packages. A changed plugin version requires review of its corresponding reviewedVersion copy before building. Behavior may also change without a version bump, so review changed documents even when the version guard passes. Newly published catalog entries stop synchronization until availability and download links are reviewed.

Optional npm run check:interactions reuses jsdom from the adjacent framework's existing installation. Its seven groups cover offline DOM behavior without network or clipboard access; it is not part of public CI and does not replace browser visual checks. Local evidence and prior design files remain outside the public delivery.

DM Sans and DM Mono are distributed under the SIL Open Font License. Illustrations are original code-based drawings. This community project is not affiliated with or endorsed by SmartX.

