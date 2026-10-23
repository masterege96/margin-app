# web

The JobMargin app: sign-in, workspaces, jobs, cost ledger and margins, talking straight to the
margin-app Supabase project. Row-level security in the database decides what each user can see.

## Run it

```powershell
cd web
npm install
npm run dev        # http://localhost:3000, real Supabase
```

Create an account on the sign-in screen. Supabase emails a confirmation link that opens
http://localhost:3000 (Supabase's default Site URL), then sign in and name your workspace.

To click around without an account or network, use the in-memory fake:

```powershell
npx vite --mode fake
```

## Test and build

```powershell
npm test           # unit tests, data layer, and parity checks against the real migrations
npm run build      # production bundle in web/dist
```

## Layout

| Path | What it does |
| --- | --- |
| `src/main.js` | Boot: session check, auth state changes |
| `src/app.js` | App shell, navigation, actions and form submits |
| `src/api.js` | Every Supabase read and write |
| `src/margins.js` | Margin math, same rules as the `job_margins` view |
| `src/format.js` | Exact money parsing (micro-dollars), formatting, CSV safety |
| `src/modals.js` | Job and cost forms, job drawer |
| `src/pages/` | Overview, Jobs, Cost ledger, Workspace & data |
| `src/auth.js` | Sign-in, sign-up, workspace setup screens |
| `tests/fake-supabase.js` | In-memory Supabase that enforces the schema's rules |

`src/supabase.js` holds the project URL and publishable key (override with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`). The publishable key is meant to be
public; never put the service-role key in a `VITE_` variable.
