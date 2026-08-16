# 便利ツール

🔗 公開ページ: [https://popopopman.github.io/util-tools/](https://popopopman.github.io/util-tools/)

タイマー・ルーレット・ガチャ・サイコロなど、会議や職場ですぐ使える無料のオンラインツール集です。
会員登録・インストール不要で、全ての機能がブラウザ内だけで完結します(入力データはサーバーに送信されません)。

- ⏱️ **タイマー** — プリセット付きカウントダウンタイマー。Picture-in-Picture対応(他の作業をしながら残り時間を確認できます)。
- 🎯 **ルーレット** — 項目を登録して回すだけの、赤黒×ゴールドのカジノ風3D抽選ルーレット(three.js製)。
- 🔮 **ガチャ** — 参加者リストから重複なく順番・当選者を抽選。隕石が魔法陣に落ちてくる3D演出付き(three.js製)。
- 🎲 **サイコロ** — D4〜D20に対応した3Dダイス(three.js製)。上空から回転しながら落下・バウンドして着地する。
- 🔑 **パスワード生成** — 文字種と桁数を選んで安全なパスワードを生成。ワンクリックでコピー可能。
- 🪙 **コイントス** — 3Dコインを投げて表裏を決める(three.js製)。二択の決定やゲームの先攻/後攻決めに。

GitHub Pagesでのホスティングを前提に、Next.jsの静的書き出し(`output: "export"`)で構築しています。

## 技術スタック

- [Next.js](https://nextjs.org/)(App Router, 静的エクスポート) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [three.js](https://threejs.org/) / [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) / [@react-three/drei](https://github.com/pmndrs/drei) / [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing)(Bloom等の演出) / [@react-three/rapier](https://github.com/pmndrs/react-three-rapier)(サイコロ・コイントスの物理演算)
- パッケージマネージャ: [pnpm](https://pnpm.io/)

## ディレクトリ構成

```text
src/
  app/                 各ページ(App Router)。ページごとにフォルダを切っている
    timer/ roulette/ gacha/ dice/ password/ coin/
  components/
    tools/             各ツールの2D側UI(操作パネル・結果表示など)
    three/             ルーレット・ガチャ・サイコロ・コイントスの3Dシーン(react-three-fiber)
    ToolPageShell.tsx  ツールページ共通レイアウト(見出し・広告枠)
    AdSlot.tsx         Google AdSense広告枠(未設定時はプレースホルダー表示)
    SiteHeader.tsx / SiteFooter.tsx
  lib/
    tools.ts           各ツールのメタ情報(名前・説明・URL等)を一元管理
    dice3d.ts          サイコロの形状生成・出目判定ロジック
    coin3d.ts          コイントスの形状生成・出目判定ロジック
    password.ts        パスワード生成の純粋ロジック(CSPRNGで文字を選ぶ)
    wheelTexture.ts     ルーレット・ガチャのラベル描画
    gachaTiming.ts      ガチャの3D演出とツール本体で共有するタイミング定数
    gachaAudio.ts / rouletteAudio.ts / diceSound.ts / coinAudio.ts
                        各ツールの効果音(Web Audio APIでその場に合成、音源ファイル不要)
```

## ローカル開発

### Docker(推奨)

Node/pnpmをホストに入れなくても、Docker Composeだけで開発できます。
マルチステージの `Dockerfile` を使い、依存関係のインストール結果(pnpm store)は
Dockerのボリュームにキャッシュされるため、2回目以降のビルドは高速です。

```bash
# 開発サーバーを起動 (http://localhost:3000)
docker compose up -d dev

# コンテナ内でコマンドを実行する場合
docker compose exec dev pnpm lint
docker compose exec dev pnpm build

# 停止
docker compose down
```

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
ビルド時に環境変数`GITHUB_PAGES=true`を渡すことでリポジトリ名(`/util-tools`)を`basePath`に付与しています
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
- **サイコロ**: `@react-three/rapier`による本物の物理演算(重力・衝突)でトレイに投げて転がします
  (`src/components/three/DiceScene.tsx`)。出目は先に決めるのではなく、静止後の姿勢(quaternion)から
  実際に上を向いている面を読み取って求めます(`src/lib/dice3d.ts`)。この方式は以前、実機のGPUでも
  再現するWebGLコンテキストロストの不具合を起こしたことがあるため、その再発を避けるべく
  Physicsワールド・RigidBodyはロールのたびに再マウントせず、既存ボディの位置・速度をリセットする
  だけに留めています。静止後は少し傾いたまま止まった姿勢から、綺麗に整列した姿勢へ滑らかにスライド
  させています。D6は本物同様「向かい合う面の和が7」になるようピップ(目)を配置し、それ以外の
  面数は色付きの多面体で表示します。
- **ルーレット**: 当選項目を先に乱数で決めてから「その項目がポインター位置に来る回転角」を逆算し、
  ease-outで滑らかに減速するアニメーションで着地させています。赤黒交互の配色とゴールドの縁取り・
  仕切り・スポークで、カジノのルーレット台のような見た目にしています。
- **ガチャ**(`src/components/three/GachaScene.tsx`): 「空が光り、おとりの隕石を何個か落としてから、
  結果を決める本命の隕石が降ってくる → 着弾で大きく爆発し、魔法陣が浮かび上がる」という演出です。
  当選ラベル・魔法陣の紋様・地面・隕石の岩肌テクスチャは、いずれも外部アセットを使わず
  `<canvas>`への描画結果を`THREE.CanvasTexture`化して使っています。本命の隕石は着弾後も
  地面に突き刺さったまま残り、地面自体も着弾地点がクレーター状にえぐれるよう頂点を変形させています。
  効果音(隕石の落下音・着弾音・爆発音・当選チャイム)もファイルを使わず、Web Audio APIの
  オシレーター・ノイズ・畳み込みリバーブでその場に合成しています(`src/lib/gachaAudio.ts`)。
  演出の尺は3D側とツール本体(`src/components/tools/GachaTool.tsx`)の両方が必要とするため、
  three.jsを含まない軽量な定数ファイル(`src/lib/gachaTiming.ts`)に切り出して共有しています。
- **コイントス**: サイコロと同じく`@react-three/rapier`の物理演算で実際に投げ上げて転がし、
  静止した姿勢(quaternion)から上を向いている面(表/裏)を読み取ります(`src/lib/coin3d.ts`)。
  縁で立ってバランスした場合は小突いて転がり直させます。
- **パスワード生成**: `Math.random()`は予測可能なため使わず、`crypto.getRandomValues`
  (CSPRNG)で文字を選びます(`src/lib/password.ts`)。指定した文字列を含めたい場合は、
  残りの桁をランダム生成した上でランダムな位置に挿入します。
