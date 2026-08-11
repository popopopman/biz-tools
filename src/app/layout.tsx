import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// サイト全体のデフォルトmetadata。各ツールページ側でtitleを上書きすると
// 「ツール名 | Biz Tools」の形式(template)で表示される。
export const metadata: Metadata = {
  title: {
    default: "Biz Tools | 業務で使える無料オンラインツール集",
    template: "%s | Biz Tools",
  },
  description:
    "タイマー・ルーレット・くじ引き・サイコロなど、会議や職場ですぐ使える無料のオンラインツール集です。インストール不要、ブラウザだけで動作します。",
};

// AdSenseの読み込みスクリプトはIDが設定されている時だけ差し込む
// (未設定時に空のクライアントID付きURLへリクエストが飛ぶのを防ぐ)。
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

// 全ページ共通のルートレイアウト。ヘッダー・フッターと、
// AdSenseの読み込みスクリプト(設定時のみ)をここで一括管理する。
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {ADSENSE_CLIENT ? (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
