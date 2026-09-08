# Phase E - PDF Export

Phase E adds facilitator-side PDF export with server-side authorization, RLS-protected reads, export audit logging, and native A4 PDF generation.

Exports:
- Raw Answers PDF
- Comprehensive Assessment Report PDF

Security:
- requires export permission / superadmin
- private assessment content remains controlled by private-view permission
- export is recorded in generated_documents and audit_logs
- no service-role key is exposed to the client

Validation:
- Next.js CI green
- Supabase Security Advisor: 0 findings after export RPC
- rendered sample checked visually for clipping/overlap across 5 A4 pages
