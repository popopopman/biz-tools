"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildLabelCanvas } from "@/lib/wheelTexture";
import {
  GACHA_DECOY_COUNT,
  GACHA_DECOY_FALL_DURATION,
  GACHA_DECOY_IMPACT_PAUSE,
  GACHA_METEOR_DURATION,
  GACHA_EXPLODE_DURATION,
  GACHA_SINGLE_HOLD,
  GACHA_BURST_HOLD,
} from "@/lib/gachaTiming";
import { playMeteorWhoosh, playImpactThud, playExplosionBoom, playRevealChime } from "@/lib/gachaAudio";

// 「空が光り、おとりの隕石を何個か落としてから本命の隕石が降ってくる → 着弾で大きく爆発する」演出。
//   1. おとり: 本命の前に、小さな隕石が何個か落ちてきては小さく着弾する(期待感を煽る)
//   2. メテオ: 空でひらめいた本命の隕石が、燃えながら地面(魔法陣の中心)めがけて落下してくる
//   3. エクスプロード: 着弾の瞬間、フラッシュ・光の粒子・魔法陣・当選ラベルが一気に爆発する
//   4. ホールド: 当選ラベルを表示したまま発光を保ち続ける。フェードはせず、
//      次の抽選(次のeject.currentへの上書き)が始まるまでこの状態を保つ。
// 物理演算は使わず、経過時間から求めた0〜1の進行度を各要素に配るだけの軽量な演出。

const GOLD = "#d4af37";

const RIG_Y = -0.35; // 演出全体の基準高さ
const CIRCLE_RADIUS = 2.5;
const PARTICLE_COUNT = 70;
const PARTICLE_BURST_MULT = 2.9;
const PILLAR_HEIGHT = 6.2;
const PILLAR_WIDTH = 2.8;
// 光の柱は根元(地面側)を細く、先端(空側)にかけてラッパ状に広げる
// (alphaMapによる縦方向のフェードと合わせて、上に行くほど「薄く・大きく」広がる光にする)。
const PILLAR_TOP_RADIUS = PILLAR_WIDTH * 0.75;
const PILLAR_BOTTOM_RADIUS = PILLAR_WIDTH * 0.18;

// 魔法陣の縁を取り囲む、虹色の細い光の柱(中心の太い柱とは別に、リング状に並べる)。
// カメラに近い手前側には置かず、奥側の弧だけに並べる(カメラ位置[2.0, 0.45, 4.2]を基準に、
// その方向を中心とした120度の扇形を除外し、残り240度の弧に等間隔で配置する)。
const RING_PILLAR_COUNT = 10;
const RING_PILLAR_RADIUS = CIRCLE_RADIUS * 0.95;
// 中心の柱を大きくしても、周囲のリング柱は元の高さ(4.2 * 1.75)のまま据え置く。
const RING_PILLAR_HEIGHT = 7.35; // まっすぐ・長めの柱にする
const RING_PILLAR_RADIUS_SIZE = 0.065; // 上下同じ太さ(広がらずまっすぐ)、少し細めに
const RING_PILLAR_TILT = Math.PI / 6.5; // 円の外側へ傾ける角度(接線を軸に回転させる)。少し緩やかに。
const RING_PILLAR_FRONT_ANGLE = Math.atan2(4.2, 2.0);
const RING_PILLAR_EXCLUDE_HALF = Math.PI / 3; // 手前側、除外する扇形の半分の角度(合計120度分)
const RING_PILLAR_ARC_START = RING_PILLAR_FRONT_ANGLE + RING_PILLAR_EXCLUDE_HALF;
const RING_PILLAR_ARC_SPAN = Math.PI * 2 - RING_PILLAR_EXCLUDE_HALF * 2;

const RAY_COUNT = 16; // 魔法陣から放射状に伸びる光の筋の本数
const RAY_LENGTH = CIRCLE_RADIUS * 2.1;
const RAY_WIDTH = 0.07;

// タイミング定数はGachaTool側の結果表示タイミングとも共有するため src/lib/gachaTiming.ts にある。
const DECOY_COUNT = GACHA_DECOY_COUNT;
const DECOY_FALL_DURATION = GACHA_DECOY_FALL_DURATION;
const DECOY_IMPACT_PAUSE = GACHA_DECOY_IMPACT_PAUSE;
const DECOY_CYCLE = DECOY_FALL_DURATION + DECOY_IMPACT_PAUSE;
const DECOY_PHASE_END = DECOY_COUNT * DECOY_CYCLE;
const METEOR_DURATION = GACHA_METEOR_DURATION;
const EXPLODE_DURATION = GACHA_EXPLODE_DURATION;
// 爆発が始まるまでの合計時間(=おとり隕石群 + 本命隕石の落下)。
const PRE_EXPLODE_DURATION = DECOY_PHASE_END + METEOR_DURATION;
const SINGLE_HOLD = GACHA_SINGLE_HOLD;
const BURST_HOLD = GACHA_BURST_HOLD;

// 魔法陣は着弾までは隠れていて、爆発の瞬間にこのスケールから一気にポップインする。
const HIDDEN_SCALE = 0.05;

// ヒットストップ: 着弾の瞬間だけ演出全体の時間を一瞬止め、衝撃の重みを強調する。
const HITSTOP_DURATION = 0.07;
// カメラのFOVパンチ: 爆発の瞬間だけ視野角を一瞬広げ、画面全体を揺さぶるような衝撃にする。
const BASE_FOV = 42;
const FOV_PUNCH = 9;

// 隕石の落下経路(ローカル座標。RIG_Yで全体がすでにオフセットされているため、
// 地面付近=y≈0.15が他の演出要素の基準高さと揃う)。斜めに降らせた方が動きに勢いが出る。
// 結果を決める本命はどこから降ってきても中心に着弾するとわかりやすいよう固定位置、
// おとり隕石は引くたびに毎回違う位置から降ってくるようランダムに決める。
const FINAL_METEOR_START = new THREE.Vector3(-2.4, 6.5, -1.6);
const METEOR_END = new THREE.Vector3(0, 0.15, 0);
const METEOR_TRAIL_COUNT = 6;
const METEOR_TRAIL_LAG = 0.05; // 尾を引く各セグメントの、頭からの進捗差
// 隕石の火の尾とは別に、もっと後方をふわっと漂う土煙(発光しない、灰色がかった)の軌跡。
// 間隔を詰めて連ねることで、粒の連なりではなく1本の煙の尾のように見せる。
const DUST_TRAIL_COUNT = 10;
const DUST_TRAIL_LAG = 0.045;

// おとり隕石の発生位置をランダムに1つ決める(呼び出しはuseEffect内のみで、レンダー中には呼ばない)。
function randomDecoyStart(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const dist = 2.2 + Math.random() * 1.2;
  const height = 5.6 + Math.random() * 2.0;
  return new THREE.Vector3(Math.cos(angle) * dist, height, Math.sin(angle) * dist * 0.7 - 0.6);
}

// おとり隕石の着地位置をランダムに1つ決める(中心からわずかにずれた位置に着弾させる)。
function randomDecoyEnd(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1.1 + Math.random() * 1.0;
  return new THREE.Vector3(Math.cos(angle) * dist, METEOR_END.y, Math.sin(angle) * dist);
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t: number) {
  return t * t;
}

type CraterImpact = { x: number; z: number; radius: number; depth: number };

