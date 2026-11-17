/**
 * Tiny unit check for roundHalfUp.
 * Run: npx tsx scripts/check-rounding.ts
 * Proves the half-up rounding that keeps the dashboard in sync with the PDF.
 */
import { roundHalfUp } from "../lib/format";

let failures = 0;

function check(actual: number, expected: number, label: string) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label} -> ${actual} (expected ${expected})`);
}

check(roundHalfUp(44.15, 1), 44.2, "roundHalfUp(44.15, 1)");
check(roundHalfUp(13.3902, 2), 13.39, "roundHalfUp(13.3902, 2)");
check(roundHalfUp(4591.6, 1), 4591.6, "roundHalfUp(4591.6, 1)");
check(roundHalfUp(28880, 0), 28880, "roundHalfUp(28880, 0)");

if (failures > 0) {
  console.error(`${failures} rounding check(s) failed`);
  process.exit(1);
}
console.log("All rounding checks passed");
