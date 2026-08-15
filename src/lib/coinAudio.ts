// コインが台や壁に接触した際の効果音をWeb Audio APIでその場で合成する
// (rouletteAudio.tsと同じ方針。音源ファイルなしでブラウザだけで完結する)。
//
// 着地音(playCoinClink)は、フェルトへの沈み込みを表す低いsineの「ドスッ」に、
// トス音(playCoinTossFlick)と同じ「爪で弾いたような」金属音(自由円板の
// 曲げ振動モード、Rayleighの円板振動理論に基づく1 : 2.32 : 3.95 : 5.96という
// モード比)を重ねている。金属音の部分はscheduleFlickCoreとして共通化してある。
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  return ctx;
}

// 物理演算のonCollisionEnterは短時間に何度も発火しうるため、
// 音が団子になって割れて聞こえないよう最小間隔を空ける。
// 初期値を0にすると、AudioContext生成直後はcurrentTimeも0に近いため
// 「前回の再生から間もない」と誤判定され、最初の1回が鳴らないことがあった。
// 負の値にしておき、初回は必ずこのチェックを通過させる。
let lastPlayAt = -Infinity;
const MIN_INTERVAL = 0.04;

const MODE_RATIOS = [1, 2.32, 3.95, 5.96];
// 着地音(床への接触)は低めに、トス時の弾き音は高めに、と用途ごとに基本周波数を分けている。
const CLINK_FUNDAMENTAL = 1100;
const FLICK_FUNDAMENTAL = 1500;
const MODE_DECAY = [0.09, 0.07, 0.05, 0.04];

// コインが台や壁に当たった瞬間に鳴らす、低い沈み込み音+金属の弾き音。
// speed(衝突時の速さ)が大きいほど衝撃が強いとみなし、音量を持ち上げる。
export function playCoinClink(speed: number): void {
  const audio = getContext();
  if (!audio) return;

  const strength = Math.min(1, speed / 6);
  if (strength < 0.05) return;

  // ページを開いた直後などAudioContextがsuspended状態のままだと、
  // resume()の完了を待たずに音をスケジュールしても再生されない
  // (サスペンド中のAudioContextはグラフを一切処理しない)。
  // 実際にrunning状態になってからスケジュールする。
  if (audio.state === "suspended") {
    audio.resume().then(() => schedule(audio, strength));
    return;
  }
  schedule(audio, strength);
}

function schedule(audio: AudioContext, strength: number): void {
  const now = audio.currentTime;
  if (now - lastPlayAt < MIN_INTERVAL) return;
  lastPlayAt = now;

  // 低く鈍いsineの沈み込み(フェルトへの着地そのもの)。
  const thump = audio.createOscillator();
  const thumpGain = audio.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150, now);
  thump.frequency.exponentialRampToValueAtTime(50, now + 0.08);
  thumpGain.gain.setValueAtTime(0.24 * strength, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
  thump.connect(thumpGain).connect(audio.destination);
  thump.start(now);
  thump.stop(now + 0.1);

  // 低音の沈み込みに、トス時と同じ「爪で弾いたような」金属音を重ねる。
  scheduleFlickCore(audio, now, CLINK_FUNDAMENTAL, strength);
}

// 結果が確定した瞬間に鳴らす、短く軽やかな2音の確認チャイム。
export function playCoinResultChime(): void {
  const audio = getContext();
  if (!audio) return;

  if (audio.state === "suspended") {
    audio.resume().then(() => scheduleChime(audio));
    return;
  }
  scheduleChime(audio);
}

function scheduleChime(audio: AudioContext): void {
  const now = audio.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const start = now + i * 0.09;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

// トスした瞬間に鳴らす、爪でコインの縁を弾いたような音。爪が触れる一瞬の
// 鋭いノイズのアタック(高域だけを残したクリック)に、playCoinClinkと同じ
// モード合成(自由円板の曲げ振動)による金属的な響きを、より高く短く重ねている。
export function playCoinTossFlick(): void {
  const audio = getContext();
  if (!audio) return;

  if (audio.state === "suspended") {
    audio.resume().then(() => scheduleFlick(audio));
    return;
  }
  scheduleFlick(audio);
}

function scheduleFlick(audio: AudioContext): void {
  scheduleFlickCore(audio, audio.currentTime, FLICK_FUNDAMENTAL, 1);
}

// 爪でコインの縁を弾いたような音(クリック+金属モード)の本体。playCoinClink
// (着地音)とplayCoinTossFlick(トス音)の両方から、基本周波数と音量倍率を
// 変えて呼び出す。
function scheduleFlickCore(audio: AudioContext, now: number, fundamental: number, volumeScale: number): void {
  // 爪がコインの縁に触れる一瞬のクリック(高域だけを残した短いノイズバースト)。
  const bufferSize = Math.floor(audio.sampleRate * 0.02);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const highpass = audio.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 4500;
  highpass.Q.value = 0.7;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.35 * volumeScale, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.02);
  noise.connect(highpass).connect(noiseGain).connect(audio.destination);
  noise.start(now);

  // 弾かれたコインが一瞬だけ響く、短い金属モード音。
  const pitch = 1.3;
  MODE_RATIOS.forEach((ratio, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = fundamental * ratio * pitch;
    const decay = MODE_DECAY[i] * 1.4;
    const peak = 0.12 * volumeScale * (1 - i * 0.18);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  });
}

// コインが縁を軸に「コマ」のように回っている間、ループ再生する空気を切る
// ような音。setIntensity(0〜1程度)で回転の速さに応じて音量・音色を追従させ、
// stopでフェードアウトさせてから止める。
export function startCoinSpinHum(): { setIntensity: (v: number) => void; stop: () => void } {
  const audio = getContext();
  if (!audio) return { setIntensity: () => {}, stop: () => {} };
  if (audio.state === "suspended") audio.resume();

  const bufferSize = Math.floor(audio.sampleRate * 0.5);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 700;
  bandpass.Q.value = 3.5;

  const gain = audio.createGain();
  gain.gain.value = 0;

  noise.connect(bandpass).connect(gain).connect(audio.destination);
  noise.start();

  let stopped = false;
  return {
    setIntensity(v: number) {
      if (stopped) return;
      const clamped = Math.max(0, Math.min(1, v));
      const now = audio.currentTime;
      gain.gain.setTargetAtTime(clamped * 0.09, now, 0.05);
      bandpass.frequency.setTargetAtTime(650 + clamped * 900, now, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = audio.currentTime;
      gain.gain.setTargetAtTime(0, now, 0.07);
      noise.stop(now + 0.3);
    },
  };
}

// コマのように回っていたコインが「パタン」と倒れて平らになった瞬間に鳴らす、
// 短く乾いた音(フェルトに当たる柔らかいノイズ+ごく控えめな金属の弾き音)。
export function playCoinFlop(speed: number): void {
  const audio = getContext();
  if (!audio) return;

  const strength = Math.min(1, 0.4 + speed / 6);
  if (audio.state === "suspended") {
    audio.resume().then(() => scheduleFlop(audio, strength));
    return;
  }
  scheduleFlop(audio, strength);
}

function scheduleFlop(audio: AudioContext, strength: number): void {
  const now = audio.currentTime;

  const bufferSize = Math.floor(audio.sampleRate * 0.04);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 650;
  bandpass.Q.value = 0.7;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.28 * strength, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  noise.connect(bandpass).connect(noiseGain).connect(audio.destination);
  noise.start(now);

  scheduleFlickCore(audio, now, CLINK_FUNDAMENTAL, strength * 0.6);
}
