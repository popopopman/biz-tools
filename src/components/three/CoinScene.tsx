"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, CylinderCollider, type RapierRigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sideFromQuaternion, type CoinSide } from "@/lib/coin3d";
import { buildCoinTextures } from "@/lib/coinTexture";
import { buildCasinoFeltTexture } from "@/lib/casinoFeltTexture";
import { playCoinClink, playCoinFlop, playCoinResultChime, playCoinTossFlick, startCoinSpinHum } from "@/lib/coinAudio";
import ResponsiveCamera from "@/components/three/ResponsiveCamera";

// コインの寸法。見た目の厚み(存在感を出すため実際より厚めにしている)と、
// 当たり判定用の厚み(薄いまま、転がり方や安定のしやすさはこれまで通り)を
// あえて分けている。静止位置(REST_Y)は見た目の厚みに合わせ、フェルト面に
// 見た目上ぴったり乗るようにする。
const RADIUS = 0.75;
const VISUAL_THICKNESS = 0.1;
const PHYSICS_THICKNESS = 0.01;
const REST_Y = VISUAL_THICKNESS / 2;
// コインの金属としての密度(rapierのデフォルト密度1.0に対する倍率)。
// 大きくするほど慣性が増し、衝突や回転の減衰が「重み」を感じさせる動きになる。
const COIN_DENSITY = 26;
// コインを投げるテーブルの半径・壁の高さ(ダイスのトレイと同じ考え方)。
const TABLE_HALF = 4.0;
const WALL_HEIGHT = 6;
// 卓を囲む縁の見た目上の高さ・厚み・角丸半径(サイコロのトレイと全く同じ
// 階段状デザイン)。外側ほど高く太く、内側(フェルト側)に向かって段々と
// 低く薄くなっていく。
const BORDER_HEIGHT = 1.1;
const BORDER_THICKNESS = 0.75;
const BORDER_CORNER_RADIUS = 0.6;

// コインが自分の面法線を軸にコマのように回ってしまう成分を、毎フレーム
// 指数的に弱める割合。大きいほど早く抑え込む。
const TOP_SPIN_DAMP_RATE = 6;
// コマのように回っている、とみなす角速度(面法線まわり、rad/s)のしきい値。
// これを超えている間はスピン音を鳴らし、下回った瞬間に「パタン」と倒れた
// 音を鳴らす。
const TOP_SPIN_SOUND_THRESHOLD = 4;

// 並進・回転の速度がこの閾値を下回った状態がSETTLE_HOLD秒続いたら「静止した」とみなす。
const SETTLE_LIN_SPEED = 0.05;
const SETTLE_ANG_SPEED = 0.1;
const SETTLE_HOLD = 0.25;
// トス開始時の回転速度(水平軸まわり)。MINを設けることで「たまたま遅い」を防ぎ、
// 毎回しっかり回転しているように見せる。
const SPIN_MIN = 38;
const SPIN_MAX = 52;

// 角丸長方形の輪郭をpath(Shape/Path)にトレースする(サイコロのトレイと同じ
// 手法)。角丸の半径はコーナーごとに変えられるよう外から渡す。
function tracePath(path: THREE.Shape | THREE.Path, halfW: number, halfD: number, radius: number) {
  const x0 = -halfW;
  const y0 = -halfD;
  path.moveTo(x0, y0 + radius);
  path.lineTo(x0, y0 + halfD * 2 - radius);
  path.quadraticCurveTo(x0, y0 + halfD * 2, x0 + radius, y0 + halfD * 2);
  path.lineTo(x0 + halfW * 2 - radius, y0 + halfD * 2);
  path.quadraticCurveTo(x0 + halfW * 2, y0 + halfD * 2, x0 + halfW * 2, y0 + halfD * 2 - radius);
  path.lineTo(x0 + halfW * 2, y0 + radius);
  path.quadraticCurveTo(x0 + halfW * 2, y0, x0 + halfW * 2 - radius, y0);
  path.lineTo(x0 + radius, y0);
  path.quadraticCurveTo(x0, y0, x0, y0 + radius);
}

