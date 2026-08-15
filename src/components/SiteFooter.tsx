export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 py-6 text-center text-xs text-white/40">
      <p>© {new Date().getFullYear()} 便利ツール. すべての機能はブラウザ内で完結し、入力データはサーバーに送信されません。</p>
    </footer>
  );
}
