"use client";

import { useMemo, useState } from "react";
import { generatePassword, type PasswordOptions } from "@/lib/password";
import { useT } from "@/lib/i18n";
import ToolGrid from "@/components/ToolGrid";

const TOGGLE_KEYS: (keyof Omit<PasswordOptions, "length" | "include">)[] = [
  "uppercase",
  "lowercase",
  "numbers",
  "symbols",
];

export default function PasswordTool() {
  const t = useT();
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
    <ToolGrid>
      <div className="flex flex-col items-center gap-6">
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-violet-500/70 bg-white/5 px-4 py-4 shadow-[0_0_40px_-12px_rgba(139,92,246,0.5)]">
          <span className="break-all font-mono text-lg font-bold tabular-nums text-white sm:text-xl">
            {password || t.password.placeholder}
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={regenerate}
            disabled={!canGenerate}
            className="glow-btn rounded-lg bg-violet-600 px-6 py-2 font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.password.regenerate}
          </button>
          <button
            onClick={copy}
            disabled={!password}
            className="rounded-lg border border-white/15 px-6 py-2 font-medium text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? t.password.copied : t.password.copy}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="w-full">
          <p className="mb-2 flex justify-between text-sm font-medium text-white/60">
            <span>{t.password.lengthLabel}</span>
            <span className="tabular-nums text-white/80">{length}{t.password.lengthUnit}</span>
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
          <p className="mb-2 text-sm font-medium text-white/60">{t.password.includeLabel}</p>
          <input
            type="text"
            value={include}
            onChange={(e) => setInclude(e.target.value)}
            placeholder={t.password.includePlaceholder}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-white placeholder:text-white/30"
          />
          <p className="mt-1 text-xs text-white/40">{t.password.includeHint}</p>
        </div>

        <div className="w-full">
          <p className="mb-2 text-sm font-medium text-white/60">{t.password.charsetLabel}</p>
          <div className="flex flex-wrap gap-2">
            {TOGGLE_KEYS.map((key) => {
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
                  {t.password.toggles[key]}
                </button>
              );
            })}
          </div>
          {noCharsetSelected && (
            <p className={`mt-2 text-sm ${include ? "text-amber-400" : "text-red-400"}`}>
              {include ? t.password.charsetWarnWithInclude : t.password.charsetWarn}
            </p>
          )}
        </div>
      </div>
    </ToolGrid>
  );
}
