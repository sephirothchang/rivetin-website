// Reviewed English copy is kept separate from source metadata. A version change
// requires an editorial review before it can silently inherit these claims.
export const extensionCopy = [
  {
    key: 'ipmi', enhancement: 'Host access', id: 'rivetin-ipmi-redirection', reviewedVersion: '0.1.2', name: 'IPMI Redirection',
    category: 'management', icon: 'link', status: 'Dev/test enabled',
    description: 'Open host BMC pages with shared vendor and protocol rules.',
    capabilities: ['Enhance the host overview IPMI address while preserving its copy control.', 'Set vendor and protocol defaults, with host and cluster exceptions.', 'Save functional settings centrally and keep personal display preferences separate.'],
    detail: 'Version 0.1.2 is enabled in the accepted Rivetin deployment on the CloudTower 4.9.0 development/test environment. This is not a production or all-version guarantee. The package provides address redirection; automatic BMC web login is unavailable. Hardware catalog entries and simulated Redfish sessions do not establish real firmware compatibility.',
  },
  {
    key: 'context', enhancement: 'Resource actions', id: 'rivetin-context-menu', reviewedVersion: '0.2.6', name: 'Context Menu',
    category: 'management', icon: 'menu', status: 'Limited UI verified',
    description: 'Group resource actions around the selected object.',
    capabilities: ['Organize VM power, console, hardware, snapshot, migration and management actions into grouped menus.', 'Bind actions to the object, state, permission result and actual subresource.', 'Open a reviewed form or confirmation flow before an operation can be submitted.'],
    detail: 'Version 0.2.6 is deployed and enabled in the controlled CloudTower 4.9.0 environment. Read-only browser acceptance covered grouped menus, local form input and Cancel, and internal expand/collapse controls. No resource-changing action was submitted. The catalog contains 67 VM actions, but this does not mean all actions or resource types are implemented. Server integration currently covers basic VM edits and seven power actions; actual mutations and native-dialog integration remain unverified.',
  },
  {
    key: 'ssh', enhancement: 'Data collection', id: 'rivetin-ssh-channel', reviewedVersion: '0.1.1', name: 'SSH Channel',
    category: 'infrastructure', icon: 'terminal', status: 'Collection unverified',
    description: 'Review and authorize shared, controlled collection tasks.',
    capabilities: ['Edit explicit host, cluster and global connection drafts, with host inventory selection.', 'Review each consumer’s structured operations, targets and schedule before approval.', 'Revoke approvals when the command, version, target, schedule or channel configuration changes.'],
    detail: 'Version 0.1.1 is deployed and enabled in the controlled CloudTower 4.9.0 environment. Read-only acceptance covered connection editing, inventory and leaving unsaved drafts. Collection settings, credentials, approvals and schedules remain unconfigured; no real host was connected. Fresh installation defaults remain off. Connection secrets are stored by the encrypted backend and are never returned in saved-secret responses. The bounded recent-result buffer is separate from persistent per-disk history.',
  },
  {
    key: 'smart', enhancement: 'Disk health', id: 'rivetin-disk-smart-info', reviewedVersion: '0.1.1', name: 'Disk SMART',
    category: 'infrastructure', icon: 'disk', status: 'Live UI · no samples',
    description: 'Compare physical-disk SMART metrics and snapshot changes.',
    capabilities: ['Present selected ATA, NVMe and SCSI metrics with risk explanations.', 'Compare an identity-checked snapshot with an earlier valid sample.', 'Keep unsupported, unavailable and stale samples distinct from healthy data.'],
    detail: 'Version 0.1.1 is deployed and enabled in the controlled CloudTower 4.9.0 environment. Read-only browser acceptance covered mounting and switching physical-disk pages in host and cluster views, plus unbound-device diagnostics. The shared provider, HTTP consumer and persistent-history path have local integration coverage. No real host SMART sample, actual history or cross-day collection has been verified. Inventory health alone is not complete SMART data, and unavailable data must not be presented as healthy.',
  },
  {
    key: 'topology', enhancement: 'Networking', id: 'rivetin-network-topology', reviewedVersion: '0.1.0', name: 'Network Topology',
    category: 'infrastructure', icon: 'network', status: 'Local demo',
    description: 'Explore topology and edit network drafts in a local canvas.',
    capabilities: ['Explore VM, distributed-switch, host and physical-switch relationships.', 'Create VDS and virtual-network drafts and review host uplink changes.', 'Exercise protected-network checks and a simulated confirm-or-rollback flow.'],
    detail: 'This is a standalone local demonstration with synthetic data. Draft creation, uplink edits and timed rollback are simulations, not live network changes. No CloudTower build has been accepted for this extension; its tested-build list is empty and real installation must remain gated.',
  },
  {
    key: 'converter', enhancement: 'Security policy', id: 'rivetin-security-policy-converter', reviewedVersion: '0.1.0', name: 'Policy Converter',
    category: 'utilities', icon: 'policy', status: 'Offline preview',
    description: 'Turn inventory JSON and traffic CSV into policy review drafts.',
    capabilities: ['Import normalized VM inventory and traffic CSV with explicit column mapping.', 'Resolve exact IPv4 identities and review label-pair MONITOR candidates.', 'Export a manually confirmed rivetin-policy-review-v1 review draft.'],
    detail: 'The exported JSON is a project-specific review draft, not an Everoute API request or directly importable policy. Inputs stay in memory; only the saved label key uses shared configuration. The extension does not make AI calls, write labels, deploy policies or enable WORK mode. No live CloudTower or Everoute build has been validated.',
  },
];

export function attachProjectState(project) {
  return extensionCopy.map(copy => {
    const metadata = project.extensions.find(extension => extension.id === copy.id);
    if (!metadata || metadata.version !== copy.reviewedVersion) {
      throw new Error(`Review website copy for ${copy.id}: expected ${copy.reviewedVersion}, found ${metadata?.version ?? 'missing'}.`);
    }
    return { ...copy, ...metadata };
  });
}
