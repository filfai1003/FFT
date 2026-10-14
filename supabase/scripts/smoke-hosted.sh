#!/usr/bin/env bash
# Checks the access rules of the hosted server (needs SUPABASE_URL and SUPABASE_ANON_KEY).
# It creates two throwaway accounts and deletes them at the end.
set -u
U="${SUPABASE_URL:?}"
K="${SUPABASE_ANON_KEY:?}"
ok=0
bad=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then ok=$((ok + 1)); echo "ok   $1"; else bad=$((bad + 1)); echo "FAIL $1 (expected $2, got $3)"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" -m 30 "$@"; }
check "no key: rest refused" 401 "$(code "$U/rest/v1/profiles?select=id")"
check "no key: auth refused" 401 "$(code "$U/auth/v1/settings")"
check "no key: functions refused" 401 "$(code -X POST "$U/functions/v1/off")"
check "storage schema not exposed" 406 "$(code "$U/rest/v1/objects?select=id" -H "apikey: $K" -H "Accept-Profile: storage")"

# Accounts are made with Google only (DECISIONS 45): no test accounts can be created from here.
# The row level security rules are covered by npm run db:verify and npm run db:test.
check "password sign-up is switched off" 422 "$(code -X POST "$U/auth/v1/signup" -H "apikey: $K" -H "Content-Type: application/json" -d '{"email":"smoke@example.com","password":"long-enough-1"}')"
check "anonymous sees no profile" "[]" "$(curl -s -m 20 "$U/rest/v1/profiles?select=id" -H "apikey: $K")"
check "off needs a signed-in user" 401 "$(code -X POST "$U/functions/v1/off" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"query":"milk"}')"

echo "$ok passed, $bad failed"
[ "$bad" = 0 ]
