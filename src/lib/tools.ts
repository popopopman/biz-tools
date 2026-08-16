// 1つのツール(タイマー/ルーレット/ガチャ/サイコロ/パスワード生成/コイントス)に関するメタ情報。
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
    accent: "#059669",
  },
  {
    slug: "gacha",
    name: "ガチャ",
    shortName: "ガチャ",
    emoji: "🔮",
    description: "参加者リストから順番や当選者を重複なく抽選。席替えや発表順決めに。",
    accent: "#0891b2",
  },
  {
    slug: "dice",
    name: "サイコロ",
    shortName: "サイコロ",
    emoji: "🎲",
    description: "面数と個数を選んで振るだけのオンラインダイス。ゲームや簡易抽選に。",
    accent: "#d97706",
  },
  {
    slug: "coin",
    name: "コイントス",
    shortName: "コイントス",
    emoji: "🪙",
    description: "3Dコインを投げて表裏を決める。二択の決定やゲームの先攻/後攻決めに。",
    accent: "#eab308",
  },
  {
    slug: "password",
    name: "パスワード生成",
    shortName: "パスワード",
    emoji: "🔑",
    description: "文字種と桁数を選んで安全なパスワードを生成。ワンクリックでコピー可能。",
    accent: "#7c3aed",
  },
];

export function getTool(slug: string): ToolMeta | undefined {
  return tools.find((tool) => tool.slug === slug);
}
