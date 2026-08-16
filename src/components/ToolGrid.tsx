import type { ReactNode } from "react";

// 各ツール本体の共通レイアウト。横幅に余裕がある画面(md以上)ではスクロールせずに
// 操作できるよう、左右2カラムに分割する(md未満では1カラムに縦積み)。
// wide: 3Dシーンなどビジュアル側を広く取りたいツール用(左3:右2)。
// !wide: 左右を均等に2分割したいツール用(タイマー・パスワード生成)。
export default function ToolGrid({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div
      className={
        wide
          ? "grid w-full gap-6 md:grid-cols-[3fr_2fr] md:items-start"
          : "grid w-full gap-8 md:grid-cols-2 md:items-center"
      }
    >
      {children}
    </div>
  );
}
