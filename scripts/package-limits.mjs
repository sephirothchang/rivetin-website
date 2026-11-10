// Package size limits shared by the website's catalog validators and readback.
// The standard-ZIP limits mirror the framework install contract
// (`framework/shared/package-limits.js`); keep the two sets in sync.
export const MAX_LEGACY_PACKAGE_BYTES = 16 * 1024 * 1024;
export const MAX_STANDARD_PACKAGE_BYTES = 32 * 1024 * 1024;
export const MAX_STANDARD_ENTRY_BYTES = 16 * 1024 * 1024;
export const MAX_STANDARD_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_STANDARD_ENTRIES = 512;
export const MAX_STANDARD_METADATA_BYTES = 64 * 1024;
