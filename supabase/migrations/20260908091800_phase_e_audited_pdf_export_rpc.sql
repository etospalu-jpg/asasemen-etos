-- Phase E: audited PDF export registration.
-- PDF bytes are generated in the authenticated Next.js server route; this RPC
-- atomically records the export intent after permission checks.

create or replace function private.record_assessment_export_internal(
  p_awardee_id uuid,
  p_period_id uuid,
  p_document_type public.document_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if not private.has_export_access() then
    raise exception 'export permission required';
  end if;
  if not private.can_access_awardee(p_awardee_id, p_period_id) then
    raise exception 'awardee access denied';
  end if;

  insert into public.generated_documents(awardee_id,period_id,document_type,generated_by,storage_path)
  values(p_awardee_id,p_period_id,p_document_type,(select auth.uid()),null)
  returning id into v_document_id;

  insert into public.audit_logs(actor_id,action,entity,entity_id,metadata)
  values(
    (select auth.uid()),'export_pdf','generated_documents',v_document_id,
    pg_catalog.jsonb_build_object(
      'awardee_id',p_awardee_id,
      'period_id',p_period_id,
      'document_type',p_document_type::text,
      'channel','server_pdf'
    )
  );

  return v_document_id;
end;
$$;

revoke all on function private.record_assessment_export_internal(uuid,uuid,public.document_type) from public,anon,authenticated;
grant execute on function private.record_assessment_export_internal(uuid,uuid,public.document_type) to authenticated;

create or replace function public.record_assessment_export(
  p_awardee_id uuid,
  p_period_id uuid,
  p_document_type public.document_type
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_assessment_export_internal(p_awardee_id,p_period_id,p_document_type);
$$;

revoke all on function public.record_assessment_export(uuid,uuid,public.document_type) from public,anon;
grant execute on function public.record_assessment_export(uuid,uuid,public.document_type) to authenticated;
