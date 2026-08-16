import type { Metadata } from "next";
import ToolPageShell from "@/components/ToolPageShell";
import PasswordTool from "@/components/tools/PasswordTool";
import { getTool } from "@/lib/tools";
import { dictionaries } from "@/lib/dictionaries";

const tool = getTool("password")!;
const toolText = dictionaries.ja.tools[tool.slug];

export const metadata: Metadata = {
  title: toolText.name,
  description: toolText.description,
};

export default function PasswordPage() {
  return (
    <ToolPageShell tool={tool} adSlotBottom="5000000002" fullscreenEnabled={false}>
      <PasswordTool />
    </ToolPageShell>
  );
}
