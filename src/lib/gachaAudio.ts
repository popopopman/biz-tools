// ガチャの効果音(隕石の落下音・着弾音・爆発音・当選チャイム)をWeb Audio APIで
// その場に合成する。音源ファイルを用意する代わりに、オシレーター・ノイズを組み合わせて
// 鳴らすだけなので追加アセットが不要で、ブラウザさえあればどこでも同じ音が出る。
let ctx: AudioContext | null = null;
let reverb: ConvolverNode | null = null;

// AudioContextはユーザー操作なしに音を鳴らせない(自動再生ポリシー)ため、
// 「1件引く」ボタンのクリックに端を発するタイミングで初めて生成・resumeする。
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// 減衰するノイズから簡易的な残響(インパルスレスポンス)をその場で合成する。
// 重厚感・豪華さを出すため、爆発音やチャイムをこの送り先にも重ねて奥行きを足す。
function getReverb(audio: AudioContext): ConvolverNode {
  if (reverb) return reverb;
  const duration = 2.0;
  const length = Math.floor(audio.sampleRate * duration);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.2;
    }
  }
  reverb = audio.createConvolver();
  reverb.buffer = impulse;
  reverb.connect(audio.destination);
  return reverb;
}

function createNoiseBuffer(audio: AudioContext, duration: number, curve = 1): AudioBuffer {
  const length = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** curve;
  }
  return buffer;
}

// 隕石(おとり・本命とも)が降り始める瞬間に鳴らす、下降するホイッスル。
// durationはその隕石の落下時間に合わせて渡す(本命は長く、おとりは短く)。
export function playMeteorWhoosh(duration: number): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// おとり隕石が着弾した時の、小さく軽い着地音(本命の爆発とはっきり違う音量・音色にする)。
export function playImpactThud(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const thump = audio.createOscillator();
  const thumpGain = audio.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(95, now);
  thump.frequency.exponentialRampToValueAtTime(32, now + 0.12);
  thumpGain.gain.setValueAtTime(0.22, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  thump.connect(thumpGain).connect(audio.destination);
  thump.start(now);
  thump.stop(now + 0.16);

  const noise = audio.createBufferSource();
  noise.buffer = createNoiseBuffer(audio, 0.05);
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  noise.connect(filter).connect(noiseGain).connect(audio.destination);
  noise.start(now);
}

// 本命の隕石が着弾する瞬間の大爆発。低音の衝撃(sine)+広帯域から低域へ収束していく
// 炸裂ノイズ、の2層構成で「ドォン」という重みを出す。ごく軽くリバーブも送って空間の広さを足す。
export function playExplosionBoom(): void {
  const audio = getContext();
  if (!audio) return;
  const send = getReverb(audio);
  const now = audio.currentTime;

  const thump = audio.createOscillator();
  const thumpGain = audio.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(70, now);
  thump.frequency.exponentialRampToValueAtTime(22, now + 0.35);
  thumpGain.gain.setValueAtTime(0.6, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  const thumpSendGain = audio.createGain();
  thumpSendGain.gain.value = 0.07;
  thump.connect(thumpGain).connect(audio.destination);
  thump.connect(thumpSendGain).connect(send);
  thump.start(now);
  thump.stop(now + 0.5);

  const noise = audio.createBufferSource();
  noise.buffer = createNoiseBuffer(audio, 0.4, 1.5);
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.frequency.exponentialRampToValueAtTime(280, now + 0.4);
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.5, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  const noiseSendGain = audio.createGain();
  noiseSendGain.gain.value = 0.07;
  noise.connect(filter);
  filter.connect(noiseGain).connect(audio.destination);
  filter.connect(noiseSendGain).connect(send);
  noise.start(now);
}

// 爆発の直後、当選ラベルがポップインするのに合わせて鳴らす、駆け上がる短いベルの合図。
// 「レアなアイテムが当たった」ようなキラッとした明るさを狙い、駆け上がるベル+最後に
// 高音のきらめきを添える。低音は足さず、軽くリバーブを送って空気感だけ出す。
export function playRevealChime(): void {
  const audio = getContext();
  if (!audio) return;
  const send = getReverb(audio);
  const now = audio.currentTime;

  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const t0 = now + i * 0.07;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.08, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    const sendGain = audio.createGain();
    sendGain.gain.value = 0.12;
    osc.connect(gain).connect(audio.destination);
    osc.connect(sendGain).connect(send);
    osc.start(t0);
    osc.stop(t0 + 0.45);
  });

  // レアアイテム獲得のような、最後にきらっと光る高音のスパークル。
  const sparkleStart = now + notes.length * 0.07 + 0.03;
  [1567.98, 2093.0].forEach((freq, i) => {
    const t0 = sparkleStart + i * 0.05;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.04, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    const sendGain = audio.createGain();
    sendGain.gain.value = 0.15;
    osc.connect(gain).connect(audio.destination);
    osc.connect(sendGain).connect(send);
    osc.start(t0);
    osc.stop(t0 + 0.32);
  });
}
