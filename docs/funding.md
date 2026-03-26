# UGIG Bitcoin + Lightning Funding Round PRD

## Overview

UGIG will raise capital using Bitcoin (BTC) and Lightning Network (LN) by offering prepaid platform credits, lifetime access tiers, and supporter rewards.

This is NOT a token sale or equity offering. It is a prepaid usage + supporter program.

The system will be powered by LNbits for invoice generation, payment tracking, and wallet management.

---

## Goals

- Raise $25k–$100k equivalent in BTC
- Convert contributors into long-term UGIG users
- Avoid securities classification
- Build a Bitcoin-native user base (LN + Nostr friendly)
- Keep implementation simple, fast, and self-hosted

---

## Non-Goals

- No token issuance
- No DAO governance (phase 1)
- No equity or revenue-sharing contracts
- No dependency on custodial payment providers

---

## Funding Model

### 1. Credit Presale

Users purchase UGIG credits at a discount:

- 100k sats → $100 credits
- 500k sats → $600 credits
- 1M sats → $1,500 credits

Credits are stored in user account and consumed within UGIG platform.

---

### 2. Lifetime Access Tier

Any investment of **$20 or more** automatically receives a **free Lifetime Premium plan**.

- $20+ (any amount) → Lifetime Premium Plan
- No cap on number of users

Includes:
- Unlimited job postings
- Premium placement
- API access (future)
- Founder badge
- All future Premium features at no additional cost

---

### 3. Supporter Tier (Optional)

- 10k–50k sats → supporter badge
- Public leaderboard (optional)

---

## Dedicated Funding Address

A dedicated BTC/LN address will be used exclusively for funding contributions:

- **On-chain BTC address**: TBD (dedicated HD wallet, not shared with platform operations)
- **Lightning address**: fund@ugig.net (via LNbits LNURLp)
- **LNURL-pay**: Encoded LNURL for QR-based payments

All incoming payments to this address are tracked as funding contributions and automatically trigger the reward logic (credits, lifetime plan, badges).

Implementation requirements:
- Separate LNbits wallet dedicated to funding (not the platform operational wallet)
- Webhook routes specific to funding payments
- Automatic $20+ threshold check to grant Lifetime Premium

---

## System Architecture

### Components

- LNbits (self-hosted)
- Node.js API (ESM, no TypeScript)
- PostgreSQL / Supabase (DB only, API layer separate)
- Frontend (Svelte or Next.js)
- Redis (optional, for caching)

---

### Flow

1. User selects funding option
2. Backend requests LN invoice from LNbits
3. LNbits returns invoice (bolt11)
4. User pays via Lightning wallet
5. LNbits webhook notifies backend
6. Backend verifies payment
7. Credits / perks applied to user account
8. Receipt displayed

---

## LNbits Setup

### Required Extensions

- Wallet
- Paywall (optional)
- LNURLp
- Webhooks

---

### Configuration

- Deploy LNbits (Docker or VPS)
- Create funding wallet
- Store:
  - Admin key
  - Invoice key

- Enable webhook URL:
  - POST /api/webhooks/lnbits

---

## Backend API

### POST /api/funding/create-invoice

Request:
{
  "userId": "string",
  "tier": "credits_100k | credits_500k | lifetime"
}

Response:
{
  "paymentRequest": "bolt11",
  "paymentHash": "string",
  "expiresAt": "timestamp"
}

---

### POST /api/webhooks/lnbits

- Verify paymentHash
- Confirm amount paid
- Mark invoice as paid
- Trigger reward logic

---

### Reward Logic

IF tier == credits:
  add credits to user account

IF amount_usd >= 20:
  set user.plan = "lifetime_premium"

IF tier == supporter:
  assign badge

---

## Database Schema

### users

- id
- email
- plan (free | pro | lifetime)
- credits (integer)

---

### payments

- id
- user_id
- payment_hash
- amount_sats
- tier
- status (pending | paid | expired)
- created_at

---

### rewards_log

- id
- user_id
- type (credits | lifetime | badge)
- amount
- metadata
- created_at

---

## Frontend Requirements

### Funding Page

- Show tiers
- Display BTC + USD equivalent
- “Pay with Lightning” button
- QR code + copy invoice

---

### Payment State

- Poll or websocket for payment confirmation
- Show:
  - pending
  - paid
  - expired

---

### Dashboard

- Show:
  - credits balance
  - plan status
  - contribution history

---

## Security

- Validate webhook signatures
- Never trust client-side payment confirmation
- Store LNbits keys securely (env variables)
- Rate limit invoice creation

---

## Compliance Considerations

- No promise of profit or ROI
- Clearly labeled as:
  - prepaid credits
  - supporter program

- Terms must state:
  - non-refundable
  - no investment expectation

---

## Optional Enhancements

### Nostr Integration

- Allow login via Nostr
- Display zap leaderboard
- Reward zaps with credits

---

### Gamification

- Top contributors leaderboard
- Badges:
  - Early supporter
  - Whale
  - OG

---

### Referral System

- Unique referral link
- % bonus credits for referrals

---

## Deployment

### Infrastructure

- Railway / VPS
- Dockerized LNbits
- Node API service
- PostgreSQL database

---

### Env Variables

- LNBITS_ADMIN_KEY
- LNBITS_INVOICE_KEY
- LNBITS_URL
- DATABASE_URL

---

## Success Metrics

- Total sats raised
- Number of contributors
- Conversion → active users
- Credits usage rate
- Retention after funding

---

## Timeline

Week 1:
- LNbits setup
- API endpoints

Week 2:
- Frontend funding page
- Webhook integration

Week 3:
- Testing + launch
- Nostr promotion

---

## Future Phases

- Recurring LN subscriptions
- API usage billing via LN
- DAO / governance (optional)
- BTC-native job payments inside UGIG

---

## Summary

UGIG will raise funds using Bitcoin and Lightning by selling prepaid credits and lifetime access, powered by LNbits.

This approach:
- avoids tokens
- avoids securities issues
- aligns with real product usage
- taps into the Bitcoin ecosystem
