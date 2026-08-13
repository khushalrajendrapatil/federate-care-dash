# MedFed — Federated Health AI

MedFed is a privacy-preserving healthcare prediction platform. Everything runs inside this
Lovable project: there is **no external Python service and no `localhost` dependency**.

## Architecture

```
Lovable app (TanStack Start + React)
├── Authentication ......... Lovable Cloud auth (email/password), roles in user_roles
├── Database ............... Postgres with row-level security on every table
├── Server functions ....... src/lib/fl.functions.ts  (typed RPC, auth-checked)
│   └── ML engine .......... src/lib/ml/fedlearn.server.ts (runs server-side only)
├── Federated learning ..... FedAvg over per-hospital dataset shards
├── Prediction + SHAP ...... logistic-regression scoring with exact linear Shapley values
├── Audit / hash ledger .... audit_events, SHA-256 chained, verify_audit_chain()
└── Dashboard .............. role-aware analytics
```

## Modules

- **Auth & roles** — the first account becomes admin; later accounts register a hospital that
  stays *pending* until an admin approves it.
- **Datasets** — each hospital imports a demo shard or uploads a CSV (30 numeric features +
  label). Rows are stored per hospital and protected by RLS.
- **Federated training (admin)** — the server initialises a global model, trains locally on each
  hospital's shard, clips and noises each update (differential privacy), masks updates pairwise
  (secure aggregation), averages them (FedAvg) and evaluates the global model on a held-out split.
  Round history, metrics and weights hashes are stored in `global_models` / `training_rounds`.
- **Prediction** — the active global model scores 30 standardised features and returns
  probability, risk level, confidence and SHAP contributions. Every prediction is stored.
- **Explainability** — exact Shapley values for the linear model (`weight × standardised value`).
  If no model is active, the UI says the explanation is unavailable rather than inventing one.
- **Audit trail** — sign-in/out, dataset changes, hospital approvals, training rounds,
  aggregation, model versions and predictions are appended to a SHA-256 hash chain; the Audit
  page re-verifies every record and reports the first broken sequence number if tampered with.
- **Settings** — read-only service, model, federated and privacy status. No API URL to enter.

## Database tables

`hospitals`, `user_roles`, `patients`, `datasets`, `dataset_samples`, `global_models`,
`training_rounds`, `local_updates`, `predictions`, `audit_events`, `notifications`.

## Notes

- The demo dataset is the public UCI Wisconsin Diagnostic Breast Cancer set — synthetic/demo use
  only. Never enter real patient information.
- The model is L2-regularised logistic regression, chosen because it trains deterministically in
  the serverless runtime and yields exact SHAP values. Deep models would need a GPU host.
