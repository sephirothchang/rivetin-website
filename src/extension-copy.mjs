// Reviewed English copy is kept separate from source metadata. A version change
// requires an editorial review before it can silently inherit these claims.
export const extensionCopy = [
  {
    key: 'ipmi', enhancement: 'Host access', id: 'rivetin-ipmi-redirection', reviewedVersion: '0.1.4', name: 'IPMI Redirection',
    category: 'management', icon: 'link', status: 'Candidate · unverified',
    description: 'Open host BMC pages with shared vendor and protocol rules.',
    capabilities: ['Enhance the host overview IPMI address while preserving its copy control.', 'Set vendor and protocol defaults, with host and cluster exceptions.', 'Save functional settings centrally and keep personal display preferences separate.'],
    detail: 'Fixed IPMI 0.1.4 was verified with Rivetin 0.2.0 in one exact CloudTower 4.9.0 development/test profile. Checks covered draft save/discard and settings restoration, one host with IPMI plus two without, lifecycle, and preservation of HTTPS links, rel attributes and copy controls. This does not cover switching between two hosts with IPMI values, clipboard execution, different administrators, real BMC access, automatic login or KVM. The historical v3 package remains 0.1.2 for the 0.1 framework line.',
  },
  {
    key: 'context', enhancement: 'Resource actions', id: 'rivetin-context-menu', reviewedVersion: '0.5.6', name: 'Context Menu',
    category: 'management', icon: 'menu', status: 'Candidate · unverified',
    description: 'Group resource actions around the selected object.',
    capabilities: ['Open native VM, disk and NIC editors from contextual shortcuts.', 'Open the native migration wizard for the selected resource.', 'Let CloudTower handle configuration, permissions and confirmation.'],
    detail: 'Source 0.5.6 is a CloudTower 4.9.0 candidate for the 0.2 framework line. It extends stale-control rejection to resource rows and checks disabled controls. Source 0.5.5 did not pass independent review and was not frozen as a release package. A local fixed package and independent review are complete; real framework/plugin combination acceptance remains pending. The historical catalog entry is still a 0.4.2 draft with no public package.',
  },
  {
    key: 'ssh', enhancement: 'Data collection', id: 'rivetin-ssh-channel', reviewedVersion: '0.1.2', name: 'SSH Channel',
    category: 'infrastructure', icon: 'terminal', status: 'Collection unverified',
    description: 'Review and authorize shared, controlled collection tasks.',
    capabilities: ['Edit explicit host, cluster and global connection drafts, with host inventory selection.', 'Review each consumer’s structured operations, targets and schedule before approval.', 'Revoke approvals when the command, version, target, schedule or channel configuration changes.'],
    detail: 'Source 0.1.2 is a compatibility candidate for the 0.2 framework line; the historical public package remains 0.1.1. Earlier host-key, authentication and identity-command checks do not validate this candidate. Device-policy v2 backend and migration remain incomplete in the reviewed 0.2 validation record. Real SMART collection and unattended daily execution remain unverified; collection stays disabled until explicitly reviewed and approved.',
  },
  {
    key: 'smart', enhancement: 'Disk health', id: 'rivetin-disk-smart-info', reviewedVersion: '0.1.5', name: 'Disk SMART',
    category: 'infrastructure', icon: 'disk', status: 'Candidate · unverified',
    description: 'Compare physical-disk SMART metrics and snapshot changes.',
    capabilities: ['Present selected ATA, NVMe and SCSI metrics with risk explanations.', 'Compare an identity-checked snapshot with an earlier valid sample.', 'Keep unsupported, unavailable and stale samples distinct from healthy data.'],
    detail: 'Source 0.1.5 is a local candidate for Rivetin 0.2.x, adding recovery guidance for binding, permission, session and disabled-plugin errors. The historical public package remains 0.1.3 for the 0.1 framework line. Local checks do not validate the new framework/plugin combination. Real SMART health samples, persistent history and cross-day execution remain unverified. Unavailable data must not be presented as healthy.',
  },
  {
    key: 'topology', enhancement: 'Networking', id: 'rivetin-network-topology', reviewedVersion: '0.1.0', name: 'Network Topology',
    category: 'infrastructure', icon: 'network', status: 'Local demo',
    description: 'Explore topology and edit network drafts in a local canvas.',
    capabilities: ['Explore VM, distributed-switch, host and physical-switch relationships.', 'Create VDS and virtual-network drafts and review host uplink changes.', 'Exercise protected-network checks and a simulated confirm-or-rollback flow.'],
    detail: 'This is a standalone local demonstration with synthetic data. Draft creation, uplink edits and timed rollback are simulations, not live network changes. No CloudTower build has been accepted for this extension; its tested-build list is empty and real installation must remain gated.',
  },
  {
    key: 'converter', enhancement: 'Security policy', id: 'rivetin-security-policy-converter', reviewedVersion: '0.1.1', name: 'Policy Converter',
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
