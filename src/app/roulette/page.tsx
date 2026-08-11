import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import RouletteTool from "@/components/tools/RouletteTool";
import { getTool } from "@/lib/tools";

const tool = getTool("roulette")!;

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のRouletteTool。
export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function RoulettePage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="2000000001" adSlotBottom="2000000002">
      <RouletteTool />
    </ToolPageShell>
  );
}
