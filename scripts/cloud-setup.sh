#!/usr/bin/env bash
# Sets up one cloud environment: migrations, auth settings, advisors, Supabase env vars on Vercel.
# Needs SUPABASE_ACCESS_TOKEN and VERCEL_TOKEN (from .envrc).
#   scripts/cloud-setup.sh <supabase-ref> <vercel-project-id> <site-url>
set -euo pipefail
REF=$1 VERCEL_PROJECT=$2 SITE=$3
TEAM=team_VqORbjzAYX0PFINkRdLkVK2O
SB=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json")

supabase link --project-ref "$REF"
supabase db push --yes

# Closed signup (accounts are created by the owner), longer passwords, site URL for auth emails.
curl -sf -X PATCH "${SB[@]}" "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -d "{\"disable_signup\":true,\"password_min_length\":10,\"site_url\":\"$SITE\"}" >/dev/null
echo "auth: signup disabled, min password 10, site_url $SITE"

supabase db advisors --linked

# The publishable key is public by design (it ships to the browser); RLS protects the data.
PK=$(curl -sf "${SB[@]}" "https://api.supabase.com/v1/projects/$REF/api-keys" |
  python3 -c "import json,sys;print(next(k['api_key'] for k in json.load(sys.stdin) if k.get('type')=='publishable'))")
for pair in "NEXT_PUBLIC_SUPABASE_URL=https://$REF.supabase.co" "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PK"; do
  curl -sf -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
    "https://api.vercel.com/v10/projects/$VERCEL_PROJECT/env?teamId=$TEAM&upsert=true" \
    -d "{\"key\":\"${pair%%=*}\",\"value\":\"${pair#*=}\",\"type\":\"plain\",\"target\":[\"production\"]}" >/dev/null
  echo "vercel: ${pair%%=*} set"
done
