"use client";

import { useState } from "react";

const DEFAULT_ITEMS = ["Aさん", "Bさん", "Cさん", "Dさん", "Eさん"];

// Fisher-Yatesシャッフル。全ての並び順が等確率で出現する標準的なアルゴリズム。
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// くじ引きツール。
// 「くじ箱を準備する」で参加者リストを一度だけシャッフルし(pool)、
// そこから1件ずつ(または残り全部を一気に)取り出して drawn に積んでいく、
// という「実物のくじ引き」を模した挙動にしている
// (シャッフル自体は最初に1回だけ行い、後は先頭から取り出すだけなので、
//  同じ人が重複して当たることはない)。
export default function KujiTool() {
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS.join("\n"));
  // null = まだくじ箱を準備していない状態。配列 = くじ箱の中身(残り)。
  const [pool, setPool] = useState<string[] | null>(null);
  const [drawn, setDrawn] = useState<string[]>([]);
  // 1件引いた瞬間だけtrueになり、枠を光らせる演出用フラグ。
  const [flash, setFlash] = useState(false);

  const items = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const started = pool !== null;

  // 現在のリストをシャッフルして「くじ箱」を作る。以後はリストの編集を禁止し、
  // 抽選結果の一貫性を保つ(編集し直したい場合は一度リセットする)。
  const startDraw = () => {
    if (items.length < 2) return;
    setPool(shuffle(items));
    setDrawn([]);
  };

  // くじ箱の先頭から1件取り出す(既にシャッフル済みなので単純に先頭を取るだけでよい)。
  const drawOne = () => {
    if (!pool || pool.length === 0) return;
    const [next, ...rest] = pool;
    setPool(rest);
    setDrawn((prev) => [...prev, next]);
    setFlash(true);
    setTimeout(() => setFlash(false), 350);
  };

  // 残り全員を一括で引く(全員分の順番を素早く決めたい場合用)。
  const drawAll = () => {
    if (!pool) return;
    setDrawn((prev) => [...prev, ...pool]);
    setPool([]);
  };

  // くじ箱を空にしてリスト編集画面に戻る。
  const reset = () => {
    setPool(null);
    setDrawn([]);
  };

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <div className="w-full max-w-sm">
        <label className="mb-2 block text-sm font-medium text-white/60">
          参加者・項目（1行に1つ、2件以上）
        </label>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={8}
          disabled={started}
          className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-white/40">{items.length} 件登録中</p>
        {!started ? (
          <button
            onClick={startDraw}
            disabled={items.length < 2}
            className="glow-btn mt-3 w-full rounded-lg bg-emerald-600 px-6 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            くじ箱を準備する
          </button>
        ) : (
          <button
            onClick={reset}
            className="mt-3 w-full rounded-lg border border-white/15 px-6 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            リストを編集し直す
          </button>
        )}
      </div>

      <div className="w-full max-w-sm">
        <div
          className={`flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-xl font-semibold text-white transition ${
            flash ? "scale-105 border-emerald-500 bg-emerald-500/10" : "border-white/15"
          }`}
        >
          {started
            ? pool && pool.length > 0
              ? `残り ${pool.length} 件`
              : "くじ箱は空です"
            : "「くじ箱を準備する」を押してください"}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={drawOne}
            disabled={!started || (pool?.length ?? 0) === 0}
            className="glow-btn flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            1件引く
          </button>
          <button
            onClick={drawAll}
            disabled={!started || (pool?.length ?? 0) === 0}
            className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 font-medium text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            残り全部引く
          </button>
        </div>

        {drawn.length > 0 && (
          <ol className="mt-4 space-y-1.5">
            {drawn.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                {name}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
