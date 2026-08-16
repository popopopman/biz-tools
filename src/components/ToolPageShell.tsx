"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import AdSlot from "@/components/AdSlot";
import type { ToolMeta } from "@/lib/tools";
import { useT } from "@/lib/i18n";

// 各ツールページ(timer/roulette/gacha/dice/password/coin)共通の外枠。
// タイトル・説明文・上下の広告枠を統一し、各ツール固有のUI(children)を
// ガラス調のカード内に表示する。
export default function ToolPageShell({
  tool,
  adSlotBottom,
  fullscreenEnabled = true,
  children,
}: {
  tool: ToolMeta;
  adSlotBottom: string;
  fullscreenEnabled?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const toolT = t.tools[tool.slug];

  const cardRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // 3Dシーンのcanvasはコンテナのbox sizeをResizeObserverで見ているため、
    // fullscreen切り替え時のリサイズは自動で追従する(resizeイベントの手動発火は不要)。
    const onChange = () => setIsFullscreen(document.fullscreenElement === cardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      cardRef.current?.requestFullscreen();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section
        ref={cardRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)] p-5 sm:p-8"
            : "glass-card relative rounded-2xl p-5 sm:p-8"
        }
      >
        {fullscreenEnabled && (
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t.common.fullscreenExit : t.common.fullscreenEnter}
            title={isFullscreen ? t.common.fullscreenExit : t.common.fullscreenEnter}
            className="absolute right-4 top-4 z-10 rounded-lg border border-white/15 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
              </svg>
            )}
          </button>
        )}
        {children}
      </section>

      <section className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span style={{ color: tool.accent }}>{tool.emoji}</span> {toolT.name}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/55">{toolT.description}</p>
      </section>

      <AdSlot slot={adSlotBottom} label={t.common.adBottom(toolT.name)} />
    </div>
  );
}
