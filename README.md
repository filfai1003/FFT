# FFT

Training and diet app (freemium): Expo + Supabase. Spec in `docs/PROJECT.md`, design in `docs/design/`, working rules in `CLAUDE.md`.

```bash
npm install
npm run check          # lint, typecheck, tests, database verification
npx expo start --web   # then open http://localhost:8081/dev/components
```

Local backend (needs Docker): `npm run db:start`, then copy the URL and anon key from `npx supabase status` into `.env` (see `.env.example`).
