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

  // テキストエリアの入力を1行1項目として分割し、空行を除去。
  // 3Dシーンの見やすさ・パフォーマンスを考慮して最大16件に制限。
  const items = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 16);

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
  };

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-[340px] w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.04] to-transparent">
          <RouletteScene items={items} spinToken={spinToken} onResult={handleResult} />
        </div>

        <button
          onClick={spin}
          disabled={spinning || items.length < 2}
          className="glow-btn rounded-lg bg-pink-600 px-8 py-2.5 font-medium text-white hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {spinning ? "回転中…" : "回す"}
        </button>

        <div className="h-8 text-lg font-semibold text-white">
          {winner && <span>結果: {winner} 🎉</span>}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <label className="mb-2 block text-sm font-medium text-white/60">
          項目（1行に1つ、2〜16件）
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
