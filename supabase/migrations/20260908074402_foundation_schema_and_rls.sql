create schema if not exists private;

create type public.app_role as enum ('superadmin', 'coordinator', 'facilitator');
create type public.assessment_status as enum ('not_started', 'in_progress', 'completed', 'locked');
create type public.question_direction as enum ('positive', 'negative', 'signal');
create type public.question_sensitivity as enum ('standard', 'private', 'signal');
create type public.signal_level as enum ('info', 'low', 'medium', 'high');
create type public.followup_status as enum ('open', 'in_progress', 'resolved', 'cancelled');
create type public.document_type as enum ('raw_answers', 'comprehensive_report');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role public.app_role not null default 'facilitator',
  unit_id uuid references public.units(id) on delete set null,
  can_view_private boolean not null default false,
  can_export boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.awardees (
  id uuid primary key default gen_random_uuid(),
  awardee_code text not null unique,
  full_name text not null,
  phone_hash text,
  phone_last4_hash text,
  campus text,
  major text,
  cohort smallint,
  unit_id uuid references public.units(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'alumni')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_periods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  year integer not null check (year between 2020 and 2100),
  semester smallint not null check (semester in (1, 2)),
  start_date date,
  end_date date,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.assessment_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_modules (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.assessment_versions(id) on delete restrict,
  code text not null,
  title text not null,
  subtitle text,
  prompt text,
  sort_order smallint not null,
  restricted boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, code),
  unique (version_id, sort_order)
);

create table public.question_dimensions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.assessment_modules(id) on delete restrict,
  dimension_id uuid references public.question_dimensions(id) on delete set null,
  code text not null,
  question_text text not null,
  weight numeric(6,3) not null default 1,
  direction public.question_direction not null default 'positive',
  sensitivity public.question_sensitivity not null default 'standard',
  sort_order smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, code),
  unique (module_id, sort_order)
);

create table public.facilitator_assignments (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.profiles(id) on delete cascade,
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (facilitator_id, awardee_id, period_id)
);

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  module_id uuid not null references public.assessment_modules(id) on delete restrict,
  version_id uuid not null references public.assessment_versions(id) on delete restrict,
  status public.assessment_status not null default 'not_started',
  started_at timestamptz,
  completed_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (awardee_id, period_id, module_id)
);

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete restrict,
  selected boolean not null,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  module_id uuid references public.assessment_modules(id) on delete set null,
  result_json jsonb not null default '{}'::jsonb,
  engine_version text not null,
  generated_at timestamptz not null default now()
);

create table public.assessment_signals (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  question_id uuid references public.assessment_questions(id) on delete set null,
  signal_code text not null,
  signal_level public.signal_level not null default 'info',
  source text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  facilitator_id uuid references public.profiles(id) on delete set null,
  signal_id uuid references public.assessment_signals(id) on delete set null,
  category text not null,
  notes text,
  action text,
  deadline date,
  status public.followup_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  document_type public.document_type not null,
  storage_path text,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index profiles_unit_id_idx on public.profiles(unit_id);
create index awardees_unit_id_idx on public.awardees(unit_id);
create index facilitator_assignments_facilitator_id_idx on public.facilitator_assignments(facilitator_id);
create index facilitator_assignments_awardee_id_idx on public.facilitator_assignments(awardee_id);
create index facilitator_assignments_period_id_idx on public.facilitator_assignments(period_id);
create index assessment_sessions_awardee_id_idx on public.assessment_sessions(awardee_id);
create index assessment_sessions_period_id_idx on public.assessment_sessions(period_id);
create index assessment_answers_session_id_idx on public.assessment_answers(session_id);
create index assessment_answers_question_id_idx on public.assessment_answers(question_id);
create index assessment_results_awardee_id_idx on public.assessment_results(awardee_id);
create index assessment_results_period_id_idx on public.assessment_results(period_id);
create index assessment_signals_awardee_id_idx on public.assessment_signals(awardee_id);
create index assessment_signals_period_id_idx on public.assessment_signals(period_id);
create index followups_awardee_id_idx on public.followups(awardee_id);
create index followups_period_id_idx on public.followups(period_id);
create index generated_documents_awardee_id_idx on public.generated_documents(awardee_id);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function private.current_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active limit 1;
$$;

create or replace function private.current_unit()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.unit_id from public.profiles p
  where p.id = (select auth.uid()) and p.active limit 1;
$$;

create or replace function private.has_private_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and (p.role = 'superadmin'::public.app_role or p.can_view_private)
  ), false);
