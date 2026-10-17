# FFT API and MCP server

For every account (all accounts keep their data online, DECISIONS 47). Code: `server/api.js` (api service),
tokens: migration `20261016100000_api_tokens.sql`, app page Settings → API & MCP.

- Base: `https://fft-api.up.railway.app`
- Auth: `Authorization: Bearer fft_…` (a personal token made in the app; shown once, only its
  SHA-256 is stored; revoke it in the app). Every request runs as the token's user with row level
  security, like the app.
- Permission (DECISIONS 59): each token and each connected AI app is **read and write** or
  **read only**, chosen when the token is made (or on the sign-in page). A read-only token can call
  only the tools that do not change data; any other call answers `403` with
  `{ "error": "This token is read only: …" }`. Over MCP a read-only connection lists only the read
  tools, and a write tool in `tools/call` comes back with `isError: true`. Server side:
  `api_tokens.scope` (`read` / `write`), resolved by `api_token_access(hash)`.
- Limit: 120 requests a minute per account. Bodies are JSON (at most 64 KB).
- Dates are the user's local dates (`YYYY-MM-DD`, default today in the profile time zone); units
  are metric. Writes reach the user's phones with the next sync.

## Sign in with FFT (Claude, ChatGPT)

AI apps add FFT as a connector by its MCP address and a sign-in, with no token: OAuth 2.1
(authorization code + PKCE S256, dynamic client registration, refresh tokens; `server/oauth.js`).
Without a token `/mcp` answers 401 with `WWW-Authenticate: Bearer resource_metadata=…`; the app
reads `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`,
registers at `/oauth/register`, opens `/oauth/authorize` (FFT email and password, checked by the
auth service; any account) and gets tokens at `/oauth/token` (access 7 days, then
renewed with the refresh token). The sign-in page asks **Read and write** (preselected) or **Read
only**; an app can ask for read only with the standard `scope=read` (supported scopes: `read`,
`write`; the older `fft` means write), but the user's choice on the page wins. The token response's
`scope` says what was granted, and a refresh keeps it. Each connection is a token row named after the app, listed and
revocable in the app. In the app, Settings → API & MCP → Add to Claude / Add to ChatGPT copies the
address and opens that app's connectors page.

## MCP

`POST /mcp` — Streamable HTTP, stateless, JSON replies (protocol 2025-06-18, 2025-03-26,
2024-11-05). Methods: `initialize`, `ping`, `tools/list`, `tools/call`.

Claude Code:

```
claude mcp add --transport http fft https://fft-api.up.railway.app/mcp --header "Authorization: Bearer fft_…"
```

## Tools and REST endpoints

| Tool | REST | Arguments |
|---|---|---|
| `get_profile` | `GET /v1/me` | |
| `get_day` | `GET /v1/days/{day}` | `day` |
| `list_food_logs` | `GET /v1/food-logs` | `from`, `to` |
| `search_foods` | `GET /v1/foods?q=` | `query` |
| `log_food` | `POST /v1/food-logs` | `meal` + (`food_id`, `grams`) or (`name`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `grams`), `day` |
| `remove_food_log` | `DELETE /v1/food-logs/{id}` | `log_id` |
| `list_water` | `GET /v1/water` | `from`, `to` |
| `log_water` | `POST /v1/water` | `ml`, `day` |
| `list_body_metrics` | `GET /v1/body` | `from`, `to` |
| `log_body` | `POST /v1/body` | `weight_kg`, `body_fat_pct`, `waist_cm`, `hips_cm`, `chest_cm`, `arm_cm`, `thigh_cm`, `day` |
| `list_workouts` | `GET /v1/workouts` | `from`, `to` |
| `get_goals` | `GET /v1/goals` | |

**The in-app coach's tools** (same names, descriptions and rules; the logic is the app's own
`src/domain` code, run by the server: `src/domain/data-tools.ts` for the data questions, plan import,
nutrition safety). Over REST every tool, these included, is `POST /v1/tools/{name}` with the
arguments as the JSON body.

| Tool | Changes data | What |
|---|---|---|
| `list_data` | | every table, what it holds, its columns, how many rows |
| `query_data` | | `table`, `columns`, `where` [{column, op, value}], `group_by`, `aggregates` [{fn, column}], `order_by`, `limit` |
| `get_strength` | | strength score, by muscle group and exercise (`period` 4w/12w/1y/all) |
| `get_workout_plans` | | the plans in the plan format |
| `get_diet` | | calorie/macro target, maintenance, water goal, fixed meals |
| `list_exercises` | | exercise names (`muscle`) |
| `propose_plans` | yes | `workout_plan` and/or `diet_plan` in the plan format; a changed plan keeps an archived backup |
| `set_nutrition_goal` | yes | `kcal`, `protein_g`, `carbs_g`, `fat_g` (never < 1500 kcal or > 25 % deficit) |
| `set_meal_status` | yes | fixed meals: `meal`, `status` done/skipped/adjusted/pending |
| `create_food`, `update_food`, `delete_food` | yes | the user's own foods (per 100 g, portions) |
| `add_supplement`, `set_supplement` | yes | the supplement list; taken / not taken on a `day` |

In MCP every tool carries `annotations.readOnlyHint`: clients like Claude ask the user before a tool
that changes data (the app asks for each change and offers Undo).

Ranges default to the last 7 days, at most a year. Errors: `{ "error": "…" }` with 400 (bad
input or a database rule, e.g. a weight out of range), 401 (no token, revoked, or the plan no
longer includes the API), 403 (a read-only token asked to change data), 404, 429. In MCP a tool error is a result with `isError: true`.
