"use client";

import AdSlot from "@/components/AdSlot";
import { useT } from "@/lib/i18n";

// 横幅に余裕がある画面(xl=1280px以上)だけ、左右の余白にスカイスクレイパー広告を
// 固定表示する。本文側はルートのfont-size縮小でmax-w-*(rem基準)が実寸で
// 縮んでいるため、以前(2xl)より低い閾値でも十分な余白がある
// (main内ではなくbody直下に置き、レイアウトに影響させない)。
export default function SideAds() {
  const t = useT();
  return (
    <>
      <div className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <AdSlot slot="0000000003" label={t.common.adSide} className="h-[600px] w-[160px]" />
      </div>
      <div className="fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <AdSlot slot="0000000004" label={t.common.adSide} className="h-[600px] w-[160px]" />
      </div>
    </>
  );
}
