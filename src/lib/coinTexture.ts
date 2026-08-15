// コインの見た目(表・裏の刻印面、側面の溝)をcanvasで生成する。
// 色用(map)と、光の当たり方で凹凸を表現するグレースケール用(bumpMap)を対にして作る。
const FACE_SIZE = 256;

function drawBeadedBorder(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  beadRadius: number,
  color: string
) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, beadRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

// 縁の粒模様+二重リングを描く(表裏共通の下地)。
function drawRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, beadColor: string, ringColors: [string, string]) {
  drawBeadedBorder(ctx, cx, cy, r * 0.9, 48, r * 0.015, beadColor);
  [
    { f: 0.8, width: r * 0.012, color: ringColors[0] },
    { f: 0.76, width: r * 0.006, color: ringColors[1] },
  ].forEach(({ f, width, color }) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  });
}

// 太陽をかたどった放射状の刻印(表面用)。三角形の光条を交互の濃淡で描き、
// 立体的な浮き彫りに見せる。
function drawSunburst(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lightColor: string, darkColor: string) {
  const rayCount = 20;
  const innerR = r * 0.16;
  const outerR = r * 0.58;
  const halfSpread = (Math.PI / rayCount) * 0.62;
  for (let i = 0; i < rayCount; i += 1) {
    const angle = (i / rayCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle - halfSpread) * innerR, cy + Math.sin(angle - halfSpread) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.lineTo(cx + Math.cos(angle + halfSpread) * innerR, cy + Math.sin(angle + halfSpread) * innerR);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? lightColor : darkColor;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = darkColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = lightColor;
  ctx.fill();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number) {
  ctx.beginPath();
  const points = 5;
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// 五芒星の刻印(裏面用)。地の金属色を塗りつぶさず、影を先に・ハイライトを
// あとに重ねる(drawSunburstの中央の二重円と同じ順序)ことで、左上から光が
// 当たって浮き上がった金属の凹凸に見せる。
function drawStarEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const outerR = r * 0.5;
  const innerR = r * 0.19;
  const offset = r * 0.025;

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  starPath(ctx, cx + offset, cy + offset, outerR, innerR);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  starPath(ctx, cx - offset, cy - offset, outerR, innerR);
  ctx.fill();

  // シルエットを薄く縁取って輪郭を引き締める。
  ctx.lineWidth = r * 0.008;
  ctx.strokeStyle = "rgba(60,50,20,0.3)";
  starPath(ctx, cx, cy, outerR, innerR);
  ctx.stroke();
}

// 硬貨らしい「縁の粒模様+二重リング+中央の刻印」を描いた色用テクスチャ。
function drawFaceColor(emblem: "sunburst" | "star", colorFrom: string, colorTo: string): HTMLCanvasElement {
  const size = FACE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, colorFrom);
  grad.addColorStop(1, colorTo);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  drawRings(ctx, cx, cy, r, "rgba(0,0,0,0.3)", ["rgba(0,0,0,0.28)", "rgba(255,255,255,0.4)"]);
  drawBeadedBorder(ctx, cx, cy, r * 0.9, 48, r * 0.009, "rgba(255,255,255,0.5)");

  if (emblem === "sunburst") {
    drawSunburst(ctx, cx, cy, r, "rgba(255,255,255,0.55)", "rgba(0,0,0,0.35)");
  } else {
    drawStarEmblem(ctx, cx, cy, r);
  }

  return canvas;
}

// 上と同じ構図をグレースケールで描いた凹凸マップ。明るいほど高く盛り上がって見える。
function drawFaceBump(emblem: "sunburst" | "star"): HTMLCanvasElement {
  const size = FACE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#a0a0a0";
  ctx.fill();

  drawBeadedBorder(ctx, cx, cy, r * 0.9, 48, r * 0.017, "#ffffff");

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.012;
  ctx.strokeStyle = "#e8e8e8";
  ctx.stroke();

  if (emblem === "sunburst") {
    drawSunburst(ctx, cx, cy, r, "#ffffff", "#707070");
  } else {
    // 色用のdrawStarEmblemと同じ「影を先に・ハイライトをあとに」の配置にして、
    // 星の内部にも陰影の勾配(=凹凸)を持たせる(平らな一枚岩の盛り上がりにしない)。
    const outerR = r * 0.5;
    const innerR = r * 0.19;
    const offset = r * 0.025;
    ctx.fillStyle = "#707070";
    starPath(ctx, cx + offset, cy + offset, outerR, innerR);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    starPath(ctx, cx - offset, cy - offset, outerR, innerR);
    ctx.fill();
  }

  return canvas;
}

// 側面(ギザ)用の縦縞テクスチャ。CylinderGeometryの側面にrepeatWrapで敷き詰めて
// 硬貨の「ギザ10」のような刻み目を再現する。色用と凹凸用を対で作る。
function buildEdgeStripes(colors: [string, string]): HTMLCanvasElement {
  const width = 128;
  const height = 16;
  const grooves = 64;
  const stripeWidth = width / grooves;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < grooves; i += 1) {
    ctx.fillStyle = colors[i % 2];
    ctx.fillRect(i * stripeWidth, 0, stripeWidth, height);
  }
  return canvas;
}

export function buildCoinTextures() {
  return {
    front: { color: drawFaceColor("sunburst", "#fff6cf", "#c99a2e"), bump: drawFaceBump("sunburst") },
    back: { color: drawFaceColor("star", "#f5f5f5", "#9a9a9a"), bump: drawFaceBump("star") },
    edge: {
      color: buildEdgeStripes(["#b8860b", "#8a660a"]),
      bump: buildEdgeStripes(["#ffffff", "#404040"]),
    },
  };
}
