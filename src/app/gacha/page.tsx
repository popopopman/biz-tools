import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import GachaTool from "@/components/tools/GachaTool";
import { getTool } from "@/lib/tools";

const tool = getTool("gacha")!;

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のGachaTool。
export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function GachaPage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="3000000001" adSlotBottom="3000000002">
      <GachaTool />
    </ToolPageShell>
  );
}
