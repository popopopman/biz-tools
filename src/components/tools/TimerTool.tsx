"use client";

import { useEffect, useRef, useState } from "react";

// プリセットボタンに表示する時間(秒)。1分・3分・5分・10分・15分・30分。
const PRESETS_SEC = [60, 180, 300, 600, 900, 1800];
// Picture-in-Picture(PinP)ウィンドウとして表示する際のcanvasサイズ。
const PIP_WIDTH = 320;
const PIP_HEIGHT = 180;

// 残り秒数を "MM:SS" 形式の文字列に変換する。
function formatTime(totalSeconds: number) {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// タイマー終了時に鳴らす通知音。Web Audio APIでオシレーターを3回鳴らす
// (音声ファイルを用意しなくても済むようにその場で合成している)。
function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const playTone = (delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      // 急に音量0→最大にすると「プツッ」というノイズが出るため、
      // exponentialRampでフェードイン・フェードアウトさせる。
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    };
    [0, 0.45, 0.9].forEach(playTone);
    // AudioContextを開きっぱなしにするとブラウザに警告されることがあるため、
    // 再生が終わる頃に明示的にcloseする。
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // オーディオが使えない環境(自動再生ブロック等)では何もしない。
  }
}

// PinPウィンドウに表示する1フレームを描画する。
// 残り時間の文字と、終了時は赤字＋メッセージを表示する。
function drawPipFrame(canvas: HTMLCanvasElement, label: string, finished: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0b1120");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = finished ? "#f87171" : "#e2e8f0";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  if (finished) {
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText("時間になりました", canvas.width / 2, canvas.height / 2 + 48);
  }
}

