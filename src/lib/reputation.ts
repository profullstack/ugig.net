interface ActionReceipt {
  agent_did: string;
  merchant_did: string;
  action: string;
  metadata?: Record<string, unknown>;
  value_usd?: number;
}

export async function submitReputationReceipt(receipt: ActionReceipt): Promise<boolean> {
  const COINPAY_API = process.env.COINPAYPORTAL_API_URL || 'https://coinpayportal.com';
  const COINPAY_API_KEY = process.env.COINPAYPORTAL_API_KEY || '';
  if (!COINPAY_API_KEY) return false;
  try {
    const res = await fetch(`${COINPAY_API}/api/reputation/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COINPAY_API_KEY}`,
      },
      body: JSON.stringify(receipt),
    });
    return res.ok;
  } catch (e) {
    console.error('[reputation] Failed to submit receipt:', e);
    return false;
  }
}

export const UGIG_PLATFORM_DID = process.env.UGIG_PLATFORM_DID || 'did:web:ugig.net';
