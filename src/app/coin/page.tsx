import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import CoinTool from "@/components/tools/CoinTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("coin")!;
const toolText = dictionaries.ja.tools[tool.slug];

export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function CoinPage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="6000000002">
      <CoinTool />
    </ToolPageShell>
  );
}
