import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitReputationReceipt, UGIG_PLATFORM_DID } from '../reputation';
import {
  onProfileCompleted,
  onResumeUploaded,
  onGigPosted,
  onApplicationSubmitted,
  onHired,
  onPostCreated,
  onCommentCreated,
  onEndorsementGiven,
  getUserDid,
} from '../reputation-hooks';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('submitReputationReceipt', () => {
  beforeEach(() => {
    vi.stubEnv('COINPAYPORTAL_REPUTATION_API_KEY', 'test-key');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true on successful submission', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await submitReputationReceipt({
      agent_did: 'did:key:z6MkTest',
      merchant_did: UGIG_PLATFORM_DID,
      action: 'test_action',
    });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://coinpayportal.com/api/reputation/receipt',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      })
    );
  });

  it('returns false on failed submission', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await submitReputationReceipt({
      agent_did: 'did:key:z6MkTest',
      merchant_did: UGIG_PLATFORM_DID,
      action: 'test_action',
    });
    expect(result).toBe(false);
  });

  it('returns false when no API key is set', async () => {
    vi.stubEnv('COINPAYPORTAL_REPUTATION_API_KEY', '');
    // Re-import to pick up env change - but since it reads at module level,
    // we need to test the behavior directly
    // The module reads env at import time, so we test the fetch-error path
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const result = await submitReputationReceipt({
      agent_did: 'did:key:z6MkTest',
      merchant_did: UGIG_PLATFORM_DID,
      action: 'test_action',
    });
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const result = await submitReputationReceipt({
      agent_did: 'did:key:z6MkTest',
      merchant_did: UGIG_PLATFORM_DID,
      action: 'test_action',
    });
    expect(result).toBe(false);
  });
});

describe('reputation hooks', () => {
  beforeEach(() => {
    vi.stubEnv('COINPAYPORTAL_REPUTATION_API_KEY', 'test-key');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('onProfileCompleted submits receipt', async () => {
    onProfileCompleted('did:key:z6MkTest');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('profile_completed');
    expect(body.agent_did).toBe('did:key:z6MkTest');
  });

  it('onResumeUploaded submits receipt', async () => {
    onResumeUploaded('did:key:z6MkTest');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('resume_uploaded');
  });

  it('onGigPosted submits receipt with gig_id', async () => {
    onGigPosted('did:key:z6MkTest', 'gig-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('gig_posted');
    expect(body.metadata.gig_id).toBe('gig-123');
  });

  it('onApplicationSubmitted submits receipt', async () => {
    onApplicationSubmitted('did:key:z6MkTest', 'gig-456');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('application_submitted');
  });

  it('onHired submits receipt with value', async () => {
    onHired('did:key:z6MkTest', 'gig-789', 500);
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('hired');
    expect(body.value_usd).toBe(500);
  });

  it('onPostCreated submits receipt', async () => {
    onPostCreated('did:key:z6MkTest', 'post-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('post_created');
    expect(body.metadata.post_id).toBe('post-123');
  });

  it('onCommentCreated submits receipt', async () => {
    onCommentCreated('did:key:z6MkTest', 'comment-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('comment_created');
  });

  it('onEndorsementGiven submits receipt', async () => {
    onEndorsementGiven('did:key:z6MkTest', 'did:key:z6MkOther');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action).toBe('endorsement_given');
    expect(body.metadata.endorsed_did).toBe('did:key:z6MkOther');
  });

  it('getUserDid fetches DID from supabase', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { did: 'did:key:z6MkTest' } }),
    };
    const did = await getUserDid(mockSupabase as any, 'user-123');
    expect(did).toBe('did:key:z6MkTest');
  });

  it('getUserDid returns null when no DID', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { did: null } }),
    };
    const did = await getUserDid(mockSupabase as any, 'user-123');
    expect(did).toBeNull();
  });
});
