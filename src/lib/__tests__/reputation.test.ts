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
      action: 'comment_created',
    });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://coinpayportal.com/api/reputation/platform-action',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      })
    );
    // Verify it maps to correct action_category
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_category).toBe('social.comment');
    expect(body.action_type).toBe('comment_created');
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
    const result = await submitReputationReceipt({
      agent_did: 'did:key:z6MkTest',
      merchant_did: UGIG_PLATFORM_DID,
      action: 'test_action',
    });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
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

  it('maps action types to correct categories', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const mappings: Record<string, string> = {
      profile_completed: 'identity.profile_update',
      resume_uploaded: 'identity.profile_update',
      gig_posted: 'productivity.task',
      application_submitted: 'productivity.application',
      hired: 'productivity.completion',
      post_created: 'social.post',
      comment_created: 'social.comment',
      endorsement_given: 'social.endorsement',
    };

    for (const [action, expectedCategory] of Object.entries(mappings)) {
      mockFetch.mockClear();
      await submitReputationReceipt({
        agent_did: 'did:key:z6MkTest',
        merchant_did: UGIG_PLATFORM_DID,
        action,
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action_category).toBe(expectedCategory);
      expect(body.action_type).toBe(action);
    }
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

  it('onProfileCompleted submits action', async () => {
    onProfileCompleted('did:key:z6MkTest');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('profile_completed');
    expect(body.action_category).toBe('identity.profile_update');
    expect(body.agent_did).toBe('did:key:z6MkTest');
  });

  it('onResumeUploaded submits action', async () => {
    onResumeUploaded('did:key:z6MkTest');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('resume_uploaded');
    expect(body.action_category).toBe('identity.profile_update');
  });

  it('onGigPosted submits action with gig_id', async () => {
    onGigPosted('did:key:z6MkTest', 'gig-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('gig_posted');
    expect(body.action_category).toBe('productivity.task');
    expect(body.metadata.gig_id).toBe('gig-123');
  });

  it('onApplicationSubmitted submits action', async () => {
    onApplicationSubmitted('did:key:z6MkTest', 'gig-456');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('application_submitted');
    expect(body.action_category).toBe('productivity.application');
  });

  it('onHired submits action with value', async () => {
    onHired('did:key:z6MkTest', 'gig-789', 500);
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('hired');
    expect(body.action_category).toBe('productivity.completion');
    expect(body.value_usd).toBe(500);
  });

  it('onPostCreated submits action', async () => {
    onPostCreated('did:key:z6MkTest', 'post-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('post_created');
    expect(body.action_category).toBe('social.post');
    expect(body.metadata.post_id).toBe('post-123');
  });

  it('onCommentCreated submits action', async () => {
    onCommentCreated('did:key:z6MkTest', 'comment-123');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('comment_created');
    expect(body.action_category).toBe('social.comment');
  });

  it('onEndorsementGiven submits action', async () => {
    onEndorsementGiven('did:key:z6MkTest', 'did:key:z6MkOther');
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action_type).toBe('endorsement_given');
    expect(body.action_category).toBe('social.endorsement');
    expect(body.metadata.endorsed_did).toBe('did:key:z6MkOther');
  });

  it('getUserDid fetches DID from supabase', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { did: 'did:key:z6MkTest' } }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const did = await getUserDid(mockSupabase as any, 'user-123');
    expect(did).toBeNull();
  });
});
