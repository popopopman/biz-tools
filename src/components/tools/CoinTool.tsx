"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { CoinSide } from "@/lib/coin3d";
import SceneErrorBoundary from "@/components/three/SceneErrorBoundary";

// WebGLを使う3Dコインはクライアントでのみ動作するため、ssr:falseで読み込む。
const CoinScene = dynamic(() => import("@/components/three/CoinScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      3Dシーンを読み込み中…
    </div>
  ),
});

const SIDE_LABEL: Record<CoinSide, string> = { front: "表", back: "裏" };

// コイントスツールの外枠。「トスする」ボタンと結果・履歴表示を担当し、
// 実際の回転アニメーション・結果の抽選はCoinScene(3D側)が行う。
export default function CoinTool() {
  // この値を更新するたびにCoinScene側で新しいトスが開始される。
  const [flipToken, setFlipToken] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<CoinSide | null>(null);
  const [history, setHistory] = useState<CoinSide[]>([]);
  // 物理演算が万一収束しなかった場合に備えたフォールバック用タイマー(ダイスと同じ対策)。
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flip = () => {
    if (flipping) return;
    setResult(null);
    setFlipping(true);
    setFlipToken((t) => t + 1);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => setFlipping(false), 6000);
  };

  // CoinScene側でコインが着地し、結果が確定した時に呼ばれる。
  const handleResult = (side: CoinSide) => {
    setResult(side);
    setFlipping(false);
    setHistory((h) => [side, ...h].slice(0, 20));
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  };

  const frontCount = history.filter((s) => s === "front").length;
  const backCount = history.length - frontCount;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="h-[560px] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.04] to-transparent">
        <SceneErrorBoundary>
          <CoinScene trigger={flipToken} onResult={handleResult} />
        </SceneErrorBoundary>
      </div>

      {/* コイン本体の表(金色)・裏(銀色)と同じグラデーションを凡例の丸に使い、
          実際の見た目の色そのままで表裏を判断できるようにしている。 */}
      <div className="flex items-center gap-4 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{ background: "linear-gradient(135deg, #fff6cf, #c99a2e)" }}
          />
          表
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{ background: "linear-gradient(135deg, #f5f5f5, #9a9a9a)" }}
          />
          裏
        </span>
      </div>

      <button
        onClick={flip}
        disabled={flipping}
        className="glow-btn rounded-lg bg-yellow-600 px-8 py-2.5 font-medium text-white hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {flipping ? "トス中…" : "トスする"}
      </button>

      <div className="h-8 text-lg font-semibold text-white">
        {result && <span>結果: {SIDE_LABEL[result]} 🪙</span>}
      </div>

      {history.length > 0 && (
        <div className="w-full max-w-sm space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-white/50">履歴(直近{history.length}回、新しい順)</p>
            <div className="flex flex-wrap gap-1.5">
              {history.map((side, i) => (
                <span
                  key={i}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    i === 0 ? "bg-yellow-600 text-white" : "bg-white/10 text-white/70"
                  }`}
                >
                  {SIDE_LABEL[side]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-4 text-xs text-white/60">
            <span>表 ×{frontCount}</span>
            <span>裏 ×{backCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
