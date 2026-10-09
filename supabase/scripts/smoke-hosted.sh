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
token() {
  curl -s -m 30 -X POST "$U/auth/v1/signup" -H "apikey: $K" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Smoke-pw-12345\"}" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token||''))"
}

check "no key: rest refused" 401 "$(code "$U/rest/v1/profiles?select=id")"
check "no key: auth refused" 401 "$(code "$U/auth/v1/settings")"
check "no key: functions refused" 401 "$(code -X POST "$U/functions/v1/off")"
check "storage schema not exposed" 406 "$(code "$U/rest/v1/objects?select=id" -H "apikey: $K" -H "Accept-Profile: storage")"

A="smoke-a-$(date +%s)@example.com"
B="smoke-b-$(date +%s)@example.com"
TA="$(token "$A")"
TB="$(token "$B")"
check "sign up works" yes "$([ -n "$TA" ] && [ -n "$TB" ] && echo yes || echo no)"
check "anonymous sees no profile" "[]" "$(curl -s -m 20 "$U/rest/v1/profiles?select=id" -H "apikey: $K")"
mine="$(curl -s -m 20 "$U/rest/v1/profiles?select=id" -H "apikey: $K" -H "Authorization: Bearer $TA" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))")"
check "a user sees only their own profile" 1 "$mine"
check "off needs a signed-in user" 401 "$(code -X POST "$U/functions/v1/off" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"query":"milk"}')"

for t in "$TA" "$TB"; do
  curl -s -m 30 -X POST "$U/functions/v1/delete-account" -H "apikey: $K" -H "Authorization: Bearer $t" >/dev/null
done
check "delete-account removes the user" 403 "$(code "$U/auth/v1/user" -H "apikey: $K" -H "Authorization: Bearer $TA")"

echo "$ok passed, $bad failed"
[ "$bad" = 0 ]
