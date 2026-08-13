CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'audit_events records are append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.audit_block_payload(bigint, timestamptz, text, uuid, uuid, text, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_events_chain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_events_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_audit_chain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain() TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_hospital_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;