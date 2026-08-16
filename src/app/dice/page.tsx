import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import DiceTool from "@/components/tools/DiceTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("dice")!;
const toolText = dictionaries.ja.tools[tool.slug];

export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function DicePage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="4000000002">
      <DiceTool />
    </ToolPageShell>
  );
}
