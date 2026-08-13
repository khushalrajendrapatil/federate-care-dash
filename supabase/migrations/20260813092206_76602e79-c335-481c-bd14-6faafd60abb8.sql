-- ============ DATASETS ============
CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'uci_wdbc_partition',
  feature_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.datasets TO authenticated;
GRANT ALL ON public.datasets TO service_role;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hospitals read own datasets" ON public.datasets FOR SELECT TO authenticated
  USING (hospital_id = public.current_hospital_id());
CREATE POLICY "Admins read all datasets" ON public.datasets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX datasets_hospital_idx ON public.datasets(hospital_id);

CREATE TABLE public.dataset_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  external_ref text,
  features double precision[] NOT NULL,
  label integer NOT NULL CHECK (label IN (0,1)),
  split text NOT NULL DEFAULT 'train' CHECK (split IN ('train','test')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dataset_samples TO authenticated;
GRANT ALL ON public.dataset_samples TO service_role;
ALTER TABLE public.dataset_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hospitals read own samples" ON public.dataset_samples FOR SELECT TO authenticated
  USING (hospital_id = public.current_hospital_id());
CREATE POLICY "Admins read all samples" ON public.dataset_samples FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX dataset_samples_dataset_idx ON public.dataset_samples(dataset_id);
CREATE INDEX dataset_samples_hospital_idx ON public.dataset_samples(hospital_id);

-- ============ GLOBAL MODELS ============
CREATE TABLE public.global_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  feature_names jsonb NOT NULL,
  weights double precision[] NOT NULL,
  bias double precision NOT NULL DEFAULT 0,
  feature_means double precision[] NOT NULL,
  feature_stds double precision[] NOT NULL,
  rounds_completed integer NOT NULL DEFAULT 0,
  participating_hospitals integer NOT NULL DEFAULT 0,
  training_samples integer NOT NULL DEFAULT 0,
  test_samples integer NOT NULL DEFAULT 0,
  dp_noise_multiplier double precision NOT NULL DEFAULT 0,
  dp_clip_norm double precision NOT NULL DEFAULT 0,
  secure_aggregation boolean NOT NULL DEFAULT true,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.global_models TO authenticated;
GRANT ALL ON public.global_models TO service_role;
ALTER TABLE public.global_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read models" ON public.global_models FOR SELECT TO authenticated USING (true);

CREATE TABLE public.training_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES public.global_models(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  round_number integer NOT NULL,
  global_accuracy double precision,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  participating_hospitals integer NOT NULL DEFAULT 0,
  weights_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_rounds TO authenticated;
GRANT ALL ON public.training_rounds TO service_role;
ALTER TABLE public.training_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read rounds" ON public.training_rounds FOR SELECT TO authenticated USING (true);
CREATE INDEX training_rounds_model_idx ON public.training_rounds(model_id);

CREATE TABLE public.local_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.training_rounds(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  sample_count integer NOT NULL,
  local_accuracy double precision,
  local_loss double precision,
  update_hash text NOT NULL,
  masked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.local_updates TO authenticated;
GRANT ALL ON public.local_updates TO service_role;
ALTER TABLE public.local_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hospitals read own updates" ON public.local_updates FOR SELECT TO authenticated
  USING (hospital_id = public.current_hospital_id());
CREATE POLICY "Admins read all updates" ON public.local_updates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX local_updates_round_idx ON public.local_updates(round_id);

-- ============ AUDIT LEDGER (hash-chained) ============
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL,
  actor_id uuid,
  actor_label text,
  hospital_id uuid,
  model_version text,
  round_number integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read ledger" ON public.audit_events FOR SELECT TO authenticated USING (true);
CREATE UNIQUE INDEX audit_events_seq_idx ON public.audit_events(seq);

CREATE OR REPLACE FUNCTION public.audit_block_payload(
  _seq bigint, _created_at timestamptz, _event_type text, _actor_id uuid,
  _hospital_id uuid, _model_version text, _round_number integer,
  _payload jsonb, _previous_hash text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _seq::text || '|' || to_char(_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
      || '|' || _event_type
      || '|' || COALESCE(_actor_id::text, '')
      || '|' || COALESCE(_hospital_id::text, '')
      || '|' || COALESCE(_model_version, '')
      || '|' || COALESCE(_round_number::text, '')
      || '|' || _payload::text
      || '|' || _previous_hash
$$;

CREATE OR REPLACE FUNCTION public.audit_events_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text;
BEGIN
  SELECT hash INTO prev FROM public.audit_events ORDER BY seq DESC LIMIT 1;
  NEW.previous_hash := COALESCE(prev, repeat('0', 64));
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.hash := encode(sha256(convert_to(public.audit_block_payload(
    NEW.seq, NEW.created_at, NEW.event_type, NEW.actor_id, NEW.hospital_id,
    NEW.model_version, NEW.round_number, NEW.payload, NEW.previous_hash), 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_chain_trg BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_chain();

CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events records are append-only';
END;
$$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

CREATE OR REPLACE FUNCTION public.verify_audit_chain()
RETURNS TABLE(total bigint, valid boolean, first_broken_seq bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  prev text := repeat('0', 64);
  expected text;
  broken bigint := NULL;
  cnt bigint := 0;
BEGIN
  FOR r IN SELECT * FROM public.audit_events ORDER BY seq ASC LOOP
    cnt := cnt + 1;
    expected := encode(sha256(convert_to(public.audit_block_payload(
      r.seq, r.created_at, r.event_type, r.actor_id, r.hospital_id,
      r.model_version, r.round_number, r.payload, prev), 'UTF8')), 'hex');
    IF broken IS NULL AND (r.previous_hash IS DISTINCT FROM prev OR r.hash IS DISTINCT FROM expected) THEN
      broken := r.seq;
    END IF;
    prev := r.hash;
  END LOOP;
  RETURN QUERY SELECT cnt, broken IS NULL, broken;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain() TO authenticated;

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  level text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============ PREDICTIONS EXTENSION ============
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS probability double precision,
  ADD COLUMN IF NOT EXISTS confidence double precision,
  ADD COLUMN IF NOT EXISTS predicted_label integer,
  ADD COLUMN IF NOT EXISTS input_features jsonb,
  ADD COLUMN IF NOT EXISTS explanation_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- ============ REMOVE LEGACY TABLE ============
DROP TABLE IF EXISTS public.models;