GRANT INSERT, DELETE ON public.datasets TO authenticated;
GRANT INSERT, DELETE ON public.dataset_samples TO authenticated;
GRANT INSERT, UPDATE ON public.global_models TO authenticated;
GRANT INSERT ON public.training_rounds TO authenticated;
GRANT INSERT ON public.local_updates TO authenticated;
GRANT INSERT ON public.audit_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_events_seq_seq TO authenticated;
GRANT INSERT ON public.notifications TO authenticated;

CREATE POLICY "Approved hospitals create own datasets"
ON public.datasets
FOR INSERT
TO authenticated
WITH CHECK (
  hospital_id = public.current_hospital_id()
  AND EXISTS (
    SELECT 1 FROM public.hospitals h
    WHERE h.id = hospital_id
      AND h.owner_id = auth.uid()
      AND h.status = 'approved'::public.hospital_status
  )
);

CREATE POLICY "Approved hospitals delete own datasets"
ON public.datasets
FOR DELETE
TO authenticated
USING (hospital_id = public.current_hospital_id());

CREATE POLICY "Approved hospitals create own samples"
ON public.dataset_samples
FOR INSERT
TO authenticated
WITH CHECK (
  hospital_id = public.current_hospital_id()
  AND EXISTS (
    SELECT 1 FROM public.datasets d
    WHERE d.id = dataset_id
      AND d.hospital_id = public.current_hospital_id()
  )
);

CREATE POLICY "Approved hospitals delete own samples"
ON public.dataset_samples
FOR DELETE
TO authenticated
USING (hospital_id = public.current_hospital_id());

CREATE POLICY "Admins create global models"
ON public.global_models
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update global models"
ON public.global_models
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins create training rounds"
ON public.training_rounds
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins create local updates"
ON public.local_updates
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users append own audit events"
ON public.audit_events
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

CREATE POLICY "Admins create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));