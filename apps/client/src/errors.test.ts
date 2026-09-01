import assert from "node:assert/strict";
import test from "node:test";
import { errorMessage } from "./errors.js";

test("maps known server codes to Vietnamese", () => {
  assert.equal(errorMessage("KINGDOM_FULL"), "Vương quốc đã đầy, không thể tạo thêm thành phố.");
  assert.equal(errorMessage("NO_DEPOT"), "Cần xây trạm tiếp tế (road_depot) trước.");
  assert.equal(errorMessage("INSUFFICIENT_RESOURCES"), "Không đủ tài nguyên.");
});

test("passes unknown codes through untouched", () => {
  const code = "SOME_NEW_ERROR";
  assert.equal(errorMessage(code), code);
});

test("Vietnamized codes are never empty", () => {
  for (const code of ["INVALID_REQUEST", "UNAUTHORIZED", "SESSION_EXPIRED", "ARMY_ACCESS_DENIED", "TARGET_FROZEN", "RATE_LIMITED"]) {
    assert.ok(errorMessage(code).length > 0, `${code} should map to a non-empty message`);
  }
});