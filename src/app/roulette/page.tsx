import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import RouletteTool from "@/components/tools/RouletteTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("roulette")!;
const toolText = dictionaries.ja.tools[tool.slug];

// サーバーコンポーネント(metadata出力用)。中身はクライアント側のRouletteTool。
export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function RoulettePage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="2000000002">
      <RouletteTool />
    </ToolPageShell>
  );
}
