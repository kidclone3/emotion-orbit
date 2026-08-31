#!/bin/sh
set -eu

: "${PI_CHAT_PROVIDER:?PI_CHAT_PROVIDER is required}"
: "${PI_CHAT_MODEL:?PI_CHAT_MODEL is required}"

test -f dist/index.html || {
  echo "dist/index.html is missing; rebuild the image." >&2
  exit 1
}

pi --version
printf 'Emotion Orbit provider=%s model=%s\n' "$PI_CHAT_PROVIDER" "$PI_CHAT_MODEL"

if [ -z "${PI_CHAT_API_KEY:-}" ]; then
  pi auth check \
    --provider "$PI_CHAT_PROVIDER" \
    --model "$PI_CHAT_MODEL" \
    --json >/dev/null
fi

exec node server.mjs
