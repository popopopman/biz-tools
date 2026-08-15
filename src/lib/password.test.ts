import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCharset, generatePassword } from "./password.ts";

test("generates a password of the requested length using only selected charsets", () => {
  const options = { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: false };
  const pw = generatePassword(options);
  const charset = buildCharset(options);
  assert.equal(pw.length, 20);
  assert.ok([...pw].every((c) => charset.includes(c)));
});

test("returns an empty string when no charset is selected and no include word given", () => {
  assert.equal(generatePassword({ length: 10, uppercase: false, lowercase: false, numbers: false, symbols: false }), "");
});

test("embeds the include word at the requested length", () => {
  const options = { length: 16, uppercase: true, lowercase: true, numbers: true, symbols: false, include: "Tanaka2024" };
  const pw = generatePassword(options);
  assert.equal(pw.length, 16);
  assert.ok(pw.includes("Tanaka2024"));
});

test("extends the length when the include word is longer than the requested length", () => {
  const options = { length: 4, uppercase: true, lowercase: true, numbers: true, symbols: false, include: "Tanaka2024" };
  const pw = generatePassword(options);
  assert.equal(pw, "Tanaka2024");
});

test("returns the include word as-is when no charset is selected", () => {
  const options = { length: 16, uppercase: false, lowercase: false, numbers: false, symbols: false, include: "Tanaka2024" };
  assert.equal(generatePassword(options), "Tanaka2024");
});
