-- Run on the existing configured project. The test rolls back its fixture.
BEGIN;
SELECT set_config('test.owner_id', (SELECT user_id::text FROM public.owner_accounts LIMIT 1), true);
SET LOCAL ROLE anon;
INSERT INTO public.quote_requests (id,customer_name,customer_email,project_type,project_description)
VALUES ('bb60808b-13ea-48d7-bb3b-d05016861eba','Website access test','test@example.com','Custom Barn Door','Transactional fixture');
DO $$ BEGIN
  BEGIN
    PERFORM id FROM public.quote_requests;
    RAISE EXCEPTION 'Anonymous reads unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.quote_requests(customer_name,customer_email,project_type,status)
    VALUES('Test','test@example.com','Custom Barn Door','approved');
    RAISE EXCEPTION 'Visitor set approved status';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner_id'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.quote_requests WHERE id='bb60808b-13ea-48d7-bb3b-d05016861eba') THEN
    RAISE EXCEPTION 'Owner could not read request';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"bb60808b-13ea-48d7-bb3b-d05016861ebb","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.quote_requests) THEN
    RAISE EXCEPTION 'Non-owner read requests';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
