insert into public.feature_flags(key, enabled, description)
values ('billing_checkout_enabled', false, 'Allow customers to start paid subscriptions through Paddle checkout')
on conflict (key) do nothing;
