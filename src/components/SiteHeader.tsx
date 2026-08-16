"use client";

import Link from "next/link";
import { useState } from "react";
import { tools } from "@/lib/tools";
import { useT } from "@/lib/i18n";

// 全ページ共通のヘッダー。スクロールしても追従する半透明のガラス調バー。
// ナビゲーションリンクはtools配列から自動生成される。
// モバイル幅ではリンクを並べる余白がないため、ハンバーガーメニューに切り替える。
export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <header className="glass-card site-header sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="glow-text text-lg font-extrabold tracking-tight" onClick={() => setOpen(false)}>
          {t.header.siteName}
        </Link>
        <nav className="hidden flex-wrap gap-x-1 gap-y-2 text-sm sm:flex">
          {tools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/${tool.slug}/`}
              className="rounded-full px-3 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {tool.emoji} {t.tools[tool.slug as keyof typeof t.tools].shortName}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t.header.menuLabel}
          aria-expanded={open}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 sm:hidden"
        >
          {/* ハンバーガー3本線とバツ印を同じ要素で表現し、開閉のたびに回転・
              フェードで滑らかに切り替える(瞬時の切り替わりだと素っ気ないため)。 */}
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out ${
                open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 rounded-full bg-current transition-opacity duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out ${
                open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
              }`}
            />
          </span>
        </button>
      </div>
      {/* 開閉をdisplay切り替えではなくgrid-template-rowsで0fr⇔1frにアニメーションさせる
          (高さがautoな要素をtransitionだけで滑らかに開閉させるための定番手法)。 */}
      <nav
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out sm:hidden ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div
          className={`flex min-h-0 flex-col gap-1 overflow-hidden border-t px-4 transition-[padding,border-color] duration-300 ease-out ${
            open ? "border-white/10 py-3" : "border-transparent py-0"
          }`}
        >
          {tools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/${tool.slug}/`}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {tool.emoji} {t.tools[tool.slug as keyof typeof t.tools].shortName}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
