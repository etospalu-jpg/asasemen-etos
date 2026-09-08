-- Canonical replay for Phase C.
-- Produces the final secure Phase C state directly; historical fixes are retained as no-op markers.

create table if not exists private.awardee_access_sessions (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists awardee_access_sessions_awardee_idx on private.awardee_access_sessions(awardee_id);
create index if not exists awardee_access_sessions_expires_idx on private.awardee_access_sessions(expires_at);

create table if not exists private.awardee_verification_attempts (
  awardee_id uuid primary key references public.awardees(id) on delete cascade,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists assessment_periods_one_active_idx on public.assessment_periods ((active)) where active;

insert into public.assessment_periods(code,name,year,semester,start_date,active)
values('2026-S1','Assessment 2026 / Semester 1',2026,1,current_date,true)
on conflict(code) do update set name=excluded.name,year=excluded.year,semester=excluded.semester,active=true,updated_at=now();

insert into public.question_dimensions(code,name) values
('SG','Social Engagement'),('KL','Leadership Initiative'),('ML','Analytical & Detail Orientation'),('PL','Stability & Harmony'),
('IN','Integrity'),('SA','Self Awareness'),('SP','Spiritual Value Alignment'),('TJ','Responsibility'),('RE','Resilience'),
('IS','Initiative & Ownership'),('KO','Collaboration'),('LE','Leadership'),('KS','Contribution Orientation'),
('EA','Emotional Awareness'),('ER','Emotional Regulation'),('RR','Recovery & Resilience'),('OP','Emotional Openness'),
('AC','Self Acceptance'),('SU','Support System'),('HS','Help Seeking'),('XF','Family Pressure Signal'),('XR','Relationship Signal'),
('XA','Academic Pressure Signal'),('XM','Future Uncertainty Signal'),('CK','Coaching Need Signal'),('FC','Career Clarity'),
('FE','Career Exploration'),('R','Realistic'),('I','Investigative'),('A','Artistic'),('S','Social'),('E','Enterprising'),('C','Conventional'),
('AL','Leadership Aspiration'),('AE','Entrepreneurship Aspiration'),('AS','Social Impact'),('AG','Global Exposure'),
('CP','Corporate Career'),('CE','Entrepreneurship Career'),('CA','Academic Career'),('CG','Public Service'),
('CS','NGO & Community Development'),('CD','Education & Human Development'),('VN','Meaningful Impact'),('VF','Financial Independence'),
('VS','Spiritual Career Alignment'),('VL','Lifelong Learning'),('KD','Regional Contribution')
on conflict(code) do update set name=excluded.name;

with catalog(module_code,question_code,dimension_code,question_text,direction,sensitivity,sort_order) as (values
('MENGENAL_DIRI','SG1','SG','Saya mudah memulai percakapan dengan orang yang baru saya kenal.','positive'::public.question_direction,'standard'::public.question_sensitivity,1),
('MENGENAL_DIRI','SG2','SG','Saya sering membuat suasana kelompok menjadi lebih hidup.','positive'::public.question_direction,'standard'::public.question_sensitivity,2),
('MENGENAL_DIRI','SG3','SG','Saya cukup terbuka mengekspresikan antusiasme.','positive'::public.question_direction,'standard'::public.question_sensitivity,3),
('MENGENAL_DIRI','SG4','SG','Saya menikmati kegiatan yang melibatkan banyak interaksi dengan orang lain.','positive'::public.question_direction,'standard'::public.question_sensitivity,4),
('MENGENAL_DIRI','KL1','KL','Ketika kelompok belum memiliki arah, saya cenderung mengambil inisiatif.','positive'::public.question_direction,'standard'::public.question_sensitivity,5),
('MENGENAL_DIRI','KL2','KL','Saya cukup nyaman mengambil keputusan ketika situasi membutuhkan tindakan.','positive'::public.question_direction,'standard'::public.question_sensitivity,6),
('MENGENAL_DIRI','KL3','KL','Saya senang bekerja dengan target dan hasil yang jelas.','positive'::public.question_direction,'standard'::public.question_sensitivity,7),
('MENGENAL_DIRI','KL4','KL','Ketika muncul masalah, pikiran saya cepat tertuju pada apa yang dapat dilakukan.','positive'::public.question_direction,'standard'::public.question_sensitivity,8),
('MENGENAL_DIRI','ML1','ML','Saya biasanya memikirkan berbagai kemungkinan sebelum mengambil keputusan.','positive'::public.question_direction,'standard'::public.question_sensitivity,9),
('MENGENAL_DIRI','ML2','ML','Saya cukup memperhatikan detail dalam pekerjaan.','positive'::public.question_direction,'standard'::public.question_sensitivity,10),
('MENGENAL_DIRI','ML3','ML','Saya lebih nyaman ketika kegiatan memiliki rencana yang jelas.','positive'::public.question_direction,'standard'::public.question_sensitivity,11),
('MENGENAL_DIRI','ML4','ML','Saya sering memeriksa kembali hasil pekerjaan sebelum dianggap selesai.','positive'::public.question_direction,'standard'::public.question_sensitivity,12),
('MENGENAL_DIRI','PL1','PL','Saya cenderung tetap tenang ketika terjadi ketegangan dalam kelompok.','positive'::public.question_direction,'standard'::public.question_sensitivity,13),
('MENGENAL_DIRI','PL2','PL','Saya lebih suka mencari jalan tengah ketika terjadi perbedaan pendapat.','positive'::public.question_direction,'standard'::public.question_sensitivity,14),
('MENGENAL_DIRI','PL3','PL','Saya cukup sabar mendengarkan orang lain menjelaskan masalahnya.','positive'::public.question_direction,'standard'::public.question_sensitivity,15),
('MENGENAL_DIRI','PL4','PL','Saya nyaman bekerja dengan ritme yang stabil dan tidak terburu-buru.','positive'::public.question_direction,'standard'::public.question_sensitivity,16),
('MENGENAL_DIRI','IN1','IN','Saya berusaha menepati janji atau komitmen meskipun tidak ada yang mengingatkan.','positive'::public.question_direction,'standard'::public.question_sensitivity,17),
('MENGENAL_DIRI','IN2','IN','Saya bersedia mengakui kesalahan dan menjaga kepercayaan ketika diberi amanah.','positive'::public.question_direction,'standard'::public.question_sensitivity,18),
('MENGENAL_DIRI','SA1','SA','Saya dapat mengenali kekuatan sekaligus kekurangan diri saya.','positive'::public.question_direction,'standard'::public.question_sensitivity,19),
('MENGENAL_DIRI','SA2','SA','Saya terbuka menerima masukan dan mengevaluasi diri setelah melakukan kesalahan.','positive'::public.question_direction,'standard'::public.question_sensitivity,20),
('MENGENAL_DIRI','SP1','SP','Nilai agama yang saya yakini menjadi pertimbangan dalam keputusan penting.','positive'::public.question_direction,'standard'::public.question_sensitivity,21),
('MENGENAL_DIRI','SP2','SP','Saya berusaha menerapkan pelajaran dari kajian atau pembinaan dalam kehidupan sehari-hari.','positive'::public.question_direction,'standard'::public.question_sensitivity,22),
('MENGENAL_DIRI','TJ1','TJ','Saya berusaha menyelesaikan tanggung jawab yang sudah saya terima.','positive'::public.question_direction,'standard'::public.question_sensitivity,23),
('MENGENAL_DIRI','TJ2','TJ','Saya menjaga kualitas pekerjaan meskipun tidak selalu diawasi.','positive'::public.question_direction,'standard'::public.question_sensitivity,24),
('MENGENAL_DIRI','RE1','RE','Saya tetap mencoba ketika menghadapi tugas atau keadaan yang sulit.','positive'::public.question_direction,'standard'::public.question_sensitivity,25),
('MENGENAL_DIRI','RE2','RE','Ketika cara pertama tidak berhasil, saya mencari pendekatan lain.','positive'::public.question_direction,'standard'::public.question_sensitivity,26),
('MENGENAL_DIRI','IS1','IS','Saya bersedia mengambil tanggung jawab baru untuk berkembang.','positive'::public.question_direction,'standard'::public.question_sensitivity,27),
('MENGENAL_DIRI','IS2','IS','Saya dapat mengubah gagasan menjadi langkah atau tindakan nyata.','positive'::public.question_direction,'standard'::public.question_sensitivity,28),
('MENGENAL_DIRI','KO1','KO','Saya dapat bekerja dengan orang yang memiliki pandangan berbeda.','positive'::public.question_direction,'standard'::public.question_sensitivity,29),
('MENGENAL_DIRI','KO2','KO','Saya memberi ruang kepada orang lain untuk menyampaikan pendapat.','positive'::public.question_direction,'standard'::public.question_sensitivity,30),
('MENGENAL_DIRI','LE1','LE','Ketika dibutuhkan, saya bersedia membantu kelompok menentukan arah.','positive'::public.question_direction,'standard'::public.question_sensitivity,31),
('MENGENAL_DIRI','LE2','LE','Saya senang membantu orang lain berkembang, bukan hanya menyelesaikan bagian saya sendiri.','positive'::public.question_direction,'standard'::public.question_sensitivity,32),
('MENGENAL_DIRI','KS1','KS','Saya tertarik menggunakan kemampuan saya untuk memberikan manfaat kepada orang lain.','positive'::public.question_direction,'standard'::public.question_sensitivity,33),
('MENGENAL_DIRI','KS2','KS','Saya ingin pengetahuan dan pengalaman saya kelak memberi manfaat bagi masyarakat atau daerah.','positive'::public.question_direction,'standard'::public.question_sensitivity,34),
('MEMAHAMI_DIRI','EA1','EA','Saya cukup mampu mengenali apa yang sedang saya rasakan.','positive'::public.question_direction,'private'::public.question_sensitivity,1),
('MEMAHAMI_DIRI','EA2','EA','Saya biasanya mengetahui hal apa yang membuat suasana hati saya berubah.','positive'::public.question_direction,'private'::public.question_sensitivity,2),
('MEMAHAMI_DIRI','EA3','EA','Saya menyadari ketika emosi mulai memengaruhi keputusan saya.','positive'::public.question_direction,'private'::public.question_sensitivity,3),
('MEMAHAMI_DIRI','ER1','ER','Ketika marah atau kecewa, saya mampu memberi waktu kepada diri sendiri sebelum bertindak.','positive'::public.question_direction,'private'::public.question_sensitivity,4),
('MEMAHAMI_DIRI','ER2','ER','Saya mempunyai cara yang cukup sehat untuk menenangkan diri ketika tertekan.','positive'::public.question_direction,'private'::public.question_sensitivity,5),
('MEMAHAMI_DIRI','ER3','ER','Saya dapat kembali fokus setelah mengalami situasi emosional.','positive'::public.question_direction,'private'::public.question_sensitivity,6),
('MEMAHAMI_DIRI','RR1','RR','Saya dapat menerima bahwa tidak semua hal berjalan sesuai rencana.','positive'::public.question_direction,'private'::public.question_sensitivity,7),
('MEMAHAMI_DIRI','RR2','RR','Setelah mengalami kegagalan, saya biasanya dapat kembali bergerak.','positive'::public.question_direction,'private'::public.question_sensitivity,8),
('MEMAHAMI_DIRI','RR3','RR','Ketika satu cara tidak berhasil, saya masih mampu mencari pilihan lain.','positive'::public.question_direction,'private'::public.question_sensitivity,9),
('MEMAHAMI_DIRI','OP1','OP','Saya sering menyimpan masalah sendiri terlalu lama.','negative'::public.question_direction,'private'::public.question_sensitivity,10),
('MEMAHAMI_DIRI','OP2','OP','Saya terkadang merasa harus terlihat baik-baik saja di depan orang lain.','negative'::public.question_direction,'private'::public.question_sensitivity,11),
('MEMAHAMI_DIRI','OP3','OP','Saya sulit menceritakan masalah pribadi kepada orang lain.','negative'::public.question_direction,'private'::public.question_sensitivity,12),
('MEMAHAMI_DIRI','AC1','AC','Saya terkadang terlalu keras menyalahkan diri sendiri ketika melakukan kesalahan.','negative'::public.question_direction,'private'::public.question_sensitivity,13),
('MEMAHAMI_DIRI','AC2','AC','Saya sering memikirkan kekurangan diri lebih lama daripada keberhasilan yang saya capai.','negative'::public.question_direction,'private'::public.question_sensitivity,14),
('MEMAHAMI_DIRI','SU1','SU','Saya memiliki setidaknya satu orang yang benar-benar dapat saya percaya untuk bercerita.','positive'::public.question_direction,'private'::public.question_sensitivity,15),
('MEMAHAMI_DIRI','SU2','SU','Saya merasa memiliki orang yang dapat membantu ketika sedang mengalami masa sulit.','positive'::public.question_direction,'private'::public.question_sensitivity,16),
('MEMAHAMI_DIRI','HS1','HS','Saya cukup nyaman meminta bantuan ketika memang membutuhkannya.','positive'::public.question_direction,'private'::public.question_sensitivity,17),
('MEMAHAMI_DIRI','HS2','HS','Saya merasa lingkungan ETOS dapat menjadi salah satu tempat untuk mencari dukungan.','positive'::public.question_direction,'private'::public.question_sensitivity,18),
('MEMAHAMI_DIRI','XF1','XF','Ada persoalan keluarga yang belakangan ini cukup memengaruhi pikiran saya.','signal'::public.question_direction,'signal'::public.question_sensitivity,19),
('MEMAHAMI_DIRI','XR1','XR','Ada persoalan pertemanan atau hubungan dengan orang lain yang sedang mengganggu saya.','signal'::public.question_direction,'signal'::public.question_sensitivity,20),
('MEMAHAMI_DIRI','XA1','XA','Tekanan akademik belakangan ini terasa cukup berat bagi saya.','signal'::public.question_direction,'signal'::public.question_sensitivity,21),
('MEMAHAMI_DIRI','XM1','XM','Saya sedang cukup bingung mengenai diri atau masa depan saya.','signal'::public.question_direction,'signal'::public.question_sensitivity,22),
('MEMAHAMI_DIRI','CK1','CK','Saya merasa ada sesuatu yang ingin saya bicarakan secara pribadi dengan fasilitator.','signal'::public.question_direction,'signal'::public.question_sensitivity,23),
('MEMAHAMI_DIRI','CK2','CK','Saya merasa akan terbantu jika mendapat pendampingan lebih dekat dalam beberapa waktu ke depan.','signal'::public.question_direction,'signal'::public.question_sensitivity,24),
('MENENTUKAN_ARAH','FC1','FC','Saya sudah memiliki gambaran mengenai profesi yang ingin saya jalani.','positive'::public.question_direction,'standard'::public.question_sensitivity,1),
('MENENTUKAN_ARAH','FC2','FC','Saya mengetahui kemampuan apa yang perlu saya bangun untuk mendekati cita-cita saya.','positive'::public.question_direction,'standard'::public.question_sensitivity,2),
('MENENTUKAN_ARAH','FC3','FC','Saya memiliki target tertentu yang ingin saya capai selama masa kuliah.','positive'::public.question_direction,'standard'::public.question_sensitivity,3),
('MENENTUKAN_ARAH','FE1','FE','Saya mempunyai beberapa pilihan karier yang sedang saya pertimbangkan.','positive'::public.question_direction,'standard'::public.question_sensitivity,4),
('MENENTUKAN_ARAH','FE2','FE','Saya masih ingin mencoba banyak pengalaman sebelum menentukan pilihan karier.','positive'::public.question_direction,'standard'::public.question_sensitivity,5),
('MENENTUKAN_ARAH','FE3','FE','Saya ingin masa kuliah menjadi waktu untuk menemukan arah hidup dengan lebih jelas.','positive'::public.question_direction,'standard'::public.question_sensitivity,6),
('MENENTUKAN_ARAH','R1','R','Saya menikmati kegiatan yang menggunakan alat, teknologi, atau keterampilan praktis.','positive'::public.question_direction,'standard'::public.question_sensitivity,7),
('MENENTUKAN_ARAH','R2','R','Saya tertarik membuat, merakit, memperbaiki, atau mengoperasikan sesuatu.','positive'::public.question_direction,'standard'::public.question_sensitivity,8),
('MENENTUKAN_ARAH','I1','I','Saya menikmati mencari tahu penyebab suatu masalah.','positive'::public.question_direction,'standard'::public.question_sensitivity,9),
('MENENTUKAN_ARAH','I2','I','Saya tertarik melakukan penelitian, analisis, atau mempelajari sesuatu secara mendalam.','positive'::public.question_direction,'standard'::public.question_sensitivity,10),
('MENENTUKAN_ARAH','A1','A','Saya menikmati menciptakan ide, desain, tulisan, konten, atau karya.','positive'::public.question_direction,'standard'::public.question_sensitivity,11),
('MENENTUKAN_ARAH','A2','A','Saya menyukai aktivitas yang memberi ruang besar untuk kreativitas dan ekspresi.','positive'::public.question_direction,'standard'::public.question_sensitivity,12),
('MENENTUKAN_ARAH','S1','S','Saya menikmati membantu orang memahami sesuatu.','positive'::public.question_direction,'standard'::public.question_sensitivity,13),
('MENENTUKAN_ARAH','S2','S','Saya senang ketika dapat mendampingi atau memberi manfaat langsung kepada orang lain.','positive'::public.question_direction,'standard'::public.question_sensitivity,14),
('MENENTUKAN_ARAH','E1','E','Saya menikmati mengajak orang lain bergerak mencapai suatu tujuan.','positive'::public.question_direction,'standard'::public.question_sensitivity,15),
('MENENTUKAN_ARAH','E2','E','Saya tertarik membangun usaha, organisasi, program, atau sesuatu yang dapat berkembang.','positive'::public.question_direction,'standard'::public.question_sensitivity,16),
('MENENTUKAN_ARAH','C1','C','Saya menikmati mengatur data, sistem, jadwal, atau pekerjaan agar lebih rapi.','positive'::public.question_direction,'standard'::public.question_sensitivity,17),
('MENENTUKAN_ARAH','C2','C','Saya nyaman mengerjakan sesuatu yang membutuhkan ketelitian dan keteraturan.','positive'::public.question_direction,'standard'::public.question_sensitivity,18),
('MENENTUKAN_ARAH','AL1','AL','Saya tertarik memimpin organisasi, tim, atau project.','positive'::public.question_direction,'standard'::public.question_sensitivity,19),
('MENENTUKAN_ARAH','AE1','AE','Saya tertarik membangun usaha sendiri atau menjadi entrepreneur.','positive'::public.question_direction,'standard'::public.question_sensitivity,20),
('MENENTUKAN_ARAH','AS1','AS','Saya tertarik menghasilkan dampak sosial melalui pekerjaan atau kegiatan saya.','positive'::public.question_direction,'standard'::public.question_sensitivity,21),
('MENENTUKAN_ARAH','AG1','AG','Saya ingin memiliki pengalaman belajar atau bekerja di luar daerah atau lingkungan internasional.','positive'::public.question_direction,'standard'::public.question_sensitivity,22),
('MENENTUKAN_ARAH','CP1','CP','Saya tertarik bekerja di perusahaan atau lingkungan profesional.','positive'::public.question_direction,'standard'::public.question_sensitivity,23),
('MENENTUKAN_ARAH','CE1','CE','Saya tertarik menjadikan entrepreneurship sebagai salah satu jalur masa depan.','positive'::public.question_direction,'standard'::public.question_sensitivity,24),
('MENENTUKAN_ARAH','CA1','CA','Saya tertarik menjadi akademisi, peneliti, atau melanjutkan pendidikan tinggi.','positive'::public.question_direction,'standard'::public.question_sensitivity,25),
('MENENTUKAN_ARAH','CG1','CG','Saya tertarik bekerja di pemerintahan atau pelayanan publik.','positive'::public.question_direction,'standard'::public.question_sensitivity,26),
('MENENTUKAN_ARAH','CS1','CS','Saya tertarik bekerja dalam NGO, organisasi sosial, atau community development.','positive'::public.question_direction,'standard'::public.question_sensitivity,27),
('MENENTUKAN_ARAH','CD1','CD','Saya tertarik menjadi pendidik atau terlibat dalam pengembangan manusia.','positive'::public.question_direction,'standard'::public.question_sensitivity,28),
('MENENTUKAN_ARAH','VN1','VN','Saya ingin pekerjaan saya memberikan manfaat nyata bagi orang lain.','positive'::public.question_direction,'standard'::public.question_sensitivity,29),
('MENENTUKAN_ARAH','VF1','VF','Saya ingin memiliki kemandirian finansial.','positive'::public.question_direction,'standard'::public.question_sensitivity,30),
('MENENTUKAN_ARAH','VS1','VS','Saya ingin kehidupan profesional saya tetap selaras dengan nilai agama.','positive'::public.question_direction,'standard'::public.question_sensitivity,31),
('MENENTUKAN_ARAH','VL1','VL','Saya ingin terus memperoleh pengalaman dan pengetahuan baru sepanjang hidup.','positive'::public.question_direction,'standard'::public.question_sensitivity,32),
('MENENTUKAN_ARAH','KD1','KD','Ada persoalan di masyarakat atau daerah asal yang suatu saat ingin saya bantu selesaikan.','positive'::public.question_direction,'standard'::public.question_sensitivity,33),
('MENENTUKAN_ARAH','KD2','KD','Saya ingin menggunakan bidang ilmu saya untuk memberikan manfaat kepada masyarakat.','positive'::public.question_direction,'standard'::public.question_sensitivity,34)
), resolved as (
  select m.id module_id,d.id dimension_id,c.question_code,c.question_text,c.direction,c.sensitivity,c.sort_order
  from catalog c
  join public.assessment_modules m on m.code=c.module_code
  join public.assessment_versions v on v.id=m.version_id and v.code='ETOS-ASSESSMENT-V1'
  left join public.question_dimensions d on d.code=c.dimension_code
)
insert into public.assessment_questions(module_id,dimension_id,code,question_text,weight,direction,sensitivity,sort_order,active)
select module_id,dimension_id,question_code,question_text,1,direction,sensitivity,sort_order,true from resolved
on conflict(module_id,code) do update set dimension_id=excluded.dimension_id,question_text=excluded.question_text,weight=excluded.weight,direction=excluded.direction,sensitivity=excluded.sensitivity,sort_order=excluded.sort_order,active=true,updated_at=now();

create or replace function private.awardee_from_token(p_token text)
returns uuid language sql volatile security definer set search_path='' as $$
  update private.awardee_access_sessions s set last_seen_at=now()
  where s.token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex') and s.revoked_at is null and s.expires_at>now()
  returning s.awardee_id;
$$;

create or replace function private.list_awardees_for_access_internal()
returns table(awardee_id uuid,full_name text,campus text,cohort smallint)
language sql stable security definer set search_path='' as $$
  select a.id,a.full_name,a.campus,a.cohort from public.awardees a where a.status='active' order by a.full_name;
$$;

create or replace function private.verify_awardee_access_internal(p_awardee_id uuid,p_last4 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_awardee public.awardees%rowtype;v_attempt private.awardee_verification_attempts%rowtype;v_token text;v_expires timestamptz:=now()+interval '12 hours';v_failed integer;
begin
  if p_last4 is null or p_last4!~'^[0-9]{4}$' then return pg_catalog.jsonb_build_object('ok',false,'error','invalid_code'); end if;
  select * into v_awardee from public.awardees where id=p_awardee_id and status='active';
  if not found then return pg_catalog.jsonb_build_object('ok',false,'error','invalid_credentials'); end if;
  select * into v_attempt from private.awardee_verification_attempts where awardee_id=p_awardee_id;
  if found and v_attempt.locked_until is not null and v_attempt.locked_until>now() then
    return pg_catalog.jsonb_build_object('ok',false,'error','temporarily_locked','retry_after_seconds',greatest(1,extract(epoch from(v_attempt.locked_until-now()))::integer));
  end if;
  if v_awardee.phone_last4_hash is null or extensions.crypt(p_last4,v_awardee.phone_last4_hash)<>v_awardee.phone_last4_hash then
    if not found or v_attempt.window_started_at<now()-interval '15 minutes' then
      insert into private.awardee_verification_attempts(awardee_id,failed_count,window_started_at,locked_until,updated_at)
      values(p_awardee_id,1,now(),null,now()) on conflict(awardee_id) do update set failed_count=1,window_started_at=now(),locked_until=null,updated_at=now();v_failed:=1;
    else
      v_failed:=v_attempt.failed_count+1;update private.awardee_verification_attempts set failed_count=v_failed,locked_until=case when v_failed>=5 then now()+interval '15 minutes' else null end,updated_at=now() where awardee_id=p_awardee_id;
    end if;
    return pg_catalog.jsonb_build_object('ok',false,'error',case when v_failed>=5 then 'temporarily_locked' else 'invalid_credentials' end);
  end if;
  delete from private.awardee_verification_attempts where awardee_id=p_awardee_id;
  delete from private.awardee_access_sessions where awardee_id=p_awardee_id and(expires_at<=now() or revoked_at is not null);
  v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into private.awardee_access_sessions(awardee_id,token_hash,expires_at) values(p_awardee_id,pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),v_expires);
  return pg_catalog.jsonb_build_object('ok',true,'token',v_token,'expires_at',v_expires,'awardee',pg_catalog.jsonb_build_object('id',v_awardee.id,'full_name',v_awardee.full_name,'campus',v_awardee.campus,'major',v_awardee.major,'cohort',v_awardee.cohort));
end;$$;

create or replace function private.revoke_awardee_access_internal(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin update private.awardee_access_sessions set revoked_at=now() where token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null;return found;end;$$;

create or replace function private.get_awardee_workspace_internal(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_awardee_id uuid;v_awardee public.awardees%rowtype;v_period public.assessment_periods%rowtype;v_modules jsonb;v_completed integer:=0;v_total integer:=0;
begin
  v_awardee_id:=private.awardee_from_token(p_token);if v_awardee_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_expired');end if;
  select * into v_awardee from public.awardees where id=v_awardee_id;
  select * into v_period from public.assessment_periods where active order by created_at desc limit 1;
  if not found then return pg_catalog.jsonb_build_object('ok',true,'awardee',pg_catalog.jsonb_build_object('id',v_awardee.id,'full_name',v_awardee.full_name,'campus',v_awardee.campus,'major',v_awardee.major,'cohort',v_awardee.cohort),'period',null,'modules','[]'::jsonb,'progress',pg_catalog.jsonb_build_object('completed',0,'total',0,'percent',0));end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',m.code,'title',m.title,'subtitle',m.subtitle,'prompt',m.prompt,'restricted',m.restricted,'sort_order',m.sort_order,'question_count',(select count(*) from public.assessment_questions q where q.module_id=m.id and q.active),'status',coalesce(s.status::text,'not_started'),'last_saved_at',s.last_saved_at,'completed_at',s.completed_at) order by m.sort_order),'[]'::jsonb),count(*)::integer,count(*) filter(where s.status='completed'::public.assessment_status)::integer into v_modules,v_total,v_completed
  from public.assessment_modules m join public.assessment_versions v on v.id=m.version_id left join public.assessment_sessions s on s.module_id=m.id and s.awardee_id=v_awardee_id and s.period_id=v_period.id where v.status='active' and m.active;
  return pg_catalog.jsonb_build_object('ok',true,'awardee',pg_catalog.jsonb_build_object('id',v_awardee.id,'full_name',v_awardee.full_name,'campus',v_awardee.campus,'major',v_awardee.major,'cohort',v_awardee.cohort),'period',pg_catalog.jsonb_build_object('id',v_period.id,'code',v_period.code,'name',v_period.name,'year',v_period.year,'semester',v_period.semester),'modules',v_modules,'progress',pg_catalog.jsonb_build_object('completed',v_completed,'total',v_total,'percent',case when v_total=0 then 0 else round((v_completed::numeric/v_total::numeric)*100) end));
end;$$;

create or replace function private.get_awardee_module_internal(p_token text,p_module_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_awardee_id uuid;v_period_id uuid;v_version_id uuid;v_module public.assessment_modules%rowtype;v_session public.assessment_sessions%rowtype;v_questions jsonb;
begin
  v_awardee_id:=private.awardee_from_token(p_token);if v_awardee_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_expired');end if;
  select id into v_period_id from public.assessment_periods where active order by created_at desc limit 1;if v_period_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','no_active_period');end if;
  select m.* into v_module from public.assessment_modules m join public.assessment_versions v on v.id=m.version_id where m.code=p_module_code and m.active and v.status='active' order by m.sort_order limit 1;
  if v_module.id is null then return pg_catalog.jsonb_build_object('ok',false,'error','module_not_found');end if;v_version_id:=v_module.version_id;
  insert into public.assessment_sessions(awardee_id,period_id,module_id,version_id,status,started_at,last_saved_at) values(v_awardee_id,v_period_id,v_module.id,v_version_id,'in_progress',now(),now())
  on conflict(awardee_id,period_id,module_id) do update set status=case when public.assessment_sessions.status='not_started'::public.assessment_status then 'in_progress'::public.assessment_status else public.assessment_sessions.status end,started_at=coalesce(public.assessment_sessions.started_at,now()) returning * into v_session;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',q.id,'code',q.code,'text',q.question_text,'sort_order',q.sort_order,'selected',coalesce(a.selected,false)) order by q.sort_order),'[]'::jsonb) into v_questions
  from public.assessment_questions q left join public.assessment_answers a on a.question_id=q.id and a.session_id=v_session.id where q.module_id=v_module.id and q.active;
  return pg_catalog.jsonb_build_object('ok',true,'module',pg_catalog.jsonb_build_object('code',v_module.code,'title',v_module.title,'subtitle',v_module.subtitle,'prompt',v_module.prompt,'restricted',v_module.restricted),'session',pg_catalog.jsonb_build_object('id',v_session.id,'status',v_session.status,'last_saved_at',v_session.last_saved_at,'completed_at',v_session.completed_at),'questions',v_questions);
end;$$;

create or replace function private.save_awardee_answers_internal(p_token text,p_module_code text,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_awardee_id uuid;v_period_id uuid;v_module_id uuid;v_session_id uuid;v_status public.assessment_status;v_saved integer:=0;
begin
  v_awardee_id:=private.awardee_from_token(p_token);if v_awardee_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_expired');end if;
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers)<>'array' or pg_catalog.jsonb_array_length(p_answers)>100 then return pg_catalog.jsonb_build_object('ok',false,'error','invalid_answers');end if;
  select id into v_period_id from public.assessment_periods where active order by created_at desc limit 1;
  select m.id into v_module_id from public.assessment_modules m join public.assessment_versions v on v.id=m.version_id where m.code=p_module_code and m.active and v.status='active' limit 1;
  select s.id,s.status into v_session_id,v_status from public.assessment_sessions s where s.awardee_id=v_awardee_id and s.period_id=v_period_id and s.module_id=v_module_id;
  if v_session_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_not_started');end if;
  if v_status='completed'::public.assessment_status or v_status='locked'::public.assessment_status then return pg_catalog.jsonb_build_object('ok',false,'error','module_locked');end if;
  with input as(select x.question_id,x.selected from pg_catalog.jsonb_to_recordset(p_answers) as x(question_id uuid,selected boolean)),valid as(select i.question_id,coalesce(i.selected,false) selected from input i join public.assessment_questions q on q.id=i.question_id where q.module_id=v_module_id and q.active),upserted as(insert into public.assessment_answers(session_id,question_id,selected,answered_at) select v_session_id,question_id,selected,now() from valid on conflict(session_id,question_id) do update set selected=excluded.selected,answered_at=now(),updated_at=now() returning 1) select count(*)::integer into v_saved from upserted;
  update public.assessment_sessions set status='in_progress',last_saved_at=now(),updated_at=now() where id=v_session_id;
  return pg_catalog.jsonb_build_object('ok',true,'saved',v_saved,'last_saved_at',now());
end;$$;

create or replace function private.complete_awardee_module_internal(p_token text,p_module_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_awardee_id uuid;v_period_id uuid;v_module_id uuid;v_session_id uuid;v_selected integer;v_status public.assessment_status;
begin
  v_awardee_id:=private.awardee_from_token(p_token);if v_awardee_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_expired');end if;
  select id into v_period_id from public.assessment_periods where active order by created_at desc limit 1;
  select m.id into v_module_id from public.assessment_modules m join public.assessment_versions v on v.id=m.version_id where m.code=p_module_code and m.active and v.status='active' limit 1;
  select id,status into v_session_id,v_status from public.assessment_sessions where awardee_id=v_awardee_id and period_id=v_period_id and module_id=v_module_id;
  if v_session_id is null then return pg_catalog.jsonb_build_object('ok',false,'error','session_not_started');end if;
  if v_status='completed'::public.assessment_status then return pg_catalog.jsonb_build_object('ok',true,'already_completed',true);end if;
  select count(*)::integer into v_selected from public.assessment_answers a join public.assessment_questions q on q.id=a.question_id where a.session_id=v_session_id and q.module_id=v_module_id and q.active and a.selected;
  if v_selected<3 then return pg_catalog.jsonb_build_object('ok',false,'error','minimum_selection','minimum',3,'selected',v_selected);end if;
  insert into public.assessment_answers(session_id,question_id,selected,answered_at) select v_session_id,q.id,false,now() from public.assessment_questions q where q.module_id=v_module_id and q.active and not exists(select 1 from public.assessment_answers a where a.session_id=v_session_id and a.question_id=q.id) on conflict(session_id,question_id) do nothing;
  update public.assessment_sessions set status='completed',completed_at=now(),last_saved_at=now(),updated_at=now() where id=v_session_id;
  return pg_catalog.jsonb_build_object('ok',true,'completed_at',now(),'selected',v_selected);
end;$$;

create or replace function private.set_awardee_last4_internal(p_awardee_id uuid,p_last4 text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if private.current_role()<>'superadmin'::public.app_role then raise exception 'not authorized';end if;
  if p_last4 is null or p_last4!~'^[0-9]{4}$' then raise exception 'last4 must be exactly 4 digits';end if;
  update public.awardees set phone_last4_hash=extensions.crypt(p_last4,extensions.gen_salt('bf',8)),updated_at=now() where id=p_awardee_id;return found;
end;$$;

grant usage on schema private to anon,authenticated;
revoke all on function private.awardee_from_token(text) from public,anon,authenticated;
revoke all on function private.list_awardees_for_access_internal() from public,anon,authenticated;
revoke all on function private.verify_awardee_access_internal(uuid,text) from public,anon,authenticated;
revoke all on function private.revoke_awardee_access_internal(text) from public,anon,authenticated;
revoke all on function private.get_awardee_workspace_internal(text) from public,anon,authenticated;
revoke all on function private.get_awardee_module_internal(text,text) from public,anon,authenticated;
revoke all on function private.save_awardee_answers_internal(text,text,jsonb) from public,anon,authenticated;
revoke all on function private.complete_awardee_module_internal(text,text) from public,anon,authenticated;
revoke all on function private.set_awardee_last4_internal(uuid,text) from public,anon,authenticated;
grant execute on function private.list_awardees_for_access_internal() to anon,authenticated;
grant execute on function private.verify_awardee_access_internal(uuid,text) to anon,authenticated;
grant execute on function private.revoke_awardee_access_internal(text) to anon,authenticated;
grant execute on function private.get_awardee_workspace_internal(text) to anon,authenticated;
grant execute on function private.get_awardee_module_internal(text,text) to anon,authenticated;
grant execute on function private.save_awardee_answers_internal(text,text,jsonb) to anon,authenticated;
grant execute on function private.complete_awardee_module_internal(text,text) to anon,authenticated;
grant execute on function private.set_awardee_last4_internal(uuid,text) to authenticated;

create or replace function public.list_awardees_for_access() returns table(awardee_id uuid,full_name text,campus text,cohort smallint) language sql stable security invoker set search_path='' as $$select * from private.list_awardees_for_access_internal();$$;
create or replace function public.verify_awardee_access(p_awardee_id uuid,p_last4 text) returns jsonb language sql volatile security invoker set search_path='' as $$select private.verify_awardee_access_internal(p_awardee_id,p_last4);$$;
create or replace function public.revoke_awardee_access(p_token text) returns boolean language sql volatile security invoker set search_path='' as $$select private.revoke_awardee_access_internal(p_token);$$;
create or replace function public.get_awardee_workspace(p_token text) returns jsonb language sql volatile security invoker set search_path='' as $$select private.get_awardee_workspace_internal(p_token);$$;
create or replace function public.get_awardee_module(p_token text,p_module_code text) returns jsonb language sql volatile security invoker set search_path='' as $$select private.get_awardee_module_internal(p_token,p_module_code);$$;
create or replace function public.save_awardee_answers(p_token text,p_module_code text,p_answers jsonb) returns jsonb language sql volatile security invoker set search_path='' as $$select private.save_awardee_answers_internal(p_token,p_module_code,p_answers);$$;
create or replace function public.complete_awardee_module(p_token text,p_module_code text) returns jsonb language sql volatile security invoker set search_path='' as $$select private.complete_awardee_module_internal(p_token,p_module_code);$$;
create or replace function public.set_awardee_last4(p_awardee_id uuid,p_last4 text) returns boolean language sql volatile security invoker set search_path='' as $$select private.set_awardee_last4_internal(p_awardee_id,p_last4);$$;

revoke all on function public.list_awardees_for_access() from public;
revoke all on function public.verify_awardee_access(uuid,text) from public;
revoke all on function public.revoke_awardee_access(text) from public;
revoke all on function public.get_awardee_workspace(text) from public;
revoke all on function public.get_awardee_module(text,text) from public;
revoke all on function public.save_awardee_answers(text,text,jsonb) from public;
revoke all on function public.complete_awardee_module(text,text) from public;
revoke all on function public.set_awardee_last4(uuid,text) from public;
grant execute on function public.list_awardees_for_access() to anon,authenticated;
grant execute on function public.verify_awardee_access(uuid,text) to anon,authenticated;
grant execute on function public.revoke_awardee_access(text) to anon,authenticated;
grant execute on function public.get_awardee_workspace(text) to anon,authenticated;
grant execute on function public.get_awardee_module(text,text) to anon,authenticated;
grant execute on function public.save_awardee_answers(text,text,jsonb) to anon,authenticated;
grant execute on function public.complete_awardee_module(text,text) to anon,authenticated;
grant execute on function public.set_awardee_last4(uuid,text) to authenticated;
