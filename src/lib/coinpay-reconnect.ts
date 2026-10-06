import type { CoinpayLinkState } from "@/lib/coinpay-oauth";

/**
 * The one machine-readable answer to "the worker's CoinPay link cannot be used".
 *
 * Every route that would otherwise create a half-made invoice or payment
 * request returns this with a 409, so the web UI, the CLI and agents can key
 * on one `code` and offer the same fix: the existing connect flow at
 * /settings/connections. `coinpay_link_state` says whether that is a first
 * connection ("none") or a reconnect ("needs_reconnect"), which changes the
 * button label and nothing else.
 */
export const COINPAY_RECONNECT_CODE = "coinpay_reconnect_required" as const;
export const COINPAY_CONNECT_PATH = "/settings/connections";

export interface CoinpayReconnectBody {
  error: string;
  code: typeof COINPAY_RECONNECT_CODE;
  coinpay_link_state: Exclude<CoinpayLinkState, "connected">;
  reconnect_url: string;
  /** True when the caller is the worker, i.e. the person who can fix it. */
  oauth_required: boolean;
  setup_required: true;
}

export function coinpayReconnectBody(options: {
  state: Exclude<CoinpayLinkState, "connected">;
  /** Is the caller the worker whose link is broken? */
  callerIsWorker: boolean;
  /** What was being attempted, for the sentence. */
  action: "invoice" | "payment";
}): CoinpayReconnectBody {
  const { state, callerIsWorker, action } = options;
  const reconnect = state === "needs_reconnect";
  const what = action === "invoice" ? "sending an invoice" : "this invoice can be paid";

  let error: string;
  if (callerIsWorker) {
    error = reconnect
      ? `Reconnect your CoinPay account before ${what}. It is linked, but the link has expired or is missing the permission to read your wallet addresses.`
      : `Connect your CoinPay account before ${what}`;
  } else {
    error = reconnect
      ? `The worker must reconnect CoinPay before ${action === "invoice" ? "this invoice can be created" : what}. Their link has expired or is missing the wallet permission.`
      : `The worker must connect CoinPay before ${action === "invoice" ? "this invoice can be created" : what}.`;
  }

  return {
    error,
    code: COINPAY_RECONNECT_CODE,
    coinpay_link_state: state,
    reconnect_url: COINPAY_CONNECT_PATH,
    oauth_required: callerIsWorker,
    setup_required: true,
  };
}

/** Narrow an unknown API error body to the reconnect shape. */
export function isCoinpayReconnectBody(value: unknown): value is CoinpayReconnectBody {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { code?: unknown }).code === COINPAY_RECONNECT_CODE
  );
}
