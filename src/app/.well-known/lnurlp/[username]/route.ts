import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const LNBITS_URL = process.env.LNBITS_URL || 'https://ln.coinpayportal.com';

/**
 * /.well-known/lnurlp/<username> — Lightning Address (LNURL-pay step 1)
 *
 * Looks up the user's LNbits wallet from our DB, then fetches THEIR specific
 * lnurlp link from LNbits (not the global username resolution, which can
 * hit stale/orphaned links).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const host = request.headers.get('host') || 'ugig.net';

  try {
    const supabase = createServiceClient();

    // Look up the user's profile and LNbits wallet.
    //
    // Usernames are stored with their original case but Lightning Addresses are
    // advertised lowercased, so this has to match case-insensitively — comparing
    // against username.toLowerCase() alone never matches a mixed-case profile.
    // ilike is only a prefilter (its wildcards are escaped, but the strict
    // lowercase comparison below is what actually decides the match, so an
    // over-broad pattern can never resolve to the wrong person).
    const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: candidates } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', pattern)
      .limit(10);

    const wanted = username.toLowerCase();
    const matches = (candidates ?? []).filter(
      (c: { username: string | null }) => c.username?.toLowerCase() === wanted
    );
    // Prefer an exact-case match; a handful of usernames differ only by case.
    const ordered = [
      ...matches.filter((c: { username: string | null }) => c.username === username),
      ...matches.filter((c: { username: string | null }) => c.username !== username),
    ];

    if (ordered.length === 0) {
      return NextResponse.json(
        { status: 'ERROR', reason: `Unknown user: ${username}` },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Where names collide only by case, the one with a wallet is the payee.
    let lnWallet: { invoice_key?: string } | null = null;
    for (const candidate of ordered) {
      const { data } = await (supabase
        .from('user_ln_wallets' as any)
        .select('invoice_key')
        .eq('user_id', candidate.id)
        .maybeSingle() as any);
      if (data?.invoice_key) {
        lnWallet = data;
        break;
      }
    }

    if (!lnWallet?.invoice_key) {
      return NextResponse.json(
        { status: 'ERROR', reason: `No Lightning wallet for ${username}` },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Fetch the user's LNURL-pay links from their specific wallet
    const linksRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
      headers: { 'X-Api-Key': lnWallet.invoice_key, 'Accept': 'application/json' },
    });

    if (!linksRes.ok) {
      return NextResponse.json(
        { status: 'ERROR', reason: 'Lightning Address service unavailable' },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const links = await linksRes.json();
    const link = Array.isArray(links) ? links[0] : null;

    if (!link) {
      return NextResponse.json(
        { status: 'ERROR', reason: `No Lightning Address for ${username}` },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Build LNURL-pay response using the correct link
    // Rewrite callback to go through our domain
    const callback = `https://${host}/lnurlp/api/v1/lnurl/cb/${link.id}`;

    return NextResponse.json({
      tag: 'payRequest',
      callback,
      minSendable: (link.min || 1) * 1000,        // sats → msats
      maxSendable: (link.max || 10000000) * 1000,
      metadata: JSON.stringify([
        ['text/plain', `Payment to ${username}`],
        ['text/identifier', `${username}@${host}`],
      ]),
      commentAllowed: link.comment_chars || 255,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('LNURL-pay error:', error);
    return NextResponse.json(
      { status: 'ERROR', reason: 'Lightning Address service unavailable' },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
