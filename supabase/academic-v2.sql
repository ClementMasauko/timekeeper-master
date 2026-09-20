-- TimeKeeper Master School Platform v2
-- Run once AFTER setup.sql and academic.sql.

create table if not exists public.timekeeper_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.timekeeper_profiles add column if not exists school_id uuid references public.timekeeper_schools(id);
alter table public.timekeeper_teacher_subjects add column if not exists school_id uuid references public.timekeeper_schools(id);
alter table public.timekeeper_mark_windows add column if not exists school_id uuid references public.timekeeper_schools(id);
alter table public.timekeeper_window_requests add column if not exists school_id uuid references public.timekeeper_schools(id);

create or replace function public.timekeeper_school_id()
returns uuid language sql stable security definer set search_path=public
as $$ select school_id from public.timekeeper_profiles where id=auth.uid() $$;

create or replace function public.timekeeper_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.timekeeper_profiles where id=auth.uid() and role='admin' and school_id is not null) $$;

create or replace function public.timekeeper_create_school(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.timekeeper_schools; code text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if exists(select 1 from public.timekeeper_profiles where id=auth.uid() and school_id is not null) then raise exception 'Account already belongs to a school'; end if;
 code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.timekeeper_schools(name,join_code,owner_id) values(trim(p_name),code,auth.uid()) returning * into s;
 insert into public.timekeeper_profiles(id,role,display_name,school_id)
 values(auth.uid(),'admin',coalesce(nullif(trim(p_name),''),'School')||' Administrator',s.id)
 on conflict(id) do update set role='admin',school_id=s.id;
 return jsonb_build_object('id',s.id,'name',s.name,'join_code',s.join_code);
end $$;

create or replace function public.timekeeper_join_school(p_code text,p_name text,p_role public.timekeeper_role,p_student_number text default null,p_class_group text default null)
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_role not in ('teacher','student') then raise exception 'Invalid requested role'; end if;
 select id into sid from public.timekeeper_schools where upper(join_code)=upper(trim(p_code));
 if sid is null then raise exception 'School code not found'; end if;
 insert into public.timekeeper_profiles(id,role,display_name,teacher_name,student_number,class_group,school_id)
 values(auth.uid(),'pending',trim(p_name),case when p_role='teacher' then trim(p_name) end,p_student_number,p_class_group,sid)
 on conflict(id) do update set role='pending',display_name=excluded.display_name,teacher_name=excluded.teacher_name,student_number=excluded.student_number,class_group=excluded.class_group,school_id=sid;
 if p_role='student' and p_student_number is not null then
  update public.timekeeper_students set user_id=auth.uid() where school_id=sid and lower(student_number)=lower(trim(p_student_number));
 end if;
end $$;

create table if not exists public.timekeeper_publications (
 id bigint generated always as identity primary key,
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 kind text not null check(kind in ('timetable','allocation','examination','invigilation')),
 title text not null,
 academic_year int not null,
 term text not null,
 status text not null default 'draft' check(status in ('draft','published','archived')),
 version int not null default 1,
 content jsonb not null default '{}'::jsonb,
 created_by uuid not null references auth.users(id),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.timekeeper_students (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 user_id uuid unique references auth.users(id) on delete set null,
 student_number text not null,
 display_name text not null,
 class_group text not null,
 active boolean not null default true,
 unique(school_id,student_number)
);

create table if not exists public.timekeeper_assessments (
 id bigint generated always as identity primary key,
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 title text not null,
 subject text not null,
 class_group text not null,
 out_of numeric(7,2) not null check(out_of>0),
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 reopened_until timestamptz,
 published boolean not null default false,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(closes_at>opens_at)
);

create table if not exists public.timekeeper_results (
 id bigint generated always as identity primary key,
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 assessment_id bigint not null references public.timekeeper_assessments(id) on delete cascade,
 student_id uuid not null references public.timekeeper_students(id) on delete cascade,
 teacher_id uuid not null references auth.users(id),
 score numeric(7,2) not null check(score>=0),
 submitted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(assessment_id,student_id)
);

create table if not exists public.timekeeper_result_audit (
 id bigint generated always as identity primary key,
 result_id bigint,
 school_id uuid not null,
 changed_by uuid not null,
 old_score numeric(7,2),
 new_score numeric(7,2),
 action text not null,
 changed_at timestamptz not null default now()
);

create table if not exists public.timekeeper_notifications (
 id bigint generated always as identity primary key,
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 recipient_id uuid references auth.users(id) on delete cascade,
 audience text not null default 'all' check(audience in ('all','teachers','students','admin')),
 title text not null,
 message text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.timekeeper_exams (
 id bigint generated always as identity primary key,
 school_id uuid not null references public.timekeeper_schools(id) on delete cascade,
 subject text not null,class_group text not null,exam_date date not null,start_time time not null,end_time time not null,
 room text not null default '',published boolean not null default false,created_by uuid not null references auth.users(id)
);
create table if not exists public.timekeeper_invigilation (
 id bigint generated always as identity primary key,
 exam_id bigint not null references public.timekeeper_exams(id) on delete cascade,
 teacher_id uuid not null references auth.users(id),
 status text not null default 'assigned' check(status in ('assigned','unavailable','replacement_requested')),
 replacement_teacher_id uuid references auth.users(id),unique(exam_id,teacher_id)
);

create or replace function public.timekeeper_can_edit_result(p_assessment bigint)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.timekeeper_assessments a join public.timekeeper_teacher_subjects x
 on x.teacher_id=auth.uid() and x.school_id=a.school_id and lower(x.subject)=lower(a.subject) and lower(x.class_group)=lower(a.class_group)
 where a.id=p_assessment and a.school_id=public.timekeeper_school_id()
 and now() between a.opens_at and greatest(a.closes_at,coalesce(a.reopened_until,a.closes_at))
 and not exists(select 1 from public.timekeeper_results r where r.assessment_id=a.id and r.teacher_id=auth.uid() and r.submitted_at is not null)
 );
$$;

create or replace function public.timekeeper_audit_result() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.timekeeper_result_audit(result_id,school_id,changed_by,old_score,new_score,action)
 values(new.id,new.school_id,auth.uid(),case when tg_op='UPDATE' then old.score end,new.score,lower(tg_op));
 new.updated_at=now(); return new;
end $$;

create or replace function public.timekeeper_submit_results(p_assessment_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.timekeeper_can_edit_result(p_assessment_id) then raise exception 'Assessment is locked or not allocated to you'; end if;
 update public.timekeeper_results set submitted_at=now(),updated_at=now() where assessment_id=p_assessment_id and teacher_id=auth.uid() and submitted_at is null;
end $$;

create or replace function public.timekeeper_reopen_assessment(p_assessment_id bigint,p_hours int default 24)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.timekeeper_is_admin() then raise exception 'Administrator access required'; end if;
 update public.timekeeper_assessments set reopened_until=now()+make_interval(hours=>greatest(1,least(p_hours,168))) where id=p_assessment_id and school_id=public.timekeeper_school_id();
 update public.timekeeper_results set submitted_at=null where assessment_id=p_assessment_id and school_id=public.timekeeper_school_id();
end $$;

create or replace function public.timekeeper_request_invigilation_replacement(p_exam_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.timekeeper_invigilation i set status='replacement_requested'
 where i.exam_id=p_exam_id and i.teacher_id=auth.uid()
 and exists(select 1 from public.timekeeper_exams e where e.id=i.exam_id and e.school_id=public.timekeeper_school_id());
 if not found then raise exception 'Invigilation duty not found'; end if;
end $$;
drop trigger if exists timekeeper_result_audit_trigger on public.timekeeper_results;
create trigger timekeeper_result_audit_trigger before insert or update on public.timekeeper_results for each row execute function public.timekeeper_audit_result();

alter table public.timekeeper_schools enable row level security;
alter table public.timekeeper_publications enable row level security;
alter table public.timekeeper_students enable row level security;
alter table public.timekeeper_assessments enable row level security;
alter table public.timekeeper_results enable row level security;
alter table public.timekeeper_result_audit enable row level security;
alter table public.timekeeper_notifications enable row level security;
alter table public.timekeeper_exams enable row level security;
alter table public.timekeeper_invigilation enable row level security;

drop policy if exists "profiles read self or admin" on public.timekeeper_profiles;
drop policy if exists "admins approve profiles" on public.timekeeper_profiles;
drop policy if exists "allocations read own or admin" on public.timekeeper_teacher_subjects;
drop policy if exists "admins manage allocations" on public.timekeeper_teacher_subjects;
create policy "profiles read school" on public.timekeeper_profiles for select to authenticated using(id=auth.uid() or (school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()));
create policy "admins approve school profiles" on public.timekeeper_profiles for update to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin());
create policy "allocations read school role" on public.timekeeper_teacher_subjects for select to authenticated using(school_id=public.timekeeper_school_id() and (teacher_id=auth.uid() or public.timekeeper_is_admin()));
create policy "admins manage school allocations" on public.timekeeper_teacher_subjects for all to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin());
drop policy if exists "teachers create own requests" on public.timekeeper_window_requests;
drop policy if exists "requests read own or admin" on public.timekeeper_window_requests;
drop policy if exists "admins decide requests" on public.timekeeper_window_requests;
create policy "teachers create school requests" on public.timekeeper_window_requests for insert to authenticated with check(teacher_id=auth.uid() and school_id=public.timekeeper_school_id());
create policy "school requests read" on public.timekeeper_window_requests for select to authenticated using(school_id=public.timekeeper_school_id() and (teacher_id=auth.uid() or public.timekeeper_is_admin()));
create policy "admins decide school requests" on public.timekeeper_window_requests for update to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin());

create policy "school members read school" on public.timekeeper_schools for select to authenticated using(id=public.timekeeper_school_id() or owner_id=auth.uid());
create policy "members read published content" on public.timekeeper_publications for select to authenticated using(school_id=public.timekeeper_school_id() and (status='published' or public.timekeeper_is_admin()));
create policy "admins manage publications" on public.timekeeper_publications for all to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin() and created_by=auth.uid());
create policy "school roster read" on public.timekeeper_students for select to authenticated using(school_id=public.timekeeper_school_id() and (public.timekeeper_is_admin() or user_id=auth.uid() or exists(select 1 from public.timekeeper_profiles p where p.id=auth.uid() and p.role='teacher')));
create policy "admins manage roster" on public.timekeeper_students for all to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin());
create policy "school assessments read" on public.timekeeper_assessments for select to authenticated using(school_id=public.timekeeper_school_id());
create policy "admins manage assessments" on public.timekeeper_assessments for all to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin() and created_by=auth.uid());
create policy "protected results read" on public.timekeeper_results for select to authenticated using(school_id=public.timekeeper_school_id() and (public.timekeeper_is_admin() or teacher_id=auth.uid() or exists(select 1 from public.timekeeper_students s where s.id=student_id and s.user_id=auth.uid() and exists(select 1 from public.timekeeper_assessments a where a.id=assessment_id and a.published))));
create policy "teachers insert results" on public.timekeeper_results for insert to authenticated with check(school_id=public.timekeeper_school_id() and teacher_id=auth.uid() and public.timekeeper_can_edit_result(assessment_id));
create policy "teachers update results" on public.timekeeper_results for update to authenticated using(teacher_id=auth.uid() and public.timekeeper_can_edit_result(assessment_id)) with check(teacher_id=auth.uid() and public.timekeeper_can_edit_result(assessment_id));
create policy "admins read audit" on public.timekeeper_result_audit for select to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin());
create policy "members read notifications" on public.timekeeper_notifications for select to authenticated using(school_id=public.timekeeper_school_id() and (recipient_id is null or recipient_id=auth.uid()) and (audience='all' or audience=(select case role when 'teacher' then 'teachers' when 'student' then 'students' else 'admin' end from public.timekeeper_profiles where id=auth.uid())));
create policy "admins send notifications" on public.timekeeper_notifications for insert to authenticated with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin() and created_by=auth.uid());
create policy "school exams read" on public.timekeeper_exams for select to authenticated using(school_id=public.timekeeper_school_id() and (published or public.timekeeper_is_admin()));
create policy "admins manage exams" on public.timekeeper_exams for all to authenticated using(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin()) with check(school_id=public.timekeeper_school_id() and public.timekeeper_is_admin() and created_by=auth.uid());
create policy "invigilation protected read" on public.timekeeper_invigilation for select to authenticated using(exists(select 1 from public.timekeeper_exams e where e.id=exam_id and e.school_id=public.timekeeper_school_id()) and (teacher_id=auth.uid() or public.timekeeper_is_admin()));
create policy "admins manage invigilation" on public.timekeeper_invigilation for all to authenticated using(public.timekeeper_is_admin() and exists(select 1 from public.timekeeper_exams e where e.id=exam_id and e.school_id=public.timekeeper_school_id())) with check(public.timekeeper_is_admin() and exists(select 1 from public.timekeeper_exams e where e.id=exam_id and e.school_id=public.timekeeper_school_id()));

grant select on public.timekeeper_schools,public.timekeeper_publications,public.timekeeper_students,public.timekeeper_assessments,public.timekeeper_results,public.timekeeper_result_audit,public.timekeeper_notifications,public.timekeeper_exams,public.timekeeper_invigilation to authenticated;
grant insert,update,delete on public.timekeeper_publications,public.timekeeper_students,public.timekeeper_assessments,public.timekeeper_exams,public.timekeeper_invigilation to authenticated;
grant insert,update on public.timekeeper_results to authenticated;
grant insert on public.timekeeper_notifications to authenticated;
grant execute on function public.timekeeper_create_school(text),public.timekeeper_join_school(text,text,public.timekeeper_role,text,text) to authenticated;
grant execute on function public.timekeeper_submit_results(bigint),public.timekeeper_reopen_assessment(bigint,int) to authenticated;
grant execute on function public.timekeeper_request_invigilation_replacement(bigint) to authenticated;
grant usage,select on all sequences in schema public to authenticated;
