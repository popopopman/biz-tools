import * as THREE from "three";

// 「ローカル座標での各面の法線ベクトル」と「その面の出目」の対応表。
// BoxGeometryのマテリアルグループの並び順(+x, -x, +y, -y, +z, -z 固定)に
// 合わせてあり、向かい合う面の出目の和が7になるようにしている(本物のダイスと同じ)。
const FACE_NORMALS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const FACE_VALUES = [1, 6, 2, 5, 3, 4];

const upVector = new THREE.Vector3(0, 1, 0);

function bestFaceIndex(quat: THREE.Quaternion): number {
  let bestIndex = 0;
  let bestDot = -Infinity;
  const worldNormal = new THREE.Vector3();
  FACE_NORMALS.forEach((n, i) => {
    worldNormal.set(n[0], n[1], n[2]).applyQuaternion(quat);
    const dot = worldNormal.dot(upVector);
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = i;
    }
  });
  return bestIndex;
}

// 本物の物理演算(@react-three/rapier)で静止したサイコロの回転(quaternion)から、
// 「どの面が真上を向いているか」を判定して出目を求める。
export function valueFromQuaternion(quat: THREE.Quaternion): number {
  return FACE_VALUES[bestFaceIndex(quat)];
}

// 出目ごとに固定された「整列時の向き」を返す。setFromUnitVectorsは同じ入力に対して
// 常に同じ回転を返す純粋関数なので、転がった末のヨーには一切依存しない。
// 整列後、同じ出目のサイコロは向きまで含めて必ず同じ見た目になる。
export function alignedQuaternion(value: number): THREE.Quaternion {
  const index = FACE_VALUES.indexOf(value);
  const [nx, ny, nz] = FACE_NORMALS[index];
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(nx, ny, nz), upVector);
}

// BoxGeometryの各面に対応する出目(FACE_VALUES)の並び順で使う。
export { FACE_VALUES };

// 各目の数字ごとの丸(ポチ)の配置(0〜1の正規化座標)。pipTexture・
// pipNormalTextureの両方から参照するので、位置は必ずこの1箇所だけで定義する。
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.28, 0.28],
    [0.28, 0.72],
    [0.72, 0.28],
    [0.72, 0.72],
  ],
  5: [
    [0.28, 0.28],
    [0.28, 0.72],
    [0.5, 0.5],
    [0.72, 0.28],
    [0.72, 0.72],
  ],
  6: [
    [0.28, 0.22],
    [0.28, 0.5],
    [0.28, 0.78],
    [0.72, 0.22],
    [0.72, 0.5],
    [0.72, 0.78],
  ],
};

// 黒い立方体でおなじみの「賽の目」(丸ポチ)を、画像ファイルを用意せずcanvasで
// その場に生成する。地の色を暗めにしておくことで、DiceScene側でダイスごとに
// 色味を掛け合わせた時に目の白さは保ったまま淡く色分けできる(数字テクスチャの
// 時と同じ仕組み)。
export function pipTexture(value: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = size * 0.03;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);

  ctx.fillStyle = "#f5f5f5";
  for (const [px, py] of PIP_POSITIONS[value] ?? []) {
    ctx.beginPath();
    ctx.arc(px * size, py * size, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// 半径dotRadius(uv単位)のお椀型のくぼみをdepthの深さで作る高さ関数。
// ポチの中心でもっとも低く(-depth)、縁(dotRadius)でなめらかに0へ戻る。
function pipDepth(u: number, v: number, value: number, dotRadius: number, depth: number): number {
  let minDist = Infinity;
  for (const [px, py] of PIP_POSITIONS[value] ?? []) {
    const d = Math.hypot(u - px, v - py);
    if (d < minDist) minDist = d;
  }
  if (minDist >= dotRadius) return 0;
  return -depth * Math.cos((minDist / dotRadius) * (Math.PI / 2));
}

// ポチが実際にへこんでいるように見せるための法線マップ(バンプマッピング)。
// 実際にジオメトリを彫り込むのではなく、上のくぼみ形状から算出した表面の傾きを
// 法線として焼き込むことで、平らなままライティングだけで凹凸を表現する。
export function pipNormalTexture(value: number): THREE.CanvasTexture {
  const size = 256;
  const dotRadius = 0.115;
  const depth = 0.05;
  const eps = 1 / size;
  const strength = 1.4;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const hL = pipDepth(u - eps, v, value, dotRadius, depth);
      const hR = pipDepth(u + eps, v, value, dotRadius, depth);
      const hD = pipDepth(u, v - eps, value, dotRadius, depth);
      const hU = pipDepth(u, v + eps, value, dotRadius, depth);
      const dx = ((hR - hL) / (2 * eps)) * strength;
      const dy = ((hU - hD) / (2 * eps)) * strength;

      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * size + x) * 4;
      image.data[i] = (nx * 0.5 + 0.5) * 255;
      image.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
