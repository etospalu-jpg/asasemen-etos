# Phase B — Foundation

Implemented foundation for ETOS Assessment Center.

## Application
- Next.js 16 App Router
- Supabase SSR browser/server clients
- Next.js request proxy for session refresh
- facilitator email/password login
- protected dashboard smoke test
- role-aware internal foundation UI

## Database
- 16 public tables
- assessment versioning and modules
- awardee/facilitator assignment model
- result, signal, follow-up, document, audit models
- private helper schema for authorization
- RLS enabled on all public tables
- restricted access for private assessment data
- explicit grants for Data API access

## Roles
- superadmin
- coordinator
- facilitator

## Security
- authorization data stored in database profiles, not user metadata
- service role is never exposed to frontend
- private assessment permission is independent from normal assessment access
- export permission is independent and auditable
- Supabase Security Advisor: no findings after foundation migration

## Seed
- ETOS ID Palu unit
- ETOS-ASSESSMENT-V1
- Mengenal Diri
- Memahami Diri (restricted)
- Menentukan Arah

The 92 assessment questions are intentionally deferred to Phase C so scoring and item metadata can be seeded together.
