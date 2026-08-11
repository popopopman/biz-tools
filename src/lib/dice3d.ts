import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;

// 1種類のサイコロ形状に関する情報一式。
// - geometry: 3D表示・物理判定コライダーに使う形状
// - faceNormals[i] と faceValues[i] はペアで、
//   「ローカル座標でのこの面の法線ベクトル」と「その面に対応する出目」を表す。
export type DieDefinition = {
  geometry: THREE.BufferGeometry;
  faceNormals: THREE.Vector3[];
  faceValues: number[];
  radius: number;
};

// 3頂点ごとに三角形とみなし、その面の法線ベクトルを計算する。
// three.jsの正多面体ジオメトリ(Tetrahedron/Octahedron/Dodecahedron/Icosahedron)は
// 1つの「面」が複数の三角形に分割されていても、それらは全く同じ法線を持つように
// 生成されているため、「ほぼ同じ向きの法線をまとめる」ことで
// 見た目の面(ダイスの目1つ分)と1対1対応する法線リストを復元できる。
// (例: 正12面体は五角形1面につき3枚の三角形に分割されているが、
//      法線でグルーピングすると正しく12個にまとまる)
function extractFaceNormals(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.getAttribute("position");
  const triCount = pos.count / 3;
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < triCount; i += 1) {
    a.fromBufferAttribute(pos, i * 3);
    b.fromBufferAttribute(pos, i * 3 + 1);
    c.fromBufferAttribute(pos, i * 3 + 2);
    const n = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const existing = normals.find((e) => e.dot(n) > 0.995);
    if (!existing) normals.push(n);
  }
  return normals;
}

// D10(10面ダイス)用のジオメトリ。
// 本物のD10は「五角台形二十面体」という少し複雑な形状だが、
// ここでは実装・出目判定ともに単純で確実な「五角両錐(pentagonal bipyramid)」、
// すなわち五角形を底面にした2つの角錐を貼り合わせた形を採用している。
// 上下の頂点と赤道上の5頂点、計7頂点の凸包(ConvexGeometry)を取ると、
// 自動的に三角形10枚(見た目の面10個)の閉じた立体になる。
function pentagonalBipyramidGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5;
    points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  points.push(new THREE.Vector3(0, 1.15, 0));
  points.push(new THREE.Vector3(0, -1.15, 0));
  return new ConvexGeometry(points);
}

// 面数ごとのDieDefinitionはジオメトリ生成・法線抽出のコストがあるため、
// 一度作ったら使い回す(同じ面数のサイコロが何個あっても計算は1回だけ)。
const cache = new Map<DieSides, DieDefinition>();

// 指定した面数のサイコロの形状定義を取得する(初回のみ生成しキャッシュする)。
export function getDieDefinition(sides: DieSides): DieDefinition {
  const cached = cache.get(sides);
  if (cached) return cached;

  let geometry: THREE.BufferGeometry;
  let faceNormals: THREE.Vector3[];
  let faceValues: number[];
  const radius = 1;

  if (sides === 6) {
    // D6(通常のサイコロ)だけは特別扱いし、本物と同じ「向かい合う面の目の和が7」
    // になるよう明示的に割り当てる(他の面数は印刷された目がないため任意でよい)。
    geometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    // BoxGeometryのマテリアルグループの並び順は +x, -x, +y, -y, +z, -z 固定。
    // ここでの並び順は下のpipTexture()に渡すマテリアル配列の順序と対応させる必要がある。
    faceNormals = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    faceValues = [1, 6, 2, 5, 3, 4];
  } else {
    switch (sides) {
      case 4:
        geometry = new THREE.TetrahedronGeometry(1.05);
        break;
      case 8:
        geometry = new THREE.OctahedronGeometry(1);
        break;
      case 10:
        geometry = pentagonalBipyramidGeometry();
        break;
      case 12:
        geometry = new THREE.DodecahedronGeometry(1);
        break;
      case 20:
      default:
        geometry = new THREE.IcosahedronGeometry(1);
        break;
    }
    const normals = extractFaceNormals(geometry);
    // これらの面には実際の印刷文字がないため、番号の割り当ては
    // 「常に同じ結果になる」ことだけを保証すればよい(公平性には影響しない)。
    normals.sort((a, b) => b.y - a.y || Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    faceNormals = normals;
    faceValues = normals.map((_, i) => i + 1);
  }

  geometry.computeVertexNormals();
  const definition: DieDefinition = { geometry, faceNormals, faceValues, radius };
  cache.set(sides, definition);
  return definition;
}

const upVector = new THREE.Vector3(0, 1, 0);

// 「出目をvalueにするには、サイコロをどう回転させればよいか」を求める。
// 対応する面のローカル法線を(0,1,0)=真上に一致させる最短回転に、
// 見た目のバリエーションを出すため上向き軸まわりのランダムな回転(yaw)を加える。
//
// 実際の物理演算(重力・衝突)は行わず、結果を先に決めてから
// もっともらしく回転するアニメーションを付ける“フェイク物理”方式を採用している。
// (以前は@react-three/rapierで本物の物理演算を行っていたが、
//  一部の環境でWebGLのコンテキストロスト=画面が真っ黒になる不具合が
//  実機のGPUでも再現したため、より安全なこの方式に切り替えた)
export function quaternionForValue(die: DieDefinition, value: number, yaw: number): THREE.Quaternion {
  const index = die.faceValues.indexOf(value);
  const normal = die.faceNormals[index] ?? die.faceNormals[0];
  const align = new THREE.Quaternion().setFromUnitVectors(normal, upVector);
  const spin = new THREE.Quaternion().setFromAxisAngle(upVector, yaw);
  return spin.multiply(align);
}

// D6の各面に描く「目(ピップ)」のテクスチャを、canvasでその場に生成する。
// 画像ファイルを用意する代わりに、1〜6の丸の配置パターンを直接描画している。
export function pipTexture(value: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  // 各目の数字ごとの丸の配置(0〜1の正規化座標)。
  const positions: Record<number, [number, number][]> = {
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

  ctx.fillStyle = "#b91c1c";
  for (const [px, py] of positions[value] ?? []) {
    ctx.beginPath();
    ctx.arc(px * size, py * size, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
