CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_exists boolean;
  is_admin boolean;
  h_name text;
  h_location text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  is_admin := NOT admin_exists;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_admin THEN 'admin'::public.app_role ELSE 'hospital'::public.app_role END)
  ON CONFLICT DO NOTHING;

  h_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'hospital_name', '')), '');
  h_location := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'hospital_location', '')), '');

  IF h_name IS NOT NULL AND h_location IS NOT NULL THEN
    INSERT INTO public.hospitals (owner_id, name, email, location, status)
    VALUES (
      NEW.id,
      h_name,
      COALESCE(NEW.email, ''),
      h_location,
      CASE WHEN is_admin THEN 'approved'::public.hospital_status ELSE 'pending'::public.hospital_status END
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;