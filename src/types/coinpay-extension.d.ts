/**
 * `window.coinpay` — injected by the CoinPay wallet browser extension.
 *
 * Optional at runtime: the property only exists when the extension is
 * installed, so every use must feature-detect first.
 * See packages/extension/src/inpage/provider.ts in the coinpayportal repo.
 */

export interface CoinPayBatchPayment {
  /** Correlation id echoed back on the matching result (we use the invoice id). */
  id: string;
  /** Chain or CoinPay currency code, e.g. `usdc_pol`, `BTC`. */
  chain: string;
  to: string;
  /** Decimal string in the chain's display units. */
  amount: string;
  label?: string;
  amountUsd?: number;
}

export type CoinPayStage =
  | "queued"
  | "preparing"
  | "signing"
  | "broadcasting"
  | "sent"
  | "failed"
  | "skipped";

export interface CoinPayBatchResult {
  id: string;
  chain: string;
  to: string;
  amount: string;
  status: "sent" | "failed" | "skipped";
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export interface CoinPayProgress {
  id: string;
  stage: CoinPayStage;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  completed: number;
  total: number;
}

export interface CoinPayAccount {
  chain: string;
  address: string;
  tokens: string[];
}

export interface CoinPayProvider {
  isCoinPay: true;
  version: string;
  getState(): Promise<{ initialized: boolean; unlocked: boolean; connected: boolean }>;
  connect(): Promise<{ accounts: CoinPayAccount[] }>;
  getAccounts(): Promise<{ accounts: CoinPayAccount[] }>;
  /**
   * Resolves once every payment reaches a terminal state — including when some
   * fail. Check `status` per result; this is not all-or-nothing.
   */
  payBatch(
    payments: CoinPayBatchPayment[],
    options?: {
      onProgress?: (progress: CoinPayProgress) => void;
      /**
       * Which of the wallet's addresses funds the run. A wallet holds several
       * per chain and a batch spends exactly one; without this it always spends
       * the first, so a payer whose money sits on a later address watches every
       * payment fail for want of funds that are plainly there.
       *
       * Supported from extension 0.9.x — older builds ignore it.
       */
      from?: string;
    }
  ): Promise<{ results: CoinPayBatchResult[] }>;
  onProgress(listener: (progress: CoinPayProgress) => void): () => void;
}

declare global {
  interface Window {
    coinpay?: CoinPayProvider;
  }
}

export {};
