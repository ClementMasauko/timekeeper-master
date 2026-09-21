-- Run after academic-v2.sql. Exact unique matches are approved automatically;
-- partial or ambiguous teacher names remain pending for administrator review.
drop function if exists public.timekeeper_join_school(text,text,public.timekeeper_role,text,text);

create function public.timekeeper_join_school(p_code text,p_name text,p_role public.timekeeper_role,p_student_number text default null,p_class_group text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
 sid uuid; existing public.timekeeper_profiles%rowtype; approved_role public.timekeeper_role := 'pending';
 exact_count int := 0; partial_count int := 0; roster_count int := 0; matched_teacher text; suggested_teacher text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Your full name is required'; end if;
 if p_role not in ('teacher','student') then raise exception 'Invalid requested role'; end if;
 select id into sid from public.timekeeper_schools where upper(join_code)=upper(trim(p_code));
 if sid is null then raise exception 'School code not found'; end if;
 select * into existing from public.timekeeper_profiles where id=auth.uid();
 if existing.school_id is not null then
  if existing.school_id<>sid then raise exception 'This user already belongs to another school'; end if;
  if existing.role='pending' then raise exception 'Membership request already awaiting administrator approval'; end if;
  raise exception 'User already exists and is approved';
 end if;
 if p_role='teacher' then
  with latest as (select content from public.timekeeper_publications where school_id=sid and status='published' and jsonb_typeof(content->'allocations')='array' order by published_at desc nulls last,id desc limit 1),
  names as (select distinct trim(a->>'teacher') teacher from latest cross join lateral jsonb_array_elements(content->'allocations') a where nullif(trim(a->>'teacher'),'') is not null)
  select count(*),min(teacher) into exact_count,matched_teacher from names where regexp_replace(regexp_replace(lower(teacher),'^(mr|mrs|miss|ms)[.]?[[:space:]]+','','i'),'[^a-z0-9]+','','g')=regexp_replace(regexp_replace(lower(trim(p_name)),'^(mr|mrs|miss|ms)[.]?[[:space:]]+','','i'),'[^a-z0-9]+','','g');
  if exact_count=1 then approved_role:='teacher'; else
   with latest as (select content from public.timekeeper_publications where school_id=sid and status='published' and jsonb_typeof(content->'allocations')='array' order by published_at desc nulls last,id desc limit 1),
   names as (select distinct trim(a->>'teacher') teacher from latest cross join lateral jsonb_array_elements(content->'allocations') a where nullif(trim(a->>'teacher'),'') is not null)
   select count(*),min(teacher) into partial_count,suggested_teacher from names where lower(teacher) like '%'||lower(trim(p_name))||'%' or lower(trim(p_name)) like '%'||lower(teacher)||'%';
  end if;
 else
  select count(*) into roster_count from public.timekeeper_students where school_id=sid and active and lower(student_number)=lower(trim(coalesce(p_student_number,''))) and regexp_replace(lower(display_name),'[^a-z0-9]+','','g')=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','','g');
  if roster_count=1 then approved_role:='student'; end if;
 end if;
 insert into public.timekeeper_profiles(id,role,display_name,teacher_name,student_number,class_group,school_id)
 values(auth.uid(),approved_role,trim(p_name),case when p_role='teacher' then coalesce(matched_teacher,case when partial_count=1 then suggested_teacher else trim(p_name) end) end,p_student_number,p_class_group,sid)
 on conflict(id) do update set role=excluded.role,display_name=excluded.display_name,teacher_name=excluded.teacher_name,student_number=excluded.student_number,class_group=excluded.class_group,school_id=sid;
 if approved_role='student' then
  update public.timekeeper_students set user_id=auth.uid() where school_id=sid and lower(student_number)=lower(trim(p_student_number));
 elsif approved_role='teacher' then
  insert into public.timekeeper_teacher_subjects(teacher_id,subject,class_group,school_id)
  select distinct auth.uid(),trim(a->>'subject'),coalesce(nullif(trim(a->>'classGroup'),''),'All classes'),sid from public.timekeeper_publications p cross join lateral jsonb_array_elements(p.content->'allocations') a
  where p.id=(select id from public.timekeeper_publications where school_id=sid and status='published' and jsonb_typeof(content->'allocations')='array' order by published_at desc nulls last,id desc limit 1)
   and regexp_replace(regexp_replace(lower(a->>'teacher'),'^(mr|mrs|miss|ms)[.]?[[:space:]]+','','i'),'[^a-z0-9]+','','g')=regexp_replace(regexp_replace(lower(matched_teacher),'^(mr|mrs|miss|ms)[.]?[[:space:]]+','','i'),'[^a-z0-9]+','','g')
  on conflict(teacher_id,subject,class_group) do nothing;
 end if;
end $$;
grant execute on function public.timekeeper_join_school(text,text,public.timekeeper_role,text,text) to authenticated;
