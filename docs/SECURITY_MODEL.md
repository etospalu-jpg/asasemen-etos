# Security Model

ETOS Assessment Center uses Supabase Auth for internal users and PostgreSQL Row Level Security for authorization.

## Roles
- Superadmin: global internal access.
- Coordinator: unit-scoped access.
- Facilitator: assigned-awardee access only.

## Sensitive data
The `Memahami Diri` module is restricted. Raw answers in restricted sessions, coaching signals, and follow-up records require separate private-access permission.

## Keys
Only the Supabase publishable key is allowed in browser code. Secret/service-role credentials are server-only and must never use a `NEXT_PUBLIC_` prefix.
