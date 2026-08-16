"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "ja" | "en";

const ja = {
  common: {
    loadingScene: "3Dシーンを読み込み中…",
    adTop: (name: string) => `${name}上部広告`,
    adBottom: (name: string) => `${name}下部広告`,
    adSide: "サイド広告",
    fullscreenEnter: "全画面表示",
    fullscreenExit: "全画面終了",
  },
  header: {
    siteName: "🧰 便利ツール",
    menuLabel: "メニュー",
  },
  footer: {
    copyright: (year: number) =>
      `© ${year} 便利ツール. すべての機能はブラウザ内で完結し、入力データはサーバーに送信されません。`,
  },
  home: {
    kicker: "Free Online Tools",
    title: "業務でそのまま使える無料ツール集",
    subtitle:
      "会議・研修・イベントで役立つタイマー、ルーレット、ガチャ、サイコロ。会員登録不要・インストール不要、ブラウザだけで完結します。",
    useIt: "使ってみる →",
    adName: "ホーム",
  },
  tools: {
    timer: {
      name: "タイマー",
      shortName: "タイマー",
      description: "会議・プレゼン・休憩時間の計測に。プリセット付きのシンプルなカウントダウンタイマー。",
    },
    roulette: {
      name: "ルーレット",
      shortName: "ルーレット",
      description: "項目を登録してくるくる回すだけ。担当決めやランチ選びに使える抽選ルーレット。",
    },
    gacha: {
      name: "ガチャ",
      shortName: "ガチャ",
      description: "参加者リストから順番や当選者を重複なく抽選。席替えや発表順決めに。",
    },
    dice: {
      name: "サイコロ",
      shortName: "サイコロ",
      description: "面数と個数を選んで振るだけのオンラインダイス。ゲームや簡易抽選に。",
    },
    password: {
      name: "パスワード生成",
      shortName: "パスワード",
      description: "文字種と桁数を選んで安全なパスワードを生成。ワンクリックでコピー可能。",
    },
    coin: {
      name: "コイントス",
      shortName: "コイントス",
      description: "3Dコインを投げて表裏を決める。二択の決定やゲームの先攻/後攻決めに。",
    },
  },
  timer: {
    presetLabel: "プリセット",
    customTimeLabel: "カスタム時間",
    start: "スタート",
    pause: "一時停止",
    reset: "リセット",
    pipShow: "PinPで表示",
    pipEnd: "PinP終了",
    finished: "時間になりました！",
    finishedShort: "時間になりました",
    minuteUnit: "分",
    secondUnit: "秒",
    setButton: "設定",
    presetChip: (sec: number) => (sec % 60 === 0 ? `${sec / 60}分` : `${sec}秒`),
  },
  roulette: {
    defaultItems: ["候補A", "候補B", "候補C", "候補D"],
    spinning: "回転中…",
    spin: "回す",
    result: (name: string) => `結果: ${name} 🎉`,
    history: (n: number) => `履歴(直近${n}回、新しい順)`,
    tally: "集計",
    itemsLabel: "項目（1行に1つ、2〜30件）",
    itemsCount: (n: number) => `${n} 件登録中`,
  },
  gacha: {
    defaultItems: ["Aさん", "Bさん", "Cさん", "Dさん", "Eさん"],
    revealing: "演出中…",
    remaining: (n: number) => `残り ${n} 件`,
    empty: "ガチャは空です",
    prompt: "「ガチャを準備する」を押してください",
    drawOne: "1件引く",
    drawAll: "残り全部引く",
    itemsLabel: "参加者・項目（1行に1つ、2件以上）",
    itemsCount: (n: number) => `${n} 件登録中`,
    prepare: "ガチャを準備する",
    editList: "リストを編集し直す",
  },
  dice: {
    rolling: "振っています…",
    prompt: "「サイコロを振る」を押してください",
    roll: "サイコロを振る",
    total: "合計:",
    countLabel: "個数",
    history: (n: number) => `履歴(直近${n}回、新しい順)`,
  },
  coin: {
    front: "表",
    back: "裏",
    flipping: "トス中…",
    flip: "トスする",
    result: (label: string) => `結果: ${label} 🪙`,
    history: (n: number) => `履歴(直近${n}回、新しい順)`,
  },
  password: {
    toggles: {
      uppercase: "大文字 (A-Z)",
      lowercase: "小文字 (a-z)",
      numbers: "数字 (0-9)",
      symbols: "記号 (!@#...)",
    },
    placeholder: "文字種を選んでください",
    regenerate: "再生成",
    copy: "コピー",
    copied: "コピーしました！",
    lengthLabel: "桁数",
    lengthUnit: "文字",
    includeLabel: "含めたい単語・数字(任意)",
    includePlaceholder: "例: Tanaka2024",
    includeHint: "パスワード内のランダムな位置に挿入されます。桁数より長い場合は自動で桁数を広げます。",
    charsetLabel: "文字種",
    charsetWarnWithInclude: "残りの桁を埋める文字種も選ぶとより安全です",
    charsetWarn: "文字種を1つ以上選んでください",
  },
};

