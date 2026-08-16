"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// WebGLを使う3Dホイールはクライアントでのみ動作するため、ssr:falseで読み込む。
const RouletteScene = dynamic(() => import("@/components/three/RouletteScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      3Dシーンを読み込み中…
    </div>
  ),
});

const DEFAULT_ITEMS = ["候補A", "候補B", "候補C", "候補D"];

// ルーレットツールの外枠。項目リストの編集と「回す」ボタン、結果表示を担当し、
// 実際の回転アニメーション・当選項目の抽選はRouletteScene(3D側)が行う。
export default function RouletteTool() {
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS.join("\n"));
  // この値を更新するたびにRouletteScene側で新しいスピンが開始される。
  const [spinToken, setSpinToken] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  // 直近の当選履歴(新しい順)。
  const [history, setHistory] = useState<string[]>([]);
  // 結果が確定するたびに増えるトークン。同じ項目に連続で当たっても
  // フラッシュ・結果テキストのポップインを毎回re-triggerするためのkeyに使う。
  const [resultToken, setResultToken] = useState(0);

  // テキストエリアの入力を1行1項目として分割し、空行を除去。
  // 項目が増えるほどラベルは自動で小さくなるが(RouletteScene側)、
  // 際限なく増やせると重くなるため上限は設けておく。
  const items = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);

  const spin = () => {
    if (spinning || items.length < 2) return;
    setWinner(null);
    setSpinning(true);
    setSpinToken((t) => t + 1);
  };

  // RouletteScene側でホイールの回転が止まり、当選項目が確定した時に呼ばれる。
  const handleResult = (name: string) => {
    setWinner(name);
    setSpinning(false);
    setHistory((h) => [name, ...h].slice(0, 12));
    setResultToken((t) => t + 1);
  };

  // 履歴から項目ごとの当選回数を集計(多い順)。
  const tally = Object.entries(
    history.reduce<Record<string, number>>((acc, name) => {
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-[380px] w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[.06] to-transparent sm:h-[560px]">
        <RouletteScene items={items} spinToken={spinToken} onResult={handleResult} />
        {/* 着地の瞬間に画面全体を一瞬光らせるフラッシュ。resultTokenが変わるたびに再生される。 */}
        {winner && (
          <div key={resultToken} className="animate-result-flash pointer-events-none absolute inset-0 bg-white" />
        )}
      </div>

      <button
        onClick={spin}
        disabled={spinning || items.length < 2}
        className={`glow-btn rounded-lg bg-emerald-600 px-8 py-2.5 font-medium text-white transition-transform duration-150 hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
          spinning ? "animate-pulse" : ""
        }`}
      >
        {spinning ? "回転中…" : "回す"}
      </button>

      <div className="h-8 text-lg font-semibold text-white">
        {winner && (
          <span key={resultToken} className="animate-result-pop inline-block">
            結果: {winner} 🎉
          </span>
        )}
      </div>

      {history.length > 0 && (
        <div className="w-full max-w-sm space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-white/50">履歴(直近{history.length}回、新しい順)</p>
            <div className="flex flex-wrap gap-1.5">
              {history.map((name, i) => (
                <span
                  key={i === 0 ? `latest-${resultToken}` : i}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    i === 0 ? "animate-result-pop bg-emerald-600 text-white" : "bg-white/10 text-white/70"
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-white/50">集計</p>
            <div className="flex flex-wrap gap-1.5">
              {tally.map(([name, count]) => (
                <span key={name} className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70">
                  {name} <span className="text-white/40">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm">
        <label className="mb-2 block text-sm font-medium text-white/60">
          項目（1行に1つ、2〜30件）
        </label>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white"
        />
        <p className="mt-1 text-xs text-white/40">{items.length} 件登録中</p>
      </div>
    </div>
  );
}
