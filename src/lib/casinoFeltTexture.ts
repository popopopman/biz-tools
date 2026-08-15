// キルティング風の格子・中央のベッティングサークル・縁のゴールドレールといった、
// カジノフェルトらしい装飾模様だけを描く(色・布地の下地は呼び出し側で用意済みの
// 前提)。buildCasinoFeltTexture、および他の色・織り目の下地に重ねて使う側の
// 両方から呼べるよう独立させてある。
export function drawCasinoFeltPattern(ctx: CanvasRenderingContext2D, size: number) {
  const margin = size * 0.055;

  // キルティング風の斜め格子。プレイエリア(レールの内側)にだけうっすらと。
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin * 1.6, margin * 1.6, size - margin * 3.2, size - margin * 3.2);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  const step = size / 14;
  for (let d = -size; d < size * 2; d += step) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d, size);
    ctx.lineTo(d + size, 0);
    ctx.stroke();
  }
  ctx.restore();

  // 中央のベッティングサークルを思わせる二重リング。
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.16, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.006;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.14, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.003;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  // 縁を囲む白いレール(二重ライン)。
  const drawFrame = (inset: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  };
  drawFrame(margin, size * 0.014, "rgba(255,255,255,0.85)");
  drawFrame(margin + size * 0.02, size * 0.005, "rgba(255,255,255,0.6)");
}

// カジノのテーブルフェルトを思わせる緑のステージ地面をcanvasで生成する。
// テーブル全体を1枚のテクスチャで覆う(リピートしない)ので、ゴールドのレールや
// 中央のベッティングサークルはタイルの継ぎ目を気にせず縁・中央にそのまま描ける。
export function buildCasinoFeltTexture(): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // ベースのフェルト色。中央がやや明るく、縁にかけてビネットで暗く落とす。
  const bg = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
  bg.addColorStop(0, "#189654");
  bg.addColorStop(1, "#0f6633");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 布地のざらつき(細かい斑点を大量にばら撒く)。
  for (let i = 0; i < 9000; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.random() * 30 - 15;
    ctx.fillStyle = `rgba(${16 + shade}, ${90 + shade}, ${52 + shade * 0.6}, 0.18)`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  drawCasinoFeltPattern(ctx, size);

  return canvas;
}
