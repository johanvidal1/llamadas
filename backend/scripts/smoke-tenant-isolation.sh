#!/bin/bash
set -eu

API='http://127.0.0.1:3000'

echo "=== Health Optick (pruebacrm) ==="
curl -sS -H 'Host: pruebacrm.optickcloud.com' "$API/api/health"
echo

echo "=== Health demo ==="
curl -sS -H 'Host: demo.optickcloud.com' "$API/api/health"
echo

echo "=== Login demo on demo host ==="
DEMO_LOGIN=$(curl -sS -H 'Host: demo.optickcloud.com' -H 'Content-Type: application/json' \
  -X POST "$API/api/auth/login" \
  -d '{"email":"demo-admin@optick.demo","password":"DemoAdmin123!"}')
echo "$DEMO_LOGIN" | head -c 400
echo
DEMO_TOKEN=$(printf '%s' "$DEMO_LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$DEMO_TOKEN" ]; then
  echo "FAIL: demo login on demo host"
  exit 1
fi
echo "OK: demo login got token"

echo "=== Login demo creds on Optick host (expect 401) ==="
CROSS1_CODE=$(curl -sS -o /tmp/cross1.json -w '%{http_code}' \
  -H 'Host: pruebacrm.optickcloud.com' -H 'Content-Type: application/json' \
  -X POST "$API/api/auth/login" \
  -d '{"email":"demo-admin@optick.demo","password":"DemoAdmin123!"}')
echo "HTTP:$CROSS1_CODE body=$(head -c 200 /tmp/cross1.json)"
if [ "$CROSS1_CODE" = "401" ]; then echo "OK: demo creds rejected on Optick host"; else echo "WARN: expected HTTP 401"; fi

echo "=== Login Optick seed admin on Optick host ==="
OPTICK_LOGIN=$(curl -sS -H 'Host: pruebacrm.optickcloud.com' -H 'Content-Type: application/json' \
  -X POST "$API/api/auth/login" \
  -d '{"email":"admin@llamadas.com","password":"Admin123!"}')
echo "$OPTICK_LOGIN" | head -c 400
echo
OPTICK_TOKEN=$(printf '%s' "$OPTICK_LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$OPTICK_TOKEN" ]; then
  echo "OK: Optick seed admin login"
else
  echo "WARN: Optick seed admin login failed (may use different staging creds)"
fi

echo "=== Login Optick seed admin on demo host (expect 401) ==="
CROSS2_CODE=$(curl -sS -o /tmp/cross2.json -w '%{http_code}' \
  -H 'Host: demo.optickcloud.com' -H 'Content-Type: application/json' \
  -X POST "$API/api/auth/login" \
  -d '{"email":"admin@llamadas.com","password":"Admin123!"}')
echo "HTTP:$CROSS2_CODE body=$(head -c 200 /tmp/cross2.json)"
if [ "$CROSS2_CODE" = "401" ]; then echo "OK: Optick creds rejected on demo host"; else echo "WARN: expected HTTP 401"; fi

echo "=== Clients list demo (expect DEMO-00000001) ==="
DEMO_CLIENTS=$(curl -sS -H 'Host: demo.optickcloud.com' -H "Authorization: Bearer $DEMO_TOKEN" \
  "$API/api/clients?page=1&limit=20")
echo "$DEMO_CLIENTS" | head -c 600
echo
if printf '%s' "$DEMO_CLIENTS" | grep -q 'DEMO-00000001'; then
  echo "OK: demo sees marker company"
else
  echo "WARN: marker RUC not in demo clients payload"
fi

if [ -n "${OPTICK_TOKEN:-}" ]; then
  echo "=== Clients list Optick (must NOT include DEMO-00000001) ==="
  OPTICK_CLIENTS=$(curl -sS -H 'Host: pruebacrm.optickcloud.com' -H "Authorization: Bearer $OPTICK_TOKEN" \
    "$API/api/clients?page=1&limit=50")
  if printf '%s' "$OPTICK_CLIENTS" | grep -q 'DEMO-00000001'; then
    echo "FAIL: Optick sees demo marker company"
    exit 1
  else
    echo "OK: Optick clients do not include DEMO-00000001"
  fi

  echo "=== Demo token against Optick host /api/auth/me (expect 401/403) ==="
  ME_CODE=$(curl -sS -o /tmp/me.json -w '%{http_code}' \
    -H 'Host: pruebacrm.optickcloud.com' -H "Authorization: Bearer $DEMO_TOKEN" \
    "$API/api/auth/me")
  echo "HTTP:$ME_CODE body=$(head -c 200 /tmp/me.json)"
fi

echo "=== DONE ==="
