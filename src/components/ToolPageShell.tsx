import type { ReactNode } from "react";
import AdSlot from "@/components/AdSlot";
import type { ToolMeta } from "@/lib/tools";

// 4つのツールページ(timer/roulette/kuji/dice)共通の外枠。
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
  return (
    <div className="flex flex-col gap-6">
      <section className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span style={{ color: tool.accent }}>{tool.emoji}</span> {tool.name}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/55">{tool.description}</p>
      </section>

      <AdSlot slot={adSlotTop} label={`${tool.name}上部広告`} />

      <section className="glass-card rounded-2xl p-5 sm:p-8">{children}</section>

      <AdSlot slot={adSlotBottom} label={`${tool.name}下部広告`} />
    </div>
  );
}
