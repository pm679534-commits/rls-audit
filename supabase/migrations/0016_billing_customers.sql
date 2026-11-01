create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paddle_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from public, anon, authenticated;
grant all on public.billing_customers to service_role;
grant select on public.billing_customers to authenticated;

drop policy if exists billing_customers_read on public.billing_customers;
create policy billing_customers_read on public.billing_customers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop trigger if exists set_updated_at on public.billing_customers;
create trigger set_updated_at before update on public.billing_customers
  for each row execute function public.set_updated_at();

-- Existing subscriptions can have duplicate customer IDs. Do not assign an
-- ambiguous ID to either account; the application rejects it on use.
insert into public.billing_customers (user_id, paddle_customer_id)
select (array_agg(owner_id))[1], paddle_customer_id
from public.subscriptions
where paddle_customer_id is not null
group by paddle_customer_id
having count(distinct owner_id) = 1
on conflict do nothing;