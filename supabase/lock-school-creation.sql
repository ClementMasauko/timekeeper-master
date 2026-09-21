-- Run once after the first legitimate school administrator has created the school.
-- UI hiding is not a security boundary: this blocks direct REST/RPC calls too.
revoke execute
on function public.timekeeper_create_school(text)
from public, anon, authenticated;
