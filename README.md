# MedFed — Federated Learning Healthcare Prediction

A React dashboard for a federated-learning healthcare platform. This project was built with [Lovable](https://lovable.dev).

## Architecture (authoritative)

- **Frontend**: React 19 + TanStack Start (TanStack Router), TypeScript, Tailwind CSS, Recharts.
- **Backend**: Lovable Cloud (Supabase) — Postgres with Row Level Security, Supabase Auth, and
  server functions where needed. There is **no** Python/Django backend inside this repository.
- **Auth & roles**: Supabase Auth (email/password). Roles live in the `user_roles` table
  (`admin` | `hospital`) and are enforced with RLS via the `has_role()` security-definer function.
  The first account created becomes the admin; hospital accounts require admin approval.
- **Data**: `hospitals`, `patients`, `models`, `predictions`, `user_roles`.
- **Live updates**: any future notification or live-update feature uses **Supabase Realtime**
  subscriptions.

Not used anywhere in this project: Django, Django REST Framework, Django Channels, Celery, Redis,
Docker/Docker Compose, Nginx, drf-yasg/Swagger, `manage.py`. There is no auto-generated API
documentation page; if API docs are wanted they must be written manually as a normal page.

## External Python ML service

All machine learning — federated training, predictions, SHAP explainability, and the hash-chained
ledger — is computed by a **separate, externally deployed Python API**. This app never computes,
simulates, or fakes those values; it calls the service over HTTP and stores the returned results in
Supabase for history and display.

Endpoints consumed (`src/lib/api.ts`):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/train?rounds={n}&local_epochs=8` | Runs federated training, returns round-by-round history |
| POST | `/api/predict` | Returns risk percentage, risk level, recommended action, real SHAP values |
| GET | `/api/audit-trail` | Returns the real hash-chained ledger (`valid` flag + block list) |
| GET | `/api/feature-names` | Returns the 30 field names used to build the prediction form |

Training results are persisted to `models`; prediction results to `predictions`. The audit trail is
rendered directly from the service response — the `valid` status is shown prominently and each
block shows its actual (truncated) hash, previous hash, and round number.

### Configuration

Set the service base URL with the `VITE_FL_API_URL` environment variable (legacy
`VITE_ML_API_BASE_URL` is still read as a fallback). It can also be overridden per browser on the
in-app **Settings** page for testing.

## Development

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
