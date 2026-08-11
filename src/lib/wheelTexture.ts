// ルーレットの各スライスに表示するラベル(角丸の黒いピル型バッジ＋白文字)を
// canvasに描画する。この結果をTHREE.CanvasTextureとしてspriteに貼り付けて使う。
export function buildLabelCanvas(text: string): HTMLCanvasElement {
  const width = 256;
  const height = 96;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  const radius = height / 2 - 4;
  ctx.beginPath();
  ctx.moveTo(radius + 4, 4);
  ctx.arcTo(width - 4, 4, width - 4, height - 4, radius);
  ctx.arcTo(width - 4, height - 4, 4, height - 4, radius);
  ctx.arcTo(4, height - 4, 4, 4, radius);
  ctx.arcTo(4, 4, width - 4, 4, radius);
  ctx.closePath();
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const truncated = text.length > 10 ? `${text.slice(0, 9)}…` : text;
  ctx.fillText(truncated, width / 2, height / 2 + 2);

  return canvas;
}