$$;

create or replace function private.has_export_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and (p.role = 'superadmin'::public.app_role or p.can_export)
  ), false);
$$;

create or replace function private.can_access_awardee(target_awardee uuid, target_period uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles p
    join public.awardees a on a.id = target_awardee
    where p.id = (select auth.uid()) and p.active
      and (
        p.role = 'superadmin'::public.app_role
        or (p.role = 'coordinator'::public.app_role and p.unit_id is not null and p.unit_id = a.unit_id)
        or (p.role = 'facilitator'::public.app_role and exists (
          select 1 from public.facilitator_assignments fa
          where fa.facilitator_id = p.id and fa.awardee_id = target_awardee
            and fa.active and (target_period is null or fa.period_id = target_period)
        ))
      )
  ), false);
$$;

create or replace function private.can_manage_awardee(target_awardee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles p
    join public.awardees a on a.id = target_awardee
    where p.id = (select auth.uid()) and p.active
      and (
        p.role = 'superadmin'::public.app_role
        or (p.role = 'coordinator'::public.app_role and p.unit_id is not null and p.unit_id = a.unit_id)
      )
  ), false);
$$;

create or replace function private.can_access_session(target_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.assessment_sessions s
    join public.assessment_modules m on m.id = s.module_id
    where s.id = target_session
      and private.can_access_awardee(s.awardee_id, s.period_id)
      and (not m.restricted or private.has_private_access())
  ), false);
$$;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger units_updated_at before update on public.units for each row execute function private.set_updated_at();
create trigger awardees_updated_at before update on public.awardees for each row execute function private.set_updated_at();
create trigger periods_updated_at before update on public.assessment_periods for each row execute function private.set_updated_at();
create trigger versions_updated_at before update on public.assessment_versions for each row execute function private.set_updated_at();
create trigger modules_updated_at before update on public.assessment_modules for each row execute function private.set_updated_at();
create trigger questions_updated_at before update on public.assessment_questions for each row execute function private.set_updated_at();
create trigger sessions_updated_at before update on public.assessment_sessions for each row execute function private.set_updated_at();
create trigger answers_updated_at before update on public.assessment_answers for each row execute function private.set_updated_at();
create trigger signals_updated_at before update on public.assessment_signals for each row execute function private.set_updated_at();
create trigger followups_updated_at before update on public.followups for each row execute function private.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_unit() to authenticated;
grant execute on function private.has_private_access() to authenticated;
grant execute on function private.has_export_access() to authenticated;
grant execute on function private.can_access_awardee(uuid, uuid) to authenticated;
grant execute on function private.can_manage_awardee(uuid) to authenticated;
grant execute on function private.can_access_session(uuid) to authenticated;

alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.awardees enable row level security;
alter table public.assessment_periods enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.assessment_modules enable row level security;
alter table public.question_dimensions enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.facilitator_assignments enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.assessment_results enable row level security;
alter table public.assessment_signals enable row level security;
alter table public.followups enable row level security;
alter table public.generated_documents enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.units, public.profiles, public.awardees,
  public.assessment_periods, public.assessment_versions, public.assessment_modules,
  public.question_dimensions, public.assessment_questions to authenticated;
