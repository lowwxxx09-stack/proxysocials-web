-- ProxySocials: make the wallet-credit RPC provider-neutral.
-- Run this in Supabase SQL Editor BEFORE using the new Flutterwave wallet route.
--
-- The existing function in your project was called:
--   public.credit_wallet_from_paystack(uuid, text, numeric, text)
--
-- This keeps the same implementation/return shape and only changes its name.
ALTER FUNCTION public.credit_wallet_from_paystack(
  uuid,
  text,
  numeric,
  text
) RENAME TO credit_wallet_from_payment;
