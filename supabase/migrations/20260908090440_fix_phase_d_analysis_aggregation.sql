-- Refactor Phase D scoring aggregation into reusable helpers.

create or replace function private.dimension_scores(p_session_id uuid,p_module_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'name',x.name,'direction',x.direction,'selected',x.selected_count,'items',x.item_count,'percent',x.percent,
    'level',case when x.percent=0 then 'none' when x.percent<=33 then 'low' when x.percent<=66 then 'moderate' else 'high' end
  ) order by x.code),'[]'::jsonb)
  from (
    select d.code,d.name,min(q.direction::text) direction,count(*)::integer item_count,
           count(*) filter(where a.selected)::integer selected_count,
           round(100*coalesce(sum(case when a.selected then q.weight else 0 end),0)/nullif(sum(q.weight),0))::integer percent
    from public.assessment_questions q
    join public.question_dimensions d on d.id=q.dimension_id
    join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
    where q.module_id=p_module_id and q.active
    group by d.code,d.name
  ) x;
$$;

create or replace function private.named_dimension_scores(p_session_id uuid,p_codes text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'name',x.name,'selected',x.selected_count,'items',x.item_count,'percent',x.percent
  ) order by x.code),'[]'::jsonb)
  from (
    select d.code,d.name,count(*)::integer item_count,count(*) filter(where a.selected)::integer selected_count,
           round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0))::integer percent
    from public.assessment_questions q
    join public.question_dimensions d on d.id=q.dimension_id
    join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
    where d.code=any(p_codes)
    group by d.code,d.name
  ) x;
$$;

create or replace function private.top_positive_patterns(p_session_id uuid,p_module_id uuid,p_limit integer default 5)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'name',x.name,'percent',x.percent,'selected',x.selected_count,'items',x.item_count
  ) order by x.percent desc,x.selected_count desc,x.code),'[]'::jsonb)
  from (
    select * from (
      select d.code,d.name,count(*)::integer item_count,count(*) filter(where a.selected)::integer selected_count,
             round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0))::integer percent
      from public.assessment_questions q
      join public.question_dimensions d on d.id=q.dimension_id
      join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
      where q.module_id=p_module_id and q.active and q.direction='positive'::public.question_direction
      group by d.code,d.name
    ) ranked
    where selected_count>0
    order by percent desc,selected_count desc,code
    limit greatest(1,least(coalesce(p_limit,5),20))
  ) x;
$$;

create or replace function private.dimension_percent(p_session_id uuid,p_code text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0)),0)::integer
  from public.assessment_questions q
  join public.question_dimensions d on d.id=q.dimension_id
  join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
  where d.code=p_code;
$$;

create or replace function private.riasec_top3(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',x.rn,'code',x.code,'name',x.name,'percent',x.percent,'selected',x.selected_count,'items',x.item_count
  ) order by x.rn),'[]'::jsonb)
  from (
    select *,row_number() over(order by percent desc,selected_count desc,code) rn
    from (
      select d.code,d.name,count(*)::integer item_count,count(*) filter(where a.selected)::integer selected_count,
             round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0))::integer percent
      from public.assessment_questions q
      join public.question_dimensions d on d.id=q.dimension_id
      join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
      where d.code in('R','I','A','S','E','C')
      group by d.code,d.name
    ) r
  ) x where x.rn<=3;
$$;

create or replace function private.riasec_code(p_session_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(x.code,'-' order by x.rn),'')
  from (
    select code,row_number() over(order by percent desc,selected_count desc,code) rn
    from (
      select d.code,count(*) filter(where a.selected)::integer selected_count,
             round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0))::integer percent
      from public.assessment_questions q
      join public.question_dimensions d on d.id=q.dimension_id
      join public.assessment_answers a on a.question_id=q.id and a.session_id=p_session_id
      where d.code in('R','I','A','S','E','C')
      group by d.code
    ) r
  ) x where x.rn<=3;
$$;

