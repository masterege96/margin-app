-- Fixes from the Supabase security and performance advisors (23 Oct 2026).

-- Cover the created_by foreign keys.
create index workspaces_created_by_idx on public.workspaces (created_by);
create index jobs_created_by_idx on public.jobs (created_by);
create index cost_entries_created_by_idx on public.cost_entries (created_by);
create index ingest_keys_created_by_idx on public.ingest_keys (created_by);

-- Platform-provided helper that the API exposed to signed-out and signed-in callers.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
