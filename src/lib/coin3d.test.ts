import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sideFromQuaternion, snapCoinFlat } from "./coin3d.ts";

test("identity rotation reads as front, fully aligned", () => {
  const { side, dot } = sideFromQuaternion(new THREE.Quaternion());
  assert.equal(side, "front");
  assert.ok(Math.abs(dot - 1) < 1e-9);
});

test("a half-turn around X reads as back, fully aligned", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
  const { side, dot } = sideFromQuaternion(q);
  assert.equal(side, "back");
  assert.ok(Math.abs(dot - 1) < 1e-6);
});

test("balanced on its edge (90° tilt) has near-zero alignment", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const { dot } = sideFromQuaternion(q);
  assert.ok(dot < 1e-6);
});

test("snapCoinFlat aligns a tilted coin exactly upright, keeping the same side", () => {
  const tilted = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, 0.2));
  const before = sideFromQuaternion(tilted);
  const snapped = snapCoinFlat(tilted);
  const after = sideFromQuaternion(snapped);
  assert.equal(after.side, before.side);
  assert.ok(Math.abs(after.dot - 1) < 1e-9);
});
