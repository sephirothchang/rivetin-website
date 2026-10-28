# V4 catalog transaction recovery

Import and recovery acquire the same exclusive `.local/catalog-v4-owner.lock` before accessing the transaction. An existing owner marker blocks both operations, including when its owner cannot be identified; it is never automatically overridden. The catalog lock also blocks cooperative v3 imports and production builds.

After an interrupted process, preserve both lock files, the transaction journal, and the catalog state. An operator must independently establish that the specific writer or recovery process has exited, and that no other operator is working on this site, before manually removing the owner marker. A PID in the marker alone does not prove ownership or termination. Then run the recovery command with the transaction ID from the catalog lock. Recovery checks journal and catalog bytes and either reports the verified committed state, rolls back, or retains the catalog lock on conflict. If recovery itself is terminated, repeat the same independent verification before handling its owner marker.

If the catalog lock has a null manifest hash, or the journal is missing or invalid, recovery cannot establish the outcome and retains the lock. Treat this as an unknown outcome requiring manual investigation; do not remove the catalog lock or retry an import merely to bypass the error. Abrupt power loss and non-cooperating filesystem writers are not covered by these guarantees. The legacy v3 importer does not provide the v4 persistent journal.

## ML publication identity

The strict v3/v4 catalog bodies and legacy packages keep their formats and bytes. Optional v4 identity uses `/catalog/v4/release.json` plus immutable `/catalog/v4/releases/<ID>/plugins.json` and `release.json`. The two index bodies must be byte-identical, as must the two metadata bodies. `catalog-release-ledger.json` is source-controlled public state, separate from the package-integrity ledger. It contains public IDs, catalog schema/hash/length, derived snapshot path, issuance time, metadata hash/length, status and optional verification time. It contains no request UUID, local path, actor or private journal data.

`ML-V4-YYMMDD.rev` uses the actual publisher issuance transaction date in Asia/Shanghai; revision is decimal starting at zero. Schema 4 does not change when plugins are added. No ID is allocated by stage/check or request preparation. Initial registration of an existing catalog uses the new issuance time, without inventing its historical first-release date. Cross-midnight recovery keeps its reserved ID. An abandoned reservation is never reused. Unchanged current raw bytes reuse the current ID; an older committed hash requires an explicit rollback decision rather than a new automatic issuance.

Only one coordinator-controlled publication window may write. Owner/shared locks and exact before/after byte comparisons cover cooperative writers in this checkout; they are not a distributed lock across checkouts. Before actual publication, reconcile the intended Git baseline, online sidecar and source ledger. Unknown online outcomes require readback before any new publication. Same ID with different bytes is rejected.

### Frozen request and local issuance

The original `stage.json` schema 1 is unchanged. A separate private `release-stage.json` has exactly `schemaVersion`, `requestId`, `stageSHA256`, `catalogPath`, `indexSHA256`, `indexBytes`, `baseReleaseSHA256`, `candidateOnly`. The UUID request is an idempotency key, not an ML ID. It is stored only in the ignored drop/journal. Existing requests are never overwritten; reusing a request with different input is rejected.

```powershell
node scripts/prepare-catalog-release.mjs --drop <ABSOLUTE_DROP> --stage-sha256 <STAGE_SHA256> --base-sha256 <BASE_INDEX_SHA256> --base-release-sha256 none
node scripts/import-catalog-v4.mjs --drop <ABSOLUTE_DROP> --stage-sha256 <STAGE_SHA256> --base-sha256 <BASE_INDEX_SHA256> --release-request-sha256 <REQUEST_SHA256> --check
```

Use the exact current metadata SHA256 in place of `none` after the first registration. `stageV4` accepts the same optional request hash. Its output must be a new immediate child of the website `.local/` directory; nested preview paths are rejected before writing. An isolated preview of changed content omits the stale current sidecar, retains old immutable snapshots and reports publication pending with no allocated ID.

