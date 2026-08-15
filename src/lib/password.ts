// パスワード生成の純粋ロジック。UIから分離してテストしやすくしている。

export type PasswordOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  include?: string; // 含めたい単語・数字など。ランダムな位置に挿入する
};

// 紛らわしい記号(バッククォート等)は避け、一般的な入力欄でそのまま使える範囲にしている。
const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}",
} as const;

export function buildCharset(options: PasswordOptions): string {
  return (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter((key) => options[key])
    .map((key) => CHARSETS[key])
    .join("");
}

// crypto.getRandomValues (CSPRNG) を使用。Math.random()は予測可能なため
// パスワード生成には使わない。
export function generatePassword(options: PasswordOptions): string {
  const charset = buildCharset(options);
  const include = options.include ?? "";
  if (!charset) return include;
  if (options.length <= 0) return "";

  // 指定された桁数がincludeより短い場合は、includeが収まる長さまで広げる。
  const fillLength = Math.max(0, Math.max(options.length, include.length) - include.length);
  const randomValues = new Uint32Array(fillLength + 1); // 最後の1個はincludeの挿入位置決め用
  crypto.getRandomValues(randomValues);
  const filler = Array.from(randomValues.slice(0, fillLength), (v) => charset[v % charset.length]);

  if (!include) return filler.join("");
  const pos = randomValues[fillLength] % (filler.length + 1);
  filler.splice(pos, 0, include);
  return filler.join("");
}