const en: typeof ja = {
  common: {
    loadingScene: "Loading 3D scene…",
    adTop: (name) => `${name} top ad`,
    adBottom: (name) => `${name} bottom ad`,
    adSide: "Side ad",
    fullscreenEnter: "Fullscreen",
    fullscreenExit: "Exit fullscreen",
  },
  header: {
    siteName: "🧰 Handy Tools",
    menuLabel: "Menu",
  },
  footer: {
    copyright: (year) =>
      `© ${year} Handy Tools. Everything runs in your browser — no input data is sent to a server.`,
  },
  home: {
    kicker: "Free Online Tools",
    title: "Free tools you can use at work right now",
    subtitle:
      "A timer, roulette, gacha draw, and dice for meetings, training, and events. No sign-up, no install — just your browser.",
    useIt: "Try it →",
    adName: "Home",
  },
  tools: {
    timer: {
      name: "Timer",
      shortName: "Timer",
      description: "For timing meetings, presentations, and breaks. A simple countdown timer with presets.",
    },
    roulette: {
      name: "Roulette",
      shortName: "Roulette",
      description: "Add items and spin. A drawing wheel for picking who's up next or where to eat lunch.",
    },
    gacha: {
      name: "Gacha",
      shortName: "Gacha",
      description:
        "Draw order or winners from a participant list with no repeats. Great for seating or presentation order.",
    },
    dice: {
      name: "Dice",
      shortName: "Dice",
      description: "Pick the number of sides and dice, then roll. An online dice for games or quick draws.",
    },
    password: {
      name: "Password Generator",
      shortName: "Password",
      description: "Generate a secure password by choosing character types and length. Copy with one click.",
    },
    coin: {
      name: "Coin Toss",
      shortName: "Coin Toss",
      description: "Flip a 3D coin for heads or tails. Handy for quick decisions or who goes first.",
    },
  },
  timer: {
    presetLabel: "Presets",
    customTimeLabel: "Custom time",
    start: "Start",
    pause: "Pause",
    reset: "Reset",
    pipShow: "Show PiP",
    pipEnd: "Exit PiP",
    finished: "Time's up!",
    finishedShort: "Time's up",
    minuteUnit: "min",
    secondUnit: "sec",
    setButton: "Set",
    presetChip: (sec) => (sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`),
  },
  roulette: {
    defaultItems: ["Option A", "Option B", "Option C", "Option D"],
    spinning: "Spinning…",
    spin: "Spin",
    result: (name) => `Result: ${name} 🎉`,
    history: (n) => `History (last ${n}, newest first)`,
    tally: "Tally",
    itemsLabel: "Items (one per line, 2–30)",
    itemsCount: (n) => `${n} item(s) registered`,
  },
  gacha: {
    defaultItems: ["Player A", "Player B", "Player C", "Player D", "Player E"],
    revealing: "Revealing…",
    remaining: (n) => `${n} remaining`,
    empty: "The gacha is empty",
    prompt: 'Press "Prepare gacha" to start',
    drawOne: "Draw one",
    drawAll: "Draw all remaining",
    itemsLabel: "Participants / items (one per line, 2+)",
    itemsCount: (n) => `${n} item(s) registered`,
    prepare: "Prepare gacha",
    editList: "Edit list again",
  },
  dice: {
    rolling: "Rolling…",
    prompt: 'Press "Roll dice" to start',
    roll: "Roll dice",
    total: "Total:",
    countLabel: "Count",
    history: (n) => `History (last ${n}, newest first)`,
  },
  coin: {
    front: "Heads",
    back: "Tails",
    flipping: "Tossing…",
    flip: "Toss",
    result: (label) => `Result: ${label} 🪙`,
    history: (n) => `History (last ${n}, newest first)`,
  },
  password: {
    toggles: {
      uppercase: "Uppercase (A-Z)",
      lowercase: "Lowercase (a-z)",
      numbers: "Numbers (0-9)",
      symbols: "Symbols (!@#...)",
    },
    placeholder: "Choose a character type",
    regenerate: "Regenerate",
    copy: "Copy",
    copied: "Copied!",
    lengthLabel: "Length",
    lengthUnit: "chars",
    includeLabel: "Word or number to include (optional)",
    includePlaceholder: "e.g. Tanaka2024",
    includeHint: "Inserted at a random position in the password. Length expands automatically if needed.",
    charsetLabel: "Character types",
    charsetWarnWithInclude: "Selecting more character types for the rest makes it safer",
    charsetWarn: "Select at least one character type",
  },
};

export const dictionaries: Record<Locale, typeof ja> = { ja, en };

const LocaleContext = createContext<Locale | null>(null);

// クライアント側のみのロケール判定(静的書き出しのためロケール別URLは持たない)。
// ユーザーが意識して切り替える操作は持たせず、ブラウザの言語設定(navigator.language)を
// 初回描画後に一度だけ見て自動的に決める。SSR時は判定できないため、
// 初回描画は常にjaにしておき、マウント後のeffectで更新することでハイドレーション不一致を避けている。
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("ja");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザの言語設定はSSR時に読めないため、初回描画後のeffectでのみ反映してハイドレーション不一致を避ける
    if (!navigator.language.toLowerCase().startsWith("ja")) setLocale("en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useT must be used within LocaleProvider");
  return dictionaries[locale];
}