grant select, insert, update, delete on public.facilitator_assignments,
  public.assessment_sessions, public.assessment_answers, public.assessment_results,
  public.assessment_signals, public.followups, public.generated_documents to authenticated;
grant insert, update, delete on public.awardees, public.assessment_periods,
  public.assessment_versions, public.assessment_modules, public.question_dimensions,
  public.assessment_questions, public.units to authenticated;
grant select on public.audit_logs to authenticated;

create policy units_select on public.units for select to authenticated using (private.current_role() = 'superadmin'::public.app_role or id = private.current_unit());
create policy units_insert on public.units for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy units_update on public.units for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy units_delete on public.units for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or private.current_role() = 'superadmin'::public.app_role
  or (private.current_role() = 'coordinator'::public.app_role and unit_id = private.current_unit())
);
create policy profiles_update on public.profiles for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);

create policy awardees_select on public.awardees for select to authenticated using (private.can_access_awardee(id, null));
create policy awardees_insert on public.awardees for insert to authenticated with check (
  private.current_role() = 'superadmin'::public.app_role
  or (private.current_role() = 'coordinator'::public.app_role and unit_id = private.current_unit())
);
create policy awardees_update on public.awardees for update to authenticated using (private.can_manage_awardee(id)) with check (private.can_manage_awardee(id));
create policy awardees_delete on public.awardees for delete to authenticated using (private.can_manage_awardee(id));

create policy periods_select on public.assessment_periods for select to authenticated using (true);
create policy periods_insert on public.assessment_periods for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy periods_update on public.assessment_periods for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy periods_delete on public.assessment_periods for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy versions_select on public.assessment_versions for select to authenticated using (true);
create policy versions_insert on public.assessment_versions for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy versions_update on public.assessment_versions for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy versions_delete on public.assessment_versions for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy modules_select on public.assessment_modules for select to authenticated using (true);
create policy modules_insert on public.assessment_modules for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy modules_update on public.assessment_modules for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy modules_delete on public.assessment_modules for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy dimensions_select on public.question_dimensions for select to authenticated using (true);
create policy dimensions_insert on public.question_dimensions for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy dimensions_update on public.question_dimensions for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy dimensions_delete on public.question_dimensions for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy questions_select on public.assessment_questions for select to authenticated using (true);
create policy questions_insert on public.assessment_questions for insert to authenticated with check (private.current_role() = 'superadmin'::public.app_role);
create policy questions_update on public.assessment_questions for update to authenticated using (private.current_role() = 'superadmin'::public.app_role) with check (private.current_role() = 'superadmin'::public.app_role);
create policy questions_delete on public.assessment_questions for delete to authenticated using (private.current_role() = 'superadmin'::public.app_role);

create policy assignments_select on public.facilitator_assignments for select to authenticated using (
  facilitator_id = (select auth.uid()) or private.current_role() = 'superadmin'::public.app_role or private.can_manage_awardee(awardee_id)
);
create policy assignments_insert on public.facilitator_assignments for insert to authenticated with check (private.can_manage_awardee(awardee_id));
create policy assignments_update on public.facilitator_assignments for update to authenticated using (private.can_manage_awardee(awardee_id)) with check (private.can_manage_awardee(awardee_id));
create policy assignments_delete on public.facilitator_assignments for delete to authenticated using (private.can_manage_awardee(awardee_id));

create policy sessions_select on public.assessment_sessions for select to authenticated using (private.can_access_awardee(awardee_id, period_id));
create policy sessions_insert on public.assessment_sessions for insert to authenticated with check (private.can_access_awardee(awardee_id, period_id));
create policy sessions_update on public.assessment_sessions for update to authenticated using (private.can_access_awardee(awardee_id, period_id)) with check (private.can_access_awardee(awardee_id, period_id));
create policy sessions_delete on public.assessment_sessions for delete to authenticated using (private.can_manage_awardee(awardee_id));

