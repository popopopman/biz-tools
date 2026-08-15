// 16進カラーをamount分だけ白(正)または黒(負)に混ぜる。バッジのグラデーション・縁取りを
// accentColorから自動生成するための小さなヘルパー。
function shade(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const mix = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const channel = (shift: number) => {
    const c = (num >> shift) & 255;
    return Math.round(c + (mix - c) * t);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function luminance(hex: string): number {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ルーレットの各スライスに表示するラベル(accentColorを基にしたグラデーション地に縁取り＋
// コントラストの取れた文字色)をcanvasに描画する。カジノのネームプレートを思わせる豪華な
// 見た目を狙っている。この結果をTHREE.CanvasTextureとしてspriteに貼り付けて使う。
// 複数件(「残り全部引く」の一括結果)を渡した場合は、1枚のバッジに縦に並べて描く。
export function buildLabelCanvas(text: string | string[], accentColor = "#c9a54e"): HTMLCanvasElement {
  const all = Array.isArray(text) ? text : [text];
  // 件数が多すぎるとバッジが縦に伸びすぎて表示が崩れるため、上限を超えた分は件数表記にまとめる。
  const maxLines = 10;
  const names =
    all.length > maxLines ? [...all.slice(0, maxLines - 1), `他${all.length - (maxLines - 1)}件`] : all;
  const isList = names.length > 1;
  const width = 256;
  const lineHeight = 50;
  const height = isList ? names.length * lineHeight + 28 : 96;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  // ブルームで白飛びして光りすぎないよう、地色はaccentColorから作った控えめなグラデーションにする
  // (縁取りも1本の細い線にとどめる)。
  const top = shade(accentColor, 0.2);
  const bottom = shade(accentColor, -0.4);
  const border = shade(accentColor, -0.55);
  const textColor = luminance(accentColor) > 0.6 ? "#2a1030" : "#fdf8ee";
  // 縁取り(border)は常にaccentColorより暗いので、番号バッジの文字色は別途コントラストを見て決める。
  const badgeTextColor = luminance(accentColor) * 0.6 > 0.35 ? "#2a1030" : "#fffdf5";

  const radius = Math.min(height / 2 - 4, width / 2 - 4, 22);
  ctx.beginPath();
  ctx.moveTo(radius + 4, 4);
  ctx.arcTo(width - 4, 4, width - 4, height - 4, radius);
  ctx.arcTo(width - 4, height - 4, 4, height - 4, radius);
  ctx.arcTo(4, height - 4, 4, 4, radius);
  ctx.arcTo(4, 4, width - 4, 4, radius);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, top);
  fill.addColorStop(1, bottom);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textBaseline = "middle";
  if (isList) {
    // 番号バッジ+左寄せの名前という、実際の当選者リストらしい体裁にする。
    names.forEach((name, i) => {
      const y = 14 + lineHeight * (i + 0.5);
      ctx.fillStyle = border;
      ctx.beginPath();
      ctx.arc(30, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = badgeTextColor;
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 30, y + 1);

      ctx.fillStyle = textColor;
      ctx.font = "700 23px system-ui, sans-serif";
      ctx.textAlign = "left";
      const truncated = name.length > 11 ? `${name.slice(0, 10)}…` : name;
      ctx.fillText(truncated, 52, y);
    });
  } else {
    ctx.fillStyle = textColor;
    ctx.font = "900 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    const truncated = names[0].length > 10 ? `${names[0].slice(0, 9)}…` : names[0];
    ctx.fillText(truncated, width / 2, height / 2 + 2);
  }

  return canvas;
}

// ゴールドパーツ・宝石スライスの表面に貼る、細かい光の粒(グリッター)のテクスチャ。
// meshの`map`として使うと、素材色を保ったまま微妙な粒立ち・キラつきが加わる。
export function buildSparkleCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e9e9e9";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.3 + 0.2;
    const bright = Math.random() > 0.85;
    ctx.fillStyle = bright ? "rgba(255,255,255,0.9)" : `rgba(255,255,255,${(Math.random() * 0.15).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(0,0,0,${(Math.random() * 0.08).toFixed(2)})`;
    ctx.fillRect(x, y, 1, 1);
  }

  return canvas;
}

// カジノのルーレット台を思わせる、ターンド加工(旋盤挽き)の木製ボウル外壁に貼る木目テクスチャ。
// 横方向に流れる濃淡の縞と、いくつかの節(ノット)を重ねて木の質感を出す。
export function buildWoodGrainCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5c3a21";
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 3) {
    const wobble = Math.random() * 3;
    ctx.strokeStyle = `rgba(30,16,6,${(0.15 + Math.random() * 0.25).toFixed(2)})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.04 + y) * wobble);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 4; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 8;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(25,14,6,0.55)");
    grad.addColorStop(1, "rgba(25,14,6,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// ボウル・タレットなど、面積の大きいゴールド/シルバーパーツに貼るヘアライン仕上げの金属テクスチャ。
// 横方向の細い筋を重ねて、鏡面ではなく研磨された金属の質感にする。
export function buildBrushedMetalCanvas(baseColor: string): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${(Math.random() * 0.14).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    if (Math.random() > 0.6) {
      ctx.strokeStyle = `rgba(0,0,0,${(Math.random() * 0.1).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size, y + 0.5);
      ctx.stroke();
    }
  }

  return canvas;
}

// 当選確定時に一瞬光る、放射状のスターバースト(中心の白いグロー＋数本の光線)を
// canvasに描画する。THREE.CanvasTextureとしてspriteに貼り、加算合成で光らせる。
export function buildStarburstCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,240,200,0.75)");
  gradient.addColorStop(0.45, "rgba(212,175,55,0.4)");
  gradient.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255,236,179,0.9)";
  ctx.lineWidth = 4;
  const rayCount = 12;
  for (let i = 0; i < rayCount; i += 1) {
    const angle = (i / rayCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (size / 2), cy + Math.sin(angle) * (size / 2));
    ctx.stroke();
  }

  return canvas;
}
