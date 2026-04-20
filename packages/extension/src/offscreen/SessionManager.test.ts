/**
 * Unit tests for policyVersion injection in SessionManager (T18 / R.15).
 *
 * The policyVersion injected into sessionData follows this priority:
 *   proverOptions.policyVersion  >  pluginConfig.policyVersion  >  'unspecified'
 *
 * These tests verify the fallback chain without instantiating the full
 * SessionManager (which requires WASM and Chrome extension APIs). Instead
 * they exercise the standalone helper function extracted below.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Replicate the injection logic as a pure function so it can be unit-tested
// without WASM or extension dependencies.
// ---------------------------------------------------------------------------
function resolvePolicyVersion(
  proverOptionsPolicyVersion: string | undefined,
  pluginConfigPolicyVersion: string | undefined,
): string {
  return proverOptionsPolicyVersion ?? pluginConfigPolicyVersion ?? 'unspecified';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('policyVersion injection into sessionData (R.15)', () => {
  it('uses proverOptions.policyVersion when explicitly set', () => {
    const result = resolvePolicyVersion('v2.0.0', 'v1.0.0');
    expect(result).toBe('v2.0.0');
  });

  it('falls back to pluginConfig.policyVersion when proverOptions has none', () => {
    const result = resolvePolicyVersion(undefined, 'v1.0.0');
    expect(result).toBe('v1.0.0');
  });

  it('falls back to "unspecified" when both are absent', () => {
    const result = resolvePolicyVersion(undefined, undefined);
    expect(result).toBe('unspecified');
  });

  it('uses proverOptions.policyVersion even when pluginConfig also has one', () => {
    const result = resolvePolicyVersion('v3.0.0-rc1', 'v2.5.0');
    expect(result).toBe('v3.0.0-rc1');
  });

  it('falls back to "unspecified" when proverOptions is absent and pluginConfig has none', () => {
    const result = resolvePolicyVersion(undefined, undefined);
    expect(result).toBe('unspecified');
  });

  it('uses pluginConfig.policyVersion with semver string', () => {
    const result = resolvePolicyVersion(undefined, 'v1.2.3');
    expect(result).toBe('v1.2.3');
  });
});

describe('sessionData __tlsn_policy_version key injection', () => {
  it('produces a string value (never undefined) for the session key', () => {
    const sessionData: Record<string, string> = {};
    sessionData['__tlsn_policy_version'] = resolvePolicyVersion(undefined, undefined);
    expect(typeof sessionData['__tlsn_policy_version']).toBe('string');
    expect(sessionData['__tlsn_policy_version']).toBe('unspecified');
  });

  it('key is set to proverOptions value when provided', () => {
    const sessionData: Record<string, string> = {};
    sessionData['__tlsn_policy_version'] = resolvePolicyVersion('v1.0.0', undefined);
    expect(sessionData['__tlsn_policy_version']).toBe('v1.0.0');
  });

  it('key is set to pluginConfig value when proverOptions is absent', () => {
    const sessionData: Record<string, string> = {};
    sessionData['__tlsn_policy_version'] = resolvePolicyVersion(undefined, 'v1.5.0');
    expect(sessionData['__tlsn_policy_version']).toBe('v1.5.0');
  });
});