export default function TimerTool() {
  const [durationSec, setDurationSec] = useState(300);
  const [remainingSec, setRemainingSec] = useState(300);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [minutesInput, setMinutesInput] = useState("5");
  const [secondsInput, setSecondsInput] = useState("0");

  // カウントダウンの終了時刻(Date.now()を基準にした絶対時刻)。
  // setIntervalの積み重ねだとタブが非アクティブな間にズレるため、
  // 「終了時刻から逆算」する方式にして誤差を防いでいる。
  const deadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- Picture-in-Picture (PinP) 関連 ---
  // Chrome専用の Document Picture-in-Picture API は使わず、
  // 「canvasの映像をcaptureStreamでvideoに流し、その<video>に対して
  // 標準の requestPictureInPicture() を呼ぶ」方式を採用している。
  // こちらはFirefoxを含む主要ブラウザが対応する共通APIのため。
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);

  // ブラウザがPinPに対応しているかを判定する。
  // サーバー側の静的書き出し時にはdocument/HTMLVideoElementが存在しないため、
  // 初回レンダリング(サーバー・クライアント双方)は必ずfalseにしておき、
  // マウント後のeffectでクライアントの実際の対応状況に更新する。
  // これによりハイドレーション時の表示差分(mismatch)を避けている。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザ機能検出はマウント後にしか行えず、SSRとの表示差分を避けるためeffect内でのみ更新する
    setPipSupported(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        document.pictureInPictureEnabled &&
        typeof HTMLVideoElement !== "undefined" &&
        "requestPictureInPicture" in HTMLVideoElement.prototype
    );
  }, []);

  // PinPウィンドウの開閉をブラウザ側のUI操作(閉じるボタン等)で行った場合も
  // ボタンの表示("PinPで表示"⇔"PinP終了")を追従させるためのイベント購読。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  // 残り時間や終了状態が変わるたびに、PinP用canvasの描画を更新する。
  // (PinPウィンドウを開いていない間も描画自体は続けておき、
  //  開いた瞬間に最新の状態がすぐ映るようにしている)
  useEffect(() => {
    if (canvasRef.current) drawPipFrame(canvasRef.current, formatTime(remainingSec), finished);
  }, [remainingSec, finished]);

  const togglePip = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (!video.srcObject) {
        // captureStreamは初回のみ生成し、以後は同じstreamを使い回す。
        drawPipFrame(canvas, formatTime(remainingSec), finished);
        video.srcObject = canvas.captureStream(30);
        await video.play();
      }
      await video.requestPictureInPicture();
    } catch {
      // ユーザー操作なしでの呼び出しやブラウザ側の拒否は無視する。
    }
  };

  // --- カウントダウン本体 ---
  // requestAnimationFrameで毎フレーム「終了時刻との差分」を計算し直すことで、
  // setIntervalの累積誤差やバックグラウンドタブでの遅延の影響を受けにくくしている。
  useEffect(() => {
    if (!running) return;

    const tick = () => {
      if (deadlineRef.current == null) return;
      const remaining = (deadlineRef.current - Date.now()) / 1000;
      if (remaining <= 0) {
        setRemainingSec(0);
        setRunning(false);
        setFinished(true);
        playBeep();
        return;
      }
      setRemainingSec(remaining);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const start = () => {
    if (remainingSec <= 0) return;
    setFinished(false);
    deadlineRef.current = Date.now() + remainingSec * 1000;
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
  };

  const reset = () => {
    setRunning(false);
    setFinished(false);
    setRemainingSec(durationSec);
  };

  // プリセットボタン・カスタム入力欄から時間を設定する共通処理。
  const applyPreset = (sec: number) => {
    setRunning(false);
    setFinished(false);
    setDurationSec(sec);
    setRemainingSec(sec);
    setMinutesInput(String(Math.floor(sec / 60)));
    setSecondsInput(String(sec % 60));
  };

  const applyCustom = () => {
    const m = Math.max(0, Number(minutesInput) || 0);
    const s = Math.max(0, Math.min(59, Number(secondsInput) || 0));
    const sec = m * 60 + s;
    if (sec <= 0) return;
    applyPreset(sec);
  };

  // 円形プログレスバー(下のバー)の進捗率。0〜1。
  const progress = durationSec > 0 ? 1 - remainingSec / durationSec : 0;

  return (
    <div className="relative mx-auto flex max-w-xl flex-col items-center gap-6">
      {/* PinP用の隠しvideo/canvas。画面には表示しないが、DOMには存在させておく必要がある */}
      <video ref={videoRef} muted playsInline className="pointer-events-none absolute h-px w-px opacity-0" />
      <canvas ref={canvasRef} width={PIP_WIDTH} height={PIP_HEIGHT} className="hidden" />

      <div
        className={`flex h-56 w-56 items-center justify-center rounded-full border-8 text-5xl font-bold tabular-nums transition-colors sm:h-64 sm:w-64 sm:text-6xl ${
          finished ? "animate-pulse border-red-500 text-red-400" : "border-indigo-500/70 text-white"
        }`}
        style={{ boxShadow: finished ? "0 0 40px -8px rgba(248,113,113,0.6)" : "0 0 40px -12px rgba(99,102,241,0.5)" }}
      >
        {formatTime(remainingSec)}
      </div>

      <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      {finished && <p className="text-lg font-semibold text-red-400">時間になりました！</p>}

      <div className="flex flex-wrap justify-center gap-3">
        {!running ? (
          <button
            onClick={start}
            className="glow-btn rounded-lg bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-500"
          >
            スタート
          </button>
        ) : (
          <button
            onClick={pause}
            className="glow-btn rounded-lg bg-amber-500 px-6 py-2 font-medium text-white hover:bg-amber-400"
          >
            一時停止
          </button>
        )}
        <button
          onClick={reset}
          className="rounded-lg border border-white/15 px-6 py-2 font-medium text-white/80 hover:bg-white/10"
        >
          リセット
        </button>
        {pipSupported && (
          <button
            onClick={togglePip}
            className="rounded-lg border border-white/15 px-6 py-2 font-medium text-white/80 hover:bg-white/10"
          >
            {pipActive ? "PinP終了" : "PinPで表示"}
          </button>
        )}
      </div>

      <div className="w-full">
        <p className="mb-2 text-sm font-medium text-white/60">プリセット</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS_SEC.map((sec) => (
            <button
              key={sec}
              onClick={() => applyPreset(sec)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                durationSec === sec
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-white/15 text-white/70 hover:bg-white/10"
              }`}
            >
              {sec % 60 === 0 ? `${sec / 60}分` : `${sec}秒`}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full">
        <p className="mb-2 text-sm font-medium text-white/60">カスタム時間</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={minutesInput}
            onChange={(e) => setMinutesInput(e.target.value)}
            className="w-20 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-white"
          />
          <span className="text-sm text-white/70">分</span>
          <input
            type="number"
            min={0}
            max={59}
            value={secondsInput}
            onChange={(e) => setSecondsInput(e.target.value)}
            className="w-20 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-white"
          />
          <span className="text-sm text-white/70">秒</span>
          <button
            onClick={applyCustom}
            className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            設定
          </button>
        </div>
      </div>
    </div>
  );
}