const BORDER_OUTER_HALF = TABLE_HALF + BORDER_THICKNESS;

// 縁が小さくなる(内側の段になる)ほど角丸半径も比例して小さくしていき、
// フェルトに接する最内周ではほぼ直角に近づく。
function cornerRadiusAt(half: number): number {
  return Math.max(0, BORDER_CORNER_RADIUS - (BORDER_OUTER_HALF - half));
}

function buildRingGeometry(halfOuter: number, halfInner: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  tracePath(shape, halfOuter, halfOuter, cornerRadiusAt(halfOuter));
  const hole = new THREE.Path();
  tracePath(hole, halfInner, halfInner, cornerRadiusAt(halfInner));
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// 外側から内側へ向かって段々と低くなっていく階段状の縁(サイコロのトレイと
// 全く同じ構造)。BORDER_THICKNESSをSTEP_COUNT分の輪に分割し、内側の輪ほど
// 低い(短い)高さにする。
const STEP_COUNT = 4;
const STEP_WIDTH = BORDER_THICKNESS / STEP_COUNT;
const MIN_HEIGHT_RATIO = 0.6;
const borderStepGeometries = Array.from({ length: STEP_COUNT }, (_, i) => {
  const halfOuter = BORDER_OUTER_HALF - i * STEP_WIDTH;
  const halfInner = BORDER_OUTER_HALF - (i + 1) * STEP_WIDTH;
  const minHeight = BORDER_HEIGHT * MIN_HEIGHT_RATIO;
  const height = minHeight + (BORDER_HEIGHT - minHeight) * ((STEP_COUNT - i) / STEP_COUNT);
  return buildRingGeometry(halfOuter, halfInner, height);
});

// コインを投げるテーブル(床)+ 見えない4方向の壁(ダイスのTrayと同じ構造)。
function Table() {
  // カジノのテーブルフェルト風テクスチャ。テーブル全体を1枚で覆うので
  // リピートはしない(ゴールドのレールが縁に一度だけ来るようにするため)。
  const feltTexture = useMemo(() => new THREE.CanvasTexture(buildCasinoFeltTexture()), []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[TABLE_HALF, 0.5, TABLE_HALF]} position={[0, -0.5, 0]} friction={0.16} restitution={0.42} />
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[TABLE_HALF * 2, 1, TABLE_HALF * 2]} />
        <meshStandardMaterial map={feltTexture} roughness={0.9} metalness={0} />
      </mesh>
      {/* 卓を囲む階段状の縁(サイコロのトレイと全く同じデザイン)。当たり判定は
          見えない壁がそのまま担うので、これは見た目だけの装飾。 */}
      {borderStepGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshStandardMaterial color="#363636" roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* 垂直な壁(見えない当たり判定)。摩擦を極小にしてもたれかかりにくくしている。 */}
      <CuboidCollider
        args={[0.2, WALL_HEIGHT / 2, TABLE_HALF]}
        position={[TABLE_HALF, WALL_HEIGHT / 2 - 0.5, 0]}
        friction={0.01}
        restitution={0.42}
      />
      <CuboidCollider
        args={[0.2, WALL_HEIGHT / 2, TABLE_HALF]}
        position={[-TABLE_HALF, WALL_HEIGHT / 2 - 0.5, 0]}
        friction={0.01}
        restitution={0.42}
      />
      <CuboidCollider
        args={[TABLE_HALF, WALL_HEIGHT / 2, 0.2]}
        position={[0, WALL_HEIGHT / 2 - 0.5, TABLE_HALF]}
        friction={0.01}
        restitution={0.42}
      />
      <CuboidCollider
        args={[TABLE_HALF, WALL_HEIGHT / 2, 0.2]}
        position={[0, WALL_HEIGHT / 2 - 0.5, -TABLE_HALF]}
        friction={0.01}
        restitution={0.42}
      />
    </RigidBody>
  );
}

