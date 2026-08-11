import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import DiceTool from "@/components/tools/DiceTool";
import { getTool } from "@/lib/tools";

const tool = getTool("dice")!;

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のDiceTool。
export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function DicePage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="4000000001" adSlotBottom="4000000002">
      <DiceTool />
    </ToolPageShell>
  );
}
