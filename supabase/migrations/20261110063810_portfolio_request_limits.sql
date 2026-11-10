set local lock_timeout = '5s';

alter table yieldwise_private.request_limits drop constraint request_limits_operation_check;
alter table yieldwise_private.request_limits add constraint request_limits_operation_check
  check (operation in ('portfolio_read', 'portfolio_write', 'account_delete'));

-- A save includes a snapshot and uses only the write budget.
alter function public.yieldwise_portfolio(uuid) set schema yieldwise_private;
do $$
declare
  definition text := pg_get_functiondef('yieldwise_private.yieldwise_write(uuid,integer,text,jsonb)'::regprocedure);
begin
  if strpos(definition, 'return public.yieldwise_portfolio(owner_id);') = 0 then
    raise exception 'Unexpected portfolio write definition; review the snapshot call before migrating.';
  end if;
  execute replace(definition, 'return public.yieldwise_portfolio(owner_id);',
    'return yieldwise_private.yieldwise_portfolio(owner_id);');
end $$;

create function yieldwise_private.take_portfolio_read_slot()
returns boolean language sql security definer set search_path = ''
as $$
  select case when yieldwise_private.session_allowed()
    then yieldwise_private.take_request_slot(auth.uid(), 'portfolio_read', 120)
    else false end;
$$;
revoke execute on function yieldwise_private.take_portfolio_read_slot() from public, anon, authenticated;
grant execute on function yieldwise_private.take_portfolio_read_slot() to authenticated;

create function public.yieldwise_portfolio(expected_user uuid) returns jsonb
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if expected_user is distinct from auth.uid() or not yieldwise_private.session_allowed() then
    return null;
  end if;
  if not yieldwise_private.take_portfolio_read_slot() then
    raise sqlstate 'PT429' using message = 'Too many portfolio reads. Wait a minute and retry.';
  end if;
  return yieldwise_private.yieldwise_portfolio(expected_user);
end;
$$;
revoke execute on function public.yieldwise_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.yieldwise_portfolio(uuid) to authenticated;

create or replace function public.yieldwise_write(expected_user uuid, expected_version integer, action text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  status text;
  message text;
begin
  if expected_user is distinct from auth.uid() or not yieldwise_private.session_allowed() then
    raise insufficient_privilege using message = 'Sign in to change this portfolio.';
  end if;
  if not yieldwise_private.take_portfolio_write_slot() then
    raise sqlstate 'PT429' using message = 'Too many portfolio changes. Wait a minute and retry.';
  end if;

  -- Roll back the mutation on error while committing the request counter.
  begin
    return yieldwise_private.yieldwise_write(expected_user, expected_version, action, payload);
  exception when others then
    status := case
      when sqlstate in ('40001', '23505') then '409'
      when sqlstate in ('23502', '23503', '23514', 'P0001') or left(sqlstate, 2) = '22' then '400'
      else '500'
    end;
    message := case
      when sqlstate = 'P0001' then sqlerrm
      when status = '409' then 'The portfolio changed or this record already exists.'
      when status = '400' then 'A portfolio value is outside the supported range.'
      else 'Could not save to the cloud.'
    end;
    if status = '500' then
      raise log 'yieldwise_write failed with SQLSTATE %', sqlstate;
    end if;
    perform set_config('response.status', status, true);
    return jsonb_build_object('code', sqlstate, 'message', message, 'details', null, 'hint', null);
  end;
end;
$$;

notify pgrst, 'reload schema';
