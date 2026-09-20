-- Run once in the Supabase SQL editor. The bucket is private and every user
-- can access only the folder named with their own authenticated user id.
insert into storage.buckets (id,name,public)
values ('timekeeper-sync','timekeeper-sync',false)
on conflict (id) do update set public=false;

create policy "timekeeper users read own sync"
on storage.objects for select to authenticated
using (bucket_id='timekeeper-sync' and (storage.foldername(name))[1]=(select auth.uid()::text));

create policy "timekeeper users create own sync"
on storage.objects for insert to authenticated
with check (bucket_id='timekeeper-sync' and (storage.foldername(name))[1]=(select auth.uid()::text));

create policy "timekeeper users update own sync"
on storage.objects for update to authenticated
using (bucket_id='timekeeper-sync' and owner_id=(select auth.uid()::text))
with check (bucket_id='timekeeper-sync' and (storage.foldername(name))[1]=(select auth.uid()::text));

create policy "timekeeper users delete own sync"
on storage.objects for delete to authenticated
using (bucket_id='timekeeper-sync' and owner_id=(select auth.uid()::text));
