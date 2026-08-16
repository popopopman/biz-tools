"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { GACHA_SINGLE_REVEAL_MS } from "@/lib/gachaTiming";
import { useT } from "@/lib/i18n";
import SceneLoading from "@/components/three/SceneLoading";

// three.js(WebGL)を使う3Dシーンはサーバー側でレンダリングできないため、
// ssr:falseの動的importでクライアントのみで読み込む。
const GachaScene = dynamic(() => import("@/components/three/GachaScene"), {
  ssr: false,
  loading: SceneLoading,
});

// Fisher-Yatesシャッフル。全ての並び順が等確率で出現する標準的なアルゴリズム。
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ガチャツール。
// 「ガチャを準備する」で参加者リストを一度だけシャッフルし(pool)、
// そこから1件ずつ(または残り全部を一気に)取り出して drawn に積んでいく、
// という「実物のガチャ」を模した挙動にしている
// (シャッフル自体は最初に1回だけ行い、後は先頭から取り出すだけなので、
//  同じ人が重複して当たることはない)。
// 実際の抽選演出(隕石が降ってきて魔法陣に着弾する3D演出)はGachaSceneが担当し、
// drawnCountの増分をpropsとして渡す。
// 結果のテキスト(drawnリスト表示)は演出のネタバレにならないよう、
// 演出がひと通り終わるタイミング(GACHA_*_REVEAL_MS)までrevealedCountで表示を遅らせている。
export default function GachaTool() {
  const t = useT();
  const [itemsText, setItemsText] = useState(t.gacha.defaultItems.join("\n"));
  // null = まだガチャを準備していない状態。配列 = ガチャの中身(残り)。
  const [pool, setPool] = useState<string[] | null>(null);
  const [drawn, setDrawn] = useState<string[]>([]);
  // drawn配列のうち、先頭から何件までを画面に表示してよいか(演出が終わった件数)。
  const [revealedCount, setRevealedCount] = useState(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  const items = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const started = pool !== null;
  const capacity = started ? (pool?.length ?? 0) + drawn.length : 0;
  // 前回引いた分の演出がまだ表示中(結果テキストがまだ隠れている)かどうか。
  const revealing = revealedCount < drawn.length;

  // 現在のリストをシャッフルして「ガチャ」を準備する。以後はリストの編集を禁止し、
  // 抽選結果の一貫性を保つ(編集し直したい場合は一度リセットする)。
  const startDraw = () => {
    if (items.length < 2) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setPool(shuffle(items));
    setDrawn([]);
    setRevealedCount(0);
  };

  // ガチャの先頭から1件取り出す(既にシャッフル済みなので単純に先頭を取るだけでよい)。
  // 結果のテキストは演出が終わってから表示したいので、revealedCountの更新はタイマーで遅らせる。
  const drawOne = () => {
    if (!pool || pool.length === 0 || revealing) return;
    const [next, ...rest] = pool;
    setPool(rest);
    setDrawn((prev) => [...prev, next]);
    revealTimer.current = setTimeout(() => setRevealedCount((c) => c + 1), GACHA_SINGLE_REVEAL_MS);
  };

  // 残り全員を一括で引く(全員分の順番を素早く決めたい場合用)。
  // 1件引くのような後出しの盛り上がりは不要なので、演出を待たずに全件その場で表示する。
  const drawAll = () => {
    if (!pool || revealing) return;
    const count = pool.length;
    setDrawn((prev) => [...prev, ...pool]);
    setPool([]);
    setRevealedCount((c) => c + count);
  };

  // ガチャを空にしてリスト編集画面に戻る。
  const reset = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setPool(null);
    setDrawn([]);
    setRevealedCount(0);
  };

  return (
    // 横幅に余裕がある画面ではスクロールせずに操作できるよう、
    // 左に演出、右に操作(引くボタン・参加者リスト・結果)を並べる。
    <div className="grid w-full gap-6 md:grid-cols-[3fr_2fr] md:items-start">
      <div className="flex w-full flex-col items-center gap-4">
        <div className="h-[360px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.04] to-transparent sm:h-[480px]">
          <GachaScene capacity={capacity} drawnCount={drawn.length} drawn={drawn} />
        </div>

        <p className="text-sm text-white/60">
          {revealing
            ? t.gacha.revealing
            : started
              ? pool && pool.length > 0
                ? t.gacha.remaining(pool.length)
                : t.gacha.empty
              : t.gacha.prompt}
        </p>
      </div>

      <div className="flex w-full flex-col items-center">
        <div className="w-full max-w-sm">
          <label className="mb-2 block text-sm font-medium text-white/60">
            {t.gacha.itemsLabel}
          </label>
          <textarea
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            rows={8}
            disabled={started}
            className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-white/40">{t.gacha.itemsCount(items.length)}</p>
          {!started ? (
            <button
              onClick={startDraw}
              disabled={items.length < 2}
              className="glow-btn mt-3 w-full rounded-lg bg-cyan-600 px-6 py-2.5 font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.gacha.prepare}
            </button>
          ) : (
            <button
              onClick={reset}
              className="mt-3 w-full rounded-lg border border-white/15 px-6 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              {t.gacha.editList}
            </button>
          )}

          <div className="mt-4 flex w-full gap-2">
            <button
              onClick={drawOne}
              disabled={!started || (pool?.length ?? 0) === 0 || revealing}
              className="glow-btn flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.gacha.drawOne}
            </button>
            <button
              onClick={drawAll}
              disabled={!started || (pool?.length ?? 0) === 0 || revealing}
              className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 font-medium text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.gacha.drawAll}
            </button>
          </div>

          {/* 結果表示系のUI(引いた結果一覧)は一番下にまとめる。 */}
          {revealedCount > 0 && (
            <ol className="mt-4 space-y-1.5">
              {drawn.slice(0, revealedCount).map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {name}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
