#!/usr/bin/env bash
# Fuzzes the beta-2 API against src/schemas/beta-2/openapi.json with
# Schemathesis, using a throwaway Docker Compose stack (compose.schemathesis.yml).
#
# Extra arguments are passed to `schemathesis run`, e.g.:
#   npm run test:schemathesis -- -n 200
#   npm run test:schemathesis -- --phases fuzzing --include-operation-id createMovement
#
# KEEP_STACK=1 leaves the stack running afterwards (backend on localhost:3012).
set -euo pipefail

cd "$(dirname "$0")/../.."
compose=(docker compose -f compose.schemathesis.yml)
out=test/schemathesis/out

if [[ "${KEEP_STACK:-}" != "1" ]]; then
  trap '"${compose[@]}" down --volumes --remove-orphans' EXIT
fi

mkdir -p "$out/reports"

"${compose[@]}" up --build --detach --wait waste-movement-backend

# Bundle the spec into one file first: the coverage report doesn't follow
# $refs into other files. Same user mapping as below, for the same reason.
"${compose[@]}" run --rm --build --user "$(id -u):$(id -g)" bundle

# Run as the calling user so the container can write reports and caches into
# the bind-mounted output dir. On Linux (e.g. CI runners, uid 1001) the image's
# own user (uid 1000) doesn't own the checkout.
"${compose[@]}" run --rm --user "$(id -u):$(id -g)" schemathesis \
  --config-file /config/schemathesis.toml \
  run spec/openapi.json \
  --coverage-format html,markdown \
  --coverage-report-html-path reports/schema-coverage.html \
  --coverage-report-markdown-path reports/schema-coverage.md \
  "$@"
