import { expect, test } from "bun:test";
import { limitError, MAX_UPLOADS_PER_HOUR } from "./limits";

const now = Date.parse("2026-11-13T12:00:00Z");
const at = (minutesAgo: number, cost = 0.001) => ({ created_at: new Date(now - minutesAgo * 60_000).toISOString(), cost_usd: cost });

test("allows uploads under both limits", () => {
  expect(limitError([at(1), at(30), at(600)], now)).toBeNull();
});

test("blocks after the hourly upload limit, counting only the last hour", () => {
  const recent = Array.from({ length: MAX_UPLOADS_PER_HOUR }, () => at(10));
  expect(limitError(recent, now)).toContain("per hour");
  expect(limitError([...recent.slice(1), at(61)], now)).toBeNull();
});

test("blocks once the daily spend reaches the cap, numeric strings included", () => {
  expect(limitError([at(120, 0.6), { ...at(300), cost_usd: "0.4" }], now)).toContain("daily spend");
  expect(limitError([at(120, 0.6), at(300, 0.39)], now)).toBeNull();
});
