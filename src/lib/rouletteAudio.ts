// ルーレットの効果音(ポインターのクリック音・当選チャイム)をWeb Audio APIで
// その場に合成する。音源ファイルを用意する代わりに、オシレーター・ノイズ・簡易リバーブを
// 組み合わせて鳴らすだけなので追加アセットが不要で、ブラウザさえあればどこでも同じ音が出る。
let ctx: AudioContext | null = null;
let reverb: ConvolverNode | null = null;

// AudioContextはユーザー操作なしに音を鳴らせない(自動再生ポリシー)ため、
// 「回す」ボタンのクリックハンドラから呼ばれるタイミングで初めて生成・resumeする。
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// 減衰するノイズから簡易的な残響(インパルスレスポンス)をその場で合成する。
// 外部のIRファイルを使わずに、チャイムに「奥行きのある響き」を足すための送り先。
function getReverb(audio: AudioContext): ConvolverNode {
  if (reverb) return reverb;
  const duration = 1.4;
  const length = Math.floor(audio.sampleRate * duration);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
    }
  }
  reverb = audio.createConvolver();
  reverb.buffer = impulse;
  reverb.connect(audio.destination);
  return reverb;
}

// 単発のトーン(sin/triangleの粒)を指定の出力先(ドライ or リバーブ送り)に鳴らす。
function playTone(
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peakGain: number,
  dest: AudioNode,
  type: OscillatorType = "sine"
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// ホイールのポインターが仕切りを1つ越えるたびに鳴らす、実物のクリッカーを模した音。
// フィルターをかけた短いノイズバースト(質感)+高めのサイン波(輪郭)の2層構成。
export function playTick(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const bufferSize = Math.floor(audio.sampleRate * 0.025);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3000;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  noise.connect(filter).connect(noiseGain).connect(audio.destination);
  noise.start(now);

  playTone(audio, 1400, now, 0.03, 0.1, audio.destination, "square");
}

// 当選確定時に鳴らす、低音の一撃(重み)→煌めくベルのカスケード→和音の着地、という
// 3段構成のファンファーレ。ベル系の音はリバーブ送りも重ねて響きに奥行きを出す。
export function playWinChime(): void {
  const audio = getContext();
  if (!audio) return;
  const send = getReverb(audio);
  const now = audio.currentTime;

  // 1. 低音のインパクト。
  const thump = audio.createOscillator();
  const thumpGain = audio.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(180, now);
  thump.frequency.exponentialRampToValueAtTime(55, now + 0.18);
  thumpGain.gain.setValueAtTime(0.5, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  thump.connect(thumpGain).connect(audio.destination);
  thump.start(now);
  thump.stop(now + 0.25);

  // 2. ペンタトニックで駆け上がるベルのカスケード。
  const cascade = [523.25, 659.25, 784.0, 987.77, 1174.66, 1567.98];
  cascade.forEach((freq, i) => {
    const start = now + 0.08 + i * 0.07;
    playTone(audio, freq, start, 0.5, 0.15, audio.destination);
    playTone(audio, freq, start, 0.6, 0.12, send, "triangle");
  });

  // 3. 最後に和音でジャジャーンと着地(リバーブでしっかり余韻を残す)。
  const chordStart = now + 0.08 + cascade.length * 0.07 + 0.06;
  [1046.5, 1318.51, 1567.98].forEach((freq) => {
    playTone(audio, freq, chordStart, 1.1, 0.13, audio.destination);
    playTone(audio, freq, chordStart, 1.4, 0.18, send, "triangle");
  });
}
