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

---

This repository contains the bilingual Rivetin website and its public plugin catalog. The [main project](https://github.com/sephirothchang/rivetin) contains the framework and extensions; repository access is currently required.

## Extensions

Three plugin packages are available in the [catalog](https://rivetin.dev/catalog/plugins.json):

| Extension | Version | What it adds |
| :--- | :--- | :--- |
| [IPMI Redirection](https://rivetin.dev/#extension-ipmi) | `0.1.2` | Host BMC access and vendor protocol settings |
| [SSH Channel](https://rivetin.dev/#extension-ssh) | `0.1.1` | Shared, controlled collection and approvals |
| [Disk SMART](https://rivetin.dev/#extension-smart) | `0.1.3` | Physical disk SMART information and history |

**In development**

| Extension | Version | Status |
| :--- | :--- | :--- |
| [Context Menu](https://rivetin.dev/#extension-context) | `0.4.2` | Catalog draft; CloudTower 4.9.0 candidate, live validation pending |
| [Network Topology](https://rivetin.dev/#extension-topology) | `0.1.0` | Local demo; no accepted CloudTower build |
| [Policy Converter](https://rivetin.dev/#extension-converter) | `0.1.0` | Offline preview; no accepted CloudTower build |

## Compatibility

Published packages declare **CloudTower 4.9.0** and **framework API 1**. Disk SMART requires Rivetin **0.1.2 or later**; SSH Channel requires its framework broker and host-specific validation. A declared version does not guarantee support for every build or production environment. Live host SMART collection remains unverified.

The [plugin catalog](https://rivetin.dev/catalog/plugins.json) is the source of truth for published versions, checksums and compatibility declarations. Framework installers are not publicly available. This overview reflects the reviewed website and catalog snapshot of October 28, 2026.
