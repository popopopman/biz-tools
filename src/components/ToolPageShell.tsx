"use client";

import type { ReactNode } from "react";
import AdSlot from "@/components/AdSlot";
import type { ToolMeta } from "@/lib/tools";
import { useT } from "@/lib/i18n";

// 各ツールページ(timer/roulette/gacha/dice/password/coin)共通の外枠。
// タイトル・説明文・上下の広告枠を統一し、各ツール固有のUI(children)を
// ガラス調のカード内に表示する。
export default function ToolPageShell({
  tool,
  adSlotTop,
  adSlotBottom,
  children,
}: {
  tool: ToolMeta;
  adSlotTop: string;
  adSlotBottom: string;
  children: ReactNode;
}) {
  const t = useT();
  const toolT = t.tools[tool.slug as keyof typeof t.tools];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <AdSlot slot={adSlotTop} label={t.common.adTop(toolT.name)} />

      <section className="glass-card rounded-2xl p-5 sm:p-8">{children}</section>

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
