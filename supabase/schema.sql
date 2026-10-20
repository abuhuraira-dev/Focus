-- Run once in your Supabase SQL editor. No service-role key is needed by Focus.
create table if not exists public.workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;
drop policy if exists own_workspace on public.workspaces;
create policy own_workspace on public.workspaces for all to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create or replace function public.set_workspace_timestamp() returns trigger
 language plpgsql set search_path = public as $$
 begin new.updated_at = clock_timestamp(); return new; end;
$$;
drop trigger if exists workspace_timestamp on public.workspaces;
create trigger workspace_timestamp before update on public.workspaces
 for each row execute function public.set_workspace_timestamp();
