// 1つのツール(タイマー/ルーレット/くじ引き/サイコロ)に関するメタ情報。
// トップページのカード一覧・ヘッダーのナビ・各ツールページの見出しなど、
// 複数箇所から参照する共通データなのでここに一元化している。
export type ToolMeta = {
  slug: string; // URLパス(/timer など)にもそのまま使う識別子
  name: string;
  shortName: string; // ヘッダーナビ用の短い表記
  emoji: string;
  description: string;
  accent: string; // カードのアクセントカラー(枠線・グロー等)
};

export const tools: ToolMeta[] = [
  {
    slug: "timer",
    name: "タイマー",
    shortName: "タイマー",
    emoji: "⏱️",
    description: "会議・プレゼン・休憩時間の計測に。プリセット付きのシンプルなカウントダウンタイマー。",
    accent: "#2563eb",
  },
  {
    slug: "roulette",
    name: "ルーレット",
    shortName: "ルーレット",
    emoji: "🎯",
    description: "項目を登録してくるくる回すだけ。担当決めやランチ選びに使える抽選ルーレット。",
    accent: "#db2777",
  },
  {
    slug: "kuji",
    name: "くじ引き",
    shortName: "くじ引き",
    emoji: "🎴",
    description: "参加者リストから順番や当選者を重複なく抽選。席替えや発表順決めに。",
    accent: "#059669",
  },
  {
    slug: "dice",
    name: "サイコロ",
    shortName: "サイコロ",
    emoji: "🎲",
    description: "面数と個数を選んで振るだけのオンラインダイス。ゲームや簡易抽選に。",
    accent: "#d97706",
  },
];

export function getTool(slug: string): ToolMeta | undefined {
  return tools.find((tool) => tool.slug === slug);
}
