import { SupabaseClient } from '@supabase/supabase-js';
import { submitReputationReceipt, UGIG_PLATFORM_DID } from './reputation';

export async function getUserDid(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('did')
    .eq('id', userId)
    .single();
  return data?.did || null;
}

export function onProfileCompleted(userDid: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'profile_completed',
  }).catch(() => {});
}

export function onResumeUploaded(userDid: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'resume_uploaded',
  }).catch(() => {});
}

export function onGigPosted(userDid: string, gigId: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'gig_posted',
    metadata: { gig_id: gigId },
  }).catch(() => {});
}

export function onApplicationSubmitted(userDid: string, gigId: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'application_submitted',
    metadata: { gig_id: gigId },
  }).catch(() => {});
}

export function onHired(userDid: string, gigId: string, valueUsd?: number) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'hired',
    metadata: { gig_id: gigId },
    value_usd: valueUsd,
  }).catch(() => {});
}

export function onPostCreated(userDid: string, postId: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'post_created',
    metadata: { post_id: postId },
  }).catch(() => {});
}

export function onCommentCreated(userDid: string, commentId: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'comment_created',
    metadata: { comment_id: commentId },
  }).catch(() => {});
}

export function onEndorsementGiven(userDid: string, endorsedDid: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'endorsement_given',
    metadata: { endorsed_did: endorsedDid },
  }).catch(() => {});
}

export function onReviewCreated(userDid: string, reviewId: string, reviewedDid?: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'review_created',
    metadata: { review_id: reviewId, reviewed_did: reviewedDid },
  }).catch(() => {});
}

export function onFollowed(userDid: string, followedDid: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'followed_user',
    metadata: { followed_did: followedDid },
  }).catch(() => {});
}

export function onPortfolioAdded(userDid: string, portfolioId: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'portfolio_added',
    metadata: { portfolio_id: portfolioId },
  }).catch(() => {});
}

export function onVerificationRequested(userDid: string, verificationType: string) {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'verification_requested',
    metadata: { verification_type: verificationType },
  }).catch(() => {});
}

export function onUpvoted(userDid: string, postId: string, targetType: 'post' | 'comment' = 'post') {
  submitReputationReceipt({
    agent_did: userDid,
    merchant_did: UGIG_PLATFORM_DID,
    action: 'upvoted',
    metadata: { post_id: postId, target_type: targetType },
  }).catch(() => {});
}
