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
    key: 'context', enhancement: 'Resource actions', id: 'rivetin-context-menu', reviewedVersion: '0.4.2', name: 'Context Menu',
    category: 'management', icon: 'menu', status: 'Draft',
    description: 'Group resource actions around the selected object.',
    capabilities: ['Open native VM, disk and NIC editors from contextual shortcuts.', 'Open the native migration wizard for the selected resource.', 'Let CloudTower handle configuration, permissions and confirmation.'],
    detail: 'Version 0.4.2 remains a catalog draft. Native VM, disk, NIC and migration shortcuts are candidates for controlled CloudTower 4.9.0 acceptance. Live deployment and English host validation remain pending. No public package is offered for this draft.',
  },
  {
    key: 'ssh', enhancement: 'Data collection', id: 'rivetin-ssh-channel', reviewedVersion: '0.1.1', name: 'SSH Channel',
    category: 'infrastructure', icon: 'terminal', status: 'Collection unverified',
    description: 'Review and authorize shared, controlled collection tasks.',
    capabilities: ['Edit explicit host, cluster and global connection drafts, with host inventory selection.', 'Review each consumer’s structured operations, targets and schedule before approval.', 'Revoke approvals when the command, version, target, schedule or channel configuration changes.'],
    detail: 'Controlled host-key verification, authentication and a manually approved identity command have been validated. This does not establish successful SMART collection or unattended daily execution. Fresh installations leave collection disabled. Connection secrets are saved by the encrypted backend and are never returned in saved-secret responses. The recent-result buffer is separate from persistent per-disk history.',
  },
  {
    key: 'smart', enhancement: 'Disk health', id: 'rivetin-disk-smart-info', reviewedVersion: '0.1.3', name: 'Disk SMART',
    category: 'infrastructure', icon: 'disk', status: 'Live UI · no samples',
    description: 'Compare physical-disk SMART metrics and snapshot changes.',
    capabilities: ['Present selected ATA, NVMe and SCSI metrics with risk explanations.', 'Compare an identity-checked snapshot with an earlier valid sample.', 'Keep unsupported, unavailable and stale samples distinct from healthy data.'],
    detail: 'Version 0.1.3 is available as a plugin package and requires Rivetin framework 0.1.2 or later. Its CloudTower 4.9.0 scope covers local tests and controlled API/DOM read checks. Live host SMART collection, actual history and cross-day collection remain unverified. Inventory health alone is not complete SMART data, and unavailable data must not be presented as healthy.',
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
