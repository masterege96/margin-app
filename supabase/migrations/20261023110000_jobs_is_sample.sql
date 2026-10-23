-- Marks fictional sample jobs so they can be cleared without touching real records,
-- and so pilot progress counts real jobs only.
alter table public.jobs add column is_sample boolean not null default false;
create index jobs_workspace_sample_idx on public.jobs (workspace_id) where is_sample;
