set local lock_timeout = '5s';

-- Keep the managed DDL event trigger, while removing its client grants.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
  if to_regclass('public.investments') is not null then
    create index if not exists yieldwise_legacy_investments_owner on public.investments(user_id);
  end if;
end $$;

create table yieldwise_private.request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('portfolio_write', 'account_delete')),
  minute_bucket timestamptz not null,
  requests integer not null check (requests > 0),
  primary key (user_id, operation)
);

alter table yieldwise_private.request_limits enable row level security;
revoke all on yieldwise_private.request_limits from public, anon, authenticated;

create function yieldwise_private.take_request_slot(actor uuid, operation_name text, maximum integer)
returns boolean language sql security definer set search_path = ''
as $$
  with accepted as (
    insert into yieldwise_private.request_limits as limits (user_id, operation, minute_bucket, requests)
    values (actor, operation_name, date_trunc('minute', statement_timestamp()), 1)
    on conflict (user_id, operation) do update set
      minute_bucket = greatest(limits.minute_bucket, excluded.minute_bucket),
      requests = case when limits.minute_bucket < excluded.minute_bucket then 1 else limits.requests + 1 end
    where limits.minute_bucket < excluded.minute_bucket or limits.requests < maximum
    returning 1
  )
  select exists (select 1 from accepted);
$$;
revoke execute on function yieldwise_private.take_request_slot(uuid,text,integer) from public, anon, authenticated;

-- The authenticated caller can consume only their own slot, via the unexposed schema.
create function yieldwise_private.take_portfolio_write_slot()
returns boolean language sql security definer set search_path = ''
as $$
  select case when yieldwise_private.session_allowed()
    then yieldwise_private.take_request_slot(auth.uid(), 'portfolio_write', 60)
    else false end;
$$;
revoke execute on function yieldwise_private.take_portfolio_write_slot() from public, anon, authenticated;
grant execute on function yieldwise_private.take_portfolio_write_slot() to authenticated;

alter function public.yieldwise_write(uuid,integer,text,jsonb) set schema yieldwise_private;
create function public.yieldwise_write(expected_user uuid, expected_version integer, action text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if expected_user is distinct from auth.uid() or not yieldwise_private.session_allowed() then
    raise insufficient_privilege using message = 'Sign in to change this portfolio.';
  end if;
  if not yieldwise_private.take_portfolio_write_slot() then
    raise sqlstate 'PT429' using message = 'Too many portfolio changes. Wait a minute and retry.';
  end if;
  return yieldwise_private.yieldwise_write(expected_user, expected_version, action, payload);
end;
$$;
revoke execute on function public.yieldwise_write(uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.yieldwise_write(uuid,integer,text,jsonb) to authenticated;

create function public.yieldwise_limit_account_deletion(actor uuid)
returns boolean language sql security definer set search_path = ''
as $$
  select yieldwise_private.take_request_slot(actor, 'account_delete', 5);
$$;
revoke execute on function public.yieldwise_limit_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.yieldwise_limit_account_deletion(uuid) to service_role;
