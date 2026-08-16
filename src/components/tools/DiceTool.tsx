"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { playDiceResult } from "@/lib/diceSound";
import { useT } from "@/lib/i18n";
import SceneLoading from "@/components/three/SceneLoading";

// three.js(WebGL)を使う3Dシーンはサーバー側でレンダリングできないため、
// ssr:falseの動的importでクライアントのみで読み込む。
const DiceScene = dynamic(() => import("@/components/three/DiceScene"), {
  ssr: false,
  loading: SceneLoading,
});

// サイコロツールの外枠(2D DOM側)のコンポーネント。
// 実際の物理シミュレーション・出目判定は3D側(DiceScene)に任せ、
// ここでは「個数の選択」「振るボタン」「結果表示」だけを担当する。
export default function DiceTool() {
  const t = useT();
  const [count, setCount] = useState(2);
  // trigger を更新するたびにDiceScene側で新しいロールが発生する
  // (値そのものには意味がなく、変化したことだけが合図になる)。
  const [trigger, setTrigger] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState<number[] | null>(null);
  // 物理演算が万一収束しなかった場合に備えたフォールバック用タイマー。
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roll = () => {
    if (rolling) return;
    setResults(null);
    setRolling(true);
    setTrigger((t) => t + 1);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    // 6秒経っても着地判定が来ない場合は強制的にボタンを再度押せるようにする。
    safetyTimer.current = setTimeout(() => setRolling(false), 6000);
  };

  // DiceScene側で全てのサイコロが静止し、出目が確定した時に呼ばれる。
  const handleAllSettled = (values: number[]) => {
    setResults(values);
    setRolling(false);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    playDiceResult();
  };

  const sum = results?.reduce((a, b) => a + b, 0) ?? null;

  return (
    // 横幅に余裕がある画面ではスクロールせずに操作できるよう、
    // 左にシーン、右に操作(結果・振るボタン・個数)を並べる。
    <div className="grid w-full gap-6 md:grid-cols-[3fr_2fr] md:items-start">
      <div className="h-[380px] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.04] to-transparent sm:h-[560px]">
        <DiceScene count={count} trigger={trigger} onAllSettled={handleAllSettled} />
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-white/60">{t.dice.countLabel}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              disabled={rolling}
              className="h-8 w-8 rounded-full border border-white/15 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              −
            </button>
            <span className="w-6 text-center font-medium text-white">{count}</span>
            <button
              onClick={() => setCount((c) => Math.min(6, c + 1))}
              disabled={rolling}
              className="h-8 w-8 rounded-full border border-white/15 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ＋
            </button>
          </div>
        </div>

        <button
          onClick={roll}
          disabled={rolling}
          className="glow-btn w-full max-w-xs rounded-lg bg-amber-600 px-8 py-2.5 font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rolling ? t.dice.rolling : t.dice.roll}
        </button>

        {/* 結果表示系のUI(出目)は一番下にまとめる。 */}
        <div className="flex min-h-16 flex-wrap items-center justify-center gap-2">
          {results ? (
            <>
              {results.map((v, i) => (
                <span
                  key={i}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600 font-bold text-white shadow-sm"
                >
                  {v}
                </span>
              ))}
              {results.length > 1 && (
                <span className="ml-2 text-sm text-white/60">
                  {t.dice.total} <span className="font-semibold">{sum}</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-white/40">
              {rolling ? t.dice.rolling : t.dice.prompt}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
