import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import KujiTool from "@/components/tools/KujiTool";
import { getTool } from "@/lib/tools";

const tool = getTool("kuji")!;

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のKujiTool。
export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function KujiPage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="3000000001" adSlotBottom="3000000002">
      <KujiTool />
    </ToolPageShell>
  );
}