// コイン本体。@react-three/rapierによる本物の物理演算(重力・衝突)で投げ上げて転がす。
// 出目(表/裏)は「先に決める」のではなく、静止後の姿勢(rotation)から実際に
// 上を向いている面を読み取って求める(ダイスと同じ設計、lib/coin3d.ts参照)。
function Coin({ trigger, onSettle }: { trigger: number; onSettle: (side: CoinSide) => void }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const lastTrigger = useRef(0);
  const flipping = useRef(false);
  const stillTime = useRef(0);
  const spinHum = useRef<ReturnType<typeof startCoinSpinHum> | null>(null);
  const wasTopSpinning = useRef(false);

  // アンマウント時にスピン音が鳴りっぱなしにならないよう後始末する。
  useEffect(() => {
    return () => {
      spinHum.current?.stop();
      spinHum.current = null;
    };
  }, []);

  // 表・裏・側面(ギザ)それぞれの色テクスチャ+凹凸(bumpMap)テクスチャ。
  // ダイスと同様、ロールの度に作り直さず一度だけ生成してRigidBody自体も再マウントしない
  // (WebGLコンテキストロスト対策)。
  const textures = useMemo(() => {
    const built = buildCoinTextures();
    const make = (canvas: HTMLCanvasElement) => new THREE.CanvasTexture(canvas);
    const front = { map: make(built.front.color), bump: make(built.front.bump) };
    const back = { map: make(built.back.color), bump: make(built.back.bump) };
    const edge = { map: make(built.edge.color), bump: make(built.edge.bump) };
    [edge.map, edge.bump].forEach((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(24, 1);
    });
    return { front, back, edge };
  }, []);

  // triggerが変化した = 「トスする」ボタンが押された合図。
  // 上空のランダムな姿勢に飛ばし、ランダムな速度・角速度(主に水平軸まわりの回転)を
  // 与えて物理演算に委ねる。
  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    const body = bodyRef.current;
    if (!body) return;

    const startX = (Math.random() - 0.5) * 0.8;
    const startZ = (Math.random() - 0.5) * 0.8;
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
    );

    body.setTranslation({ x: startX, y: 5.5 + Math.random() * 1.5, z: startZ }, true);
    body.setRotation(rotation, true);
    body.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: 4 + Math.random() * 1.4, z: (Math.random() - 0.5) * 1.5 }, true);

    // 回転軸を「コインの面(初期姿勢を反映した法線)」に対して垂直に限定することで、
    // 実物のコイントスと同じ「端から端へくるくる回転する」一軸フリップになる
    // (面の法線を軸に回すと、コマのように回ってしまいフリップらしく見えない)。
    // 初期姿勢はランダムなので、毎回そのコイン自身の面を基準に軸を組み直す。
    const faceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    const helper = Math.abs(faceNormal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent1 = new THREE.Vector3().crossVectors(helper, faceNormal).normalize();
    const tangent2 = new THREE.Vector3().crossVectors(faceNormal, tangent1).normalize();

    const spinAxisAngle = Math.random() * Math.PI * 2;
    const spinAxis = tangent1
      .clone()
      .multiplyScalar(Math.cos(spinAxisAngle))
      .add(tangent2.clone().multiplyScalar(Math.sin(spinAxisAngle)));
    // 多少の角度のランダム性(面の法線方向を少し混ぜて、完全に垂直からわずかにずらす)。
    const wobble = (Math.random() - 0.5) * 0.3;
    spinAxis.addScaledVector(faceNormal, wobble).normalize();

    const spinMagnitude = SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN);
    body.setAngvel(
      { x: spinAxis.x * spinMagnitude, y: spinAxis.y * spinMagnitude, z: spinAxis.z * spinMagnitude },
      true
    );
    flipping.current = true;
    stillTime.current = 0;
    spinHum.current?.stop();
    spinHum.current = null;
    wasTopSpinning.current = false;
    playCoinTossFlick();
  }, [trigger]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || !flipping.current) return;

    // コインが自身の面法線を軸にコマのように回ってしまう成分だけを毎フレーム
    // 弱める(フリップ方向=面に平行な軸まわりの回転はそのまま残す)。現在の
    // 姿勢を基準にワールド角速度をローカル座標へ変換し、ローカルY成分だけ
    // 減衰させてからワールドへ戻す。
    const bodyRot = body.rotation();
    const bodyQuat = new THREE.Quaternion(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
    const rawAv = body.angvel();
    const localAv = new THREE.Vector3(rawAv.x, rawAv.y, rawAv.z).applyQuaternion(bodyQuat.clone().invert());
    // 減衰をかける前の値が、今このフレームで実際に起きている「コマ回転」の速さ。
    const topSpinSpeed = Math.abs(localAv.y);
    localAv.y *= Math.exp(-TOP_SPIN_DAMP_RATE * delta);
    const dampedAv = localAv.applyQuaternion(bodyQuat);
    body.setAngvel({ x: dampedAv.x, y: dampedAv.y, z: dampedAv.z }, true);

    const lv = body.linvel();
    const av = { x: dampedAv.x, y: dampedAv.y, z: dampedAv.z };
    const linSpeed = Math.hypot(lv.x, lv.y, lv.z);
    const angSpeed = Math.hypot(av.x, av.y, av.z);

    // コマのように回転している間はスピン音を鳴らし続け、回転が収まった瞬間
    // (=コインが倒れて平らになった瞬間)に「パタン」という音を鳴らす。
    const isTopSpinning = topSpinSpeed > TOP_SPIN_SOUND_THRESHOLD;
    if (isTopSpinning) {
      spinHum.current ??= startCoinSpinHum();
      spinHum.current.setIntensity((topSpinSpeed - TOP_SPIN_SOUND_THRESHOLD) / SPIN_MIN);
    } else if (spinHum.current) {
      spinHum.current.stop();
      spinHum.current = null;
      if (wasTopSpinning.current) playCoinFlop(linSpeed);
    }
    wasTopSpinning.current = isTopSpinning;

    if (linSpeed < SETTLE_LIN_SPEED && angSpeed < SETTLE_ANG_SPEED) {
      stillTime.current += delta;
      if (stillTime.current >= SETTLE_HOLD) {
        const r = body.rotation();
        const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const { side } = sideFromQuaternion(quat);

        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);

        flipping.current = false;
        playCoinResultChime();
        onSettle(side);
      }
    } else {
      stillTime.current = 0;
    }
  });

  // 台や壁に当たった瞬間、その時の速さに応じた金属音を鳴らす。
  // マウント直後、まだ一度もトスしていない状態でコインが重力で台に落ち着く際にも
  // 衝突イベント自体は発火するため、トス中(flipping)に限定してユーザー操作前に
  // 音(=AudioContext生成)が走らないようにする。
  const handleCollision = () => {
    if (!flipping.current) return;
    const lv = bodyRef.current?.linvel();
    if (!lv) return;
    playCoinClink(Math.hypot(lv.x, lv.y, lv.z));
  };

  return (
    <RigidBody
      ref={bodyRef}
      position={[0, REST_Y, 0]}
      colliders={false}
      restitution={0.42}
      friction={0.06}
      linearDamping={0.2}
      angularDamping={0.7}
      gravityScale={1.9}
      onCollisionEnter={handleCollision}
    >
      <CylinderCollider args={[PHYSICS_THICKNESS / 2, RADIUS]} density={COIN_DENSITY} />
      {/* シャドウマップ生成中に毎回WebGLコンテキストロストが再現したため、
          原因切り分けのためこのシーンではシャドウを無効化している(Canvas側の
          shadowプロパティを外し、castShadow/receiveShadowも付けていない)。 */}
      <mesh>
        <cylinderGeometry args={[RADIUS, RADIUS, VISUAL_THICKNESS, 32]} />
        <meshStandardMaterial
          attach="material-0"
          map={textures.edge.map}
          bumpMap={textures.edge.bump}
          bumpScale={0.01}
          color="#d4af37"
          roughness={0.35}
          metalness={0.75}
        />
        <meshStandardMaterial attach="material-1" map={textures.front.map} bumpMap={textures.front.bump} bumpScale={0.015} roughness={0.3} metalness={0.7} />
        <meshStandardMaterial attach="material-2" map={textures.back.map} bumpMap={textures.back.bump} bumpScale={0.015} roughness={0.3} metalness={0.7} />
      </mesh>
      {/* 表・裏それぞれの縁に金色のリムを重ね、硬貨らしい一段高い縁取りを表現する。 */}
      <mesh position={[0, VISUAL_THICKNESS / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS * 0.97, RADIUS * 0.03, 8, 32]} />
        <meshStandardMaterial color="#d4af37" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0, -VISUAL_THICKNESS / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS * 0.97, RADIUS * 0.03, 8, 32]} />
        <meshStandardMaterial color="#d4af37" roughness={0.3} metalness={0.8} />
      </mesh>
    </RigidBody>
  );
}

