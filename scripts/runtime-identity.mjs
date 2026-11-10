// Runtime identity used by the standard-ZIP metadata contract. The package
// metadata declares the runtime environment it was built for; the framework
// derives the same value from the Runtime image tag
// (`framework/shared/runtime-identity.js`). Keep both copies in sync when the
// Runtime image tag changes.
export const RUNTIME_IMAGE = 'rivetin.dev/rivetin-runtime:1.1.0';
export const RUNTIME_ENVIRONMENT = 'rivetin-runtime-' + RUNTIME_IMAGE.slice(RUNTIME_IMAGE.lastIndexOf(':') + 1);
export const RUNTIME_ARCHITECTURE = 'amd64';
