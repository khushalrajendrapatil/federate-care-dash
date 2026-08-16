# Fix downloaded-project backend access

## Goal
Make the downloaded MedFed project run locally with its normal backend URL and public key, without requiring the unavailable cloud administrator key for datasets, prediction, status, training, or audit pages.

## Changes
- Refactor the federated-learning server layer to use the authenticated caller supplied by the existing server-function middleware instead of a global administrator client.
- Add narrowly scoped database policies for the operations the app implements:
  - approved hospitals manage only their own datasets and samples;
  - admins run model training and write model/round/update records;
  - signed-in users create only their own predictions and audit events;
  - existing role-based read isolation remains intact.
- Keep Auth account management (list all auth users, password reset, deactivate) as a genuinely privileged feature and show a clear local-configuration message if its administrator credential is unavailable.
- Add a safe local setup template and README steps covering only the public project URL/key needed for the main application.
- Verify the signed-in local flow for datasets, prediction schema, audit trail, settings, and training access.

## Security details
- Identity and role are derived from the validated bearer token; no caller-supplied owner or role is trusted.
- Hospital writes remain restricted to `current_hospital_id()` and approved hospitals.
- Training writes require `has_role(auth.uid(), 'admin')`.
- The administrator credential is never moved to browser code or committed to the repository.
