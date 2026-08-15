// サイコロのトレイと全く同じ、布の織り目っぽい質感のフェルトテクスチャをcanvasで
// 生成する(元々DiceScene.tsxにあった実装を、他のシーンからも使えるよう切り出した)。
import * as THREE from "three";

// 布の織り目1マス分のピクセルサイズ。
const WEAVE_CELL = 6;
// 床全体を1枚でまかなうテクスチャの解像度。小さいタイルを繰り返す(RepeatWrapping)
// と、同じ模様が周期的に並ぶため必ず境目(タイルの継ぎ目)が見えてしまう。
// 繰り返さずに床全体分を1枚の大きなcanvasに直接描くことで、そもそも継ぎ目が
// 存在しない状態にする。
const FELT_TEXTURE_SIZE = 1024;

// トレイの布(フェルト)っぽい質感を出すため、色に粗めのブロックノイズを乗せた
// 床全体分のテクスチャを1回だけ生成して使い回す(タイル化・繰り返しはしない)。
export function buildFeltColorTexture(baseColor: string): THREE.CanvasTexture {
  const size = FELT_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += WEAVE_CELL) {
    for (let x = 0; x < size; x += WEAVE_CELL) {
      const grain = (Math.random() - 0.5) * 26;
      ctx.fillStyle = `rgba(${grain > 0 ? 255 : 0},${grain > 0 ? 255 : 0},${grain > 0 ? 255 : 0},${Math.abs(grain) / 255})`;
      ctx.fillRect(x, y, WEAVE_CELL, WEAVE_CELL);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// 布の織り目のような凹凸を疑似表現する法線マップ。WEAVE_CELLごとにブロック化した
// ランダムな傾きにすることで、色のテクスチャと同じ粒度の織り目の凹凸に見せる。
// こちらも床全体分を1枚で描き、繰り返しによる継ぎ目が出ないようにする。
export function buildFeltNormalTexture(): THREE.CanvasTexture {
  const size = FELT_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let cy = 0; cy < size; cy += WEAVE_CELL) {
    for (let cx = 0; cx < size; cx += WEAVE_CELL) {
      const nx = (Math.random() - 0.5) * 0.4;
      const ny = (Math.random() - 0.5) * 0.4;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const r = ((nx / len) * 0.5 + 0.5) * 255;
      const g = ((ny / len) * 0.5 + 0.5) * 255;
      const b = ((nz / len) * 0.5 + 0.5) * 255;
      for (let y = cy; y < Math.min(size, cy + WEAVE_CELL); y += 1) {
        for (let x = cx; x < Math.min(size, cx + WEAVE_CELL); x += 1) {
          const i = (y * size + x) * 4;
          image.data[i] = r;
          image.data[i + 1] = g;
          image.data[i + 2] = b;
          image.data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
