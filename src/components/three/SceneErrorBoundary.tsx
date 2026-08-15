"use client";

import { Component, type ReactNode } from "react";

// ブラウザがGPUリソース逼迫時にWebGLコンテキストを強制的に失効させる
// (WebGLコンテキストロスト)ことがある。@react-three/postprocessingの
// EffectComposerはこの状態でrenderer.getContext().getContextAttributes()
// (仕様上ロスト中はnullを返す)のnullチェックをせず例外を投げ、
// Reactツリーごとクラッシュしてしまう。アプリ側のバグではなく再読み込みで
// 復帰できる状態なので、エラーバウンダリで受け止めて案内に差し替える。
type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-sm text-white/60">
          <p>
            3D表示でエラーが発生しました。
            <br />
            ブラウザのリソース不足が原因のことが多く、再読み込みで復帰します。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-white/15 px-4 py-1.5 text-white/80 hover:bg-white/10"
          >
            ページを再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
