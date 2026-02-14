interface PlatformAction {
  agent_did: string;
  action_category: string;
  action_type?: string;
  metadata?: Record<string, unknown>;
  value_usd?: number;
}

export async function submitReputationAction(action: PlatformAction): Promise<boolean> {
  const COINPAY_API = process.env.COINPAYPORTAL_API_URL || 'https://coinpayportal.com';
  const COINPAY_REPUTATION_KEY = process.env.COINPAYPORTAL_REPUTATION_API_KEY || '';
  if (!COINPAY_REPUTATION_KEY) return false;
  try {
    const res = await fetch(`${COINPAY_API}/api/reputation/platform-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COINPAY_REPUTATION_KEY}`,
      },
      body: JSON.stringify(action),
    });
    return res.ok;
  } catch (e) {
    console.error('[reputation] Failed to submit action:', e);
    return false;
  }
}

/** @deprecated Use submitReputationAction instead */
export async function submitReputationReceipt(receipt: {
  agent_did: string;
  merchant_did: string;
  action: string;
  metadata?: Record<string, unknown>;
  value_usd?: number;
}): Promise<boolean> {
  // Map old format to new platform-action format
  const ACTION_MAP: Record<string, string> = {
    profile_completed: 'identity.profile_update',
    resume_uploaded: 'identity.profile_update',
    gig_posted: 'productivity.task',
    application_submitted: 'productivity.application',
    hired: 'productivity.completion',
    post_created: 'social.post',
    comment_created: 'social.comment',
    endorsement_given: 'social.endorsement',
    review_created: 'social.endorsement',
    followed_user: 'social.endorsement',
    portfolio_added: 'identity.profile_update',
    verification_requested: 'identity.verification',
    upvoted: 'social.comment',
    content_downvoted: 'social.comment',
  };

  return submitReputationAction({
    agent_did: receipt.agent_did,
    action_category: ACTION_MAP[receipt.action] || 'productivity.task',
    action_type: receipt.action,
    metadata: receipt.metadata,
    value_usd: receipt.value_usd,
  });
}

export const UGIG_PLATFORM_DID = process.env.UGIG_PLATFORM_DID || 'did:web:ugig.net';
