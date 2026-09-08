create or replace function private.create_support_followup_internal(
  p_signal_id uuid,
  p_category text,
  p_notes text,
  p_action text,
  p_deadline date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signal public.assessment_signals%rowtype;
  v_followup_id uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if not private.has_private_access() then raise exception 'private assessment access required'; end if;

  select * into v_signal from public.assessment_signals where id = p_signal_id;
  if not found or not private.can_access_awardee(v_signal.awardee_id, v_signal.period_id) then
    raise exception 'signal not accessible';
  end if;

  insert into public.followups (
    awardee_id, period_id, facilitator_id, signal_id,
    category, notes, action, deadline, status
  ) values (
    v_signal.awardee_id, v_signal.period_id, v_actor, v_signal.id,
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_action, '')), ''),
    p_deadline,
    'open'::public.followup_status
  ) returning id into v_followup_id;

  update public.assessment_signals
  set status = 'reviewed', updated_at = now()
  where id = v_signal.id and status = 'open';

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_actor,
    'support_followup_created',
    'followup',
    v_followup_id,
    jsonb_build_object('signal_id', v_signal.id, 'awardee_id', v_signal.awardee_id, 'deadline', p_deadline)
  );

  return v_followup_id;
end;
$$;

create or replace function private.update_support_followup_internal(
  p_followup_id uuid,
  p_status public.followup_status,
  p_notes text,
  p_action text,
  p_deadline date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_followup public.followups%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if not private.has_private_access() then raise exception 'private assessment access required'; end if;

  select * into v_followup from public.followups where id = p_followup_id;
  if not found or not private.can_access_awardee(v_followup.awardee_id, v_followup.period_id) then
    raise exception 'followup not accessible';
  end if;

  update public.followups
  set status = coalesce(p_status, status),
      notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end,
      action = case when p_action is null then action else nullif(trim(p_action), '') end,
      deadline = p_deadline,
      updated_at = now()
  where id = p_followup_id;

  if p_status in ('resolved'::public.followup_status, 'cancelled'::public.followup_status)
     and v_followup.signal_id is not null then
    update public.assessment_signals set status = 'closed', updated_at = now() where id = v_followup.signal_id;
  elsif p_status in ('open'::public.followup_status, 'in_progress'::public.followup_status)
     and v_followup.signal_id is not null then
    update public.assessment_signals set status = 'reviewed', updated_at = now() where id = v_followup.signal_id;
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_actor,
    'support_followup_updated',
    'followup',
    p_followup_id,
    jsonb_build_object('status', p_status, 'deadline', p_deadline, 'awardee_id', v_followup.awardee_id)
  );

  return true;
end;
$$;

create or replace function private.set_support_signal_status_internal(p_signal_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signal public.assessment_signals%rowtype;
  v_actor uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if not private.has_private_access() then raise exception 'private assessment access required'; end if;
  if v_status not in ('open','reviewed','closed') then raise exception 'invalid signal status'; end if;

  select * into v_signal from public.assessment_signals where id = p_signal_id;
  if not found or not private.can_access_awardee(v_signal.awardee_id, v_signal.period_id) then
    raise exception 'signal not accessible';
  end if;

  update public.assessment_signals set status = v_status, updated_at = now() where id = p_signal_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_actor,
    'support_signal_status_changed',
    'assessment_signal',
    p_signal_id,
    jsonb_build_object('status', v_status, 'awardee_id', v_signal.awardee_id)
  );

  return true;
end;
$$;

revoke all on function private.create_support_followup_internal(uuid,text,text,text,date) from public, anon, authenticated;
revoke all on function private.update_support_followup_internal(uuid,public.followup_status,text,text,date) from public, anon, authenticated;
revoke all on function private.set_support_signal_status_internal(uuid,text) from public, anon, authenticated;
grant execute on function private.create_support_followup_internal(uuid,text,text,text,date) to authenticated;
grant execute on function private.update_support_followup_internal(uuid,public.followup_status,text,text,date) to authenticated;
grant execute on function private.set_support_signal_status_internal(uuid,text) to authenticated;

create or replace function public.create_support_followup(
  p_signal_id uuid,
  p_category text default null,
  p_notes text default null,
  p_action text default null,
  p_deadline date default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_support_followup_internal(p_signal_id,p_category,p_notes,p_action,p_deadline);
$$;

create or replace function public.update_support_followup(
  p_followup_id uuid,
  p_status public.followup_status,
  p_notes text default null,
  p_action text default null,
  p_deadline date default null
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_support_followup_internal(p_followup_id,p_status,p_notes,p_action,p_deadline);
$$;

create or replace function public.set_support_signal_status(p_signal_id uuid, p_status text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_support_signal_status_internal(p_signal_id,p_status);
$$;

revoke all on function public.create_support_followup(uuid,text,text,text,date) from public, anon;
revoke all on function public.update_support_followup(uuid,public.followup_status,text,text,date) from public, anon;
revoke all on function public.set_support_signal_status(uuid,text) from public, anon;
grant execute on function public.create_support_followup(uuid,text,text,text,date) to authenticated;
grant execute on function public.update_support_followup(uuid,public.followup_status,text,text,date) to authenticated;
grant execute on function public.set_support_signal_status(uuid,text) to authenticated;
