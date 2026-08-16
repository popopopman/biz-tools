"use client";

import { useT } from "@/lib/i18n";

export default function SceneLoading() {
  const t = useT();
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      {t.common.loadingScene}
    </div>
  );
}
