"use client";

import { useEffect, useId, useRef } from "react";

type AdSlotProps = {
  slot: string; // AdSense管理画面で発行される広告ユニットID(data-ad-slot)
  format?: string;
  className?: string;
  label?: string; // プレースホルダー表示時に出す説明ラベル
};

// AdSenseのスクリプトが window.adsbygoogle にpushする形で広告を読み込むため、
// 型定義を拡張しておく。
declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

// AdSenseのパブリッシャーID。未設定時は広告を出さず、代わりに枠だけのプレースホルダーを表示する
// (審査前・ID発行前でもレイアウト崩れなく開発できるようにするため)。
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

// 広告枠コンポーネント。NEXT_PUBLIC_ADSENSE_CLIENT を設定すると実際の広告に切り替わる。
export default function AdSlot({
  slot,
  format = "auto",
  className = "",
  label = "広告",
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const id = useId();

  // AdSenseの仕組み上、<ins class="adsbygoogle">を配置した後に
  // window.adsbygoogle.push({}) を呼ぶことで実際の広告が描画される。
  useEffect(() => {
    if (!ADSENSE_CLIENT || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSenseスクリプトが未読込・広告ブロッカーで拒否された等の場合は無視する。
    }
  }, []);

  // AdSense未設定時は、実際の広告と同じくらいの大きさの点線プレースホルダーを表示する。
  if (!ADSENSE_CLIENT) {
    return (
      <div
        className={`glass-card flex min-h-[90px] w-full items-center justify-center rounded-xl text-xs text-white/30 ${className}`}
        data-ad-placeholder={id}
      >
        {label}スペース（AdSense未設定）
      </div>
    );
  }

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle block ${className}`}
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
