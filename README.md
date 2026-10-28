<p align="center">
  <img src="src/mark.svg" alt="Rivetin logo" width="64" height="64">
</p>

<h1 align="center">Rivetin</h1>

<p align="center">
  Small extensions. A better CloudTower.
  <br>
  An independent extension platform for the tools you use every day.
</p>

<p align="center">
  <a href="https://rivetin.dev/"><strong>Website</strong></a>
  &nbsp; · &nbsp;
  <a href="https://rivetin.dev/guide.html"><strong>Documentation</strong></a>
  &nbsp; · &nbsp;
  <a href="https://github.com/sephirothchang/rivetin"><strong>Main project</strong></a>
</p>

<p align="center">
  <a href="https://github.com/sephirothchang/rivetin-website/actions/workflows/deploy-pages.yml"><img src="https://github.com/sephirothchang/rivetin-website/actions/workflows/deploy-pages.yml/badge.svg?branch=main" alt="Website deployment status"></a>
  <img src="https://img.shields.io/badge/CloudTower-4.9.0-536d82?style=flat-square" alt="Declared CloudTower version: 4.9.0">
  <img src="https://img.shields.io/badge/Framework_API-1-536d82?style=flat-square" alt="Framework API: 1">
</p>

---

## About

This repository contains the bilingual Rivetin website and its public plugin catalog. The [main project](https://github.com/sephirothchang/rivetin) contains the framework and extensions; repository access is currently required.

Explore the [extensions](#extensions) or check the [compatibility](#compatibility) before getting started.

## Extensions

Rivetin 0.2 uses the [v4 catalog](https://rivetin.dev/catalog/v4/plugins.json):

| Extension | v4 release | Compatibility |
| :--- | :--- | :--- |
| [IPMI Redirection](https://rivetin.dev/#extension-ipmi) | `0.1.4` | Rivetin >=0.2.0 and <0.3.0; CloudTower 4.9.0, limited development/test scope below |

Three historical v3 packages remain in the [legacy catalog](https://rivetin.dev/catalog/plugins.json) for the 0.1 framework line:

| Extension | Version | What it adds |
| :--- | :--- | :--- |
| [IPMI Redirection](https://rivetin.dev/#extension-ipmi) | `0.1.2` | Host BMC access and vendor protocol settings |
| [SSH Channel](https://rivetin.dev/#extension-ssh) | `0.1.1` | Shared, controlled collection and approvals |
| [Disk SMART](https://rivetin.dev/#extension-smart) | `0.1.3` | Physical disk SMART information and history |

**In development**

| Extension | Version | Status |
| :--- | :--- | :--- |
| [Context Menu](https://rivetin.dev/#extension-context) | `0.5.6` | Source candidate; historical catalog draft remains 0.4.2, no public package |
| [Network Topology](https://rivetin.dev/#extension-topology) | `0.1.0` | Local demo; no accepted CloudTower build |
| [Policy Converter](https://rivetin.dev/#extension-converter) | `0.1.1` | Offline source preview; no accepted CloudTower build or public package |

## Compatibility

Historical v3 packages declare **CloudTower 4.9.0** and **framework API 1**. Their old compatibility declarations do not pass the Rivetin 0.2 gate. Disk SMART 0.1.3 requires Rivetin **0.1.2 or later** on the 0.1 framework line; SSH Channel requires its framework broker and host-specific validation. A declared version does not guarantee support for every build or production environment. Live host SMART collection remains unverified.

The [plugin catalog](https://rivetin.dev/catalog/plugins.json) is the source of truth for published versions, checksums and compatibility declarations. Framework installers are not publicly available. This overview reflects the reviewed website and catalog snapshot of October 28, 2026.


The reviewed framework source is **0.2.1**. SSH Channel **0.1.2**, Disk SMART **0.1.5** and Context Menu **0.5.6** remain source/local candidates, without new market admission. The [v4 catalog](https://rivetin.dev/catalog/v4/plugins.json) is the source for Rivetin 0.2 package releases. A local fixed candidate does not establish market admission or live acceptance.

The [historical 0.2.0 validation record](https://github.com/sephirothchang/rivetin/blob/main/docs/0.2-validation.md) covers an earlier fixed candidate, a controlled Windows amd64 CLI upgrade and the Chinese component-status page in one CloudTower 4.9.0 development/test environment. It does not validate the current working tree, new plugin combinations, device-policy v2, real SMART samples or cross-day collection.

## Local content review

Run `npm run test:content`, `npm run test:catalog`, `npm run build:production`, `npm run check:production` and `npm run check:interactions` with the existing adjacent framework dependencies. Browser rendering needs separate verification.

`node scripts/sync-project.mjs --reviewed-on YYYY-MM-DD --check` checks source metadata without writing. After editorial review, omit `--check` to refresh source metadata; it preserves the separately reviewed historical acceptance and never establishes a current deployment or market release. A changed validation-document fingerprint or source version requires a new review. Fixed candidate admission and public catalog imports remain separate release steps.


The website selects a primary download only from a validated v4 `published` entry whose framework range matches the reviewed framework version. Historical v3 packages keep separate version labels and links; they never become a fallback download for Rivetin 0.2. Directory counts stay separate, and shared plugin IDs count once. Availability and examples are generated from the validated public catalogs when building.

Context Menu 0.5.6 now has a locally frozen package and independent review; real framework/plugin combination acceptance and market admission remain pending. Local proposal previews use isolated directories and do not change the canonical public catalogs.


IPMI 0.1.4 completed controlled acceptance with framework 0.2.0 on one exact CloudTower 4.9.0 development/test profile. The scope covers draft save/discard and settings restoration, one host with IPMI plus two without, lifecycle and preserved HTTPS/rel/copy controls. It excludes switching between two populated IPMI hosts, clipboard execution, different administrators, real BMC access, automatic login and KVM. This does not validate the current framework 0.2.1 source. Website deployment and live download availability require their own publication/readback checks.
