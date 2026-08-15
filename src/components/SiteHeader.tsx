import Link from "next/link";
import { tools } from "@/lib/tools";

// 全ページ共通のヘッダー。スクロールしても追従する半透明のガラス調バー。
// ナビゲーションリンクはtools配列から自動生成される。
export default function SiteHeader() {
  return (
    <header className="glass-card sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="glow-text text-lg font-extrabold tracking-tight">
          🧰 便利ツール
        </Link>
        <nav className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
          {tools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/${tool.slug}/`}
              className="rounded-full px-3 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {tool.emoji} {tool.shortName}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
