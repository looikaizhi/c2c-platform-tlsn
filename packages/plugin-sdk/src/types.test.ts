import { describe, it, expectTypeOf } from 'vitest';
import type {
  TravelRuleFieldLabel,
  ProofExportV1,
  PluginConfig,
  ProveOptions,
} from './types';

describe('TravelRuleFieldLabel', () => {
  it('accepts standard originator labels', () => {
    const label: TravelRuleFieldLabel = 'originator.accountId';
    expectTypeOf(label).toMatchTypeOf<string>();
  });

  it('accepts standard beneficiary labels', () => {
    const label: TravelRuleFieldLabel = 'beneficiary.name';
    expectTypeOf(label).toMatchTypeOf<string>();
  });

  it('accepts standard transaction labels', () => {
    const labels: TravelRuleFieldLabel[] = [
      'transaction.id',
      'transaction.status',
    ];
    expectTypeOf(labels).toMatchTypeOf<string[]>();
  });

  it('accepts arbitrary string labels (extensible)', () => {
    const label: TravelRuleFieldLabel = 'custom.myField';
    expectTypeOf(label).toMatchTypeOf<string>();
  });
});

describe('ProofExportV1', () => {
  it('has the correct shape', () => {
    const proof: ProofExportV1 = {
      formatVersion: 'ProofExportV1',
      attestationId: 'session-123',
      txHash: '0xabc',
      policyVersion: 'v1.0.0',
      timestamp: '2026-04-20T00:00:00Z',
      serverName: 'wise.com',
      verifierVersion: '0.1.0',
      travelRuleFields: {
        'originator.amount': { value: '100.00', commitmentIndex: 0 },
      },
      accountChecks: [],
      orderBindingHash: null,
      commitmentsHash: '0xdeadbeef',
      verifierSignature: '0xsig',
      verifierAddress: '0xaddr',
      chainId: 11155111,
      redactedTranscript: { sent: '', recv: '' },
      transcriptCommitments: [],
    };
    expectTypeOf(proof.formatVersion).toEqualTypeOf<'ProofExportV1'>();
    expectTypeOf(proof.txHash).toEqualTypeOf<string | null>();
    expectTypeOf(proof.orderBindingHash).toEqualTypeOf<string | null>();
  });

  it('allows null txHash and orderBindingHash', () => {
    const proof: ProofExportV1 = {
      formatVersion: 'ProofExportV1',
      attestationId: 'session-456',
      txHash: null,
      policyVersion: 'v1.0.0',
      timestamp: '2026-04-20T00:00:00Z',
      serverName: 'api.example.com',
      verifierVersion: '0.1.0',
      travelRuleFields: {},
      accountChecks: [],
      orderBindingHash: null,
      commitmentsHash: '0xcafebabe',
      verifierSignature: '0xsig',
      verifierAddress: '0xaddr',
      chainId: 1,
      redactedTranscript: { sent: '', recv: '' },
      transcriptCommitments: [],
    };
    expect(proof.txHash).toBeNull();
    expect(proof.orderBindingHash).toBeNull();
  });
});

describe('PluginConfig.policyVersion', () => {
  it('is optional', () => {
    const config: PluginConfig = {
      name: 'Test Plugin',
      description: 'A test plugin',
    };
    expectTypeOf(config.policyVersion).toEqualTypeOf<string | undefined>();
  });

  it('accepts a semver string', () => {
    const config: PluginConfig = {
      name: 'Versioned Plugin',
      description: 'Has version',
      policyVersion: 'v1.2.3',
    };
    expect(config.policyVersion).toBe('v1.2.3');
  });
});

describe('ProveOptions.policyVersion', () => {
  it('is optional', () => {
    expectTypeOf<ProveOptions['policyVersion']>().toEqualTypeOf<string | undefined>();
  });
});
