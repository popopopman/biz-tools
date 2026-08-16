import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import PasswordTool from "@/components/tools/PasswordTool";
import { getTool } from "@/lib/tools";

const tool = getTool("password")!;

export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function PasswordPage() {
  return (
    <ToolPageShell tool={tool} adSlotTop="5000000001" adSlotBottom="5000000002" fullscreenEnabled={false}>
      <PasswordTool />
    </ToolPageShell>
  );
}
