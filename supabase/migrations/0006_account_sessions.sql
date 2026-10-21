-- Expose only the current user's session timestamps; auth.sessions is never client-readable.
create function public.list_my_sessions()
returns table(session_id uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at, s.updated_at
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by s.updated_at desc
  limit 50;
$$;
revoke all on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
