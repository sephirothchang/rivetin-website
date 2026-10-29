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
| [Context Menu](https://rivetin.dev/#extension-context) | `0.5.9` | Same framework range and declared Tower build; controlled read-only scope below |
| [SSH Channel](https://rivetin.dev/#extension-ssh) | `0.1.2` | Same framework range and declared Tower build; collection remains unverified |
| [Disk SMART](https://rivetin.dev/#extension-smart) | `0.1.6` | Same framework range and declared Tower build; real samples and execution remain pending |

Three historical v3 packages remain in the [legacy catalog](https://rivetin.dev/catalog/plugins.json) for the 0.1 framework line:

| Extension | Version | What it adds |
| :--- | :--- | :--- |
| [IPMI Redirection](https://rivetin.dev/#extension-ipmi) | `0.1.2` | Host BMC access and vendor protocol settings |
| [SSH Channel](https://rivetin.dev/#extension-ssh) | `0.1.1` | Shared, controlled collection and approvals |
| [Disk SMART](https://rivetin.dev/#extension-smart) | `0.1.3` | Physical disk SMART information and history |

**In development**

| Extension | Version | Status |
| :--- | :--- | :--- |
| [Network Topology](https://rivetin.dev/#extension-topology) | `0.1.0` | Local demo; no accepted CloudTower build |
| [Policy Converter](https://rivetin.dev/#extension-converter) | `0.1.1` | Offline source preview; no accepted CloudTower build or public package |

## Compatibility

Historical v3 packages declare **CloudTower 4.9.0** and **framework API 1**. Their old compatibility declarations do not pass the Rivetin 0.2 gate. Disk SMART 0.1.3 requires Rivetin **0.1.2 or later** on the 0.1 framework line; SSH Channel requires its framework broker and host-specific validation. A declared version does not guarantee support for every build or production environment. Live host SMART collection remains unverified.

The v4 catalog is the source of truth for Rivetin 0.2 package versions, checksums and compatibility declarations; the legacy catalog retains the historical 0.1 releases. Framework installers are not publicly available. This overview reflects the reviewed website and catalog snapshot of October 29, 2026.


The reviewed framework source remains **0.2.2**. IPMI **0.1.4**, SSH Channel **0.1.2**, Disk SMART **0.1.6** and Context Menu **0.5.9** are reviewed against the [plugin source snapshot 0943fd9f51fe](https://github.com/sephirothchang/rivetin/commit/0943fd9f51fe6e2ec5177ff31c446909f861597c). Source synchronization does not establish market admission. The [v4 catalog](https://rivetin.dev/catalog/v4/plugins.json) is the source for Rivetin 0.2 package releases. A local fixed candidate does not establish market admission or live acceptance.

The [historical 0.2.0 validation record](https://github.com/sephirothchang/rivetin/blob/main/docs/0.2-validation.md) covers an earlier fixed candidate, a controlled Windows amd64 CLI upgrade and the Chinese component-status page in one CloudTower 4.9.0 development/test environment. It does not validate the current working tree, new plugin combinations, device-policy v2, real SMART samples or cross-day collection.

## Local content review

Run `npm run test:content`, `npm run test:catalog`, `npm run build:production`, `npm run check:production` and `npm run check:interactions` with the existing adjacent framework dependencies. Browser rendering needs separate verification.

`node scripts/sync-project.mjs --reviewed-on YYYY-MM-DD --check` checks source metadata without writing. After editorial review, omit `--check` to refresh source metadata; it preserves the separately reviewed historical acceptance and never establishes a current deployment or market release. A changed validation-document fingerprint or source version requires a new review. Fixed candidate admission and public catalog imports remain separate release steps.


The website selects a primary download only from a validated v4 `published` entry whose framework range matches the reviewed framework version. Historical v3 packages keep separate version labels and links; they never become a fallback download for Rivetin 0.2. Directory counts stay separate, and shared plugin IDs count once. Availability and examples are generated from the validated public catalogs when building.

Context Menu 0.5.9 completed controlled first-open, route-revisit, object-specific initial-value and cancel checks, with the documented keyboard boundary at 1280 by 720. No resource change was saved. The 0.5.7 route-revisit failure, 0.5.8 review rejection and earlier 0.5.6 failure remain recorded. Local proposal previews use isolated directories and do not change the canonical public catalogs.


IPMI 0.1.4 completed controlled acceptance with framework 0.2.0 on one exact CloudTower 4.9.0 development/test profile. The scope covers draft save/discard and settings restoration, one host with IPMI plus two without, lifecycle and preserved HTTPS/rel/copy controls. It excludes switching between two populated IPMI hosts, clipboard execution, different administrators, real BMC access, automatic login and KVM. This does not validate the current working tree or new framework/plugin combinations. Website deployment and live download availability require their own publication/readback checks.


An earlier fixed framework 0.2.2 build was reported deployed and enabled by the project coordinator on October 29, 2026 in one controlled development/test environment. Framework/CLI source 0.2.2 was synchronized at [f31821babc20](https://github.com/sephirothchang/rivetin/commit/f31821babc20cb20d8e1cbc3508a820a93666e5e), verified against the remote main on October 29. No tag or public installer is implied; plugin source publication, market admission and each plugin's real test scope remain separate. Missing real samples are recorded as pending real-environment testing, without treating that absence as a failed test or an automatic release ban. Existing immutable package downloads retain their original bytes. New catalog entries are admitted only through the exact approved issuance transaction.


## Catalog publication identity

V4 publication identity is a separate sidecar and immutable snapshot, with a minimal source-controlled `catalog-release-ledger.json`; the strict v3/v4 catalog schemas and existing package bytes are unchanged. `ML-V4-YYMMDD.rev` uses the actual publisher transaction date in Asia/Shanghai and a decimal daily revision. The initial empty ledger assigns no official ID. Stage/check do not reserve IDs. Local issuance, HTTPS/Pages confirmation, plugin acceptance and framework runtime display remain separate. See [publisher operations and recovery](scripts/catalog-v4-operations.md) for exact request/output contracts and commands.

When the referenced historical validation document changes, review its diff and scope before adding `--reviewed-history-sha256 <EXACT_SHA256>` to `sync:project`; the tool preserves the historical candidate/version/date and does not inherit newer acceptance into the current working tree. The reviewed hash transition is kept in ignored content-sync evidence.

SSH 0.1.2 and Disk SMART 0.1.6 completed limited read-only checks while their collection channels stayed off. Those historical checks did not cover connections, host commands, approval or migration; real SMART samples, collection, persistent history and cross-day execution remain pending; the SMART metric panel body was not accepted. IPMI 0.1.4 also completed a separate read-only 0.2.2 combination check with its package bytes unchanged, without real BMC/KVM/clipboard actions.

The v4 issuance is **ML-V4-261029.0**, bound to the exact [immutable catalog snapshot](https://rivetin.dev/catalog/v4/releases/ML-V4-261029.0/plugins.json) and [release metadata](https://rivetin.dev/catalog/v4/releases/ML-V4-261029.0/release.json). Website commit `5e301b6b2e8d89d6c5a283b2642ed1fe017faad1` completed Pages deployment. Canonical HTTPS readback verified the four catalog/metadata objects and three changed packages on October 29, 2026 in Asia/Shanghai (`2026-10-28T20:37:23.723Z`); the unchanged IPMI package was checked separately. The source ledger is now `verified`. The confirmation view was subsequently published in website commit `3f8cb6174c1694e284fce9fac9aff9cc319c2561`; this update retains the same publication identity and original asset bytes. Catalog verification does not expand any plugin's documented test scope or establish framework runtime consumption of the ML identifier.


## Framework 0.2.4 and controlled identity evidence

Framework/CLI source 0.2.4 was synchronized at [c86aec1487d1](https://github.com/sephirothchang/rivetin/commit/c86aec1487d15356f54a3d64291d9afdf6f741c2), verified against remote main on October 29, 2026. The source snapshot is separate from public installers, tags and market packages. Earlier 0.2.2 source/deployment and 0.2.3 interface records remain historical. The 0.2.0 acceptance version, date and scope are retained; the validation-document fingerprint now includes separately reviewed 0.2.3/0.2.4 appendices.

The coordinator confirmed a fixed 0.2.4 build deployed and enabled, with the four existing plugin packages still enabled and byte-identical. Controlled Chinese interface checks at 1280 by 720 showed four compatible installed market entries with minimum versions and no upper-bound display, the verified market service check, the Rivetin Website link and saved-connection Verify outside the disabled legacy editor. That interface pass did not execute authentication or the built-in identity command. The observed runtime was 0.2.4; above-former-maximum compatibility was only locally simulated. SSH/resource API monitoring, real SMART health samples and cross-day collection remain unverified.

A separate controlled single-host built-in identity check passed with Rivetin 0.2.4 and SSH Channel 0.1.2. One saved host completed one review, one explicit Tower ROOT one-use approval and one execution of the fixed `/usr/bin/uname -srm` command in the same browser document. The result contained structured Linux kernel and architecture information; querying the original result matched its persisted receipt. This validates only that built-in check, not SMART consumer execution, general command registration or every host. Migration, valid SMART health samples, cross-day collection and real revocation or I/O fault handling remain unverified. Saved legacy connections can be verified without an identity-only migration; editing and saving still follow explicit Connections v2 rules. The five non-Windows CLI targets retain their native-execution evidence gap.

## Minimum framework version

From framework 0.2.4, framework-version eligibility uses the inclusive minimum only. Valid legacy maximum metadata is preserved raw for immutable package/catalog identity but has no runtime upper-gate meaning. New schema 2 declarations without that field require minimum 0.2.4 or later; validation rejects lower declarations and never silently clamps them. API 1, exact Tower and SMTX conditions remain independent. Legacy v3 declarations retain their existing optional-minimum format.

Production continues to serve 0.2.2/0.2.3 readers. The existing ML publication, ledger and four packages keep their exact bytes and old syntax carrier. A mixed no-maximum V4 catalog can make an old parser reject the whole catalog; moving production requires an explicit reader-floor decision. This update introduces no V5, second feed or new ML publication.

Policy Converter navigation/full-page integration and real Network Topology installation are local work in progress, not deployed or accepted features. They remain separate from this framework/SSH/minimum-version update.
