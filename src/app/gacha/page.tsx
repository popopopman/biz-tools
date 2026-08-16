import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import GachaTool from "@/components/tools/GachaTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("gacha")!;
const toolText = dictionaries.ja.tools[tool.slug];

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のGachaTool。
export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function GachaPage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="3000000002">
      <GachaTool />
    </ToolPageShell>
  );
}
