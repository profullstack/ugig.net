/**
 * Where an approved bounty submission gets paid, and whether it can be yet.
 *
 * A bounty payout is a CoinPay payment the creator makes straight to the
 * submitter's own wallet: no claim code, no human claimant, no ugig custody.
 * The submitter's wallet comes from a live CoinPay link or, for an API-key
 * agent that never opened a browser, the validated payout wallets on its own
 * profile (PUT /api/profile/wallet-addresses), the same rule Buy now and gig
 * invoices use (see profile-payout-wallets.ts).
 *
 * Order: an exact match for the bounty's coin (CoinPay link, then profile),
 * then the submitter's other payable wallets (CoinPay link first, which is how
 * linked users were already paid, then the preferred profile wallet). The
 * amount is always the bounty's USD payout.
 *
 * A bounty with no coin set pays whatever the submitter holds. A bounty named
 * in a token CoinPay does not carry (e.g. a creator's own BSC token) is paid
 * off-platform by its creator and is never redirected into another coin.
 */
import {
  preferredCoinToPaymentCurrency,
  type CoinPayGlobalWallet,
  type SupportedCurrency,
} from "@/lib/coinpayportal";
import { payoutWalletApiFix, profilePayoutWallets } from "@/lib/profile-payout-wallets";

export type BountyPayoutCoin =
  | { kind: "currency"; currency: SupportedCurrency }
  /** No coin on the bounty: any payable wallet of the submitter's will do. */
  | { kind: "any" }
  /** A coin CoinPay cannot pay (or plain USDT, which names no chain). */
  | { kind: "unsupported"; coin: string };

export function bountyPayoutCoin(paymentCoin: unknown): BountyPayoutCoin {
  const raw = typeof paymentCoin === "string" ? paymentCoin.trim() : "";
  if (!raw) return { kind: "any" };
  const currency = preferredCoinToPaymentCurrency(raw);
  if (!currency) return { kind: "unsupported", coin: raw };
  // "USDT" maps to plain `usdt`, which names no chain (profiles hold Tron and
  // BSC addresses under it), so it pays whatever payable wallet the submitter has.
  if (currency === "usdt") return { kind: "any" };
  return { kind: "currency", currency };
}

export interface BountyPayoutWallet {
  currency: SupportedCurrency;
  address: string;
  label: string | null;
  source: "coinpay" | "profile";
  /** True when it is the bounty's own coin. */
  exact: boolean;
}

/** Pick the wallet a bounty payout goes to, or null when there is none. */
export function pickBountyPayoutWallet(input: {
  coin: BountyPayoutCoin;
  linkWallets: readonly CoinPayGlobalWallet[] | null | undefined;
  profileWalletAddresses: unknown;
}): BountyPayoutWallet | null {
  if (input.coin.kind === "unsupported") return null;
  const link = (input.linkWallets || []).filter(
    (w) => w && typeof w.address === "string" && w.address.trim() && w.currency,
  );
  const profile = profilePayoutWallets(input.profileWalletAddresses);
  const from = (w: CoinPayGlobalWallet, source: "coinpay" | "profile", exact: boolean): BountyPayoutWallet => ({
    currency: w.currency as SupportedCurrency,
    address: w.address.trim(),
    label: (w.label as string | null | undefined) ?? null,
    source,
    exact,
  });

  if (input.coin.kind === "currency") {
    const want = input.coin.currency;
    const linked = link.find((w) => w.currency === want);
    if (linked) return from(linked, "coinpay", true);
    const own = profile.find((w) => w.currency === want);
    if (own) return from(own, "profile", true);
  }
  if (link[0]) return from(link[0], "coinpay", false);
  if (profile[0]) return from(profile[0], "profile", false);
  return null;
}

export interface BountyPayoutReadiness {
  /** True when an approved submission can be paid right now. */
  ready: boolean;
  payment_coin: string | null;
  /** The CoinPay currency key it would be paid in. */
  currency: SupportedCurrency | null;
  source: "coinpay" | "profile" | null;
  /** The address it would be paid to (the submitter's own). */
  address: string | null;
  message: string;
  /** One API call that makes it ready, when it is not. */
  api_fix?: ReturnType<typeof payoutWalletApiFix>;
}

const FIX_CURRENCIES: SupportedCurrency[] = ["usdc_sol", "usdc_pol", "usdc_eth", "sol", "pol", "eth", "btc"];

/** What a submitter (or the creator) should be told about getting paid. */
export function bountyPayoutReadiness(input: {
  paymentCoin: unknown;
  linkWallets: readonly CoinPayGlobalWallet[] | null | undefined;
  profileWalletAddresses: unknown;
}): BountyPayoutReadiness {
  const coin = bountyPayoutCoin(input.paymentCoin);
  const payment_coin = typeof input.paymentCoin === "string" && input.paymentCoin.trim() ? input.paymentCoin.trim() : null;
  if (coin.kind === "unsupported") {
    return {
      ready: false,
      payment_coin,
      currency: null,
      source: null,
      address: null,
      message:
        `This bounty pays in ${coin.coin}, which ugig cannot send through CoinPay. ` +
        `The creator pays it themselves: keep a ${coin.coin} receiving address in your profile wallet_addresses and ask them for the transaction hash.`,
    };
  }
  const wallet = pickBountyPayoutWallet({ coin, linkWallets: input.linkWallets, profileWalletAddresses: input.profileWalletAddresses });
  if (wallet) {
    const coinNote =
      coin.kind === "currency" && !wallet.exact
        ? ` You have no ${coin.currency} wallet, so it is paid in ${wallet.currency} (same USD amount). Add a ${coin.currency} wallet to be paid in the bounty's own coin.`
        : "";
    return {
      ready: true,
      payment_coin,
      currency: wallet.currency,
      source: wallet.source,
      address: wallet.address,
      message: `Paid straight to your ${wallet.source === "coinpay" ? "CoinPay" : "profile"} wallet ${wallet.address} in ${wallet.currency} once the creator approves and pays. No account, claim code or human step is needed to receive it.${coinNote}`,
    };
  }
  const want = coin.kind === "currency" ? [coin.currency, ...FIX_CURRENCIES.filter((c) => c !== coin.currency)] : FIX_CURRENCIES;
  return {
    ready: false,
    payment_coin,
    currency: coin.kind === "currency" ? coin.currency : null,
    source: null,
    address: null,
    message:
      `No payout wallet yet, so an approved submission cannot be paid. Add one with your API key: ` +
      `PUT /api/profile/wallet-addresses with {"wallet_addresses":[{"currency":"${want[0]}","address":"<your address>"}]}. ` +
      `Any self-custody address works; no CoinPay account is needed.`,
    api_fix: payoutWalletApiFix(want),
  };
}
