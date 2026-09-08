# Foundation Architecture

```text
Awardee Web (Phase C)
        |
Next.js App Router
        |
Supabase SSR / Server Routes
        |
PostgreSQL + RLS
        |
Assessment / Signals / Follow-up / Reports
```

Internal authentication uses Supabase Auth. Awardee verification will use a separate server-side flow in Phase C and will not expose privileged database credentials to the browser.