Only after the coordinator authorizes the exact inputs, omit `--check` for local issuance. The publisher takes the existing owner/shared locks; freezes complete before/after ledger, index, package and metadata images; durably anchors the journal; reserves the ID; writes packages and immutable snapshots; replaces current index/metadata; records `local-committed`; then writes its commit event. A prepared transaction with no commit event is rolled back using exact bytes. Only that transaction's uncommitted files are removed; committed older snapshots/packages remain immutable. Its allocated ID becomes `abandoned`. Committed transactions are reconciled without another allocation. A manually lost lock with an unfinished request is restored as unknown, not silently retried.

The private journal produces `publication-output.json` with exactly `schemaVersion`, `requestId`, `stageSHA256`, `releaseRequestSHA256`, `publicationId`, `publicationState`, `files`, `ledger`, `packages`. State is `local-committed`, not online success. `files` is exactly four `{path,sha256,bytes}` records in order: current index, current metadata, immutable index, immutable metadata. `ledger` describes the local source-ledger image; it is not an HTTP object. Packages keep the original staged `{path,sha256,bytes}` records. Freeze this output manifest's raw SHA256 before Git/Pages approval. It is private, contains a request UUID, and must not be copied into the public asset tree.

### Readback and confirmation

```powershell
node scripts/catalog-release-readback.mjs --drop <ABSOLUTE_DROP> --stage-sha256 <STAGE_SHA256> --base-sha256 <BASE_INDEX_SHA256> --release-request-sha256 <REQUEST_SHA256> --publication-output <ABSOLUTE_FROZEN_OUTPUT_MANIFEST> --publication-output-sha256 <OUTPUT_MANIFEST_SHA256> --output <NEW_ABSOLUTE_IGNORED_PROOF_DIRECTORY>
node scripts/catalog-release-confirm.mjs --drop <ABSOLUTE_DROP> --stage-sha256 <STAGE_SHA256> --base-sha256 <BASE_INDEX_SHA256> --release-request-sha256 <REQUEST_SHA256> --publication-output <ABSOLUTE_FROZEN_OUTPUT_MANIFEST> --publication-output-sha256 <OUTPUT_MANIFEST_SHA256> --proof <ABSOLUTE_PROOF_DIRECTORY>
```

Readback fetches the four fixed HTTPS objects and staged packages, verifies every raw entity against the approved output manifest, then saves proof in a new exclusive ignored directory. Receipts have exactly `schemaVersion`, `site`, `path`, `status`, `sha256`, `bytes`, `verifiedAt`; site is the canonical HTTPS origin, status is 200. Redirects, wrong content type, size/hash mismatch and mixed metadata/index fail. Verification timestamps must follow stage/issuance and meet the existing one-day age/five-minute clock-skew bounds. Metadata is never reserialized to manufacture an expected digest.

Current proof names are `catalog.plugins.json` / `catalog.receipt.json`, `catalog.release.json` / `catalog.release.receipt.json`, `catalog.snapshot.plugins.json` / `catalog.snapshot.receipt.json`, and `catalog.snapshot.release.json` / `catalog.snapshot.release.receipt.json`. Package proof names retain the prior `<id>-<version>` convention. The separate confirmation command changes only the matching source-ledger record to `verified` after all proof validates. It uses the same locks and its own before/after journal. `recover --transaction <ID>` also handles interrupted confirmations: restore only the ledger status if no confirmation event exists, otherwise verify the recorded result. Confirmation does not allocate a revision or change index/metadata/package bytes.

Git success, a started deployment, local commit, source ledger verification and runtime consumption are separate facts. The current fixed framework 0.2.2 has no sidecar consumer/display change in this task; root stage/verify integration and future runtime display have separate owners and evidence. Missing or invalid optional identity must never be used to grant package compatibility or claim plugin test acceptance.

The release ledger is bounded by both 5,000 records and 2 MiB of encoded JSON, whichever is reached first. All reservation, local commit, rollback and verification-confirmation replacements use the same 2 MiB read/write bound; the legacy index replacement default remains 512 KiB. Every planned ledger image is size-checked before journal preparation or reservation. A full ledger fails with `CATALOG_RELEASE_LEDGER_SIZE_LIMIT` without allocating an ID, changing the existing ledger or retaining publisher locks. Capacity maintenance needs a separately reviewed design; do not delete or recycle historical IDs to bypass this bound.
