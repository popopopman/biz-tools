"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildLabelCanvas } from "@/lib/wheelTexture";

const RADIUS = 2;
// カジノのルーレット台のように、ホイールの外側に一回り大きいフェルト面を敷く。
const TABLE_RADIUS = RADIUS + 0.9;
// カジノホイールらしい赤/黒の交互配色。
const WEDGE_COLORS = ["#b91c1c", "#111114"];
// リムや装飾に使うゴールド。
const GOLD = "#d4af37";
// 「回す」ボタン1回につき最低でも何周させるか(勢いよく回っている見た目にするため)。
const SPINS = 5;
// 1回の回転アニメーションにかける秒数。
const DURATION = 4.2;

// 最初は速く、後半にかけて滑らかに減速するイージング関数(5乗のease-out)。
// 「ルーレットが徐々に止まっていく」自然な動きを再現する。
function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

// ホイール本体(赤黒交互の扇形メッシュ + ラベル + 回転アニメーション)。
//
// 扇形の色分けはメッシュの単色マテリアルで行い、文字ラベルは
// 各項目ごとに生成したcanvasテクスチャを貼った sprite で表示している。
// spriteは常にカメラの方を向く特殊なオブジェクトなので、
// ホイールが回転してもラベルの文字自体は傾かず読みやすいままになる
// (実物のルーレットとは少し違うが、Webツールとしては視認性を優先した)。
function Wheel({
  items,
  spinToken,
  onResult,
}: {
  items: string[];
  spinToken: number;
  onResult: (winner: string) => void;
}) {
  // ホイール全体を回転させるグループへの参照。
  const spinRef = useRef<THREE.Group>(null);
  const lastToken = useRef(0);
  // 回転アニメーションの状態(stateにすると毎フレーム再レンダリングされるためrefで持つ)。
  const anim = useRef({
    spinning: false,
    startAngle: 0,
    targetAngle: 0,
    startTime: 0,
    winner: "",
  });

  const n = Math.max(items.length, 1);
  const sliceAngle = (Math.PI * 2) / n;

  // 各項目のラベルテクスチャ。項目リストが変わった時だけ作り直す。
  const labelTextures = useMemo(
    () => items.map((label) => new THREE.CanvasTexture(buildLabelCanvas(label))),
    [items]
  );

  // spinTokenが変化した = 「回す」ボタンが押された合図。
  // 当選項目を先に(見た目のアニメーションより先に)乱数で決めてしまい、
  // 「その項目の中心が、真上に固定されたポインターの位置にちょうど来る角度」を逆算する。
  useEffect(() => {
    if (spinToken === lastToken.current || items.length < 2) return;
    lastToken.current = spinToken;

    const targetIndex = Math.floor(Math.random() * n);
    const midAngle = targetIndex * sliceAngle + sliceAngle / 2;
    // 毎回ぴったり中央で止まると不自然なので、目盛り内で少しランダムにずらす。
    const jitter = (Math.random() - 0.5) * sliceAngle * 0.6;

    // 現在の回転角(ラジアン、蓄積値・2πを超えていてもよい)を0〜2πに正規化。
    const current = spinRef.current?.rotation.z ?? 0;
    const currentMod = ((current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // ポインターは真上(角度=90°=π/2)に固定されているので、
    // 「目標スライスの中心が90°に来るために必要な追加回転量」を計算する。
    const required =
      ((Math.PI / 2 - (midAngle + jitter)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // 前回までの回転量はそのまま維持しつつ(＝毎回必ず「前に」回る)、
    // 指定回数分フル回転させてから目標角度に着地させる。
    const finalAngle = current - currentMod + SPINS * Math.PI * 2 + required;

    anim.current = {
      spinning: true,
      startAngle: current,
      targetAngle: finalAngle,
      startTime: performance.now() / 1000,
      winner: items[targetIndex],
    };
  }, [spinToken, items, n, sliceAngle]);

  // 毎フレーム、経過時間に応じてイージングをかけながら回転角を更新する。
  useFrame(() => {
    const s = anim.current;
    if (!s.spinning || !spinRef.current) return;
    const now = performance.now() / 1000;
    const t = Math.min(1, (now - s.startTime) / DURATION);
    const eased = easeOutQuint(t);
    spinRef.current.rotation.z = s.startAngle + (s.targetAngle - s.startAngle) * eased;
    if (t >= 1) {
      s.spinning = false;
      onResult(s.winner);
    }
  });

  // 各スライスの境界(=ポケット同士の仕切り)に立てるゴールドの仕切り板の角度。
  const dividerAngles = useMemo(() => Array.from({ length: n }, (_, i) => i * sliceAngle), [n, sliceAngle]);

  return (
    // ホイール全体を少し手前に傾けて見下ろすような、立体感のある構図にする。
    <group rotation={[-0.5, 0, 0]}>
      {/* カジノのテーブルを思わせる、ホイールより一回り大きい緑フェルトの台座(回転しない)。 */}
      <mesh position={[0, 0, -0.08]} receiveShadow>
        <circleGeometry args={[TABLE_RADIUS, 64]} />
        <meshStandardMaterial color="#064e3b" roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[0, 0, -0.075]}>
        <ringGeometry args={[TABLE_RADIUS - 0.06, TABLE_RADIUS, 64]} />
        <meshStandardMaterial color={GOLD} roughness={0.25} metalness={0.85} />
      </mesh>

      <group ref={spinRef}>
        {/* 項目数ぶんの扇形(CircleGeometryのthetaStart/thetaLengthで1スライスずつ描画)。
            実物のカジノルーレットのように赤と黒を交互に配色する。 */}
        {items.map((_, i) => {
          const thetaStart = i * sliceAngle;
          return (
            <mesh key={`wedge-${i}`} castShadow receiveShadow>
              <circleGeometry args={[RADIUS, 48, thetaStart, sliceAngle]} />
              <meshStandardMaterial color={WEDGE_COLORS[i % 2]} roughness={0.4} metalness={0.15} />
            </mesh>
          );
        })}
        {/* スライスの境界に立つゴールドの仕切り板(カジノホイールのポケット区切りを模したもの)。 */}
        {dividerAngles.map((angle, i) => (
          <mesh
            key={`divider-${i}`}
            position={[Math.cos(angle) * RADIUS * 0.5, Math.sin(angle) * RADIUS * 0.5, 0.05]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[RADIUS, 0.03, 0.09]} />
            <meshStandardMaterial color={GOLD} roughness={0.25} metalness={0.85} />
          </mesh>
        ))}
        {/* 各スライスの中央あたりにラベル(sprite)を配置。 */}
        {items.map((_, i) => {
          const mid = i * sliceAngle + sliceAngle / 2;
          const r = RADIUS * 0.62;
          return (
            <sprite
              key={`label-${i}`}
              position={[Math.cos(mid) * r, Math.sin(mid) * r, 0.08]}
              scale={[0.85, 0.32, 1]}
            >
              <spriteMaterial map={labelTextures[i]} depthWrite={false} />
            </sprite>
          );
        })}
        {/* 外周のリム(ゴールドの縁取り)と、放射状のスポーク付きハブ。 */}
        <mesh position={[0, 0, 0.03]}>
          <ringGeometry args={[RADIUS - 0.05, RADIUS, 64]} />
          <meshStandardMaterial color={GOLD} roughness={0.2} metalness={0.9} />
        </mesh>
        {dividerAngles.map((angle, i) => (
          <mesh key={`spoke-${i}`} position={[0, 0, 0.06]} rotation={[0, 0, angle + sliceAngle / 2]}>
            <boxGeometry args={[0.34, 0.045, 0.02]} />
            <meshStandardMaterial color={GOLD} roughness={0.2} metalness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.07]}>
          <circleGeometry args={[0.18, 32]} />
          <meshStandardMaterial color={GOLD} roughness={0.15} metalness={0.95} />
        </mesh>
      </group>

      {/* ポインター(常に真上に固定、ホイールと一緒には回転しない)。 */}
      <mesh position={[0, RADIUS + 0.18, 0.15]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.16, 0.36, 4]} />
        <meshStandardMaterial color={GOLD} roughness={0.2} metalness={0.9} emissive="#f59e0b" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

// ルーレットツールの3Dシーン本体。ライティングと後処理(Bloom等)を設定し、Wheelを描画する。
export default function RouletteScene({
  items,
  spinToken,
  onResult,
}: {
  items: string[];
  spinToken: number;
  onResult: (winner: string) => void;
}) {
  return (
    <Canvas shadows camera={{ position: [0, 2.4, 6.5], fov: 42 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      {/* カジノらしい暖色(琥珀色)のスポットライトを中心に、ゴールドの輝きを強調する。 */}
      <directionalLight position={[4, 6, 4]} intensity={1.2} color="#fff2d6" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3, 3, 3]} intensity={0.6} color="#f59e0b" />
      <pointLight position={[3, 2, -2]} intensity={0.3} color="#fde68a" />
      <Wheel items={items} spinToken={spinToken} onResult={onResult} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.85} intensity={0.6} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
