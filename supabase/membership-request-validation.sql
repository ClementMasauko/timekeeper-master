-- Run once to improve membership validation on an existing deployment.
create or replace function public.timekeeper_join_school(p_code text,p_name text,p_role public.timekeeper_role,p_student_number text default null,p_class_group text default null)
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; existing public.timekeeper_profiles%rowtype;
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
 insert into public.timekeeper_profiles(id,role,display_name,teacher_name,student_number,class_group,school_id)
 values(auth.uid(),'pending',trim(p_name),case when p_role='teacher' then trim(p_name) end,p_student_number,p_class_group,sid)
 on conflict(id) do update set role='pending',display_name=excluded.display_name,teacher_name=excluded.teacher_name,student_number=excluded.student_number,class_group=excluded.class_group,school_id=sid;
 if p_role='student' and p_student_number is not null then
  update public.timekeeper_students set user_id=auth.uid() where school_id=sid and lower(student_number)=lower(trim(p_student_number));
 end if;
end $$;

grant execute on function public.timekeeper_join_school(text,text,public.timekeeper_role,text,text) to authenticated;
