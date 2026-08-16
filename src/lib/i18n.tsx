"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries, type Locale } from "@/lib/dictionaries";

export type { Locale };

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
