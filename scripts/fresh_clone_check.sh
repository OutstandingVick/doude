#!/usr/bin/env bash
# Clones origin into a fresh temp directory and verifies a clean checkout
# builds and tests end-to-end. Prints PASS/FAIL per step and a summary.

set -u

REPO_URL="${DOUDE_REPO:-https://github.com/OutstandingVick/doude.git}"
TMP_DIR="$(mktemp -d /tmp/doude-fresh.XXXXXX)"
CLONE_DIR="$TMP_DIR/doude"
PASS=0
FAIL=0

step() {
  local name="$1"
  shift
  local log="$TMP_DIR/${name}.log"
  echo ""
  echo "=== $name ==="
  if "$@" >"$log" 2>&1; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    tail -20 "$log"
    FAIL=$((FAIL + 1))
  fi
}

echo "fresh_clone_check: cloning $REPO_URL into $CLONE_DIR"
if git clone --quiet "$REPO_URL" "$CLONE_DIR"; then
  echo "PASS: clone"
  PASS=$((PASS + 1))
else
  echo "FAIL: clone"
  exit 1
fi

cd "$CLONE_DIR" || exit 1

step "setup" make setup
step "data" make data
step "test" make test
step "build" sh -c "cd app && npm run build"

echo ""
echo "=== summary: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: ALL PASS"
  exit 0
else
  echo "RESULT: FAILURES PRESENT"
  exit 1
fi