"use client";

import { useMemo, useState } from "react";
import { generatePassword, type PasswordOptions } from "@/lib/password";

const TOGGLES: { key: keyof Omit<PasswordOptions, "length" | "include">; label: string }[] = [
  { key: "uppercase", label: "大文字 (A-Z)" },
  { key: "lowercase", label: "小文字 (a-z)" },
  { key: "numbers", label: "数字 (0-9)" },
  { key: "symbols", label: "記号 (!@#...)" },
];

export default function PasswordTool() {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(false);
  const [include, setInclude] = useState("");
  // 手動での再生成ボタン用。オプションが同じでも押すたびに新しい乱数で生成し直すためのカウンタ。
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);

  const options: PasswordOptions = { length, uppercase, lowercase, numbers, symbols, include };
  const noCharsetSelected = !uppercase && !lowercase && !numbers && !symbols;
  const canGenerate = !noCharsetSelected || include.length > 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- seedは意図的にオプション以外の再生成トリガーとして使う
  const password = useMemo(() => (canGenerate ? generatePassword(options) : ""), [length, uppercase, lowercase, numbers, symbols, include, seed]);

  const regenerate = () => {
    setSeed((s) => s + 1);
    setCopied(false);
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では何もしない。
    }
  };

  const toggle = {
    uppercase: setUppercase,
    lowercase: setLowercase,
    numbers: setNumbers,
    symbols: setSymbols,
  } as const;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-violet-500/70 bg-white/5 px-4 py-4 shadow-[0_0_40px_-12px_rgba(139,92,246,0.5)]">
        <span className="break-all font-mono text-lg font-bold tabular-nums text-white sm:text-xl">
          {password || "文字種を選んでください"}
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={regenerate}
          disabled={!canGenerate}
          className="glow-btn rounded-lg bg-violet-600 px-6 py-2 font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          再生成
        </button>
        <button
          onClick={copy}
          disabled={!password}
          className="rounded-lg border border-white/15 px-6 py-2 font-medium text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "コピーしました！" : "コピー"}
        </button>
      </div>

      <div className="w-full">
        <p className="mb-2 flex justify-between text-sm font-medium text-white/60">
          <span>桁数</span>
          <span className="tabular-nums text-white/80">{length}文字</span>
        </p>
        <input
          type="range"
          min={4}
          max={64}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </div>

      <div className="w-full">
        <p className="mb-2 text-sm font-medium text-white/60">含めたい単語・数字(任意)</p>
        <input
          type="text"
          value={include}
          onChange={(e) => setInclude(e.target.value)}
          placeholder="例: Tanaka2024"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-white placeholder:text-white/30"
        />
        <p className="mt-1 text-xs text-white/40">パスワード内のランダムな位置に挿入されます。桁数より長い場合は自動で桁数を広げます。</p>
      </div>

      <div className="w-full">
        <p className="mb-2 text-sm font-medium text-white/60">文字種</p>
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map(({ key, label }) => {
            const active = options[key];
            return (
              <button
                key={key}
                onClick={() => toggle[key](!active)}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  active
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-white/15 text-white/70 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {noCharsetSelected && (
          <p className={`mt-2 text-sm ${include ? "text-amber-400" : "text-red-400"}`}>
            {include ? "残りの桁を埋める文字種も選ぶとより安全です" : "文字種を1つ以上選んでください"}
          </p>
        )}
      </div>
    </div>
  );
}
