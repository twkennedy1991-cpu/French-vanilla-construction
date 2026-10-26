-- Existing row-level policies restrict submissions to new requests and reads to owner_accounts.
GRANT INSERT ON TABLE public.quote_requests TO anon, authenticated;
GRANT SELECT ON TABLE public.quote_requests TO authenticated;
