"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getDieDefinition, quaternionForValue, pipTexture, type DieSides } from "@/lib/dice3d";

// サイコロ1個ずつに割り当てる色(D6以外の形状で使用)。
const DIE_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2"];
// トレイ(サイコロを転がす台)の半径。原点から端までの距離。
const TRAY_HALF = 3.2;
// サイコロが静止している時のY座標(トレイの床のすぐ上)。
const REST_Y = 0.75;

// サイコロを転がす台(緑色の床)。物理演算は行わないため壁は不要。
function Tray() {
  return (
    <mesh position={[0, -0.5, 0]} receiveShadow>
      <boxGeometry args={[TRAY_HALF * 2, 1, TRAY_HALF * 2]} />
      <meshStandardMaterial color="#0b4a2c" roughness={0.95} metalness={0} />
    </mesh>
  );
}

// アニメーション1回分のパラメーター(useFrame内で読み書きするためrefで保持)。
type RollAnim = {
  rolling: boolean;
  startTime: number;
  duration: number;
  spinAxis: THREE.Vector3;
  totalSpins: number;
  targetQuat: THREE.Quaternion;
  value: number;
  dropHeight: number;
  startX: number;
  startZ: number;
};

const GRAVITY = 30;
const RESTITUTION = 0.45;

// 高さdropHeightから自由落下→バウンドを繰り返して静止するまでの
// 「床からの高さ」を時刻elapsedごとに計算する(本物の物理演算は使わず、
// 落下・跳ね返りの運動方程式を1個の球として解析的に解くことで、
// 見た目には自然な減衰バウンドを再現している)。
function bounceHeight(elapsed: number, dropHeight: number): number {
  let remaining = elapsed;
  const firstFall = Math.sqrt((2 * dropHeight) / GRAVITY);
  if (remaining <= firstFall) {
    return dropHeight - 0.5 * GRAVITY * remaining * remaining;
  }
  remaining -= firstFall;
  let v = GRAVITY * firstFall;

  for (let bounce = 0; bounce < 8; bounce += 1) {
    v *= RESTITUTION;
    if (v < 0.3) return 0;
    const airTime = (2 * v) / GRAVITY;
    if (remaining <= airTime) {
      return Math.max(0, v * remaining - 0.5 * GRAVITY * remaining * remaining);
    }
    remaining -= airTime;
  }
  return 0;
}

// 上と同じ運動をもとに、静止するまでに必要な合計時間を求める
// (アニメーション全体の長さ・回転のイージングをこの値に合わせるため)。
function totalSettleTime(dropHeight: number): number {
  let total = Math.sqrt((2 * dropHeight) / GRAVITY);
  let v = GRAVITY * total;
  for (let bounce = 0; bounce < 8; bounce += 1) {
    v *= RESTITUTION;
    if (v < 0.3) break;
    total += (2 * v) / GRAVITY;
  }
  return total;
}

// count個のサイコロの「静止位置」を、トレイの範囲内でお互い最低distanceだけ
// 離れるように乱数で決める(単純な反復棄却法)。物理的な衝突判定はしていないが、
// 着地後に重なって見えることを防げれば十分なため、この程度の簡易な方法で足りる。
function generateSpreadPositions(count: number, bound: number, minDistance: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    let best: [number, number] = [0, 0];
    let bestScore = -Infinity;
    // 30回試して、他の点から最も離れている候補を採用する
    // (完全に条件を満たす点が見つからなくても、マシな配置に収束させるため)。
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate: [number, number] = [(Math.random() * 2 - 1) * bound, (Math.random() * 2 - 1) * bound];
      const minDistToOthers = points.reduce(
        (min, p) => Math.min(min, Math.hypot(candidate[0] - p[0], candidate[1] - p[1])),
        Infinity
      );
      if (minDistToOthers > bestScore) {
        bestScore = minDistToOthers;
        best = candidate;
      }
      if (minDistToOthers >= minDistance) break;
    }
    points.push(best);
  }
  return points;
}

