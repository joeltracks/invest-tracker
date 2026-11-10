-- Run as the database owner after applying the migration. Fixtures roll back.
begin;
insert into auth.users (id) values
  ('a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
do $$
declare
  owner_id uuid := auth.uid();
  item jsonb := '{"id":"test-holding","provider":"Fixture","name":"USD Bond","type":"Bond","principal":1000,"currency":"USD","annualRate":5,"startDate":"2026-01-01","maturityDate":null,"frequency":"annual","interestMode":"paid_out","yieldBasis":"gross","taxRate":0,"statementValue":null,"couponMonths":[]}';
  snapshot jsonb;
begin
  snapshot := public.yieldwise_write(owner_id,0,'create',jsonb_build_object('id','test-holding','investment',item,'exchangeRate',0));
  if snapshot->>'code' is distinct from '23514' or current_setting('response.status',true) is distinct from '400' then
    raise exception 'Invalid FX did not return a validation error';
  end if;
  if jsonb_array_length(public.yieldwise_portfolio(owner_id)->'items') <> 0 then raise exception 'Invalid write was not atomic'; end if;
  snapshot := public.yieldwise_write(owner_id,0,'create',jsonb_build_object('id','test-holding','investment',item,'exchangeRate',130));
  if (snapshot->>'version')::int is distinct from 1 or (snapshot #>> '{preferences,rates,USD}')::numeric is distinct from 130
     or snapshot #>> '{items,0,name}' is distinct from 'USD Bond' then raise exception 'Snapshot missing committed holding or FX'; end if;
  snapshot := public.yieldwise_write(owner_id,1,'event','{"id":"test-holding","event":{"id":"e1","kind":"withdrawal","amount":900,"date":"2026-03-01"}}');
  if (snapshot #>> '{items,0,events,0,amount}')::numeric is distinct from 900 then raise exception 'Ledger missing from snapshot'; end if;
  snapshot := public.yieldwise_write(owner_id,2,'event','{"id":"test-holding","event":{"id":"e2","kind":"withdrawal","amount":200,"date":"2026-02-01"}}');
  if snapshot->>'code' is distinct from 'P0001' or coalesce(snapshot->>'message','') not like '%principal%' then
    raise exception 'Backdated overdraft did not return a ledger error';
  end if;
  snapshot := public.yieldwise_write(owner_id,1,'delete','{"id":"test-holding"}');
  if snapshot->>'code' is distinct from '40001' or current_setting('response.status',true) is distinct from '409' then
    raise exception 'Stale write did not return a conflict';
  end if;
  snapshot := public.yieldwise_write(owner_id,2,'delete','{"id":"test-holding"}');
  if jsonb_array_length(snapshot->'items') <> 0 then raise exception 'Deleted holding visible'; end if;
  snapshot := public.yieldwise_write(owner_id,3,'restore','{"id":"test-holding"}');
  if jsonb_array_length(snapshot->'items') <> 1 or jsonb_array_length(snapshot #> '{items,0,events}') <> 1 then raise exception 'Undo lost the ledger'; end if;
end $$;

reset role;
do $$
begin
  if (select requests from yieldwise_private.request_limits
      where user_id='a1000000-0000-4000-8000-000000000001' and operation='portfolio_write') is distinct from 7 then
    raise exception 'Failed writes did not consume quota';
  end if;
  if (select requests from yieldwise_private.request_limits
      where user_id='a1000000-0000-4000-8000-000000000001' and operation='portfolio_read') is distinct from 1 then
    raise exception 'Saves consumed the read quota';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
do $$
begin
  if public.yieldwise_portfolio('a1000000-0000-4000-8000-000000000001') is not null
     or jsonb_array_length(public.yieldwise_portfolio(auth.uid())->'items') <> 0
     or exists(select 1 from yieldwise_private.investments)
  then raise exception 'Cross-account data leaked'; end if;
  begin
    perform public.yieldwise_write('a1000000-0000-4000-8000-000000000001',4,'delete','{"id":"test-holding"}');
    raise exception 'Cross-account mutation was accepted' using errcode='XX000';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values ('f3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','totp','verified',now(),now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
do $$
begin
  if public.yieldwise_portfolio(auth.uid()) is not null then raise exception 'MFA challenge was bypassed'; end if;
  begin
    perform public.yieldwise_write(auth.uid(),4,'delete','{"id":"test-holding"}');
    raise exception 'MFA write challenge was bypassed' using errcode='XX000';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
do $$ begin
  if jsonb_array_length(public.yieldwise_portfolio(auth.uid())->'items') is distinct from 1 then raise exception 'Verified MFA session was blocked'; end if;
end $$;

reset role;
do $$
declare
  actor uuid := 'a1000000-0000-4000-8000-000000000001';
begin
  for attempt in 1..5 loop
    if not public.yieldwise_limit_account_deletion(actor) then raise exception 'Deletion limit rejected a permitted attempt'; end if;
  end loop;
  if public.yieldwise_limit_account_deletion(actor) then raise exception 'Deletion limit allowed an extra attempt'; end if;
  if has_function_privilege('authenticated','public.yieldwise_limit_account_deletion(uuid)','execute')
     or has_function_privilege('anon','public.yieldwise_limit_account_deletion(uuid)','execute') then
    raise exception 'Client role can consume another user''s deletion limit';
  end if;
  update yieldwise_private.request_limits
  set requests = case operation when 'portfolio_write' then 60 else 120 end,
      minute_bucket = date_trunc('minute', statement_timestamp()) + interval '1 minute'
  where user_id=actor and operation in ('portfolio_read', 'portfolio_write');
end $$;
set local role authenticated;
do $$
begin
  perform public.yieldwise_write(auth.uid(),4,'delete','{"id":"test-holding"}');
  raise exception 'Portfolio write limit was bypassed';
exception when sqlstate 'PT429' then null;
end $$;
do $$
begin
  perform public.yieldwise_portfolio(auth.uid());
  raise exception 'Portfolio read limit was bypassed';
exception when sqlstate 'PT429' then null;
end $$;
reset role;
delete from auth.users where id='a1000000-0000-4000-8000-000000000001';
do $$
begin
  if exists(select 1 from yieldwise_private.investments where user_id='a1000000-0000-4000-8000-000000000001')
     or exists(select 1 from yieldwise_private.investment_events where user_id='a1000000-0000-4000-8000-000000000001')
     or exists(select 1 from yieldwise_private.fx_rates where user_id='a1000000-0000-4000-8000-000000000001')
     or exists(select 1 from yieldwise_private.request_limits where user_id='a1000000-0000-4000-8000-000000000001')
  then raise exception 'Account deletion did not cascade'; end if;
  if has_function_privilege('anon','public.yieldwise_portfolio(uuid)','execute')
     or has_function_privilege('anon','public.yieldwise_write(uuid,integer,text,jsonb)','execute')
  then raise exception 'Anonymous API access was granted'; end if;
end $$;
rollback;
select 'Portfolio transaction, isolation and deletion checks passed' as result;
