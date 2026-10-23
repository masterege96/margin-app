-- Append-only audit log for financial records, and margin views.
-- Each audit row stores a SHA-256 hash of {table, action, row}; Phase 4 rolls these
-- hashes into a daily Merkle root anchored on-chain.

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,            -- no FK: history outlives deleted workspaces
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb,
  row_hash text not null check (row_hash ~ '^[0-9a-f]{64}$')
);
create index audit_log_workspace_at_idx on public.audit_log (workspace_id, at desc);
create index audit_log_record_idx on public.audit_log (record_id);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (workspace_id, table_name, record_id, action, actor, old_row, new_row, row_hash)
  values (
    (rec ->> 'workspace_id')::uuid,
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id')::uuid,
    lower(tg_op),
    (select auth.uid()),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    encode(sha256(convert_to(
      jsonb_build_object('table', tg_table_name, 'action', lower(tg_op), 'row', rec)::text, 'UTF8')), 'hex')
  );
  return null;
end;
$$;

create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row();
create trigger jobs_audit after insert or update or delete on public.jobs
  for each row execute function private.audit_row();
create trigger cost_entries_audit after insert or update or delete on public.cost_entries
  for each row execute function private.audit_row();
create trigger workspace_members_audit after insert or update or delete on public.workspace_members
  for each row execute function private.audit_row();

-- History is never rewritten, not even by the service role.
create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

alter table public.audit_log enable row level security;
create policy audit_log_member_read on public.audit_log for select to authenticated
  using (private.is_member(workspace_id));
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- Margin views (security_invoker: callers only see their own workspaces' rows) --

create view public.job_margins with (security_invoker = true) as
select
  j.id as job_id,
  j.workspace_id,
  j.client_id,
  c.code as client_code,
  j.title,
  j.status,
  j.job_date,
  j.revenue_micro,
  coalesce(sum(e.amount_micro) filter (where e.phase = 'confirmed'), 0)::bigint as confirmed_cost_micro,
  coalesce(sum(e.amount_micro) filter (where e.phase = 'estimated'), 0)::bigint as estimated_cost_micro,
  (j.revenue_micro - coalesce(sum(e.amount_micro) filter (where e.phase = 'confirmed'), 0))::bigint as contribution_micro,
  (j.revenue_micro - coalesce(sum(e.amount_micro), 0))::bigint as projected_contribution_micro,
  case when j.revenue_micro > 0 then
    round(100.0 * (j.revenue_micro - coalesce(sum(e.amount_micro) filter (where e.phase = 'confirmed'), 0)) / j.revenue_micro, 2)
  end as margin_pct,
  count(e.id) filter (where e.retry_of is not null) as retry_count
from public.jobs j
join public.clients c on c.id = j.client_id and c.workspace_id = j.workspace_id
left join public.cost_entries e on e.job_id = j.id and e.workspace_id = j.workspace_id
group by j.id, c.id;

create view public.client_margins with (security_invoker = true) as
select
  workspace_id,
  client_id,
  client_code,
  count(*) as job_count,
  sum(revenue_micro)::bigint as revenue_micro,
  sum(confirmed_cost_micro)::bigint as confirmed_cost_micro,
  sum(estimated_cost_micro)::bigint as estimated_cost_micro,
  sum(contribution_micro)::bigint as contribution_micro,
  case when sum(revenue_micro) > 0 then
    round(100.0 * sum(contribution_micro) / sum(revenue_micro), 2)
  end as margin_pct
from public.job_margins
group by workspace_id, client_id, client_code;

revoke all on public.job_margins, public.client_margins from anon;
