#!/bin/bash
# Cross-tenant isolation E2E: a session token minted by association A must be
# rejected by association B (and vice versa) in every token transport, even
# while A's auth cache is hot. Needs a running server with two tenants and an
# admin in each.
#   URL=http://127.0.0.1:3999 HOST_A=assoc-a.jaadpro.com HOST_B=assoc-b.jaadpro.com \
#   EMAIL_A=… PASS_A=… EMAIL_B=… PASS_B=… bash scripts/test-tenant-isolation.sh
set -u
U=${URL:-http://127.0.0.1:3999}; A="Host: $HOST_A"; B="Host: $HOST_B"
login(){ curl -s -H "$1" -H 'content-type: application/json' -X POST $U/api/auth -d "{\"email\":\"$2\",\"password\":\"$3\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))"; }
TA=$(login "$A" "$EMAIL_A" "$PASS_A"); TB=$(login "$B" "$EMAIL_B" "$PASS_B")
[ -n "$TA" ] && [ -n "$TB" ] || { echo "login failed"; exit 1; }
pass=0; fail=0
chk(){ if [ "$3" = "$2" ]; then pass=$((pass+1)); echo "✓ $1 → $3"; else fail=$((fail+1)); echo "✗ $1 → got $3, want $2"; fi; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
chk "A on A"                          200 "$(code -H "$A" -H "x-session-token: $TA" $U/api/donors)"
chk "B on B (cookie)"                 200 "$(code -H "$B" -H "cookie: session_token=$TB" $U/api/donors)"
code -H "$A" -H "x-session-token: $TA" $U/api/auth >/dev/null   # warm A's cache
chk "A token → B (header)"            401 "$(code -H "$B" -H "x-session-token: $TA" $U/api/donors)"
chk "A token → B (Bearer)"            401 "$(code -H "$B" -H "Authorization: Bearer $TA" $U/api/donors)"
chk "A token → B (cookie)"            401 "$(code -H "$B" -H "cookie: session_token=$TA" $U/api/donors)"
chk "A token → B (write)"             401 "$(code -H "$B" -H "x-session-token: $TA" -H 'content-type: application/json' -X POST $U/api/donors -d '{"name":"x","type":"individual"}')"
chk "A token → B (me)"                '{"user":null}' "$(curl -s -H "$B" -H "x-session-token: $TA" $U/api/auth)"
code -H "$B" -H "x-session-token: $TB" $U/api/auth >/dev/null
chk "B token → A (header)"            401 "$(code -H "$A" -H "x-session-token: $TB" $U/api/donors)"
bad=0; for i in $(seq 1 20); do c1=$(code -H "$A" -H "x-session-token: $TA" $U/api/donors); c2=$(code -H "$B" -H "x-session-token: $TA" $U/api/donors); [ "$c1" = 200 ] && [ "$c2" = 401 ] || bad=$((bad+1)); done
chk "20 hot-cache alternations"       0 "$bad"
echo "RESULT: $pass passed, $fail failed"; [ $fail = 0 ]
