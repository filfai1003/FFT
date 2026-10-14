# FFT API and MCP server

For Supporter and Premium accounts (their data is online). Code: `server/api.js` (api service),
tokens: migration `20261016100000_api_tokens.sql`, app page Settings → API & MCP.

- Base: `https://api-fft.up.railway.app`
- Auth: `Authorization: Bearer fft_…` (a personal token made in the app; shown once, only its
  SHA-256 is stored; revoke it in the app). Every request runs as the token's user with row level
  security, like the app.
- Limit: 120 requests a minute per account. Bodies are JSON (at most 64 KB).
- Dates are the user's local dates (`YYYY-MM-DD`, default today in the profile time zone); units
  are metric. Writes reach the user's phones with the next sync.

## MCP

`POST /mcp` — Streamable HTTP, stateless, JSON replies (protocol 2025-06-18, 2025-03-26,
2024-11-05). Methods: `initialize`, `ping`, `tools/list`, `tools/call`.

Claude Code:

```
claude mcp add --transport http fft https://api-fft.up.railway.app/mcp --header "Authorization: Bearer fft_…"
```

## Tools and REST endpoints

| Tool | REST | Arguments |
|---|---|---|
| `get_profile` | `GET /v1/me` | |
| `get_day` | `GET /v1/days/{day}` | `day` |
| `list_food_logs` | `GET /v1/food-logs` | `from`, `to` |
| `search_foods` | `GET /v1/foods?q=` | `query` |
| `log_food` | `POST /v1/food-logs` | `meal` + (`food_id`, `grams`) or (`name`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `grams`), `day` |
| `delete_food_log` | `DELETE /v1/food-logs/{id}` | `id` |
| `list_water` | `GET /v1/water` | `from`, `to` |
| `log_water` | `POST /v1/water` | `ml`, `day` |
| `list_body_metrics` | `GET /v1/body` | `from`, `to` |
| `log_body_metrics` | `POST /v1/body` | `weight_kg`, `body_fat_pct`, `waist_cm`, `hips_cm`, `chest_cm`, `arm_cm`, `thigh_cm`, `day` |
| `list_workouts` | `GET /v1/workouts` | `from`, `to` |
| `get_goals` | `GET /v1/goals` | |

Ranges default to the last 7 days, at most a year. Errors: `{ "error": "…" }` with 400 (bad
input or a database rule, e.g. a weight out of range), 401 (no token, revoked, or the plan no
longer includes the API), 404, 429. In MCP a tool error is a result with `isError: true`.