create policy answers_select on public.assessment_answers for select to authenticated using (private.can_access_session(session_id));
create policy answers_insert on public.assessment_answers for insert to authenticated with check (private.can_access_session(session_id));
create policy answers_update on public.assessment_answers for update to authenticated using (private.can_access_session(session_id)) with check (private.can_access_session(session_id));
create policy answers_delete on public.assessment_answers for delete to authenticated using (private.can_access_session(session_id));

create policy results_select on public.assessment_results for select to authenticated using (
  private.can_access_awardee(awardee_id, period_id)
  and (module_id is null or exists (
    select 1 from public.assessment_modules m
    where m.id = module_id and (not m.restricted or private.has_private_access())
  ))
);
create policy results_insert on public.assessment_results for insert to authenticated with check (private.can_access_awardee(awardee_id, period_id));
create policy results_update on public.assessment_results for update to authenticated using (private.can_access_awardee(awardee_id, period_id)) with check (private.can_access_awardee(awardee_id, period_id));
create policy results_delete on public.assessment_results for delete to authenticated using (private.can_manage_awardee(awardee_id));

create policy signals_select on public.assessment_signals for select to authenticated using (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy signals_insert on public.assessment_signals for insert to authenticated with check (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy signals_update on public.assessment_signals for update to authenticated using (private.can_access_awardee(awardee_id, period_id) and private.has_private_access()) with check (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy signals_delete on public.assessment_signals for delete to authenticated using (private.can_manage_awardee(awardee_id) and private.has_private_access());

create policy followups_select on public.followups for select to authenticated using (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy followups_insert on public.followups for insert to authenticated with check (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy followups_update on public.followups for update to authenticated using (private.can_access_awardee(awardee_id, period_id) and private.has_private_access()) with check (private.can_access_awardee(awardee_id, period_id) and private.has_private_access());
create policy followups_delete on public.followups for delete to authenticated using (private.can_manage_awardee(awardee_id) and private.has_private_access());

create policy documents_select on public.generated_documents for select to authenticated using (private.can_access_awardee(awardee_id, period_id));
create policy documents_insert on public.generated_documents for insert to authenticated with check (private.can_access_awardee(awardee_id, period_id) and private.has_export_access());
create policy documents_delete on public.generated_documents for delete to authenticated using (private.can_manage_awardee(awardee_id) and private.has_export_access());

create policy audit_logs_select on public.audit_logs for select to authenticated using (private.current_role() = 'superadmin'::public.app_role);

insert into public.units (code, name) values ('PALU', 'ETOS ID Palu') on conflict (code) do nothing;

insert into public.assessment_versions (code, label, description, status, activated_at)
values ('ETOS-ASSESSMENT-V1', 'ETOS Assessment V1', 'Baseline assessment: Kenali diri, pahami kondisi, tentukan arah.', 'active', now())
on conflict (code) do nothing;

with v as (select id from public.assessment_versions where code = 'ETOS-ASSESSMENT-V1')
insert into public.assessment_modules (version_id, code, title, subtitle, prompt, sort_order, restricted)
select v.id, x.code, x.title, x.subtitle, x.prompt, x.sort_order, x.restricted
from v
cross join (values
  ('MENGENAL_DIRI', 'Mengenal Diri', 'Profil Karakter, Temperamen & Gaya Interaksi', 'Saya ini orang seperti apa?', 1::smallint, false),
  ('MEMAHAMI_DIRI', 'Memahami Diri', 'Emosi, Ketangguhan & Kebutuhan Pendampingan', 'Apa yang sedang terjadi dalam diri saya?', 2::smallint, true),
  ('MENENTUKAN_ARAH', 'Menentukan Arah', 'Minat, Cita-Cita, Karier & Kontribusi', 'Saya ingin menjadi siapa dan menuju ke mana?', 3::smallint, false)
) as x(code, title, subtitle, prompt, sort_order, restricted)
on conflict (version_id, code) do nothing;
