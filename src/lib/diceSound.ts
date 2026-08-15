let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastPlayAt = 0;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// 減衰するホワイトノイズの短いバッファを1回だけ作って使い回す(ノック音の元ネタ)。
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const duration = 0.05;
    const length = Math.floor(ctx.sampleRate * duration);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

// サイコロが床・壁・他のサイコロにぶつかった時の「コツッ」という短いノック音を、
// 音声ファイルを用意せずWeb Audio APIでその場合成して鳴らす。
//
// 木琴のように特定の音程で「響かせる」方式を試したが、実物のダイスの音のイメージとは
// 違っていた。実際のダイス衝突音を分析した資料(MIT 21M.380 "Dice Rolling Model",
// Florian Hollerweger, 2014)によると、木のテーブルにダイスが当たる音("clunk")は
// 特定の音程を持つ響きではなく、10〜20ms程度のごく短いノイズで、しかもローパス
// フィルタのカットオフが高い方(~10kHz)から低い方(~3kHz)へ一瞬で下がっていく
// "下降チャープ"だと分析されている。これをそのまま再現する
// (ノイズ+下降するローパスフィルタのみで、共鳴音・ピッチ音は使わない)。
// intensity(衝突の速さ)に応じて音量を変え、勢いが伝わるようにする。
export function playDiceKnock(intensity: number) {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // 転がっている間は同時に大量の衝突イベントが飛んでくるため、
  // 短時間に何度も鳴らさないよう間引く(間隔を広めにして、連打が
  // ノイズの壁のように聞こえて「反響」っぽく感じるのを防ぐ)。
  if (now - lastPlayAt < 0.07) return;

  // カットオフを下げるほどホワイトノイズの大半のエネルギーが削られて音量が
  // 下がってしまうため、ここで底上げしておく。
  const volume = Math.min(1, intensity / 8) * 4.2;
  if (volume < 0.02) return;
  lastPlayAt = now;

  const duration = 0.012 + Math.random() * 0.008;

  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);

  // カットオフを一瞬で下降させる(資料が言う"下降チャープ")。全体を低めの帯域に
  // 移すことで、耳に痛い高域の耳障りさを抑える。
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(100 + Math.random() * 800, now);
  filter.frequency.exponentialRampToValueAtTime(900 + Math.random() * 300, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.005);
}

// 全てのサイコロが静止して出目が確定した時に鳴らす、短く明るいベルのような
// 確定音。衝突ノック音(低め・ノイズ主体)とはっきり違う音色にするため、
// サイン波中心の2音チャイムにしている。
export function playDiceResult() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // ドミソの「ソ」「ド」にあたる完全4度上の2音を少しずらして鳴らし、
  // 「ピンポン」のような達成感のある響きにする。
  const notes: { freq: number; start: number; duration: number; volume: number }[] = [
    { freq: 880, start: 0, duration: 0.35, volume: 0.22 },
    { freq: 1174.66, start: 0.09, duration: 0.45, volume: 0.22 },
  ];

  for (const note of notes) {
    const t0 = now + note.start;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = note.freq;

    // 少し明るさを足すオクターブ上の倍音(控えめに混ぜる)。
    const harmonic = ctx.createOscillator();
    harmonic.type = "sine";
    harmonic.frequency.value = note.freq * 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(note.volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + note.duration);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.25;

    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + note.duration + 0.02);
    harmonic.start(t0);
    harmonic.stop(t0 + note.duration + 0.02);
  }
}
