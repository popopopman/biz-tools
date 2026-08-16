"use client";

import { useT } from "@/lib/i18n";

export default function SiteFooter() {
  const t = useT();
  return (
    <footer className="mt-auto border-t border-white/10 py-6 text-center text-xs text-white/40">
      <p>{t.footer.copyright(new Date().getFullYear())}</p>
    </footer>
  );
}
