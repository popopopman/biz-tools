import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import TimerTool from "@/components/tools/TimerTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("timer")!;
const toolText = dictionaries.ja.tools[tool.slug];

// このファイル自体はサーバーコンポーネント(=metadataをexportできる)にしておき、
// 実際のインタラクティブな中身は"use client"のTimerToolに任せている。
export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function TimerPage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="1000000002">
      <TimerTool />
    </ToolPageShell>
  );
}
