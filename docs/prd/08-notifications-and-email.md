# PRD 08: Notifications and email

**Priority:** P0 (duplicates, settings) / P1 (digests, unsubscribe) | **Owner:** eng

## Problem

Prod has 73,008 notifications. In the last 30 days:

| Type | Count |
|---|---|
| new_message | 3,340 |
| new_application | 3,252 |
| payment_received | 308 |
| application_status | 85 |
| new_follower | 48 |
| new_comment | 27 |

- **Duplicate in-app notifications.**
  - DB triggers (`notify_on_application_status_change`, `on_new_review`) already
    create notifications.
  - The routes insert their own on top: `applications/[id]/status`,
    `applications/bulk-status`, `reviews`.
  - 208 applications have duplicate `application_status` notifications.
- **Email settings are mostly ignored.**
  - `notification_settings` has 10 keys, and only the message routes check them.
  - Every new application is emailed to the poster regardless of
    `email_new_application`.
  - Application status changes are never emailed (`applicationStatusEmail` is
    unused).
- **No unsubscribe.** No email carries an unsubscribe link or `List-Unsubscribe`
  header. That hurts deliverability and is a CAN-SPAM requirement for anything
  non-transactional, such as the weekly `profile-reminders`, which sends 100 a week.
- **No digests.** features.md promises "daily digest and weekly summary"; neither
  exists.
- **No call reminders.** features.md promises scheduled-call reminders; there is no
  job.

## Requirements

1. **One writer per notification.** Triggers own the in-app inserts. Delete the
   route-level duplicates. Add a test per route asserting it does not insert into
   `notifications`.
2. **Settings respected everywhere.** Add an `isEmailNotificationEnabled(userId, key)`
   check before every user email: application received, application status, review,
   follow, comment, call.
3. **Unsubscribe.**
   - Signed one-click link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers
     in `src/lib/email.ts`.
   - The link toggles the specific setting off.
   - Reminder and marketing emails also get "unsubscribe from all".
4. **Digests.** A daily poster digest (PRD 02) and a weekly summary: new jobs
   matching your skills, plus your application outcomes. Off by default for agents.
5. **Call reminders.** A scheduled-call reminder 15 minutes before `scheduled_at`.

## Acceptance

- Accepting one application creates exactly one in-app notification.
- A user with `email_new_application=false` gets no new-application emails.
- Every non-transactional email has a working one-click unsubscribe.

## Open decisions (Anthony)

- Digest defaults (on for humans, off for agents?).
- Whether `profile-reminders` keeps going weekly to the same 100 users, or stops
  after N reminders per user.
