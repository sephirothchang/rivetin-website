// Reviewed English copy is kept separate from source metadata. A version change
// requires an editorial review before it can silently inherit these claims.
export const extensionCopy = [
  {
    key: 'ipmi', enhancement: 'Host access', id: 'rivetin-ipmi-redirection', reviewedVersion: '0.1.4', name: 'IPMI Redirection',
    category: 'management', icon: 'link', status: 'Limited live validation',
    description: 'Open host BMC pages with shared vendor and protocol rules.',
    capabilities: ['Enhance the host overview IPMI address while preserving its copy control.', 'Set vendor and protocol defaults, with host and cluster exceptions.', 'Save functional settings centrally and keep personal display preferences separate.'],
    detail: "Version 0.1.4 completed limited read-only checks with Rivetin 0.2.2, with its fixed package bytes unchanged. These checks are separate from the historical 0.2.0 draft save/discard, lifecycle and settings-restoration tests. Real BMC access, automatic login, KVM, clipboard execution, different administrators and switching between two populated BMC hosts remain unverified. The historical v3 package remains 0.1.2 for the 0.1 framework line.",
  },
  {
    key: 'context', enhancement: 'Resource actions', id: 'rivetin-context-menu', reviewedVersion: '0.5.9', name: 'Context Menu',
    category: 'management', icon: 'menu', status: 'Limited live validation',
    description: 'Group resource actions around the selected object.',
    capabilities: ['Open native VM, disk and NIC editors from contextual shortcuts.', 'Open the native migration wizard for the selected resource.', 'Let CloudTower handle configuration, permissions and confirmation.'],
    detail: "Version 0.5.9 completed controlled checks of first opening, route revisits, object-specific CPU, memory, disk and NIC initial values, cancellation, and the documented Shift-key boundary at 1280 by 720. No resource change was saved. Version 0.5.7 had an actual route-revisit CPU-editor failure; 0.5.8 was rejected during review, and the earlier 0.5.6 first-right-click failure remains recorded. Those results do not transfer to other builds, viewports or resource-changing actions.",
  },
  {
    key: 'ssh', enhancement: 'Data collection', id: 'rivetin-ssh-channel', reviewedVersion: '0.1.2', name: 'SSH Channel',
    category: 'infrastructure', icon: 'terminal', status: 'Collection unverified',
    description: 'Review and authorize shared, controlled collection tasks.',
    capabilities: ['Edit explicit host, cluster and global connection drafts, with host inventory selection.', 'Review each consumer’s structured operations, targets and schedule before approval.', 'Revoke approvals when the command, version, target, schedule or channel configuration changes.'],
    detail: "Version 0.1.2 completed limited read-only interface checks with Rivetin 0.2.2 while the channel remained off. These checks did not execute SSH connections, host commands, collection, approval, migration or cross-day schedules. Those operations remain pending real-environment testing. The historical v3 package remains 0.1.1 for the 0.1 framework line; current download availability follows the published v4 catalog.",
  },
  {
    key: 'smart', enhancement: 'Disk health', id: 'rivetin-disk-smart-info', reviewedVersion: '0.1.6', name: 'Disk SMART',
    category: 'infrastructure', icon: 'disk', status: 'Real samples pending',
    description: 'Compare physical-disk SMART metrics and snapshot changes.',
    capabilities: ['Present selected ATA, NVMe and SCSI metrics with risk explanations.', 'Compare an identity-checked snapshot with an earlier valid sample.', 'Keep unsupported, unavailable and stale samples distinct from healthy data.'],
    detail: "Version 0.1.6 completed limited read-only interface checks with Rivetin 0.2.2 while collection remained off. The metric panel body, real SMART health samples, collection, persistent history and cross-day execution remain pending. Local tests use controlled inventory and sample substitutes. Missing real conditions do not prevent a release or establish a passed test; unavailable data must not be presented as healthy. The historical v3 package remains 0.1.3 for the 0.1 framework line.",
  },
  {
    key: 'topology', enhancement: 'Networking', id: 'rivetin-network-topology', reviewedVersion: '0.1.0', name: 'Network Topology',
    category: 'infrastructure', icon: 'network', status: 'Local demo',
    description: 'Explore topology and edit network drafts in a local canvas.',
    capabilities: ['Explore VM, distributed-switch, host and physical-switch relationships.', 'Create VDS and virtual-network drafts and review host uplink changes.', 'Exercise protected-network checks and a simulated confirm-or-rollback flow.'],
    detail: 'This is a standalone local demonstration with synthetic data. Local validation covers keyboard movement of a VDS together with its child networks and updated connections. Draft creation, uplink edits and timed rollback remain simulations, not live network changes. Source publication does not establish a standard plugin release or CloudTower acceptance; real installation remains gated.',
  },
  {
    key: 'converter', enhancement: 'Security policy', id: 'rivetin-security-policy-converter', reviewedVersion: '0.1.1', name: 'Policy Converter',
    category: 'utilities', icon: 'policy', status: 'Offline preview',
    description: 'Turn inventory JSON and traffic CSV into policy review drafts.',
    capabilities: ['Import normalized VM inventory and traffic CSV with explicit column mapping.', 'Resolve exact IPv4 identities and review label-pair MONITOR candidates.', 'Export a manually confirmed rivetin-policy-review-v1 review draft.'],
    detail: 'The exported JSON is a project-specific review draft, not an Everoute API request or directly importable policy. Inputs stay in memory; only the saved label key uses shared configuration. The extension does not make AI calls, write labels, deploy policies or enable WORK mode. Source updates remain an offline preview, with no published standard plugin package or live CloudTower/Everoute acceptance.',
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
