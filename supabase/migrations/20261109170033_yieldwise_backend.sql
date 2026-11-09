-- Keep data tables outside the Data API's exposed schemas.
create schema yieldwise_private;
revoke all on schema yieldwise_private from public, anon, authenticated;
grant usage on schema yieldwise_private to authenticated;

create table yieldwise_private.portfolio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_goal numeric not null default 0 check (monthly_goal between 0 and 1e15),
  version integer not null default 0 check (version >= 0)
);

create table yieldwise_private.investments (
  user_id uuid not null references yieldwise_private.portfolio_profiles(user_id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  provider text not null check (length(btrim(provider)) between 1 and 300),
  name text not null check (length(btrim(name)) between 1 and 300),
  type text not null check (type in ('MMF','Bond','Other')),
  principal numeric not null check (principal between 0.01 and 1e15),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  "annualRate" numeric not null check ("annualRate" between 0 and 1000),
  "startDate" date not null check (isfinite("startDate")),
  "maturityDate" date check (isfinite("maturityDate") and "maturityDate" >= "startDate"),
  frequency text not null check (frequency in ('daily','monthly','quarterly','semiannual','annual','at_maturity','unknown')),
  "interestMode" text not null check ("interestMode" in ('compound','paid_out','unknown')),
  "yieldBasis" text not null check ("yieldBasis" in ('gross','net')),
  "taxRate" numeric not null check ("taxRate" between 0 and 100),
  "statementValue" numeric check ("statementValue" between 0 and 1e15),
  "couponMonths" smallint[] not null check (cardinality("couponMonths") <= 12 and "couponMonths" <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  "createdAt" timestamptz not null default now() check (isfinite("createdAt")),
  status text not null default 'active' check (status in ('active','closed')),
  deleted_at timestamptz,
  primary key (user_id,id)
);
create index yieldwise_visible_holdings on yieldwise_private.investments (user_id,"createdAt" desc,id)
  where deleted_at is null;

create table yieldwise_private.investment_events (
  user_id uuid not null,
  investment_id text not null,
  id text not null check (length(id) between 1 and 128),
  sequence bigint generated always as identity,
  date date not null check (isfinite(date)),
  kind text not null check (kind in ('deposit','withdrawal','rate_change')),
  amount numeric,
  "annualRate" numeric,
  note text check (length(note) <= 1000),
  primary key (user_id,investment_id,id),
  foreign key (user_id,investment_id) references yieldwise_private.investments(user_id,id) on delete cascade,
  check (
    (kind in ('deposit','withdrawal') and amount is not null and amount between 0.01 and 1e15 and "annualRate" is null)
    or (kind = 'rate_change' and amount is null and "annualRate" is not null and "annualRate" between 0 and 1000)
  )
);
create index yieldwise_event_replay on yieldwise_private.investment_events (user_id,investment_id,date,sequence);

create table yieldwise_private.fx_rates (
  user_id uuid not null references yieldwise_private.portfolio_profiles(user_id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'KES'),
  kes_per_unit numeric not null check (kes_per_unit > 0 and kes_per_unit <= 1e15),
  updated_at timestamptz not null default now(),
  primary key (user_id,currency)
);

-- Authenticated grants are usable by the invoker RPCs. This schema must remain
-- outside PostgREST's exposed schemas, so clients cannot bypass the commands.
do $$
declare target text;
begin
  foreach target in array array['portfolio_profiles','investments','investment_events','fx_rates'] loop
    execute format('alter table yieldwise_private.%I enable row level security',target);
    execute format('create policy owned_rows on yieldwise_private.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',target);
  end loop;
end $$;
grant select,insert,update on yieldwise_private.portfolio_profiles,yieldwise_private.investments to authenticated;
grant select,insert on yieldwise_private.investment_events to authenticated;
grant select,insert,update,delete on yieldwise_private.fx_rates to authenticated;
grant usage on all sequences in schema yieldwise_private to authenticated;

-- Check current account existence and the verified factors on the server.
create function yieldwise_private.session_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from auth.users u where u.id=auth.uid())
    and (
      auth.jwt()->>'aal' = 'aal2'
      or not exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified')
    );
$$;

create function public.yieldwise_portfolio(expected_user uuid) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'version',coalesce((select p.version from yieldwise_private.portfolio_profiles p where p.user_id = (select auth.uid())),0),
    'preferences',jsonb_build_object(
      'baseCurrency','KES',
      'monthlyGoal',coalesce((select p.monthly_goal from yieldwise_private.portfolio_profiles p where p.user_id = (select auth.uid())),0),
      'rates',coalesce((select jsonb_object_agg(f.currency,f.kes_per_unit) from yieldwise_private.fx_rates f where f.user_id = (select auth.uid())),'{}'::jsonb)
    ),
    'items',coalesce((
      select jsonb_agg((to_jsonb(i) - 'user_id' - 'deleted_at') || jsonb_build_object('events',coalesce(e.events,'[]'::jsonb)) order by i."createdAt" desc,i.id)
      from yieldwise_private.investments i
      left join lateral (
        select jsonb_agg(jsonb_strip_nulls(to_jsonb(ev)-'user_id'-'investment_id'-'sequence') order by ev.sequence) as events
        from yieldwise_private.investment_events ev where (ev.user_id,ev.investment_id) = (i.user_id,i.id)
      ) e on true
      where i.user_id = (select auth.uid()) and i.deleted_at is null
    ),'[]'::jsonb)
  ) where expected_user = (select auth.uid()) and (select yieldwise_private.session_allowed());
