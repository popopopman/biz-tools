import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import TimerTool from "@/components/tools/TimerTool";
import { getTool } from "@/lib/tools";

const tool = getTool("timer")!;

// このファイル自体はサーバーコンポーネント(=metadataをexportできる)にしておき、
// 実際のインタラクティブな中身は"use client"のTimerToolに任せている。
export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function TimerPage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="1000000001" adSlotBottom="1000000002">
      <TimerTool />
    </ToolPageShell>
  );
}