// サイコロ1個分のコンポーネント。
// @react-three/rapierによる本物の物理演算はWebGLのコンテキストロスト
// (実機のGPUでも再現する不具合)を引き起こしたため使用していない。代わりに、
// 「出目を先に乱数で決め→そこに向かって回転しながらバウンドするアニメーション」
// で物理っぽい動きを再現する(いわゆるフェイク物理)。
function Die({
  sides,
  index,
  restPos,
  color,
  trigger,
  onSettle,
}: {
  sides: DieSides;
  index: number;
  restPos: [number, number];
  color: string;
  trigger: number;
  onSettle: (index: number, value: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const def = useMemo(() => getDieDefinition(sides), [sides]);
  const lastTrigger = useRef(0);
  const anim = useRef<RollAnim | null>(null);

  // マテリアル(見た目)を面数ごとに切り替える。
  // D6だけは6面分のピップ(目)テクスチャを個別に貼り、それ以外は単色のフラットシェーディング。
  const materials = useMemo(() => {
    if (sides === 6) {
      return def.faceValues.map(
        (v) =>
          new THREE.MeshStandardMaterial({
            map: pipTexture(v),
            roughness: 0.45,
            metalness: 0.05,
          })
      );
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.2,
      flatShading: true,
    });
  }, [sides, color, def]);

  // triggerが変化した = 「振る」ボタンが押された合図。
  // 出目を乱数で決め、そこに着地するアニメーションのパラメーターを設定する。
  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;

    const value = def.faceValues[Math.floor(Math.random() * def.faceValues.length)];
    const yaw = Math.random() * Math.PI * 2;
    const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4 + 0.6, Math.random() - 0.5).normalize();
    const dropHeight = 4 + Math.random() * 1.5;

    anim.current = {
      rolling: true,
      startTime: performance.now() / 1000,
      duration: totalSettleTime(dropHeight),
      spinAxis,
      totalSpins: 4 + Math.random() * 2.5,
      targetQuat: quaternionForValue(def, value, yaw),
      value,
      dropHeight,
      // トレイ中央付近のランダムな位置から落下させ、着地するまでの間に
      // 割り当てられた静止位置(restPos、重ならないよう散らして計算済み)まで
      // 転がり込んでいくように見せる。
      startX: (Math.random() - 0.5) * 2,
      startZ: (Math.random() - 0.5) * 2,
    };
  }, [trigger, def]);

  useFrame(() => {
    const group = groupRef.current;
    const a = anim.current;
    if (!group) return;

    if (!a || !a.rolling) {
      group.position.set(restPos[0], REST_Y, restPos[1]);
      return;
    }

    const now = performance.now() / 1000;
    const elapsed = now - a.startTime;
    const t = Math.min(1, elapsed / a.duration);

    // 落下〜バウンドの高さは運動方程式から解析的に求め、
    // xz平面上は開始位置から着地位置(restPos)へ転がり込むようにease-outで収束させる。
    const height = bounceHeight(elapsed, a.dropHeight);
    const settle = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const x = a.startX + (restPos[0] - a.startX) * settle;
    const z = a.startZ + (restPos[1] - a.startZ) * settle;
    group.position.set(x, REST_Y + height, z);

    // 落下中は指定軸でぐるぐる回転し、終盤(t>0.55〜1)で正しい出目の姿勢へ滑らかに収束する。
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(a.spinAxis, t * a.totalSpins * Math.PI * 2);
    const blend = Math.min(1, Math.max(0, (t - 0.55) / 0.45));
    const eased = blend * blend * (3 - 2 * blend); // smoothstep
    spinQuat.slerp(a.targetQuat, eased);
    group.quaternion.copy(spinQuat);

    if (t >= 1) {
      a.rolling = false;
      group.position.set(restPos[0], REST_Y, restPos[1]);
      group.quaternion.copy(a.targetQuat);
      onSettle(index, a.value);
    }
  });

  return (
    <group ref={groupRef} position={[restPos[0], REST_Y, restPos[1]]}>
      <mesh geometry={def.geometry} material={materials} castShadow receiveShadow />
    </group>
  );
}

// サイコロツールの3Dシーン本体。
// 指定した面数・個数のサイコロをトレイ上に配置し、アニメーションで転がして出目を確定する。
export default function DiceScene({
  sides,
  count,
  trigger,
  onAllSettled,
}: {
  sides: DieSides;
  count: number;
  trigger: number;
  onAllSettled: (values: number[]) => void;
}) {
  // 各サイコロの出目を集計するための配列。stateにすると毎フレーム再レンダリングが
  // 走ってしまうため、refで保持し、全て揃った時だけonAllSettledを呼ぶ。
  const resultsRef = useRef<(number | null)[]>([]);
  const reportedTrigger = useRef(-1);

  useEffect(() => {
    resultsRef.current = Array(count).fill(null);
  }, [count, trigger]);

  // ロールごとに、サイコロ同士が重ならない着地位置を再計算する。
  // trigger===0(まだ一度も振っていない)間は綺麗な横一列に並べておく。
  const restPositions = useMemo<[number, number][]>(() => {
    if (trigger === 0) {
      return Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * 1.2, 0]);
    }
    return generateSpreadPositions(count, TRAY_HALF - 1.1, 1.5);
  }, [count, trigger]);

  const handleSettle = (index: number, value: number) => {
    if (resultsRef.current.length !== count) return;
    resultsRef.current[index] = value;
    // 同じtriggerに対して二重に報告しないようreportedTriggerで防止する。
    if (reportedTrigger.current !== trigger && resultsRef.current.every((v) => v !== null)) {
      reportedTrigger.current = trigger;
      onAllSettled(resultsRef.current as number[]);
    }
  };

  return (
    <Canvas shadows camera={{ position: [0, 6.5, 6.5], fov: 42 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {/* リッチな見た目にするための補助的な色付きライト(青紫・ピンク)。 */}
      <pointLight position={[-4, 3, -3]} intensity={0.5} color="#818cf8" />
      <pointLight position={[4, 2, 4]} intensity={0.35} color="#f472b6" />
      <Tray />
      {Array.from({ length: count }).map((_, i) => (
        <Die
          key={i}
          sides={sides}
          index={i}
          restPos={restPositions[i]}
          color={DIE_COLORS[i % DIE_COLORS.length]}
          trigger={trigger}
          onSettle={handleSettle}
        />
      ))}
      {/* Bloom: 明るい部分がにじんで光るような演出。Vignette: 画面端を少し暗くして中央に視線を集める。 */}
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.9} intensity={0.55} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