$$;

create function yieldwise_private.validate_ledger(owner_id uuid, holding_id text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if exists (
    select 1 from yieldwise_private.investment_events e
    join yieldwise_private.investments i on (i.user_id,i.id) = (e.user_id,e.investment_id)
    where e.user_id = owner_id and e.investment_id = holding_id
      and (e.date < i."startDate" or e.date > i."maturityDate")
  ) then raise exception 'Event dates must fall within the investment term.'; end if;
  if exists (
    select 1 from (
      select i.principal + sum(case e.kind when 'deposit' then e.amount when 'withdrawal' then -e.amount else 0 end)
        over (order by e.date,e.sequence rows unbounded preceding) as balance
      from yieldwise_private.investment_events e
      join yieldwise_private.investments i on (i.user_id,i.id) = (e.user_id,e.investment_id)
      where e.user_id = owner_id and e.investment_id = holding_id
    ) balances where balance < 0 or balance > 1e15
  ) then raise exception 'A dated event would move principal outside the supported range.'; end if;
end;
$$;

create function yieldwise_private.insert_holding(owner_id uuid, holding jsonb) returns void
language sql security invoker set search_path = ''
as $$
  insert into yieldwise_private.investments
    (user_id,id,provider,name,type,principal,currency,"annualRate","startDate","maturityDate",frequency,
     "interestMode","yieldBasis","taxRate","statementValue","couponMonths","createdAt",status)
  select owner_id,h.id,h.provider,h.name,h.type,h.principal,h.currency,h."annualRate",h."startDate",
    h."maturityDate",h.frequency,h."interestMode",h."yieldBasis",h."taxRate",h."statementValue",
    h."couponMonths",coalesce(h."createdAt",now()),coalesce(h.status,'active')
  from jsonb_populate_record(null::yieldwise_private.investments,holding) h;
$$;

create function public.yieldwise_write(expected_user uuid, expected_version integer, action text, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  revision integer;
  holding_id text := payload->>'id';
  holding jsonb;
  event jsonb;
  settings jsonb;
  h yieldwise_private.investments;
begin
  if owner_id is distinct from expected_user or not coalesce(yieldwise_private.session_allowed(),false) then
    raise insufficient_privilege using message = 'Sign in to change this portfolio.';
  end if;
  if octet_length(payload::text) > 5242880 then raise exception 'Portfolio request exceeds 5 MB.'; end if;
  insert into yieldwise_private.portfolio_profiles(user_id) values(owner_id) on conflict do nothing;
  select version into revision from yieldwise_private.portfolio_profiles where user_id = owner_id for update;
  if revision is distinct from expected_version then
    raise sqlstate '40001' using message = 'Portfolio changed in another tab or device. Refresh and try again.';
  end if;

  if action = 'create' then
    if holding_id is null or holding_id is distinct from (payload->'investment'->>'id') then
      raise exception 'Invalid investment identifier.';
    end if;
    if (select count(*) from yieldwise_private.investments where user_id=owner_id) >= 10000 then
      raise exception 'Portfolio limit reached.';
    end if;
    perform yieldwise_private.insert_holding(owner_id,payload->'investment');
  elsif action = 'edit' then
    select * into h from jsonb_populate_record(null::yieldwise_private.investments,payload->'investment');
    update yieldwise_private.investments i set
      provider=h.provider,name=h.name,type=h.type,"maturityDate"=h."maturityDate",
      frequency=h.frequency,"interestMode"=h."interestMode","yieldBasis"=h."yieldBasis",
      "taxRate"=h."taxRate","statementValue"=h."statementValue","couponMonths"=h."couponMonths"
    where i.user_id=owner_id and i.id=holding_id and i.deleted_at is null;
    if not found then raise exception 'Investment not found.'; end if;
    perform yieldwise_private.validate_ledger(owner_id,holding_id);
  elsif action in ('delete','restore','close','reconcile') then
    update yieldwise_private.investments i set
      deleted_at=case action when 'delete' then now() when 'restore' then null else i.deleted_at end,
      status=case when action='close' then 'closed' else i.status end,
      "statementValue"=case when action='reconcile' then (payload->>'value')::numeric else i."statementValue" end
    where i.user_id=owner_id and i.id=holding_id
      and ((action='restore' and i.deleted_at is not null) or (action<>'restore' and i.deleted_at is null));
    if not found then raise exception 'Investment not found.'; end if;
  elsif action = 'event' then
    if not exists(select 1 from yieldwise_private.investments i where i.user_id=owner_id and i.id=holding_id and i.deleted_at is null and i.status='active') then
      raise exception 'Choose an open investment.';
    end if;
    if (select count(*) from yieldwise_private.investment_events e where e.user_id=owner_id and e.investment_id=holding_id) >= 10000 then
      raise exception 'Ledger limit reached.';
    end if;
    event := payload->'event';
    insert into yieldwise_private.investment_events(user_id,investment_id,id,date,kind,amount,"annualRate",note)
    values(owner_id,holding_id,event->>'id',(event->>'date')::date,event->>'kind',(event->>'amount')::numeric,(event->>'annualRate')::numeric,event->>'note');
    perform yieldwise_private.validate_ledger(owner_id,holding_id);
  elsif action = 'import' then
    if exists(select 1 from yieldwise_private.investments i where i.user_id=owner_id) then
      raise exception 'Import requires an empty cloud portfolio. Your backup is unchanged.';
    end if;
    if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') > 10000 then
      raise exception 'Invalid backup investment list.';
    end if;
    for holding in select value from jsonb_array_elements(payload->'items') loop
      perform yieldwise_private.insert_holding(owner_id,holding);
      if jsonb_typeof(holding->'events') is distinct from 'array' or jsonb_array_length(holding->'events') > 10000 then
        raise exception 'Invalid backup ledger.';
      end if;
      insert into yieldwise_private.investment_events(user_id,investment_id,id,date,kind,amount,"annualRate",note)
      select owner_id,holding->>'id',value->>'id',(value->>'date')::date,value->>'kind',
        (value->>'amount')::numeric,(value->>'annualRate')::numeric,value->>'note'
      from jsonb_array_elements(holding->'events') with ordinality order by ordinality;
      perform yieldwise_private.validate_ledger(owner_id,holding->>'id');
    end loop;
  elsif action <> 'preferences' or action is null then
    raise exception 'Unsupported portfolio operation.';
  end if;

  if action in ('create','edit') and payload ? 'exchangeRate' then
    insert into yieldwise_private.fx_rates(user_id,currency,kes_per_unit)
    select owner_id,i.currency,(payload->>'exchangeRate')::numeric
    from yieldwise_private.investments i where i.user_id=owner_id and i.id=holding_id and i.currency<>'KES'
    on conflict (user_id,currency) do update set kes_per_unit=excluded.kes_per_unit,updated_at=now();
  end if;
  if action = 'create' and exists (
    select 1 from yieldwise_private.investments i
    where i.user_id=owner_id and i.id=holding_id and i.currency <> 'KES'
      and not exists(select 1 from yieldwise_private.fx_rates f where f.user_id=owner_id and f.currency=i.currency)
  ) then raise exception 'Enter a KES conversion rate for this investment.'; end if;
  if action in ('preferences','import') and payload ? 'preferences' then
    settings := payload->'preferences';
    if settings->>'baseCurrency' is distinct from 'KES' or jsonb_typeof(settings->'rates') is distinct from 'object' then
      raise exception 'Preferences must use KES reporting.';
    end if;
    update yieldwise_private.portfolio_profiles set monthly_goal=(settings->>'monthlyGoal')::numeric where user_id=owner_id;
    delete from yieldwise_private.fx_rates where user_id=owner_id;
    insert into yieldwise_private.fx_rates(user_id,currency,kes_per_unit)
    select owner_id,key,value::numeric from jsonb_each_text(settings->'rates') where key<>'KES';
  end if;
  update yieldwise_private.portfolio_profiles set version=version+1 where user_id=owner_id;
  return public.yieldwise_portfolio(owner_id);
end;
$$;

revoke execute on all functions in schema yieldwise_private from public,anon,authenticated;
grant execute on function yieldwise_private.session_allowed(),yieldwise_private.validate_ledger(uuid,text),yieldwise_private.insert_holding(uuid,jsonb) to authenticated;
revoke execute on function public.yieldwise_portfolio(uuid),public.yieldwise_write(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.yieldwise_portfolio(uuid),public.yieldwise_write(uuid,integer,text,jsonb) to authenticated;
