-- Seed official SPORTIVRA subscription plans without inventing Paystack plan codes.
-- Checkout remains disabled until real provider_plan_refs and server Paystack keys are configured.

INSERT INTO public.subscription_plans (
  code,
  name,
  description,
  tier,
  billing_interval,
  amount_minor,
  currency,
  provider,
  provider_plan_refs,
  features,
  is_active,
  sort_order
)
VALUES
  (
    'free',
    'SPORTIVRA Free',
    'Live scores, match schedule reminders, personalised teams and sports, plus free streams and highlights.',
    'free',
    'none',
    0,
    NULL,
    NULL,
    '{}'::jsonb,
    '["Real-time live scores & final results","Personalised favourite sports & followed teams","Saved match kick-off reminders","Access to all free highlights & news"]'::jsonb,
    true,
    0
  ),
  (
    'premium_monthly',
    'Monthly Premium',
    'Flexible monthly access to licensed live sports broadcasts, premium highlights, and ad-free viewing.',
    'premium',
    'month',
    350000,
    'NGN',
    'paystack',
    '{}'::jsonb,
    '["Licensed live sports broadcasts","Premium highlights and additional premium content","Ad-free viewing where supported"]'::jsonb,
    true,
    1
  ),
  (
    'premium_yearly',
    'Yearly Premium',
    'Full annual SPORTIVRA Premium membership with 2 months free compared to monthly billing.',
    'premium',
    'year',
    3500000,
    'NGN',
    'paystack',
    '{}'::jsonb,
    '["Licensed live sports broadcasts","Premium highlights and additional premium content","Ad-free viewing where supported"]'::jsonb,
    true,
    2
  )
ON CONFLICT (code) DO NOTHING;
