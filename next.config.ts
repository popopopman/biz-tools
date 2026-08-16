import type { NextConfig } from "next";

// GitHub Pagesのリポジトリ名。プロジェクトページ(user.github.io/リポジトリ名/)として
// 公開する場合、全てのアセットURLの先頭にこのパスを付与する必要がある。
const repoName = "util-tools";
// GITHUB_PAGES=true が設定されている時だけ basePath を付与する。
// NODE_ENV==="production" 判定にしてしまうと、`pnpm build` をローカルや
// Dockerのpreviewサービスで実行した時にも basePath が付いてしまい、
// http://localhost:8080/ 直下でプレビューできなくなるため、
// 「本物のGitHub Pagesデプロイかどうか」を専用の環境変数で明示的に切り替えている。
const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  // GitHub Pagesは静的ファイルしか配信できないため、Next.jsのサーバー機能を使わず
  // 完全に静的なHTML/CSS/JSとして書き出す(`next build` の出力先は `out/`)。
  output: "export",
  // trueにすると各ルートが `dice.html` ではなく `dice/index.html` として
  // 書き出される。サイト内のリンクは全て末尾スラッシュ付き(例: "/dice/")で
  // 統一しているため、これがないとGitHub Pages上で404になってしまう。
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: {
    // next/imageの最適化はサーバーが必要なため、静的書き出しでは無効化する。
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
