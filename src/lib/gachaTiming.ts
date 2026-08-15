// ガチャの3D演出(GachaScene)とツール本体(GachaTool)の両方が参照するタイミング定数。
// 結果のテキストは演出が終わってから表示したいため、GachaTool側もこの尺を知る必要がある。
// three.jsを含むGachaScene.tsxを直接importするとバンドルが重くなるため、
// タイミングの数値だけをこの軽量なファイルに切り出している。
//
// 演出は「空が光り、おとりの隕石を何個か落としてから、結果を決める本命の隕石が降ってくる
// → 着弾で大きく爆発する」という流れで組み立てている。
export const GACHA_DECOY_COUNT = 2; // 本命の前に落とす「おとり」隕石の数
export const GACHA_DECOY_FALL_DURATION = 0.28; // おとり隕石が降ってくる時間
export const GACHA_DECOY_IMPACT_PAUSE = 0.14; // おとり隕石が着弾してから、次が降り始めるまでの間
export const GACHA_METEOR_DURATION = 0.55; // 本命の隕石が降ってくる時間
export const GACHA_EXPLODE_DURATION = 0.4; // 着弾の瞬間、大きく爆発する時間
export const GACHA_SINGLE_HOLD = 2.2; // 「1件引く」: 当選ラベルが落ち着く(settleする)までの時間
export const GACHA_BURST_HOLD = 0.8; // 「残り全部引く」: ラベルなしで光らせてから落ち着くまでの時間

// 爆発が始まるまでの合計時間(=おとり隕石群 + 本命隕石の落下)。
export const GACHA_PRE_EXPLODE_DURATION =
  GACHA_DECOY_COUNT * (GACHA_DECOY_FALL_DURATION + GACHA_DECOY_IMPACT_PAUSE) + GACHA_METEOR_DURATION;

// GachaTool側で「演出が落ち着いてから結果テキストを表示する」ためのタイミング。
// 3D側の演出はフェードせず次の抽選が始まるまでそのまま光り続けるので、
// 結果テキストは「爆発が落ち着いた瞬間」に表示すればよい。
export const GACHA_SINGLE_REVEAL_MS =
  (GACHA_PRE_EXPLODE_DURATION + GACHA_EXPLODE_DURATION + GACHA_SINGLE_HOLD) * 1000;
export const GACHA_BURST_REVEAL_MS =
  (GACHA_PRE_EXPLODE_DURATION + GACHA_EXPLODE_DURATION + GACHA_BURST_HOLD) * 1000;
