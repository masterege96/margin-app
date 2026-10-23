-- Workspace isolation, margin math and ledger rules.
-- Creates two throwaway users, rebuilds demo job 106, then always raises an exception
-- so every change is rolled back. Expected result: "ALL CHECKS PASSED ...".
do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  wa uuid; wb uuid; ca uuid; ja uuid; c1 uuid;
  n int; r record; audit_n int; failures text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a@jobmargin.test', '', '{}', '{}', now(), now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b@jobmargin.test', '', '{}', '{}', now(), now());

  -- User A rebuilds demo job 106
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.workspaces (name) values ('Agency A') returning id into wa;
  insert into public.clients (workspace_id, code) values (wa, 'CLIENT-009') returning id into ca;
  insert into public.jobs (workspace_id, client_id, title, revenue_micro, status)
    values (wa, ca, 'Deep research and synthesis', 300000000, 'review') returning id into ja;
  insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label)
    values (wa, ja, 'ai', 201100000, 'Original research calls') returning id into c1;
  insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label, retry_of)
    values (wa, ja, 'ai', 74600000, 'Retry after failed run', c1);
  insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label, minutes, hourly_rate_micro)
    values (wa, ja, 'review', 52500000, 'QA and redraft', 90, 35000000);
  insert into public.cost_entries (workspace_id, job_id, kind, phase, amount_micro, label)
    values (wa, ja, 'ai', 'estimated', 25000000, 'Pending rerun estimate');

  select * into r from public.job_margins where job_id = ja;
  if r.confirmed_cost_micro <> 328200000 then failures := failures || ' confirmed=' || r.confirmed_cost_micro; end if;
  if r.estimated_cost_micro <> 25000000 then failures := failures || ' estimated=' || r.estimated_cost_micro; end if;
  if r.contribution_micro <> -28200000 then failures := failures || ' contribution=' || r.contribution_micro; end if;
  if r.projected_contribution_micro <> -53200000 then failures := failures || ' projected=' || r.projected_contribution_micro; end if;
  if r.margin_pct <> -9.40 then failures := failures || ' margin=' || r.margin_pct; end if;
  if r.retry_count <> 1 then failures := failures || ' retries=' || r.retry_count; end if;
  select count(*) into audit_n from public.audit_log where workspace_id = wa;
  if audit_n < 7 then failures := failures || ' audit_rows=' || audit_n; end if;
  select count(*) into n from public.workspace_members where workspace_id = wa and user_id = ua and role = 'owner';
  if n <> 1 then failures := failures || ' owner_not_added'; end if;

  -- A cannot rewrite history
  begin
    update public.audit_log set action = 'insert' where workspace_id = wa;
    failures := failures || ' A_updated_audit';
  exception when insufficient_privilege then null;
  end;

  -- User B: own workspace, sees and touches nothing of A's
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.workspaces (name) values ('Agency B') returning id into wb;
  select count(*) into n from public.workspaces; if n <> 1 then failures := failures || ' B_sees_workspaces=' || n; end if;
  select count(*) into n from public.clients; if n <> 0 then failures := failures || ' B_sees_clients'; end if;
  select count(*) into n from public.jobs; if n <> 0 then failures := failures || ' B_sees_jobs'; end if;
  select count(*) into n from public.cost_entries; if n <> 0 then failures := failures || ' B_sees_costs'; end if;
  select count(*) into n from public.job_margins; if n <> 0 then failures := failures || ' B_sees_margins'; end if;
  select count(*) into n from public.audit_log where workspace_id = wa; if n <> 0 then failures := failures || ' B_sees_audit'; end if;
  select count(*) into n from public.workspace_members where workspace_id = wa; if n <> 0 then failures := failures || ' B_sees_members'; end if;

  update public.jobs set revenue_micro = 0 where id = ja;
  get diagnostics n = row_count; if n <> 0 then failures := failures || ' B_updated_A_job'; end if;
  delete from public.cost_entries where workspace_id = wa;
  get diagnostics n = row_count; if n <> 0 then failures := failures || ' B_deleted_A_costs'; end if;

  begin
    insert into public.clients (workspace_id, code) values (wa, 'INTRUDER');
    failures := failures || ' B_wrote_A_client';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.workspace_members (workspace_id, user_id, role) values (wa, ub, 'admin');
    failures := failures || ' B_joined_A';
  exception when insufficient_privilege then null;
  end;
  begin
    -- B's own workspace pointing a cost at A's job must fail the composite foreign key
    insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label) values (wb, ja, 'api', 1, 'cross link');
    failures := failures || ' B_linked_A_job';
  exception when foreign_key_violation then null;
  end;

  -- Signed-out visitor
  reset role;
  set local role anon;
  begin
    perform 1 from public.jobs limit 1;
    failures := failures || ' anon_read_jobs';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Ledger rules
  begin
    insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label) values (wa, ja, 'api', -1, 'negative');
    failures := failures || ' negative_cost_allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label, event_ref) values (wa, ja, 'ai', 1, 'evt', 'req_1');
    insert into public.cost_entries (workspace_id, job_id, kind, amount_micro, label, event_ref) values (wa, ja, 'ai', 1, 'evt', 'req_1');
    failures := failures || ' duplicate_event_allowed';
  exception when unique_violation then null;
  end;
  begin
    -- even the database owner cannot edit history
    update public.audit_log set action = 'insert' where workspace_id = wa;
    failures := failures || ' owner_updated_audit';
  exception when raise_exception then null;
  end;

  if failures = '' then
    raise exception 'ALL CHECKS PASSED (margin % %%, contribution %, audit rows %) -- rolled back', r.margin_pct, r.contribution_micro, audit_n;
  else
    raise exception 'FAILURES:%', failures;
  end if;
end $$;
