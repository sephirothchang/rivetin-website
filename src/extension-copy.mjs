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
    detail: "Version 0.1.2 completed limited read-only interface checks with Rivetin 0.2.2 while the channel remained off. These checks did not execute SSH connections, host commands, collection, approval, migration or cross-day schedules. The historical v3 package remains 0.1.1 for the 0.1 framework line; current download availability follows the published v4 catalog. With Rivetin 0.2.4, one controlled saved host completed one built-in host.identity review, explicit one-use approval and fixed-command execution, with the original result query matching its persisted receipt. That result does not validate SMART consumer execution, general command registration or all hosts. Migration, valid SMART health samples, cross-day collection and real revocation or I/O fault handling remain unverified.",
  },
  {
    key: 'smart', enhancement: 'Disk health', id: 'rivetin-disk-smart-info', reviewedVersion: '0.1.6', name: 'Disk SMART',
    category: 'infrastructure', icon: 'disk', status: 'Real samples pending',
    description: 'Compare physical-disk SMART metrics and snapshot changes.',
    capabilities: ['Present selected ATA, NVMe and SCSI metrics with risk explanations.', 'Compare an identity-checked snapshot with an earlier valid sample.', 'Keep unsupported, unavailable and stale samples distinct from healthy data.'],
    detail: "Version 0.1.6 completed limited read-only interface checks with Rivetin 0.2.2 while collection remained off. The metric panel body, real SMART health samples, collection, persistent history and cross-day execution remain pending. Local tests use controlled inventory and sample substitutes. Missing real conditions do not prevent a release or establish a passed test; unavailable data must not be presented as healthy. The historical v3 package remains 0.1.3 for the 0.1 framework line.",
  },
  {
    key: 'topology', enhancement: 'Networking', id: 'rivetin-network-topology', reviewedVersion: '0.1.3', name: 'Network Topology',
    category: 'infrastructure', icon: 'network', status: 'Limited live UI accepted',
    description: 'Explore topology and edit network drafts in a local canvas.',
    capabilities: ['Read cluster-scoped relationships through the framework provider.', 'Review layout and local network-relationship drafts without applying changes.', 'Preserve the current draft and layout across language changes.'],
    detail: "Version 0.1.3 requires Rivetin 0.2.6 and declares its own topology-toolbar entry and hosted page through UI contributions v1. The fixed package was installed and enabled with bounded Chinese interface acceptance in one CloudTower 4.9.0 environment. Checks covered the native cluster entry, current-cluster read-only resources and relationships across fourteen cards, parent and child layout moves, a clean return to the native canvas and layout reset on reentry. Resource-purpose mapping remains under investigation and is not a confirmed defect. No association intent was created, so real-environment association drafts and dirty cancel/discard guards remain pending. Local language-preservation evidence stays separate; live language switching remains untested. The check recorded 45 shared-module warnings and two initialization HTTP 504 errors from the native bundle; their endpoint, cause and relationship to this plugin remain unconfirmed. No shared configuration or real network change was submitted. Package availability follows the catalog. Live network apply and an independent persistent rollback worker are not implemented; a demonstration timer is not real rollback protection.",
  },
  {
    key: 'converter', enhancement: 'Security policy', id: 'rivetin-security-policy-converter', reviewedVersion: '0.1.4', name: 'Policy Converter',
    category: 'utilities', icon: 'policy', status: 'Limited live UI accepted',
    description: 'Turn inventory JSON and traffic CSV into policy review drafts.',
    capabilities: ['Import normalized VM inventory and traffic CSV with explicit column mapping.', 'Resolve exact IPv4 identities and review label-pair MONITOR candidates.', 'Export a manually confirmed rivetin-policy-review-v1 review draft.'],
    detail: "Version 0.1.4 requires Rivetin 0.2.6 and declares its own Everoute navigation entry and right-main-area page through UI contributions v1. The fixed package was installed and enabled in one controlled CloudTower 4.9.0 environment. Its bounded Chinese interface check covered the native entry, workpage, cancel/discard guards, empty reentry, a three-policy/four-rule sample without blocking diagnostics, and an actual 2579-byte review JSON download matching the UI. The export has canDeploy=false and MONITOR policies; it is not an Everoute API request or directly importable policy. The check recorded 44 shared-module warnings and one initialization HTTP 504 from the host page, with an unconfirmed endpoint and cause. Live switching to another language was not performed. No shared settings were saved. Inputs stay in memory; only the saved label key uses shared configuration. Package availability follows the catalog. The extension does not make AI calls, write labels, deploy policies or enable WORK mode.",
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
