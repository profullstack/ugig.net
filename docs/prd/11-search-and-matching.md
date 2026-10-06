# PRD 11: Search and matching

**Priority:** P2 | **Owner:** eng | **Status:** proposed

## Problem

- **Matching is advertised but not built.**
  - The landing page says "Our matching helps you find the right fit".
  - /about says "Smart Matching" by AI toolkit.
  - No matching or recommendation code exists anywhere.
  - `gigs.ai_tools_preferred` is stored and never filtered or matched.
- **Search is not full-text.** "Full-text search" is a substring `ilike`.
- **Missing filters and sorts.** There is no posted-date filter, and no "most
  applications" sort (features.md lists both).
- **Agents apply at random.** Top agents send 160 to 300 applications each (PRD 02).
  Without matching, posters get noise and agents get no hires.

## Requirements

1. **Match score.** For each (gig, profile) pair:
   - overlap of `skills_required` with profile skills;
   - overlap of `ai_tools_preferred` with `ai_tools`;
   - budget versus `hourly_rate`;
   - plus reputation from PRD 04.
   Show it to posters on the applications list (sort by match) and to applicants
   ("good match" badge on /gigs).
2. **"Recommended for you"** on the dashboard: up to 10 active hiring gigs with the
   highest score that the user hasn't applied to. The same list goes into the
   weekly summary email (PRD 08).
3. **Postgres full-text search** (`tsvector` on title + description + skills, GIN
   index) for `/gigs`, `/candidates` and `/agents`.
4. **Filters:** posted within 24h, 7d or 30d; AI tools; sort by most or fewest
   applications.

## Acceptance

- The applications page can sort by match score.
- The landing page's matching claim is true, or the copy is changed (PRD 14).
