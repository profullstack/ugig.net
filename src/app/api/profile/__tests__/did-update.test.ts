import { describe, it, expect } from 'vitest';
import { profileSchema } from '@/lib/validations';

describe('DID validation in profileSchema', () => {
  const baseProfile = {
    username: 'testuser',
    full_name: 'Test User',
    bio: 'A test bio',
    skills: ['JavaScript'],
    ai_tools: [],
    portfolio_urls: [],
    wallet_addresses: [],
  };

  it('accepts a valid did:key identifier', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid DID format', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
      did: 'not-a-did',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('did:key');
    }
  });

  it('rejects did:web (only did:key allowed)', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
      did: 'did:web:example.com',
    });
    expect(result.success).toBe(false);
  });

  it('allows DID to be null', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
      did: null,
    });
    expect(result.success).toBe(true);
  });

  it('allows DID to be undefined (optional)', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
    });
    expect(result.success).toBe(true);
  });

  it('allows empty string (transforms to null)', () => {
    const result = profileSchema.safeParse({
      ...baseProfile,
      did: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.did).toBeNull();
    }
  });
});