// 隕石が突き刺さった地点の周りを、中心はえぐれて(dip)・縁は少し盛り上がる(rim)
// クレーター状に変形させる。地面は position={[0,-0.08,0]}, rotation=[-PI/2,0,0]の
// planeGeometryなので、ローカルZ方向の変位が回転後のワールドY(上下)になる。
// また回転により、ワールド(x,z)はローカル(x, -y)に対応する。
function applyCraters(mesh: THREE.Mesh, impacts: CraterImpact[]) {
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    let h = 0;
    for (const imp of impacts) {
      const dx = lx - imp.x;
      const dz = -ly - imp.z;
      const d = Math.sqrt(dx * dx + dz * dz) / imp.radius;
      if (d < 1.6) {
        h += -imp.depth * Math.exp(-(d * d) / 0.25) + imp.depth * 0.55 * Math.exp(-((d - 1) * (d - 1)) / 0.05);
      }
    }
    pos.setZ(i, h);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// 光の柱・サンバーストを「根元(中心)は明るく、先端(外側)ほど透明に」減衰させるための
// グレースケールのグラデーションをalphaMap用に生成する(白=不透明、黒=透明)。
// flipY=falseで使う前提でcanvas座標そのままをUVとして扱う(V=0/U=0が根元側=白)。
function buildFadeGradientCanvas(horizontal: boolean): HTMLCanvasElement {
  const length = 64;
  const canvas = document.createElement("canvas");
  canvas.width = horizontal ? length : 4;
  canvas.height = horizontal ? 4 : length;
  const ctx = canvas.getContext("2d")!;
  const gradient = horizontal ? ctx.createLinearGradient(0, 0, length, 0) : ctx.createLinearGradient(0, 0, 0, length);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// 星空の背景用に、青〜紫のグラデーションの夜空をcanvasに描く(乱数を使わない決定的な
// グラデーションなのでレンダー中にuseMemoで生成してよい)。
function buildNebulaSkyCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  // 縦方向のグラデーション(canvas上端=天頂、canvas中央=カメラから見た地平線)。
  // 天頂側の青紫は広く明るいまま保ち、地平線のあたりだけ集中的に暗く落とす。
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#5637b8");
  gradient.addColorStop(0.3, "#4229a0");
  gradient.addColorStop(0.44, "#241c68");
  gradient.addColorStop(0.54, "#060616");
  gradient.addColorStop(0.65, "#000000");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// 星空の背景(大きな球の内側から見る、青紫のネビュラ)。乱数を使わない静的な
// テクスチャなのでuseMemoで一度だけ生成する(useEffectで作り直す必要がない)。
function NebulaBackground() {
  const texture = useMemo(() => new THREE.CanvasTexture(buildNebulaSkyCanvas()), []);
  return (
    <mesh>
      <sphereGeometry args={[80, 32, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
}

// 隕石本体用に、岩肌の下地+溶岩のひび割れが走るテクスチャをcanvasに描く(乱数でひび割れの
// 形状を作るため、呼び出しは常にuseEffect内のみ)。map/emissiveMapの両方に同じテクスチャを
// 使うことで、岩肌部分は暗く、ひび割れ部分だけが明るく光って見える。
function buildMeteorCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // 岩肌部分はほぼ黒に近い暗さにして、ひび割れだけが際立って光るようにする。
  const base = ctx.createRadialGradient(size * 0.4, size * 0.35, 6, size / 2, size / 2, size * 0.75);
  base.addColorStop(0, "#2c130a");
  base.addColorStop(0.6, "#160a05");
  base.addColorStop(1, "#080402");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // クレーター(暗い斑点)+粒状のノイズで、ざらついた岩肌の質感を出す。
  for (let i = 0; i < 22; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 9;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(4,2,1,0.6)");
    grad.addColorStop(1, "rgba(4,2,1,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const dark = Math.random() > 0.5;
    ctx.fillStyle = dark ? "rgba(0,0,0,0.15)" : "rgba(120,70,40,0.08)";
    ctx.fillRect(x, y, 1, 1);
  }

  // 溶岩のひび割れ: ジグザグに折れ曲がる線を数本、外側の橙のグロー+内側の明るい芯の2層で描く。
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let c = 0; c < 6; c += 1) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    const points: [number, number][] = [[x, y]];
    const segments = 5 + Math.floor(Math.random() * 4);
    for (let s = 0; s < segments; s += 1) {
      x += (Math.random() - 0.5) * 32;
      y += (Math.random() - 0.5) * 32;
      points.push([x, y]);
    }
    ctx.strokeStyle = "rgba(255,106,31,0.6)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
    ctx.strokeStyle = "#ffe9b0";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  }

  return canvas;
}

// 地面用に、青みがかったグレーのグラデーションをcanvasに描く(中心はやや見える程度、
// 外周(奥)に行くほど急激に黒へ落ちる)。
function buildGroundCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(256, 256, 40, 256, 256, 360);
  gradient.addColorStop(0, "#0a1024");
  gradient.addColorStop(0.35, "#04071a");
  gradient.addColorStop(0.65, "#000000");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// 実在の文字ではなく、数本の線分(+時々小さな円)を組み合わせただけの
// 「読めそうで読めない」抽象的なルーン記号を1つ描く(中心が原点になるようtranslate済みの
// コンテキストに対して呼ぶ)。呼び出しは常にuseEffect内(buildMagicCircleCanvas経由)のみ。
function drawRuneGlyph(ctx: CanvasRenderingContext2D, size: number) {
  const strokeCount = 3 + Math.floor(Math.random() * 3);
  ctx.lineCap = "round";
  ctx.save();
  // 縦に引き伸ばして文字っぽい縦長のシルエットにする(横幅を絞ることで詰めて並べやすくもなる)。
  ctx.scale(0.75, 1.75);
  for (let s = 0; s < strokeCount; s += 1) {
    ctx.beginPath();
    ctx.moveTo((Math.random() - 0.5) * size, (Math.random() - 0.5) * size);
    ctx.lineTo((Math.random() - 0.5) * size, (Math.random() - 0.5) * size);
    ctx.stroke();
  }
  if (Math.random() < 0.4) {
    ctx.beginPath();
    ctx.arc(0, 0, size * (0.12 + Math.random() * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// 指定した半径の円周上にルーン記号をcount個、外向きに等間隔で並べる。
function drawRuneRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  glyphSize: number,
  lineWidth: number
) {
  ctx.lineWidth = lineWidth;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    drawRuneGlyph(ctx, glyphSize);
    ctx.restore();
  }
}

// 魔法陣らしい紋様(同心円+六芒星+ルーン風の刻み)を1枚のテクスチャに描く。
// 円盤メッシュのmap/emissiveMapへ割り当てることで、単なる発光ディスクではなく
// 「刻まれた模様だけが光る」魔法陣らしい見た目にする(地の部分は透明なまま)。
function buildMagicCircleCanvas(): HTMLCanvasElement {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";

  const ring = (radius: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(R * 0.97, 5);
  ring(R * 0.86, 2);
  ring(R * 0.62, 2);
  ring(R * 0.4, 2);
  ring(R * 0.18, 3);

  // 六芒星(2つの三角形を重ねる)。
  const starR = R * 0.78;
  const triangle = (rotationOffset: number) => {
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = rotationOffset + i * ((Math.PI * 2) / 3) - Math.PI / 2;
      const x = cx + Math.cos(a) * starR;
      const y = cy + Math.sin(a) * starR;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };
  triangle(0);
  triangle(Math.PI);

  // 星の頂点に小さな飾り円。
  for (let tri = 0; tri < 2; tri += 1) {
    for (let i = 0; i < 3; i += 1) {
      const a = (tri === 0 ? 0 : Math.PI) + i * ((Math.PI * 2) / 3) - Math.PI / 2;
      const x = cx + Math.cos(a) * starR;
      const y = cy + Math.sin(a) * starR;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 抽象ルーン記号をさらに多くの円環に、より密集させて配置する(呪文が刻まれている感じを強める)。
  drawRuneRing(ctx, cx, cy, R * 0.51, 48, 22, 1.7); // 内周(0.40リングと0.62リングの間)
  drawRuneRing(ctx, cx, cy, R * 0.93, 78, 15, 1.1); // 外周(刻みのすぐ外側)

  // 外周のルーン風の刻み(長短交互)。外側のルーン記号の輪の内側に収まるよう、少し内寄りにする。
  const tickCount = 32;
  for (let i = 0; i < tickCount; i += 1) {
    const a = (i / tickCount) * Math.PI * 2;
    const long = i % 4 === 0;
    const outer = R * 0.895;
    const inner = R * (long ? 0.83 : 0.86);
    ctx.lineWidth = long ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.stroke();
  }

  return canvas;
}

type EjectState =
  | { active: false }
  | {
      active: true;
      startTime: number;
      color: THREE.Color;
      hasLabel: boolean;
      holdDuration: number;
      decoyStarts: THREE.Vector3[];
      decoyEnds: THREE.Vector3[];
    };

// 引くたびにランダムな色相の鮮やかな色を1つ選ぶ(呼び出しはuseEffect内のみで、レンダー中には呼ばない)。
function randomEjectColor(): THREE.Color {
  return new THREE.Color().setHSL(Math.random(), 0.8, 0.55);
}

type ParticleSeed = {
  angle: number;
  baseRadius: number;
  orbitSpeed: number;
  vSpeed: number;
  vPhase: number;
};

// 各粒子の初期パラメータ。乱数呼び出しはレンダー中(コンポーネント関数の実行中)には
// 行えない(react-hooks/purity)ため、モジュール読み込み時に一度だけ生成しておく。
const PARTICLE_SEEDS: ParticleSeed[] = Array.from({ length: PARTICLE_COUNT }, () => ({
  angle: Math.random() * Math.PI * 2,
  baseRadius: 0.35 + Math.random() * 0.65,
  orbitSpeed: (Math.random() - 0.5) * 0.6,
  vSpeed: 0.6 + Math.random() * 0.8,
  vPhase: Math.random() * Math.PI * 2,
}));

type ConfettiSeed = {
  dirX: number;
  dirY: number;
  dirZ: number;
  speed: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  colorMix: number; // 0=当選色, 1=白, 2=ゴールド
};

// 紙吹雪。光の粒子(球体・放射状)とは違い、平らな破片が重力で放物線を描いて舞い散る。
const CONFETTI_COUNT = 26;
const CONFETTI_GRAVITY = 3.4;
const CONFETTI_SEEDS: ConfettiSeed[] = Array.from({ length: CONFETTI_COUNT }, () => {
  const angle = Math.random() * Math.PI * 2;
  const upBias = 0.7 + Math.random() * 0.7;
  return {
    dirX: Math.cos(angle),
    dirY: upBias,
    dirZ: Math.sin(angle),
    speed: 1.6 + Math.random() * 1.5,
    spinX: (Math.random() - 0.5) * 10,
    spinY: (Math.random() - 0.5) * 10,
    spinZ: (Math.random() - 0.5) * 10,
    colorMix: Math.floor(Math.random() * 3),
  };
});

type DustSeed = {
  angle: number;
  speed: number;
  riseSpeed: number;
  startSize: number;
  growRate: number;
  squashY: number; // 縦方向を潰す度合い(雲のように扁平にして「もこもこ感」を出す)
  wobblePhase: number; // ゆっくり膨らんだり縮んだりする位相(個体差)
};

// 着弾地点の土煙。光る粒子(球体・発光)とは違い、地面近くを低く這うように広がって
// ゆっくり大きくなりながら消える、マットな(発光しない)煙の塊として表現する。
// 中心から遠ざかるほど薄くなる(DUST_MAX_DIST)ことで、煙が拡散して消えていく感じを出す。
const DUST_COUNT = 10;
const DUST_LIFETIME = 1.1;
const DUST_MAX_DIST = 2.4;
const DUST_SEEDS: DustSeed[] = Array.from({ length: DUST_COUNT }, () => ({
  angle: Math.random() * Math.PI * 2,
  speed: 0.9 + Math.random() * 0.8,
  riseSpeed: 0.15 + Math.random() * 0.2,
  startSize: 0.3 + Math.random() * 0.2,
  growRate: 1.1 + Math.random() * 0.7,
  squashY: 0.55 + Math.random() * 0.2,
  wobblePhase: Math.random() * Math.PI * 2,
}));

// 二次的な残り火の雨。大爆発の後、ホールド中に小さな火の粉がパラパラと降ってくる
// (花火の余韻のような追加演出)。EMBER_TOP_Yから地面までを繰り返しループして降らせる。
type EmberSeed = {
  angle: number;
  dist: number;
  phase: number;
  cycleLen: number;
  twinklePhase: number;
};
const EMBER_COUNT = 18;
const EMBER_TOP_Y = 3.2;
const EMBER_GROUND_Y = 0.1;
const EMBER_SEEDS: EmberSeed[] = Array.from({ length: EMBER_COUNT }, () => ({
  angle: Math.random() * Math.PI * 2,
  dist: 0.3 + Math.random() * (CIRCLE_RADIUS * 1.4),
  phase: Math.random() * 4,
  cycleLen: 1.6 + Math.random() * 1.2,
  twinklePhase: Math.random() * Math.PI * 2,
}));

// useFrame/useEffectを使う実体はCanvasの子として描画する必要があるため、
// Canvasを返す外側のGachaSceneとは別コンポーネントに分けている
// (同じ関数内でCanvasを生成しつつuseFrameを呼ぶと
// "Hooks can only be used within the Canvas component" になる)。
function GachaRig({
  capacity,
  drawnCount,
  drawn,
}: {
  capacity: number;
  drawnCount: number;
  drawn: string[];
}) {
  // useFrame内のtはclock.getElapsedTime()(Canvas起動からの経過秒)を基準にしているため、
  // startTimeもこのclockから読む必要がある(performance.now()は壁時計時刻で基準が違い、
  // 引き算すると巨大な負の値になってslotIndexが配列範囲外になってしまう)。
  const { clock } = useThree();
  const circleGroupRef = useRef<THREE.Group>(null);
  const groundMeshRef = useRef<THREE.Mesh>(null);
  const groundMatRef = useRef<THREE.MeshStandardMaterial>(null);
  // 隕石が突き刺さった地点に地面をえぐるクレーターを刻む。今回の抽選で確定した衝突地点を集めておき、
  // 新しい抽選が始まったタイミングでリセットして地面を平らに戻す。
  const craterImpacts = useRef<CraterImpact[]>([]);
  const craterAppliedDecoy = useRef<boolean[]>(Array.from({ length: DECOY_COUNT }, () => false));
  const craterAppliedFinal = useRef(false);
  const discMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring1MatRef = useRef<THREE.MeshStandardMaterial>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring2MatRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const labelSpriteRef = useRef<THREE.Sprite>(null);
  const labelMatRef = useRef<THREE.SpriteMaterial>(null);
  // ラベルの縦横比(複数件を縦に並べると縦長になるため、canvasの実寸に合わせてspriteの縦スケールを調整する)。
  const labelAspectRef = useRef(96 / 256);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const particleMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 紙吹雪(重力で放物線を描いて舞い散る平らな破片)。
  const confettiRefs = useRef<(THREE.Mesh | null)[]>([]);
  const confettiMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 光の柱(縦に伸びるビーム)。実際に丸い筒(円柱)として持つ
  // (太くすると平面2枚の合わせ技では板っぽく見えてしまうため)。
  const pillarGroupRef = useRef<THREE.Group>(null);
  const pillarMatRef = useRef<THREE.MeshBasicMaterial>(null);
  // 魔法陣の縁を取り囲む、虹色の細い光の柱(中心の柱と同じ「根元から伸びる」仕組みを個別に持つ)。
  const ringPillarGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const ringPillarMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  // 着弾地点の地面が光るリング(隕石が近づくほど大きく・明るくなり、着弾の瞬間は衝撃波として広がる)。
  const shockRef = useRef<THREE.Mesh>(null);
  const shockMatRef = useRef<THREE.MeshBasicMaterial>(null);
  // 魔法陣から放射状に伸びる光の筋(サンバースト)。フラッシュの瞬間に大きく開く。
  const raysGroupRef = useRef<THREE.Group>(null);
  const rayMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  // 押した瞬間の震え・ズームパンチ(演出全体を包む外側グループに位置/拡大オフセットとして加える)。
  const rigRef = useRef<THREE.Group>(null);
  // 隕石本体と、尾を引く燃えかす。
  const meteorRef = useRef<THREE.Mesh>(null);
  const meteorMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const trailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const trailMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const dustTrailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const dustTrailMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 土煙は隕石が通り過ぎてもすぐには消さず、この不透明度をじわじわ減衰させて残す。
  const dustTrailOpacityRef = useRef<number[]>(Array.from({ length: DUST_TRAIL_COUNT }, () => 0));
  // おとり隕石も本命と同じく、着弾後は消さずに地面に突き刺さったまま残す(本命よりひとまわり小さい専用メッシュ)。
  const decoyStuckRefs = useRef<(THREE.Mesh | null)[]>([]);
  const decoyStuckMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 隕石が空に現れる瞬間の専用フラッシュ(各隕石の発生位置に移動して、一瞬だけ強く光る)。
  const skyFlashRef = useRef<THREE.Mesh>(null);
  const skyFlashMatRef = useRef<THREE.MeshBasicMaterial>(null);
  // 着弾地点の土煙(発光しないマットな煙の塊)。
  const dustRefs = useRef<(THREE.Mesh | null)[]>([]);
  const dustMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 二次的な残り火の雨(ホールド中、上から降ってくる小さな火の粉)。
  const emberRefs = useRef<(THREE.Mesh | null)[]>([]);
  const emberMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  const eject = useRef<EjectState>({ active: false });
  const prevDrawn = useRef(0);
  const prevTexture = useRef<THREE.CanvasTexture | null>(null);
  // ヒットストップ(演出全体を一瞬静止させる)の残り時間。
  const hitstopRemaining = useRef(0);
  // 効果音は状態遷移の瞬間に1回だけ鳴らしたいので、直近に鳴らした地点を覚えておく
  // (useFrameは毎フレーム呼ばれるため、エッジ検出しないと鳴りっぱなしになってしまう)。
  const soundedSlot = useRef(-1); // 隕石の発射音を鳴らし終えたslotIndex
  const soundedImpactSlot = useRef(-1); // おとりの着地音を鳴らし終えたslotIndex
  const soundedExplosion = useRef(false);
  const soundedReveal = useRef(false);

  // 光の柱(縦方向)・サンバースト(横方向、根元=中心が明るく先端=外側が透明)を
  // 減衰させるグラデーション。マウント時に1度だけ生成し、各マテリアルのalphaMapへ割り当てる
  // (不透明度はopacityで動的に制御したまま、alphaMapが位置による減衰だけを掛け合わせる)。
  useEffect(() => {
    const pillarTex = new THREE.CanvasTexture(buildFadeGradientCanvas(false));
    pillarTex.flipY = false;
    if (pillarMatRef.current) {
      pillarMatRef.current.alphaMap = pillarTex;
      pillarMatRef.current.needsUpdate = true;
    }
    ringPillarMatRefs.current.forEach((m) => {
      if (!m) return;
      m.alphaMap = pillarTex;
      m.needsUpdate = true;
    });

    const radialTex = new THREE.CanvasTexture(buildFadeGradientCanvas(true));
    radialTex.flipY = false;
    rayMatRefs.current.forEach((m) => {
      if (!m) return;
      m.alphaMap = radialTex;
      m.needsUpdate = true;
    });

    return () => {
      pillarTex.dispose();
      radialTex.dispose();
    };
  }, []);

  // 地面に青みがかったグレーのグラデーションテクスチャを割り当てる。
  useEffect(() => {
    const tex = new THREE.CanvasTexture(buildGroundCanvas());
    if (groundMatRef.current) {
      groundMatRef.current.map = tex;
      groundMatRef.current.needsUpdate = true;
    }
    return () => tex.dispose();
  }, []);

  // 隕石本体に岩肌+溶岩のひび割れのテクスチャを割り当てる(map/emissiveMapとも同じテクスチャで、
  // ひび割れ部分だけが明るく発光して見えるようにする)。あわせて正多面体のままだと綺麗すぎるため、
  // 各頂点を座標由来の疑似乱数でごつごつと凹凸させ、ゴツゴツした岩の塊らしいシルエットにする
  // (同じ座標を共有する頂点は同じ凹凸量になるので、面同士の継ぎ目に隙間はできない)。
  useEffect(() => {
    const tex = new THREE.CanvasTexture(buildMeteorCanvas());
    const hash = (x: number, y: number, z: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      return s - Math.floor(s);
    };
    const bumpify = (mesh: THREE.Mesh | null) => {
      if (!mesh) return;
      const pos = mesh.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i);
        const bump = 0.78 + hash(v.x, v.y, v.z) * 0.4;
        pos.setXYZ(i, v.x * bump, v.y * bump, v.z * bump);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    };

    if (meteorMatRef.current) {
      meteorMatRef.current.map = tex;
      meteorMatRef.current.emissiveMap = tex;
      meteorMatRef.current.needsUpdate = true;
    }
    bumpify(meteorRef.current);

    decoyStuckMatRefs.current.forEach((mat) => {
      if (!mat) return;
      mat.map = tex;
      mat.emissiveMap = tex;
      mat.needsUpdate = true;
    });
    decoyStuckRefs.current.forEach(bumpify);

    return () => tex.dispose();
  }, []);

  // 魔法陣の円盤に、同心円+六芒星+ルーン刻みの紋様テクスチャを割り当てる
  // (地の部分は透明なままなので、円盤全体が光るのではなく紋様だけが光って見える)。
  useEffect(() => {
    const tex = new THREE.CanvasTexture(buildMagicCircleCanvas());
    if (discMatRef.current) {
      discMatRef.current.map = tex;
      discMatRef.current.emissiveMap = tex;
      discMatRef.current.needsUpdate = true;
    }
    return () => tex.dispose();
  }, []);

  // 新しいガチャが準備された(capacityが変わった)ら、前回の演出を打ち切って基準をリセット。
  // drawnCountは意図的に依存配列から外している(capacity変化時の初期値としてのみ読む。
  // 依存に含めると1件引くたびにここが実行され、直後の増分検知effectが常にdelta=0とみなしてしまう)。
  useEffect(() => {
    prevDrawn.current = drawnCount;
    eject.current = { active: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity]);

  // drawnCountの増分を検知して演出を開始する。
  // +1なら「1件引く」演出(当選ラベルあり)、+2以上なら「残り全部引く」の短い一斉演出。
  useEffect(() => {
    if (capacity === 0) return;
    const prevCount = prevDrawn.current;
    const delta = drawnCount - prevCount;
    prevDrawn.current = drawnCount;
    if (delta <= 0) return;
    const newNames = drawn.slice(prevCount, drawnCount);

    // 新しい抽選が始まるので、効果音のエッジ検出用フラグもリセットする。
    soundedSlot.current = -1;
    soundedImpactSlot.current = -1;
    soundedExplosion.current = false;
    soundedReveal.current = false;

    // クレーターも今回の分だけリセットして、地面を平らに戻す。
    craterImpacts.current = [];
    craterAppliedDecoy.current = craterAppliedDecoy.current.map(() => false);
    craterAppliedFinal.current = false;
    if (groundMeshRef.current) applyCraters(groundMeshRef.current, []);

    if (newNames.length > 0) {
      // ラベルバッジの配色を、今回の魔法陣の当選色と揃える。
      const ejectColor = randomEjectColor();
      const canvas = buildLabelCanvas(delta === 1 ? newNames[0] : newNames, `#${ejectColor.getHexString()}`);
      labelAspectRef.current = canvas.height / canvas.width;
      const tex = new THREE.CanvasTexture(canvas);
      prevTexture.current?.dispose();
      prevTexture.current = tex;
      if (labelMatRef.current) {
        labelMatRef.current.map = tex;
        labelMatRef.current.needsUpdate = true;
      }
      eject.current = {
        active: true,
        startTime: clock.getElapsedTime(),
        color: ejectColor,
        hasLabel: true,
        holdDuration: delta === 1 ? SINGLE_HOLD : BURST_HOLD,
        decoyStarts: Array.from({ length: DECOY_COUNT }, () => randomDecoyStart()),
        decoyEnds: Array.from({ length: DECOY_COUNT }, () => randomDecoyEnd()),
      };
    } else {
      eject.current = {
        active: true,
        startTime: clock.getElapsedTime(),
        color: randomEjectColor(),
        hasLabel: false,
        holdDuration: BURST_HOLD,
        decoyStarts: Array.from({ length: DECOY_COUNT }, () => randomDecoyStart()),
        decoyEnds: Array.from({ length: DECOY_COUNT }, () => randomDecoyEnd()),
      };
    }
  }, [drawnCount, capacity, drawn, clock]);

  useFrame(({ clock, camera }, delta) => {
    const t = clock.getElapsedTime();
    const ej = eject.current;

    // ヒットストップ: 着弾の瞬間だけ、経過時間の基準(startTime)をdeltaぶん押し出すことで
    // 演出全体の時間をHITSTOP_DURATION秒だけ静止させる(他の全ロジックはetを介しているので、
    // ここでstartTimeを操作するだけで演出全体が連動して止まる)。
    if (ej.active && hitstopRemaining.current > 0) {
      const eaten = Math.min(delta, hitstopRemaining.current);
      ej.startTime += eaten;
      hitstopRemaining.current -= eaten;
    }

    const active = ej.active;
    const color = ej.active ? ej.color : GOLD; // 引くたびにランダムな色
    const hasLabel = ej.active ? ej.hasLabel : false;
    const holdDuration = ej.active ? ej.holdDuration : 0.001;
    const et = ej.active ? t - ej.startTime : 0;

    // 隕石は「おとり」を何個か落としたあと、結果を決める本命の隕石を最後に落とす。
    // slotIndex: 今どの隕石(0〜DECOY_COUNT-1=おとり、DECOY_COUNT=本命)が動いているか。
    let slotIndex = DECOY_COUNT;
    let fallLocalT = METEOR_DURATION;
    let fallDuration = METEOR_DURATION;
    let isDecoyImpactPause = false;
    let decoyImpactLocalT = 0;
    if (active) {
      if (et < DECOY_PHASE_END) {
        slotIndex = Math.max(0, Math.min(DECOY_COUNT - 1, Math.floor(et / DECOY_CYCLE)));
        const withinCycle = et - slotIndex * DECOY_CYCLE;
        fallDuration = DECOY_FALL_DURATION;
        if (withinCycle < DECOY_FALL_DURATION) {
          fallLocalT = withinCycle;
        } else {
          fallLocalT = DECOY_FALL_DURATION;
          isDecoyImpactPause = true;
          decoyImpactLocalT = withinCycle - DECOY_FALL_DURATION;
        }
      } else {
        fallLocalT = Math.min(et - DECOY_PHASE_END, METEOR_DURATION);
      }
    }
    const isFinalSlot = slotIndex === DECOY_COUNT;
    const slotStart = isFinalSlot ? FINAL_METEOR_START : ej.active ? ej.decoyStarts[slotIndex] : FINAL_METEOR_START;
    // おとりごとに違う場所へ着弾させる(本命は必ず中心=METEOR_ENDへ着弾)。
    const slotEnd = isFinalSlot ? METEOR_END : ej.active ? ej.decoyEnds[slotIndex] : METEOR_END;
    // 隕石の落下進捗(このスロットに関して。0=空、1=着弾)。イージングで加速しながら落ちる(重力っぽさ)。
    const fallP = clamp01(fallLocalT / fallDuration);
    const fallEased = easeInQuad(fallP);
    const meteorFalling = active && !isDecoyImpactPause && fallP < 1;
    // おとり隕石が着弾した瞬間の小さな衝撃(0→1→0)。
    const decoyImpactP = isDecoyImpactPause ? Math.max(0, 1 - decoyImpactLocalT / DECOY_IMPACT_PAUSE) ** 2 : 0;

    // 効果音: 新しい隕石が降り始めた瞬間にホイッスルを、おとりが着弾した瞬間に軽い着地音を鳴らす。
    if (meteorFalling && soundedSlot.current !== slotIndex) {
      soundedSlot.current = slotIndex;
      playMeteorWhoosh(fallDuration);
    }
    if (isDecoyImpactPause && soundedImpactSlot.current !== slotIndex) {
      soundedImpactSlot.current = slotIndex;
      playImpactThud();
    }

    const explodeStarted = active && et >= PRE_EXPLODE_DURATION;
    // 爆発基準の経過時間(着弾前は負の値になるので、各所で明示的にガードする)。
    const explodeT = active ? et - PRE_EXPLODE_DURATION : 0;

    if (explodeStarted && !soundedExplosion.current) {
      soundedExplosion.current = true;
      playExplosionBoom();
      hitstopRemaining.current = HITSTOP_DURATION;
    }

    let explodeP = 0;
    let flashP = 0;
    let holdP = 0;
    // fadeMulは常に1(=フェードなし)。次の抽選が始まるまで演出を静かに保ち続け、
    // 上書きされる瞬間(新しいeject.currentが割り当てられた瞬間)にだけ切り替わる。
    const fadeMul = 1;
    if (active) {
      explodeP = clamp01(explodeT / EXPLODE_DURATION);
      // フラッシュは着弾の瞬間にピークを迎え、EXPLODE_DURATIONにかけて減衰する。
      flashP = explodeStarted ? Math.max(0, 1 - explodeT / EXPLODE_DURATION) ** 2 : 0;
      const holdStart = EXPLODE_DURATION;
      // holdPは0→1に settleし、以降はそのまま(1を超えて増え続けない=「落ち着いた状態」を保つ)。
      holdP = clamp01((explodeT - holdStart) / holdDuration);
    }

    // カメラのFOVパンチ: 爆発の瞬間だけ視野角を一瞬広げ、画面全体を揺さぶるような衝撃にする。
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = BASE_FOV + flashP * FOV_PUNCH;
      if (camera.fov !== targetFov) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    }

    // 隕石本体と尾: 空から燃えながら斜めに落ちてくる。おとりは着弾と同時に消えるが、
    // 本命だけは地面に突き刺さった状態のまま次を引くまで残り続け、色も魔法陣の当選色に染まる。
    const meteorScaleMul = isFinalSlot ? 1 : 0.65;
    const finalStuck = active && isFinalSlot && !meteorFalling && fallP >= 1;
    if (meteorRef.current && meteorMatRef.current) {
      if (meteorFalling) {
        meteorRef.current.visible = true;
        meteorRef.current.position.lerpVectors(slotStart, slotEnd, fallEased);
        meteorRef.current.scale.setScalar((0.6 + fallP * 0.8) * meteorScaleMul);
        meteorRef.current.rotation.x += delta * 6;
        meteorRef.current.rotation.z += delta * 4;
        meteorMatRef.current.opacity = 1;
        // 落下中も灰色の岩肌+魔法陣の色のひび割れ発光にする(着弾後と統一)。
        meteorMatRef.current.color.set("#525252");
        meteorMatRef.current.emissive.set(color);
        // 落下中は本命だけ派手に発光させ、おとりはただの岩(発光ほぼなし)にとどめる。
        meteorMatRef.current.emissiveIntensity = isFinalSlot ? 1.3 : 0.15;
      } else if (finalStuck) {
        meteorRef.current.visible = true;
        // 半分ほど地面に埋まって見えるよう、着弾地点よりさらに沈めて固定する(回転も止める)。
        meteorRef.current.position.set(slotEnd.x, slotEnd.y - 0.22, slotEnd.z);
        meteorRef.current.scale.setScalar(1.4);
        meteorMatRef.current.opacity = 1;
        // 着弾後は灰色の岩肌に、ひび割れから魔法陣の光が漏れ出ているような発光にする。
        meteorMatRef.current.color.set("#525252");
        meteorMatRef.current.emissive.set(color);
        meteorMatRef.current.emissiveIntensity = 1.3;
      } else {
        meteorRef.current.visible = false;
        meteorMatRef.current.opacity = 0;
      }
    }
    // 本命が突き刺さった瞬間に1回だけ、大きめのクレーターを作る。
    if (finalStuck && !craterAppliedFinal.current) {
      craterAppliedFinal.current = true;
      craterImpacts.current = [...craterImpacts.current, { x: slotEnd.x, z: slotEnd.z, radius: 0.85, depth: 0.16 }];
      if (groundMeshRef.current) applyCraters(groundMeshRef.current, craterImpacts.current);
    }
    // おとり隕石: それぞれの落下+一時停止サイクルが終わった瞬間から、着弾地点に突き刺さったまま残す。
    for (let i = 0; i < DECOY_COUNT; i += 1) {
      const mesh = decoyStuckRefs.current[i];
      const mat = decoyStuckMatRefs.current[i];
      if (!mesh || !mat) continue;
      if (ej.active && et >= i * DECOY_CYCLE + DECOY_FALL_DURATION) {
        const end = ej.decoyEnds[i];
        mesh.visible = true;
        mesh.position.set(end.x, end.y - 0.16, end.z);
        mat.opacity = 1;
        // 本命の隕石と同じく、灰色の岩肌+ひび割れから魔法陣の光が漏れ出る発光にする。
        mat.color.set("#525252");
        mat.emissive.set(color);
        // 着弾の瞬間に1回だけ、ひとまわり小さいクレーターを作る。
        if (!craterAppliedDecoy.current[i]) {
          craterAppliedDecoy.current[i] = true;
          craterImpacts.current = [...craterImpacts.current, { x: end.x, z: end.z, radius: 0.55, depth: 0.09 }];
          if (groundMeshRef.current) applyCraters(groundMeshRef.current, craterImpacts.current);
        }
      } else {
        mesh.visible = false;
        mat.opacity = 0;
      }
    }
    for (let i = 0; i < METEOR_TRAIL_COUNT; i += 1) {
      const mesh = trailRefs.current[i];
      const mat = trailMatRefs.current[i];
      if (!mesh) continue;
      const trailFallP = meteorFalling ? Math.max(0, fallP - (i + 1) * METEOR_TRAIL_LAG) : 0;
      if (meteorFalling && trailFallP > 0) {
        mesh.visible = true;
        mesh.position.lerpVectors(slotStart, slotEnd, easeInQuad(trailFallP));
        const shrink = 1 - i / METEOR_TRAIL_COUNT;
        mesh.scale.setScalar((0.35 + fallP * 0.5) * shrink * meteorScaleMul);
        if (mat) mat.opacity = 0.6 * shrink;
      } else {
        mesh.visible = false;
        if (mat) mat.opacity = 0;
      }
    }
    // 土煙の軌跡: 火の尾よりさらに後方を、ふわっと大きくなりながら薄れていく灰色の煙で追う。
    // 隕石が通り過ぎた後もすぐには消さず、漂うようにゆっくりフェードアウトさせる。
    for (let i = 0; i < DUST_TRAIL_COUNT; i += 1) {
      const mesh = dustTrailRefs.current[i];
      const mat = dustTrailMatRefs.current[i];
      if (!mesh) continue;
      const shrink = 1 - i / DUST_TRAIL_COUNT;
      const dustFallP = meteorFalling ? Math.max(0, fallP - (i + 1) * DUST_TRAIL_LAG) : 0;
      if (meteorFalling && dustFallP > 0) {
        mesh.position.lerpVectors(slotStart, slotEnd, easeInQuad(dustFallP));
        // 軌跡の方向(=slotEnd向き)にmeshを向け、進行方向だけ長く伸ばして粒同士を繋げる。
        mesh.lookAt(slotEnd);
        const radius = (0.3 + fallP * 0.7 + i * 0.08) * shrink * meteorScaleMul;
        mesh.scale.set(radius, radius, radius * 2.8);
        dustTrailOpacityRef.current[i] = 0.35 * shrink;
      } else {
        // 漂いながらゆっくり大きくなり、薄れて消えていく。
        mesh.position.y += delta * 0.15;
        mesh.scale.multiplyScalar(1 + delta * 0.2);
        dustTrailOpacityRef.current[i] = Math.max(0, dustTrailOpacityRef.current[i] - delta * 0.3);
      }
      const opacity = dustTrailOpacityRef.current[i];
      mesh.visible = opacity > 0.003;
      if (mat) mat.opacity = opacity;
    }

    // 空のフラッシュ: 隕石(おとり・本命とも)が現れる瞬間、その位置がまばゆく光る。
    if (skyFlashRef.current && skyFlashMatRef.current) {
      const skyFlashP = active && !isDecoyImpactPause ? Math.max(0, 1 - fallLocalT / 0.18) ** 2 : 0;
      skyFlashRef.current.position.copy(slotStart);
      skyFlashMatRef.current.color.set(color);
      skyFlashMatRef.current.opacity = skyFlashP * (isFinalSlot ? 1 : 0.6);
    }

    // 魔法陣: 着弾までは隠れていて、爆発の瞬間に一気に本ポップイン(弾む)→フェードで消える。
    const popOvershoot = explodeStarted && explodeP < 1 ? 1 + 0.35 * Math.sin(explodeP * Math.PI) : 1;
    const groupScale = active ? (HIDDEN_SCALE + (1 - HIDDEN_SCALE) * easeOutQuad(explodeP)) * popOvershoot * fadeMul : 0;
    if (circleGroupRef.current) circleGroupRef.current.scale.setScalar(Math.max(0.0001, groupScale));

    // リングは隕石が近づくほど回転が速まり、着弾の瞬間に最速になる。
    const spin1 = active ? 1.2 + fallEased * 4 + flashP * 4 : 0.4;
    const spin2 = active ? -(0.9 + fallEased * 3.2 + flashP * 3) : -0.3;
    if (ring1Ref.current) ring1Ref.current.rotation.z += delta * spin1;
    if (ring2Ref.current) ring2Ref.current.rotation.z += delta * spin2;

    // 明るさ: 着弾の瞬間に最大になる(隕石自体の光はmeteorMatRefが別途担っている)。
    const brightness = active ? Math.max(flashP * 2.6, (1 - holdP) * 0.9) * fadeMul : 0;
    if (discMatRef.current) {
      discMatRef.current.color.set(color);
      discMatRef.current.emissive.set(color);
      discMatRef.current.emissiveIntensity = 0.4 + brightness;
    }
    if (ring1MatRef.current) {
      ring1MatRef.current.color.set(color);
      ring1MatRef.current.emissive.set(color);
      ring1MatRef.current.emissiveIntensity = 0.9 + brightness;
    }
    if (ring2MatRef.current) {
      ring2MatRef.current.color.set(color);
      ring2MatRef.current.emissive.set(color);
      ring2MatRef.current.emissiveIntensity = 0.7 + brightness;
    }

    // 着弾地点の地面: 隕石が近づくほど光る輪が大きく・明るくなり(着弾を予感させる)、
    // おとりの着弾では小さな輪の点滅、本命の着弾の瞬間に1発だけ大きな衝撃波として外へ広がり、
    // ホールド中はラベルの足元で呼吸するように光り続ける。
    if (shockRef.current && shockMatRef.current) {
      if (meteorFalling) {
        shockRef.current.position.set(slotEnd.x, 0, slotEnd.z);
        shockRef.current.scale.setScalar((0.15 + fallP * 0.55) * meteorScaleMul);
        shockMatRef.current.color.set(color);
        shockMatRef.current.opacity = fallP * 0.6 * (isFinalSlot ? 1 : 0.6);
      } else if (isDecoyImpactPause) {
        shockRef.current.position.set(slotEnd.x, 0, slotEnd.z);
        shockRef.current.scale.setScalar(0.3 + decoyImpactP * 0.7);
        shockMatRef.current.color.set(color);
        shockMatRef.current.opacity = decoyImpactP * 0.7;
      } else if (explodeStarted && explodeT < 0.5) {
        const p = explodeT / 0.5;
        shockRef.current.position.set(METEOR_END.x, 0, METEOR_END.z);
        shockRef.current.scale.setScalar(0.2 + p * 2.6);
        shockMatRef.current.color.set(color);
        shockMatRef.current.opacity = (1 - p) * 0.85;
      } else if (explodeStarted && holdP > 0 && holdP < 1) {
        const breathe = 0.5 + 0.5 * Math.sin(t * 3);
        shockRef.current.position.set(METEOR_END.x, 0, METEOR_END.z);
        shockRef.current.scale.setScalar(1.15 + breathe * 0.15);
        shockMatRef.current.color.set(color);
        shockMatRef.current.opacity = (0.12 + breathe * 0.15) * fadeMul;
      } else {
        shockMatRef.current.opacity = 0;
      }
    }

    // サンバースト: 魔法陣から放射状に伸びる光の筋。爆発の瞬間に大きく開き、
    // ホールドでゆっくり収まりながらもゆったり回転し続ける。
    const raysP = active ? Math.max(easeOutQuad(explodeP) * (1 - holdP * 0.5), flashP) : 0;
    if (raysGroupRef.current) {
      raysGroupRef.current.scale.setScalar(Math.max(0.0001, raysP));
      raysGroupRef.current.rotation.z += delta * 0.6;
    }
    const rayOpacity = clamp01(raysP * 0.8) * fadeMul;
    rayMatRefs.current.forEach((mat) => {
      if (!mat) return;
      mat.color.set(color);
      mat.opacity = rayOpacity;
    });

    // 隕石が近づくほど地面がわずかに揺れはじめ(着弾を予感させる)、おとりの着弾では小さな地響き、
    // 本命の着弾の瞬間は大きく震えてズームパンチさせる。
    if (rigRef.current) {
      if (meteorFalling) {
        const rumble = Math.max(0, fallP - 0.5) * 2 * meteorScaleMul; // 落下後半だけ揺れはじめる
        const shakeAmount = 0.02 * rumble;
        rigRef.current.position.set(0, RIG_Y + Math.sin(t * 80) * shakeAmount, Math.cos(t * 74) * shakeAmount);
        rigRef.current.scale.setScalar(1);
      } else if (isDecoyImpactPause) {
        const shakeAmount = decoyImpactP * 0.045;
        rigRef.current.position.set(0, RIG_Y + Math.sin(t * 90) * shakeAmount, Math.cos(t * 95) * shakeAmount);
        rigRef.current.scale.setScalar(1);
      } else if (explodeStarted) {
        const shakeWindow = 0.22;
        if (explodeT < shakeWindow) {
          const shakeAmount = (1 - explodeT / shakeWindow) * 0.09;
          rigRef.current.position.set(0, RIG_Y + Math.sin(t * 55) * shakeAmount, Math.cos(t * 61) * shakeAmount);
        } else {
          rigRef.current.position.set(0, RIG_Y, 0);
        }
        rigRef.current.scale.setScalar(1 + flashP * 0.18);
      } else {
        rigRef.current.position.set(0, RIG_Y, 0);
        rigRef.current.scale.setScalar(1);
      }
    }

    // フラッシュ: 爆発の瞬間に一気に光り、Bloomで画面がまばゆく見える。
    if (flashMatRef.current) {
      flashMatRef.current.color.set(color);
      flashMatRef.current.opacity = clamp01(flashP * 1.6) * fadeMul;
    }

    // 光の柱: 爆発の瞬間に一気に伸び、ホールド中は細く残ってから消える。
    const pillarP = active ? Math.max(easeOutQuad(explodeP) * (1 - holdP * 0.4), flashP) : 0;
    if (pillarGroupRef.current) {
      pillarGroupRef.current.scale.set(1, Math.max(0.0001, Math.min(1.4, pillarP)), 1);
    }
    const pillarOpacity = clamp01(pillarP * 0.3) * fadeMul;
    if (pillarMatRef.current) {
      pillarMatRef.current.color.set(color);
      pillarMatRef.current.opacity = pillarOpacity;
    }

    // 魔法陣の縁を取り囲む虹色の柱: 中心の柱と同じタイミングで伸び縮みするが、
    // 色は当選色ではなく柱ごとに違う色相をゆっくり回して虹色に見せる。
    for (let i = 0; i < RING_PILLAR_COUNT; i += 1) {
      const group = ringPillarGroupRefs.current[i];
      const mat = ringPillarMatRefs.current[i];
      if (!group) continue;
      group.scale.set(1, Math.max(0.0001, Math.min(1.4, pillarP)), 1);
      if (mat) {
        const hue = (i / RING_PILLAR_COUNT + t * 0.3) % 1;
        mat.color.setHSL(hue, 0.85, 0.6);
        mat.opacity = pillarOpacity;
      }
    }

    // 光の粒子: 隕石が落ちてくる間は隠れていて、着弾の瞬間に一気に弾け飛ぶ → 戻ってくる途中で消える
    // (settleした状態で残り続けるのではなく、引き戻される最中にフェードアウトして消える)。
    PARTICLE_SEEDS.forEach((seed, i) => {
      const mesh = particleRefs.current[i];
      const mat = particleMatRefs.current[i];
      if (!mesh) return;
      let radiusMul = 0;
      if (active && explodeStarted) {
        if (explodeT < EXPLODE_DURATION) {
          radiusMul = 0.03 + (PARTICLE_BURST_MULT - 0.03) * easeOutQuad(explodeP);
        } else {
          radiusMul = PARTICLE_BURST_MULT * (1 - holdP) + 1.15 * holdP;
        }
      }
      const angle = seed.angle + t * seed.orbitSpeed;
      const r = seed.baseRadius * radiusMul;
      const y = 0.15 + Math.sin(t * seed.vSpeed + seed.vPhase) * 0.2 + radiusMul * 0.15;
      mesh.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      if (mat) {
        mat.color.set(color);
        mat.emissive.set(color);
        const retractFade = holdP > 0 ? clamp01(1 - holdP / 0.7) : 1;
        mat.opacity = active && explodeStarted ? clamp01(0.5 + brightness * 0.5) * retractFade * fadeMul : 0;
      }
    });

    // 紙吹雪: 爆発の瞬間に四方八方へ飛び出し、重力で放物線を描いて舞い散る。
    CONFETTI_SEEDS.forEach((seed, i) => {
      const mesh = confettiRefs.current[i];
      const mat = confettiMatRefs.current[i];
      if (!mesh) return;
      const ct = explodeStarted ? explodeT : 0;
      mesh.position.set(
        seed.dirX * seed.speed * ct,
        0.15 + seed.dirY * seed.speed * ct - 0.5 * CONFETTI_GRAVITY * ct * ct,
        seed.dirZ * seed.speed * ct
      );
      mesh.rotation.x += delta * seed.spinX;
      mesh.rotation.y += delta * seed.spinY;
      mesh.rotation.z += delta * seed.spinZ;
      if (mat) {
        mat.color.set(seed.colorMix === 0 ? color : seed.colorMix === 1 ? "#ffffff" : GOLD);
        mat.opacity = explodeStarted ? fadeMul : 0;
      }
    });

    // 土煙: 着弾の瞬間に低く這うように広がり、大きくなりながらゆっくり立ち上って消えていく(発光しない)。
    // 雲のように扁平で、ゆっくり脈打つように膨らみ縮みし(もこもこ感)、
    // 中心から遠ざかるほど薄くなって拡散していく。
    DUST_SEEDS.forEach((seed, i) => {
      const mesh = dustRefs.current[i];
      const mat = dustMatRefs.current[i];
      if (!mesh) return;
      const dt = explodeStarted ? explodeT : 0;
      const visible = explodeStarted && dt < DUST_LIFETIME;
      mesh.visible = visible;
      if (visible) {
        const dist = seed.speed * dt;
        mesh.position.set(Math.cos(seed.angle) * dist, 0.05 + seed.riseSpeed * dt, Math.sin(seed.angle) * dist);
        const wobble = 1 + Math.sin(t * 2.2 + seed.wobblePhase) * 0.1;
        const baseScale = (seed.startSize + dt * seed.growRate) * wobble;
        mesh.scale.set(baseScale, baseScale * seed.squashY, baseScale);
        const distFade = clamp01(1 - dist / DUST_MAX_DIST);
        if (mat) mat.opacity = Math.sin(Math.PI * clamp01(dt / DUST_LIFETIME)) * 0.55 * distFade * fadeMul;
      } else if (mat) {
        mat.opacity = 0;
      }
    });

    // 二次的な残り火の雨: 大爆発が少し落ち着いてから、小さな火の粉がホールド中パラパラと降ってくる。
    EMBER_SEEDS.forEach((seed, i) => {
      const mesh = emberRefs.current[i];
      const mat = emberMatRefs.current[i];
      if (!mesh) return;
      const holdElapsed = explodeStarted ? explodeT - EXPLODE_DURATION : -1;
      const raining = active && holdElapsed > 0.15;
      if (raining) {
        const localT = (holdElapsed + seed.phase) % seed.cycleLen;
        const p = localT / seed.cycleLen;
        const y = EMBER_TOP_Y - p * (EMBER_TOP_Y - EMBER_GROUND_Y);
        const sway = Math.sin(t * 1.4 + seed.twinklePhase) * 0.12;
        mesh.visible = true;
        mesh.position.set(Math.cos(seed.angle) * seed.dist + sway, y, Math.sin(seed.angle) * seed.dist);
        const twinkle = 0.5 + 0.5 * Math.sin(t * 9 + seed.twinklePhase);
        const edgeFade = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.15);
        if (mat) {
          // 残り火の雨は当選色ではなく、粒ごとに違う色相をゆっくり回して虹色に見せる。
          const hue = (i / EMBER_COUNT + t * 0.05) % 1;
          mat.color.setHSL(hue, 0.85, 0.6);
          mat.emissive.setHSL(hue, 0.9, 0.55);
          mat.opacity = edgeFade * (0.4 + twinkle * 0.4) * fadeMul;
        }
      } else {
        mesh.visible = false;
        if (mat) mat.opacity = 0;
      }
    });


    // 当選ラベル: 爆発とほぼ同時に、弾むようにポップインする。ホールド中は表示、フェードで消える。
    if (labelSpriteRef.current) {
      const revealStart = PRE_EXPLODE_DURATION + 0.05;
      const showLabel = active && hasLabel && et >= revealStart;
      labelSpriteRef.current.visible = showLabel;
      if (showLabel) {
        if (!soundedReveal.current) {
          soundedReveal.current = true;
          playRevealChime();
        }
        const revealT = et - revealStart;
        const pop = Math.min(1, revealT / 0.22);
        const overshoot = pop < 1 ? 1 + 0.35 * Math.sin(pop * Math.PI) : 1;
        const labelWidth = 1.3;
        labelSpriteRef.current.scale.set(labelWidth * overshoot, labelWidth * labelAspectRef.current * overshoot, 1);
        if (labelMatRef.current) labelMatRef.current.opacity = fadeMul;
      }
    }
  });

  return (
    <group ref={rigRef} position={[0, RIG_Y, 0]}>
      {/* 地面(隕石が実際に着弾する、暗く落ち着いた色の地表)。常に表示され、演出全体と一緒に揺れる。
          魔法陣の円盤(y=0)や衝撃波リング(y=0)と高さがほぼ同じだとz-fightingで表示が
          チラつくため、はっきり分かる分だけ下にずらしておく。隕石の着弾地点をえぐったり
          盛り上げたりできるよう、円ではなく細かく分割した正方形の板にしている
          (地面テクスチャは外周へ行くほど黒に落ちるので、正方形でも見た目は円のまま)。 */}
      <mesh ref={groundMeshRef} position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9, 9, 60, 60]} />
        <meshStandardMaterial ref={groundMatRef} color="#ffffff" roughness={0.9} metalness={0} />
      </mesh>

      {/* 空のフラッシュ(隕石が現れる瞬間、その位置がまばゆく光る。位置は毎フレームその隕石の発生位置へ移動)。 */}
      <mesh ref={skyFlashRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial ref={skyFlashMatRef} color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 隕石本体(空から燃えながら落ちてくる、岩肌+溶岩のひび割れのテクスチャ付き)。 */}
      <mesh ref={meteorRef} visible={false}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial
          ref={meteorMatRef}
          color="#5a2712"
          emissive="#ff8a3d"
          emissiveIntensity={1.3}
          roughness={0.85}
          metalness={0.05}
          transparent
          opacity={0}
        />
      </mesh>
      {/* おとり隕石が着弾後に突き刺さったまま残る、本命よりひとまわり小さい専用メッシュ。 */}
      {Array.from({ length: DECOY_COUNT }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            decoyStuckRefs.current[i] = el;
          }}
        >
          <icosahedronGeometry args={[0.22, 1]} />
          <meshStandardMaterial
            ref={(el) => {
              decoyStuckMatRefs.current[i] = el;
            }}
            color="#5a2712"
            emissive="#ff8a3d"
            emissiveIntensity={1.3}
            roughness={0.85}
            metalness={0.05}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
      {/* 隕石の尾(燃えかすが後方に伸びる、フェードしていく複数の球で表現)。 */}
      {Array.from({ length: METEOR_TRAIL_COUNT }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            trailRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.24, 8, 8]} />
          <meshBasicMaterial
            ref={(el) => {
              trailMatRefs.current[i] = el;
            }}
            color="#ffb347"
            transparent
            opacity={0}
          />
        </mesh>
      ))}
      {/* 土煙の軌跡(火の尾よりさらに後方を漂う、発光しない灰色の煙)。 */}
      {Array.from({ length: DUST_TRAIL_COUNT }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            dustTrailRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshStandardMaterial
            ref={(el) => {
              dustTrailMatRefs.current[i] = el;
            }}
            color="#6b6156"
            roughness={1}
            metalness={0}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 衝撃波リング(押した瞬間に1発だけ大きく外へ広がる)。 */}
      <mesh ref={shockRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.0, 48]} />
        <meshBasicMaterial ref={shockMatRef} color="#ffffff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* サンバースト(魔法陣から放射状に伸びる光の筋)。フラッシュの瞬間に大きく開く。 */}
      <group ref={raysGroupRef} rotation={[-Math.PI / 2, 0, 0]} scale={0.0001}>
        {Array.from({ length: RAY_COUNT }, (_, i) => {
          const a = (i / RAY_COUNT) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * (RAY_LENGTH / 2), Math.sin(a) * (RAY_LENGTH / 2), 0]} rotation={[0, 0, a]}>
              <boxGeometry args={[RAY_LENGTH, RAY_WIDTH, 0.01]} />
              <meshBasicMaterial
                ref={(el) => {
                  rayMatRefs.current[i] = el;
                }}
                color="#ffffff"
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          );
        })}
      </group>

      {/* 魔法陣(円盤+二重リング+ルーン風の刻み)。フラットに寝かせ、チャージでせり出す。 */}
      <group ref={circleGroupRef} rotation={[-Math.PI / 2, 0, 0]} scale={0.0001}>
        <mesh>
          <circleGeometry args={[CIRCLE_RADIUS * 0.92, 48]} />
          <meshStandardMaterial ref={discMatRef} color={GOLD} emissive={GOLD} emissiveIntensity={0.4} transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
        {/* ring1・ring2は円盤(disc)と同じ平面に重なるため、わずかにZをずらしてz-fighting
            (チラつき)を防いでいる。 */}
        <mesh ref={ring1Ref} position={[0, 0, 0.006]}>
          <ringGeometry args={[CIRCLE_RADIUS * 0.94, CIRCLE_RADIUS, 64]} />
          <meshStandardMaterial ref={ring1MatRef} color={GOLD} emissive={GOLD} emissiveIntensity={1.1} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={ring2Ref} position={[0, 0, 0.012]}>
          <ringGeometry args={[CIRCLE_RADIUS * 0.6, CIRCLE_RADIUS * 0.66, 64]} />
          <meshStandardMaterial ref={ring2MatRef} color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* 光の粒子(押した瞬間に爆発)。 */}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            particleRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial
            ref={(el) => {
              particleMatRefs.current[i] = el;
            }}
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={1.3}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 紙吹雪(押した瞬間に飛び出し、重力で舞い散る平らな破片)。 */}
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            confettiRefs.current[i] = el;
          }}
        >
          <boxGeometry args={[0.09, 0.15, 0.01]} />
          <meshStandardMaterial
            ref={(el) => {
              confettiMatRefs.current[i] = el;
            }}
            color="#ffffff"
            roughness={0.6}
            metalness={0.1}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 着弾地点の土煙(発光しないマットな煙の塊が低く這うように広がる)。 */}
      {Array.from({ length: DUST_COUNT }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            dustRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial
            ref={(el) => {
              dustMatRefs.current[i] = el;
            }}
            color="#8a7a6a"
            roughness={1}
            metalness={0}
            transparent
            opacity={0}
          />
        </mesh>
      ))}


      {/* 二次的な残り火の雨(大爆発の後、ホールド中に上から降ってくる小さな火の粉)。 */}
      {Array.from({ length: EMBER_COUNT }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            emberRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.045, 6, 6]} />
          <meshStandardMaterial
            ref={(el) => {
              emberMatRefs.current[i] = el;
            }}
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={1.2}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {/* 光の柱: 実際に丸い筒(円柱)として作る。 */}
      <group ref={pillarGroupRef} scale={[1, 0.0001, 1]}>
        <mesh position={[0, PILLAR_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[PILLAR_TOP_RADIUS, PILLAR_BOTTOM_RADIUS, PILLAR_HEIGHT, 24, 1, true]} />
          <meshBasicMaterial ref={pillarMatRef} color="#ffffff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {/* 魔法陣の縁を取り囲む、虹色の細い光の柱(カメラに近い手前側の弧は除く)。
          円の接線を軸に傾けることで、柱の上端が中心から外側へ開いていくようにする。 */}
      {Array.from({ length: RING_PILLAR_COUNT }, (_, i) => {
        const a = RING_PILLAR_ARC_START + ((i + 0.5) / RING_PILLAR_COUNT) * RING_PILLAR_ARC_SPAN;
        // (中心から見て)外側へ倒れるように接線の向きを取る。符号を逆にすると中心側へ倒れてしまう。
        const tangent = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
        const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tangent, RING_PILLAR_TILT);
        return (
          <group
            key={i}
            position={[Math.cos(a) * RING_PILLAR_RADIUS, 0, Math.sin(a) * RING_PILLAR_RADIUS]}
            quaternion={tiltQuat.toArray() as [number, number, number, number]}
          >
            <group
              scale={[1, 0.0001, 1]}
              ref={(el) => {
                ringPillarGroupRefs.current[i] = el;
              }}
            >
              <mesh position={[0, RING_PILLAR_HEIGHT / 2, 0]}>
                <cylinderGeometry args={[RING_PILLAR_RADIUS_SIZE, RING_PILLAR_RADIUS_SIZE, RING_PILLAR_HEIGHT, 16, 1, true]} />
                <meshBasicMaterial
                  ref={(el) => {
                    ringPillarMatRefs.current[i] = el;
                  }}
                  color="#ffffff"
                  transparent
                  opacity={0}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          </group>
        );
      })}

      {/* フラッシュ球: 収束が完了する瞬間だけ強く光り、Bloomでホワイトアウトのように見せる。 */}
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial ref={flashMatRef} color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 当選ラベル。 */}
      <sprite ref={labelSpriteRef} visible={false} renderOrder={10} position={[0, 1, 0]}>
        <spriteMaterial ref={labelMatRef} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}

// ガチャツールの3Dシーン本体。ライティングと後処理(Bloom等)を設定し、GachaRigを描画する。
export default function GachaScene({
  capacity,
  drawnCount,
  drawn,
}: {
  capacity: number;
  drawnCount: number;
  drawn: string[];
}) {
  return (
    <Canvas shadows camera={{ position: [2.0, 0.45, 4.2], fov: 42 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 4]} intensity={0.9} color="#fff2d6" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3, 2, 2]} intensity={0.4} color="#f59e0b" />
      <pointLight position={[2, 1, -2]} intensity={0.3} color="#ec4899" />
      <NebulaBackground />
      <Stars radius={60} depth={40} count={7000} factor={3} saturation={0} fade speed={0.4} />
      <GachaRig capacity={capacity} drawnCount={drawnCount} drawn={drawn} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.85} intensity={1.9} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
