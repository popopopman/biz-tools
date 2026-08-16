"use client";

import Link from "next/link";
import AdSlot from "@/components/AdSlot";
import { tools } from "@/lib/tools";
import { useT } from "@/lib/i18n";

// トップページ。ヒーローコピー＋ツール一覧カード＋広告枠のシンプルな構成。
// tools配列(src/lib/tools.ts)を元にカードを自動生成しているため、
// 新しいツールを追加する際はtools配列とsrc/app/配下のルートを増やすだけでよい。
export default function Home() {
  const t = useT();

  return (
    <div className="flex flex-col gap-10">
      <section className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          {t.home.kicker}
        </p>
        <h1 className="glow-text text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t.home.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/55 sm:text-base">
          {t.home.subtitle}
        </p>
      </section>

      <AdSlot slot="0000000001" label={t.common.adTop(t.home.adName)} />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {tools.map((tool) => {
          const toolT = t.tools[tool.slug as keyof typeof t.tools];
          return (
            <Link
              key={tool.slug}
              href={`/${tool.slug}/`}
              className="glass-card group relative overflow-hidden rounded-2xl p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-10px_var(--tool-accent)]"
              style={{ ["--tool-accent" as string]: tool.accent }}
            >
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                style={{ background: tool.accent }}
              />
              <div className="relative flex items-center gap-3">
                <span className="text-3xl drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]">
                  {tool.emoji}
                </span>
                <h2 className="text-lg font-bold text-white">{toolT.name}</h2>
              </div>
              <p className="relative mt-3 text-sm leading-relaxed text-white/55">
                {toolT.description}
              </p>
              <span
                className="relative mt-4 inline-block text-sm font-semibold group-hover:underline"
                style={{ color: tool.accent }}
              >
                {t.home.useIt}
              </span>
            </Link>
          );
        })}
      </section>

      <AdSlot slot="0000000002" label={t.common.adBottom(t.home.adName)} />
    </div>
  );
}