revoke all on function private.dimension_scores(uuid,uuid) from public,anon,authenticated;
revoke all on function private.named_dimension_scores(uuid,text[]) from public,anon,authenticated;
revoke all on function private.top_positive_patterns(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function private.dimension_percent(uuid,text) from public,anon,authenticated;
revoke all on function private.riasec_top3(uuid) from public,anon,authenticated;
revoke all on function private.riasec_code(uuid) from public,anon,authenticated;

create or replace function private.rebuild_awardee_analysis(p_awardee_id uuid,p_period_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_engine constant text:='rules-v1.0';v_module record;v_dimensions jsonb;v_top_patterns jsonb;v_payload jsonb;
  v_riasec jsonb;v_paths jsonb;v_values jsonb;v_signals jsonb;v_module_recs jsonb;v_overall_recs jsonb:='[]'::jsonb;
  v_completed integer:=0;v_total integer:=0;v_signal_count integer:=0;v_fc integer:=0;v_fe integer:=0;v_top_codes text:=null;
begin
  delete from public.assessment_results where awardee_id=p_awardee_id and period_id=p_period_id and engine_version=v_engine;
  delete from public.assessment_signals where awardee_id=p_awardee_id and period_id=p_period_id and source='engine:'||v_engine and status='open';

  insert into public.assessment_signals(awardee_id,period_id,question_id,signal_code,signal_level,source,status)
  select s.awardee_id,s.period_id,q.id,q.code,
         case when q.code in('CK1','CK2') then 'medium'::public.signal_level else 'low'::public.signal_level end,
         'engine:'||v_engine,'open'
  from public.assessment_sessions s
  join public.assessment_answers a on a.session_id=s.id and a.selected
  join public.assessment_questions q on q.id=a.question_id
  where s.awardee_id=p_awardee_id and s.period_id=p_period_id and s.status='completed'::public.assessment_status and q.direction='signal'::public.question_direction
  on conflict(awardee_id,period_id,signal_code,source) do update set question_id=excluded.question_id,signal_level=excluded.signal_level,updated_at=now();

  for v_module in
    select m.id,m.code,m.title,m.restricted,s.id session_id
    from public.assessment_sessions s join public.assessment_modules m on m.id=s.module_id
    where s.awardee_id=p_awardee_id and s.period_id=p_period_id and s.status='completed'::public.assessment_status
    order by m.sort_order
  loop
    v_dimensions:=private.dimension_scores(v_module.session_id,v_module.id);
    v_top_patterns:=private.top_positive_patterns(v_module.session_id,v_module.id,5);
    v_payload:=jsonb_build_object('method','checkbox_endorsement','engine',v_engine,'module_code',v_module.code,'module_title',v_module.title,'dimensions',v_dimensions,
      'note','Skor menunjukkan tingkat pernyataan yang dipilih awardee dan digunakan sebagai bahan refleksi/pengembangan, bukan diagnosis.');

    if v_module.code='MENGENAL_DIRI' then
      v_payload:=v_payload||jsonb_build_object('top_patterns',v_top_patterns,'interpretation','Pola teratas menunjukkan kecenderungan yang paling banyak di-endorse pada asesmen ini.');
    elsif v_module.code='MEMAHAMI_DIRI' then
      select coalesce(jsonb_agg(jsonb_build_object('code',q.code,'label',d.name,'level',case when q.code in('CK1','CK2') then 'medium' else 'low' end) order by q.sort_order),'[]'::jsonb),count(*)::integer
      into v_signals,v_signal_count
      from public.assessment_questions q join public.question_dimensions d on d.id=q.dimension_id join public.assessment_answers a on a.question_id=q.id and a.session_id=v_module.session_id
      where q.direction='signal'::public.question_direction and a.selected;
      v_module_recs:='[]'::jsonb;
      if v_signal_count>0 then v_module_recs:=v_module_recs||jsonb_build_array('Lakukan check-in personal untuk memahami konteks di balik area dukungan yang dipilih awardee.'); end if;
      if exists(select 1 from public.assessment_answers a join public.assessment_questions q on q.id=a.question_id where a.session_id=v_module.session_id and a.selected and q.code='XA1') then v_module_recs:=v_module_recs||jsonb_build_array('Bahas beban akademik, prioritas, dan strategi pengelolaan tugas secara praktis.'); end if;
      if exists(select 1 from public.assessment_answers a join public.assessment_questions q on q.id=a.question_id where a.session_id=v_module.session_id and a.selected and q.code in('XF1','XR1')) then v_module_recs:=v_module_recs||jsonb_build_array('Sediakan ruang percakapan yang aman dan privat sebelum menentukan bentuk dukungan lanjutan.'); end if;
      v_payload:=v_payload||jsonb_build_object('support_signals',v_signals,'support_priority',case when exists(select 1 from public.assessment_answers a join public.assessment_questions q on q.id=a.question_id where a.session_id=v_module.session_id and a.selected and q.code in('CK1','CK2')) then 'follow_up' when v_signal_count>0 then 'attention' else 'routine' end,'recommendations',v_module_recs,'privacy_note','Bagian ini untuk pendampingan internal dan bukan diagnosis kesehatan mental.');
    elsif v_module.code='MENENTUKAN_ARAH' then
      v_riasec:=private.riasec_top3(v_module.session_id);v_top_codes:=private.riasec_code(v_module.session_id);
      v_paths:=private.named_dimension_scores(v_module.session_id,array['CP','CE','CA','CG','CS','CD','AL','AE','AS','AG']);
      v_values:=private.named_dimension_scores(v_module.session_id,array['VN','VF','VS','VL','KD']);
      v_fc:=private.dimension_percent(v_module.session_id,'FC');v_fe:=private.dimension_percent(v_module.session_id,'FE');
      v_module_recs:=jsonb_build_array('Gunakan tiga kode RIASEC teratas sebagai hipotesis eksplorasi, lalu uji melalui pengalaman nyata seperti proyek, magang, organisasi, atau percakapan karier.');
      if v_fc<67 then v_module_recs:=v_module_recs||jsonb_build_array('Perjelas arah karier dengan membandingkan 2–3 pilihan profesi, kompetensi yang dibutuhkan, dan langkah eksperimen selama masa kuliah.'); end if;
      if v_fe>=34 then v_module_recs:=v_module_recs||jsonb_build_array('Pertahankan eksplorasi karier secara terstruktur dan dokumentasikan apa yang dipelajari dari setiap pengalaman.'); end if;
      v_payload:=v_payload||jsonb_build_object('riasec_top3',v_riasec,'riasec_code',coalesce(v_top_codes,''),'career_clarity_percent',v_fc,'career_exploration_percent',v_fe,'career_paths_and_aspirations',v_paths,'career_values',v_values,'recommendations',v_module_recs);
    end if;

    insert into public.assessment_results(awardee_id,period_id,module_id,result_json,engine_version,generated_at)
    values(p_awardee_id,p_period_id,v_module.id,v_payload,v_engine,now());
  end loop;

  select count(*)::integer,count(*) filter(where s.status='completed'::public.assessment_status)::integer into v_total,v_completed
  from public.assessment_modules m join public.assessment_versions v on v.id=m.version_id and v.status='active'
  left join public.assessment_sessions s on s.module_id=m.id and s.awardee_id=p_awardee_id and s.period_id=p_period_id where m.active;

  if v_total>0 and v_completed=v_total then
    select coalesce(jsonb_agg(jsonb_build_object('code',x.code,'name',x.name,'percent',x.percent,'selected',x.selected_count,'items',x.item_count) order by x.percent desc,x.selected_count desc,x.code),'[]'::jsonb)
    into v_top_patterns
    from(
      select * from(
        select d.code,d.name,count(*)::integer item_count,count(*) filter(where a.selected)::integer selected_count,
               round(100*count(*) filter(where a.selected)::numeric/nullif(count(*),0))::integer percent
        from public.assessment_sessions s join public.assessment_modules m on m.id=s.module_id join public.assessment_answers a on a.session_id=s.id
        join public.assessment_questions q on q.id=a.question_id join public.question_dimensions d on d.id=q.dimension_id
        where s.awardee_id=p_awardee_id and s.period_id=p_period_id and s.status='completed'::public.assessment_status and m.code in('MENGENAL_DIRI','MENENTUKAN_ARAH') and q.direction='positive'::public.question_direction
        group by d.code,d.name
      ) z where selected_count>0 order by percent desc,selected_count desc,code limit 8
    ) x;

    select coalesce(r.result_json->'riasec_top3','[]'::jsonb),coalesce(r.result_json->>'riasec_code',''),coalesce((r.result_json->>'career_clarity_percent')::integer,0),coalesce((r.result_json->>'career_exploration_percent')::integer,0)
    into v_riasec,v_top_codes,v_fc,v_fe
    from public.assessment_results r join public.assessment_modules m on m.id=r.module_id
    where r.awardee_id=p_awardee_id and r.period_id=p_period_id and r.engine_version=v_engine and m.code='MENENTUKAN_ARAH'
    order by r.generated_at desc limit 1;

    v_overall_recs:=jsonb_build_array('Gunakan hasil ini sebagai bahan percakapan perkembangan bersama fasilitator, bukan sebagai label tetap tentang diri awardee.');
    if v_fc<67 then v_overall_recs:=v_overall_recs||jsonb_build_array('Tetapkan satu eksperimen karier 30–60 hari untuk memperjelas pilihan dan kompetensi yang perlu dibangun.'); end if;
    if coalesce(v_top_codes,'')<>'' then v_overall_recs:=v_overall_recs||jsonb_build_array('Hubungkan pola RIASEC utama ('||v_top_codes||') dengan peluang belajar, proyek, dan jalur karier yang realistis.'); end if;

    insert into public.assessment_results(awardee_id,period_id,module_id,result_json,engine_version,generated_at)
    values(p_awardee_id,p_period_id,null,jsonb_build_object('engine',v_engine,'profile_type','executive_development_profile','assessment_complete',true,'top_endorsed_patterns',v_top_patterns,'riasec_top3',coalesce(v_riasec,'[]'::jsonb),'riasec_code',coalesce(v_top_codes,''),'career_clarity_percent',v_fc,'career_exploration_percent',v_fe,'recommendations',v_overall_recs,'privacy_note','Profil eksekutif tidak memuat isi privat dari modul Memahami Diri.'),v_engine,now());
  end if;
end;
$$;

revoke all on function private.rebuild_awardee_analysis(uuid,uuid) from public,anon,authenticated;
