import * as THREE from "three";

// コインは物理演算(@react-three/rapier)で実際に投げて転がし、静止した姿勢(quaternion)から
// 上を向いている面(表/裏)を読み取る。考え方はダイス(lib/dice3d.ts)と同じだが、
// 面が2つ(表/裏)しかない円盤なので、法線1本の上下判定だけで済む。
export type CoinSide = "front" | "back";

const upVector = new THREE.Vector3(0, 1, 0);
// コインのローカル座標で「表」の面(円柱の上面キャップ)が向いている法線。
const frontNormalLocal = new THREE.Vector3(0, 1, 0);

// 上を向いている面と、その法線が真上とどれだけ揃っているか(0〜1、1が真上)を返す。
// dotが低い(=コインが縁で立ってバランスしている)場合は、呼び出し側で小突いて
// 転がり直させる判定に使う。
export function sideFromQuaternion(quat: THREE.Quaternion): { side: CoinSide; dot: number } {
  const worldNormal = frontNormalLocal.clone().applyQuaternion(quat);
  const side: CoinSide = worldNormal.y >= 0 ? "front" : "back";
  return { side, dot: Math.abs(worldNormal.y) };
}

// 物理演算の結果(quat)が示す「上を向いている面」を、実際に真上(0,1,0)へきっちり
// 揃えた回転を返す(ダイスのsnapToFaceUpと同じ考え方)。
export function snapCoinFlat(quat: THREE.Quaternion): THREE.Quaternion {
  const { side } = sideFromQuaternion(quat);
  const localNormal = side === "front" ? frontNormalLocal : frontNormalLocal.clone().negate();
  const currentWorldNormal = localNormal.clone().applyQuaternion(quat);
  const align = new THREE.Quaternion().setFromUnitVectors(currentWorldNormal, upVector);
  return align.multiply(quat);
}
