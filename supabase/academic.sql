-- TimeKeeper Master academic roles and protected marks.
-- Run after setup.sql in the Supabase SQL editor.

create type public.timekeeper_role as enum ('pending','teacher','student','admin');

create table if not exists public.timekeeper_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.timekeeper_role not null default 'pending',
  display_name text not null default '',
  teacher_name text,
  student_number text unique,
  class_group text,
  created_at timestamptz not null default now()
);

create table if not exists public.timekeeper_teacher_subjects (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.timekeeper_profiles(id) on delete cascade,
  subject text not null,
  class_group text not null,
  unique (teacher_id, subject, class_group)
);

create table if not exists public.timekeeper_mark_windows (
  id bigint generated always as identity primary key,
  subject text not null,
  class_group text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reopened_until timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists public.timekeeper_marks (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.timekeeper_profiles(id) on delete cascade,
  subject text not null,
  class_group text not null,
  assessment text not null,
  score numeric(7,2) not null check (score >= 0),
  out_of numeric(7,2) not null check (out_of > 0 and score <= out_of),
  teacher_id uuid not null references public.timekeeper_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,subject,class_group,assessment)
);

create table if not exists public.timekeeper_window_requests (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.timekeeper_profiles(id),
  subject text not null,
  class_group text not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  requested_until timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.timekeeper_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.timekeeper_profiles where id=auth.uid() and role='admin') $$;

create or replace function public.timekeeper_can_mark(p_subject text,p_class text)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
   select 1 from public.timekeeper_teacher_subjects a
   where a.teacher_id=auth.uid() and lower(a.subject)=lower(p_subject) and lower(a.class_group)=lower(p_class)
 ) and exists(
   select 1 from public.timekeeper_mark_windows w
   where lower(w.subject)=lower(p_subject) and lower(w.class_group)=lower(p_class)
   and now() between w.opens_at and greatest(w.closes_at,coalesce(w.reopened_until,w.closes_at))
 );
$$;

alter table public.timekeeper_profiles enable row level security;
alter table public.timekeeper_teacher_subjects enable row level security;
alter table public.timekeeper_mark_windows enable row level security;
alter table public.timekeeper_marks enable row level security;
alter table public.timekeeper_window_requests enable row level security;

create policy "profiles read self or admin" on public.timekeeper_profiles for select to authenticated
using(id=auth.uid() or public.timekeeper_is_admin());
create policy "profiles create self pending" on public.timekeeper_profiles for insert to authenticated
with check(id=auth.uid() and role='pending');
create policy "admins approve profiles" on public.timekeeper_profiles for update to authenticated
using(public.timekeeper_is_admin()) with check(public.timekeeper_is_admin());

create policy "allocations read own or admin" on public.timekeeper_teacher_subjects for select to authenticated
using(teacher_id=auth.uid() or public.timekeeper_is_admin());
create policy "admins manage allocations" on public.timekeeper_teacher_subjects for all to authenticated
using(public.timekeeper_is_admin()) with check(public.timekeeper_is_admin());

create policy "windows authenticated read" on public.timekeeper_mark_windows for select to authenticated using(true);
create policy "admins create windows" on public.timekeeper_mark_windows for insert to authenticated
with check(public.timekeeper_is_admin() and created_by=auth.uid());
create policy "admins update windows" on public.timekeeper_mark_windows for update to authenticated
using(public.timekeeper_is_admin()) with check(public.timekeeper_is_admin());
create policy "admins delete windows" on public.timekeeper_mark_windows for delete to authenticated
using(public.timekeeper_is_admin());

create policy "marks protected read" on public.timekeeper_marks for select to authenticated
using(
 public.timekeeper_is_admin()
 or student_id=auth.uid()
 or (teacher_id=auth.uid() and exists(
   select 1 from public.timekeeper_teacher_subjects a where a.teacher_id=auth.uid()
   and lower(a.subject)=lower(timekeeper_marks.subject) and lower(a.class_group)=lower(timekeeper_marks.class_group)
 ))
);
create policy "teachers insert marks during window" on public.timekeeper_marks for insert to authenticated
with check(teacher_id=auth.uid() and public.timekeeper_can_mark(subject,class_group));
create policy "teachers update marks during window" on public.timekeeper_marks for update to authenticated
using(teacher_id=auth.uid() and public.timekeeper_can_mark(subject,class_group))
with check(teacher_id=auth.uid() and public.timekeeper_can_mark(subject,class_group));
-- No DELETE policy and no admin INSERT/UPDATE policy: administrators cannot alter marks.

create policy "teachers create own requests" on public.timekeeper_window_requests for insert to authenticated
with check(teacher_id=auth.uid());
create policy "requests read own or admin" on public.timekeeper_window_requests for select to authenticated
using(teacher_id=auth.uid() or public.timekeeper_is_admin());
create policy "admins decide requests" on public.timekeeper_window_requests for update to authenticated
using(public.timekeeper_is_admin()) with check(public.timekeeper_is_admin());

grant select,insert,update on public.timekeeper_profiles to authenticated;
grant select,insert,update,delete on public.timekeeper_teacher_subjects to authenticated;
grant select,insert,update,delete on public.timekeeper_mark_windows to authenticated;
grant select,insert,update on public.timekeeper_marks to authenticated;
grant select,insert,update on public.timekeeper_window_requests to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- After your own account is created, bootstrap it once as administrator:
-- insert into public.timekeeper_profiles(id,role,display_name)
-- select id,'admin','School Administrator' from auth.users where email='YOUR_ADMIN_EMAIL'
-- on conflict(id) do update set role='admin';
