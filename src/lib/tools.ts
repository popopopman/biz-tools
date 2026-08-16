import type { ToolSlug } from "@/lib/dictionaries";

// 1つのツール(タイマー/ルーレット/ガチャ/サイコロ/パスワード生成/コイントス)に関するメタ情報。
// 名前・説明文などの表示テキストはロケールに依存するため src/lib/dictionaries.ts が
// 単一の情報源であり、ここでは持たない(ロケール非依存のslug/emoji/accentのみ)。
export type ToolMeta = {
  slug: ToolSlug; // URLパス(/timer など)にもそのまま使う識別子
  emoji: string;
  accent: string; // カードのアクセントカラー(枠線・グロー等)
};

export const tools: ToolMeta[] = [
  { slug: "timer", emoji: "⏱️", accent: "#2563eb" },
  { slug: "roulette", emoji: "🎯", accent: "#059669" },
  { slug: "gacha", emoji: "🔮", accent: "#0891b2" },
  { slug: "dice", emoji: "🎲", accent: "#d97706" },
  { slug: "coin", emoji: "🪙", accent: "#eab308" },
  { slug: "password", emoji: "🔑", accent: "#7c3aed" },
];

export function getTool(slug: string): ToolMeta | undefined {
  return tools.find((tool) => tool.slug === slug);
}
