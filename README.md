# Biz Tools

タイマー・ルーレット・くじ引き・サイコロなど、会議や職場ですぐ使える無料のオンラインツール集です。
会員登録・インストール不要で、全ての機能がブラウザ内だけで完結します(入力データはサーバーに送信されません)。

- ⏱️ **タイマー** — プリセット付きカウントダウンタイマー。Picture-in-Picture対応(他の作業をしながら残り時間を確認できます)。
- 🎯 **ルーレット** — 項目を登録して回すだけの、赤黒×ゴールドのカジノ風3D抽選ルーレット(three.js製)。
- 🎴 **くじ引き** — 参加者リストから重複なく順番・当選者を抽選。
- 🎲 **サイコロ** — D4〜D20に対応した3Dダイス(three.js製)。上空から回転しながら落下・バウンドして着地する。

GitHub Pagesでのホスティングを前提に、Next.jsの静的書き出し(`output: "export"`)で構築しています。

## 技術スタック

- [Next.js](https://nextjs.org/)(App Router, 静的エクスポート) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [three.js](https://threejs.org/) / [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) / [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing)(Bloom等の演出)
- パッケージマネージャ: [pnpm](https://pnpm.io/)

## ディレクトリ構成

```text
src/
  app/                 各ページ(App Router)。ページごとにフォルダを切っている
    timer/ roulette/ kuji/ dice/
  components/
    tools/             各ツールの2D側UI(操作パネル・結果表示など)
    three/             サイコロ・ルーレットの3Dシーン(react-three-fiber)
    ToolPageShell.tsx  ツールページ共通レイアウト(見出し・広告枠)
    AdSlot.tsx         Google AdSense広告枠(未設定時はプレースホルダー表示)
    SiteHeader.tsx / SiteFooter.tsx
  lib/
    tools.ts           4ツールのメタ情報(名前・説明・URL等)を一元管理
    dice3d.ts           サイコロの形状生成・出目判定ロジック
    wheelTexture.ts     ルーレットのラベル描画
```

## ローカル開発

### Docker(推奨)

Node/pnpmをホストに入れなくても、Docker Composeだけで開発できます。
マルチステージの `Dockerfile` を使い、依存関係のインストール結果(pnpm store)は
Dockerのボリュームにキャッシュされるため、2回目以降のビルドは高速です。

```bash
# 開発サーバーを起動 (http://localhost:3100)
docker compose up -d dev

# コンテナ内でコマンドを実行する場合
docker compose exec dev pnpm lint
docker compose exec dev pnpm build

# 停止
docker compose down
```

ポート`3000`が既に他プロセスで使われている場合に備え、ホスト側は`3100`番にマッピングしています(`compose.yaml`)。

静的書き出し(`out/`)の内容をnginxで配信し、実際のデプロイ成果物に近い形でプレビューしたい場合:

```bash
docker compose --profile preview up --build preview
# http://localhost:8080 で確認できます
```

### Dockerを使わない場合

```bash
corepack enable
pnpm install
pnpm dev      # 開発サーバー (http://localhost:3000)
pnpm lint     # ESLint
pnpm build    # 静的書き出し (out/ に生成)
```

## GitHub Pagesへのデプロイ

`.github/workflows/deploy.yml` で、`main`ブランチへのpush時に自動ビルド・デプロイされます。
GitHub Pagesは静的ファイルしか配信できないため、`next.config.ts`で`output: "export"`を指定し、
ビルド時に環境変数`GITHUB_PAGES=true`を渡すことでリポジトリ名(`/biz-tools`)を`basePath`に付与しています
(ローカルでの`pnpm build`ではこの環境変数を設定しないため、`/`直下で動く成果物になります)。

リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください。

## 広告(Google AdSense)の設定

`NEXT_PUBLIC_ADSENSE_CLIENT` 環境変数にAdSenseのパブリッシャーID(`ca-pub-` から始まるID)を設定すると、
`src/components/AdSlot.tsx` が実際の広告を出すようになります。未設定の間は、広告と同じ大きさの
プレースホルダー枠が表示されます。

- ローカル: `.env.local` に `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx` を記述
- GitHub Actions: リポジトリの Secrets に `ADSENSE_CLIENT` を登録(ワークフロー側で読み込みます)

## 各ツールの実装メモ

- **タイマー**: `requestAnimationFrame`と「終了時刻からの逆算」で誤差の少ないカウントダウンを実現。
  Picture-in-PictureはChrome専用のDocument PiP APIではなく、`canvas.captureStream()` + `<video>.requestPictureInPicture()`
  という標準API(Firefoxでも動作)を使っています。
- **サイコロ**: 当初は`@react-three/rapier`で本物の物理演算を行っていましたが、一部環境で
  WebGLのコンテキストロスト(画面が真っ黒になる)が実機のGPUでも再現する不具合があったため、
  物理エンジンは使わず「出目を先に乱数で決め→そこに向かって落下・バウンド・回転するアニメーション」
  を運動方程式で解析的に計算する“フェイク物理”方式に変更しました(`src/components/three/DiceScene.tsx`)。
  各面のローカル法線と出目の対応表(`src/lib/dice3d.ts`)を持たせ、「出目→着地姿勢」を逆算しています。
  D6は本物同様「向かい合う面の和が7」になるようピップ(目)を配置し、それ以外の面数は色付きの多面体で表示します。
  複数個振る際は、着地位置が重ならないよう簡易な反復棄却法でトレイ内に散らして配置します。
- **ルーレット**: 当選項目を先に乱数で決めてから「その項目がポインター位置に来る回転角」を逆算し、
  ease-outで滑らかに減速するアニメーションで着地させています。赤黒交互の配色とゴールドの縁取り・
  仕切り・スポークで、カジノのルーレット台のような見た目にしています。