// コイントスツールの3Dシーン本体。
export default function CoinScene({
  trigger,
  onResult,
}: {
  trigger: number;
  onResult: (side: CoinSide) => void;
}) {
  // ブラウザがGPUリソース逼迫時にWebGLコンテキストを失効させることがある
  // (WebGLコンテキストロスト)。失効後に@react-three/postprocessingの
  // EffectComposerが次のフレームで動こうとすると例外を投げてクラッシュするため、
  // ネイティブのwebglcontextlostイベントを検知した瞬間にCanvasごと
  // フォールバック表示に切り替え、EffectComposerが失効後のコンテキストに
  // 触れる前に止める。
  const [contextLost, setContextLost] = useState(false);
  // インラインオブジェクトのままだと再レンダーのたびにR3Fが新しいcamera propと
  // 見なし、ResponsiveCameraが設定した位置/fovを毎回基準値へ引き戻してしまう
  // (RouletteScene参照)。参照を固定してそれを防ぐ。
  const initialCamera = useMemo(() => ({ position: [0, 7.6, 7.6] as [number, number, number], fov: 42 }), []);

  if (contextLost) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-sm text-white/60">
        <p>
          3D表示に問題が発生しました。
          <br />
          ブラウザのリソース不足が原因のことが多く、再読み込みで復帰します。
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-white/15 px-4 py-1.5 text-white/80 hover:bg-white/10"
        >
          ページを再読み込み
        </button>
      </div>
    );
  }

  return (
    <Canvas
      camera={initialCamera}
      gl={{ alpha: true, antialias: false }}
      dpr={1}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          setContextLost(true);
        });
      }}
    >
      <ResponsiveCamera baseFov={42} referenceAspect={672 / 560} basePosition={[0, 7.6, 7.6]} pushBackStrength={-1} />
      <ambientLight intensity={0.6} color="#fff2df" />
      <directionalLight position={[6, 10, 5]} intensity={1.25} color="#fff4e0" />
      <pointLight position={[-3, 3, 3]} intensity={0.45} color="#fde68a" />
      {/* @react-three/rapierのrapier WASMモジュール初期化はsuspend-react系の
          仕組みで行われるため、Suspense境界なしだとコールドロード(WASM未初期化)
          時にWebGLコンテキストの初期化と衝突してコンテキストロストを起こしていた
          (ダイスからの遷移など既にWASMが初期化済みの場合は再現しなかった)。
          DiceSceneと同じくSuspenseで囲む。 */}
      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]}>
          <Table />
          <Coin trigger={trigger} onSettle={onResult} />
        </Physics>
      </Suspense>
      {/* Bloom/VignetteのEffectComposerは一時的に外している(原因切り分け中)。 */}
    </Canvas>
  );
}
