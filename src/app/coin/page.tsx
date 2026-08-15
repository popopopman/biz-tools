import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import CoinTool from "@/components/tools/CoinTool";
import { getTool } from "@/lib/tools";

const tool = getTool("coin")!;

export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function CoinPage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="6000000001" adSlotBottom="6000000002">
      <CoinTool />
    </ToolPageShell>
  );
}
