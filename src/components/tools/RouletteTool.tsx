"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import SceneLoading from "@/components/three/SceneLoading";

// WebGLを使う3Dホイールはクライアントでのみ動作するため、ssr:falseで読み込む。
const RouletteScene = dynamic(() => import("@/components/three/RouletteScene"), {
  ssr: false,
  loading: SceneLoading,
});

// ルーレットツールの外枠。項目リストの編集と「回す」ボタン、結果表示を担当し、
// 実際の回転アニメーション・当選項目の抽選はRouletteScene(3D側)が行う。
export default function RouletteTool() {
  const t = useT();
  const [itemsText, setItemsText] = useState(t.roulette.defaultItems.join("\n"));
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
    // 横幅に余裕がある画面ではスクロールせずに操作できるよう、
    // 左にホイール、右に操作(スピンボタン・結果・項目編集)を並べる。
    <div className="grid w-full gap-6 md:grid-cols-[3fr_2fr] md:items-start">
      <div className="relative h-[380px] w-full overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[.06] to-transparent sm:h-[560px]">
        <RouletteScene items={items} spinToken={spinToken} onResult={handleResult} />
        {/* 着地の瞬間に画面全体を一瞬光らせるフラッシュ。resultTokenが変わるたびに再生される。 */}
        {winner && (
          <div key={resultToken} className="animate-result-flash pointer-events-none absolute inset-0 bg-white" />
        )}
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="w-full max-w-sm">
          <label className="mb-2 block text-sm font-medium text-white/60">
            {t.roulette.itemsLabel}
          </label>
          <textarea
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white"
          />
          <p className="mt-1 text-xs text-white/40">{t.roulette.itemsCount(items.length)}</p>
        </div>

        <button
          onClick={spin}
          disabled={spinning || items.length < 2}
          className={`glow-btn w-full max-w-sm rounded-lg bg-emerald-600 px-8 py-2.5 font-medium text-white transition-transform duration-150 hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
            spinning ? "animate-pulse" : ""
          }`}
        >
          {spinning ? t.roulette.spinning : t.roulette.spin}
        </button>

        {/* 結果表示系のUI(直近の結果・履歴・集計)は一番下にまとめる。 */}
        <div className="h-8 text-lg font-semibold text-white">
          {winner && (
            <span key={resultToken} className="animate-result-pop inline-block">
              {t.roulette.result(winner)}
            </span>
          )}
        </div>

        {history.length > 0 && (
          <div className="w-full max-w-sm space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-white/50">{t.roulette.history(history.length)}</p>
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
              <p className="mb-1.5 text-xs font-medium text-white/50">{t.roulette.tally}</p>
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
      </div>
    </div>
  );
}
