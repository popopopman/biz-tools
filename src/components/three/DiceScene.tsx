"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from "@react-three/rapier";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { valueFromQuaternion, alignedQuaternion, pipTexture, pipNormalTexture, FACE_VALUES } from "@/lib/dice3d";
import { playDiceKnock } from "@/lib/diceSound";
import { buildFeltColorTexture, buildFeltNormalTexture } from "@/lib/feltTexture";
import ResponsiveCamera from "@/components/three/ResponsiveCamera";

// ダイス本体のサイズと角の丸め具合。黒い立方体でおなじみの、角がわずかに
// 丸まったダイスの見た目にする。
const BOX_SIZE = 0.95;
const CORNER_RADIUS = 0.14;

// ダイス共通のgeometry(角丸ボックス)は1回だけ作って使い回す。
const dieGeometry = new RoundedBoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE, 4, CORNER_RADIUS);

// 各面の目(ピップ)テクスチャは1回だけ生成して使い回す
// (RoundedBoxGeometryはBoxGeometryのマテリアルグループ順(+x,-x,+y,-y,+z,-z)を
// そのまま引き継ぐので、FACE_VALUESと同じ順に並べればよい)。
const baseFaceMaterials = FACE_VALUES.map(
  (value) =>
    new THREE.MeshStandardMaterial({
      map: pipTexture(value),
      // 法線マップで、ポチが実際に彫り込まれているような凹みを疑似表現する
      // (ジオメトリ自体は平らなまま)。
      normalMap: pipNormalTexture(value),
      normalScale: new THREE.Vector2(1, 1),
      roughness: 0.4,
      metalness: 0.1,
    })
);

const feltMap = buildFeltColorTexture("#670707");
const feltNormalMap = buildFeltNormalTexture();

// トレイ(サイコロを転がす台)の半径。原点から端までの距離。
const TRAY_HALF = 4.0;
// サイコロが静止している時のY座標(トレイの床のすぐ上)。
const REST_Y = 0.75;
// トレイを囲む見えない壁の高さ(振っている間にサイコロが外へ転げ出ないようにする)。
const WALL_HEIGHT = 6;

// 並進・回転の速度がこの閾値を下回った状態がSETTLE_HOLD秒続いたら「静止した」とみなす。
const SETTLE_LIN_SPEED = 0.05;
const SETTLE_ANG_SPEED = 0.1;
const SETTLE_HOLD = 0.25;
// 個数が多いと他のサイコロとの接触が増え、速度が閾値をわずかに超え続けて
// いつまでも「静止」と判定できないことがある。その場合でも一定時間で
// 強制的にその時点の姿勢で確定させ、個数によって挙動が変わらないようにする。
const MAX_ROLL_DURATION = 3;
// 整列スライドアニメーションの秒数(DiceScene側の完了通知タイミングとも合わせる)。
const ALIGN_DURATION = 0.5;

// 実際のダイストレイ製品や「ヨット」系ダイスゲームによく見られる、フェルト敷きの
// 中央を黒い縁(木枠)で囲うデザインを再現する見た目だけの縁。当たり判定は
// WALL_HEIGHTの高い透明な壁が別途担っているので、こちらは見た目だけ調整すればよい。
const BORDER_HEIGHT = 1.1;
const BORDER_THICKNESS = 0.75;
const BORDER_CORNER_RADIUS = 0.6;

// (x, y)中心の角丸長方形パスをshapeに書き込む。
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

// 外周の半径を基準に、内側に向かうほど角丸の半径を小さくしていく
// (フェルトの開口部=一番内側は直角のまま)。額縁の各リングで丸みを揃えるための計算。
const outerHalf = TRAY_HALF + BORDER_THICKNESS;
function cornerRadiusAt(half: number): number {
  return Math.max(0, BORDER_CORNER_RADIUS - (outerHalf - half));
}

// halfOuter〜halfInnerの正方形リング(枠)をShapeとして作り、指定した高さで
// 押し出す。押し出し方向(Z)を後でYに回転させて縦に立てる
// (フェルト床の上面=y=0を基準にそのまま置けば、そこから真っ直ぐ立ち上がる)。
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

// 黒い縁を、外側から内側(フェルト側)へ向かって低くなっていく階段状にする。
// リングをSTEP_COUNT本並べ、外側ほど幅・高さが大きい段にする(ピラミッドの
// 一段を輪切りにしたような形)。
const STEP_COUNT = 4;
const stepWidth = BORDER_THICKNESS / STEP_COUNT;
// 一番内側の段でもBORDER_HEIGHTのMIN_HEIGHT_RATIO倍は高さを保つことで、
// 傾斜を緩やかにする(0にすると一番内側がほぼ埋まってしまうほど急になる)。
const MIN_HEIGHT_RATIO = 0.6;
const stepGeometries = Array.from({ length: STEP_COUNT }, (_, i) => {
  const halfOuter = outerHalf - i * stepWidth;
  const halfInner = outerHalf - (i + 1) * stepWidth;
  const minHeight = BORDER_HEIGHT * MIN_HEIGHT_RATIO;
  const height = minHeight + (BORDER_HEIGHT - minHeight) * ((STEP_COUNT - i) / STEP_COUNT);
  return buildRingGeometry(halfOuter, halfInner, height);
});

// サイコロを転がす台(赤いフェルト敷きの床)+ 角丸の黒い縁 + 見えない4方向の壁(当たり判定)。
function Tray() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[TRAY_HALF, 0.5, TRAY_HALF]} position={[0, -0.5, 0]} friction={0.8} restitution={0.3} />
      {/* 見た目の土台は枠の外周(outerHalf)までカバーする大きさにする。当たり判定の
          床(CuboidCollider)は従来通りフェルトの遊び場部分(TRAY_HALF)だけでよい。 */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[outerHalf * 2, 1, outerHalf * 2]} />
        <meshStandardMaterial map={feltMap} normalMap={feltNormalMap} roughness={0.95} metalness={0} />
      </mesh>

      {/* 穴(フェルト開口部)側の輪郭の巻き方向が外周と逆にならず、内側の壁面の法線が
          反転してしまう(奥の壁の内側面などが見えなくなる)ため、両面描画にしておく。 */}
      {stepGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial color="#242424" roughness={0.35} metalness={0.35} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <CuboidCollider args={[0.2, WALL_HEIGHT / 2, TRAY_HALF]} position={[TRAY_HALF, WALL_HEIGHT / 2 - 0.5, 0]} restitution={0.3} />
      <CuboidCollider args={[0.2, WALL_HEIGHT / 2, TRAY_HALF]} position={[-TRAY_HALF, WALL_HEIGHT / 2 - 0.5, 0]} restitution={0.3} />
      <CuboidCollider args={[TRAY_HALF, WALL_HEIGHT / 2, 0.2]} position={[0, WALL_HEIGHT / 2 - 0.5, TRAY_HALF]} restitution={0.3} />
      <CuboidCollider args={[TRAY_HALF, WALL_HEIGHT / 2, 0.2]} position={[0, WALL_HEIGHT / 2 - 0.5, -TRAY_HALF]} restitution={0.3} />
    </RigidBody>
  );
}

// サイコロ1個分のコンポーネント。@react-three/rapierによる本物の物理演算(重力・衝突)で転がす。
// 出目は「先に決める」のではなく、静止後の姿勢(rotation)から実際に上を向いている面を読み取って求める。
//
// 以前この方式でWebGLのコンテキストロスト(実機のGPUでも再現する不具合)が起きたことがあるため、
// その再発を避けるべく: Physicsワールド・RigidBodyは(countが変わらない限り)ロールの度に
// 再マウントせず、既存のbodyの位置・速度をリセットするだけに留めている
// (毎ロールごとにcollider/WASM側リソースを作り直すとリークしうるため)。
function Die({
  index,
  idlePos,
  trigger,
  alignSignal,
  layoutSignal,
  onSettle,
}: {
  index: number;
  idlePos: [number, number];
  trigger: number;
  alignSignal: number;
  layoutSignal: number;
  onSettle: (index: number, value: number) => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const geometry = dieGeometry;
  // countが増えて新しいDieがマウントされた時、現在のtrigger/alignSignalを
  // 「未処理の新しい合図」と誤認して勝手にロールし始めないよう、
  // マウント時点の値を初期値にしておく(0固定だと既存のtrigger値と食い違い、
  // ボタンを押していないのに追加したサイコロだけ単独で動いてしまう)。
  const lastTrigger = useRef(trigger);
  const lastAlignSignal = useRef(alignSignal);
  // こちらは逆に0固定のままにする。新しく追加されたサイコロもレイアウト変更の
  // 合図(layoutSignal、マウント時点で既に親側が更新済み)を「未処理」として
  // 受け取り、既存のサイコロと一緒に少し上から落ちてきてほしいため。
  const lastLayoutSignal = useRef(0);
  const rolling = useRef(false);
  const stillTime = useRef(0);
  const rollElapsed = useRef(0);
  // 静止はしたが、まだ整列指示(alignSignal)を待っている間の情報を保持しておく。
  const pendingAlign = useRef<{
    fromX: number;
    fromZ: number;
    fromQuat: THREE.Quaternion;
    toQuat: THREE.Quaternion;
  } | null>(null);
  // 整列位置(idlePos)へ位置・向きを滑らかにスライドさせるアニメーションの状態。
  const align = useRef({
    active: false,
    startTime: 0,
    fromX: 0,
    fromZ: 0,
    fromQuat: new THREE.Quaternion(),
    toQuat: new THREE.Quaternion(),
  });

  // triggerが変化した = 「振る」ボタンが押された合図。
  // トレイ上空のランダムな位置・姿勢に飛ばし、ランダムな速度・角速度を与えて物理演算に委ねる。
  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    const body = bodyRef.current;
    if (!body) return;

    const startX = idlePos[0] + (Math.random() - 0.5) * 1.2;
    const startZ = idlePos[1] + (Math.random() - 0.5) * 1.2;
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
    );

    body.setTranslation({ x: startX, y: 4 + Math.random() * 1.5, z: startZ }, true);
    body.setRotation(rotation, true);
    body.setLinvel({ x: (Math.random() - 0.5) * 2, y: -2, z: (Math.random() - 0.5) * 2 }, true);
    body.setAngvel(
      { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 },
      true
    );
    rolling.current = true;
    stillTime.current = 0;
    rollElapsed.current = 0;
    align.current.active = false;
    pendingAlign.current = null;
  }, [trigger, idlePos]);

  // layoutSignalが変化した = 個数が変わってグリッド配置(idlePos)が変わった合図。
  // ロール中でなければ、既存のサイコロも新しく追加されたサイコロも一緒に、
  // 初回マウント時と全く同じREST_Y位置に置き直す。ページを開いた時にサイコロが
  // 少しだけ落下して見えるのはこの位置(RigidBody初期position)がまさにこれで、
  // 床コライダーとの隙間の分だけ重力で自然に落ちるため。同じ高さにすることで
  // 個数変更時も全く同じ落ち方になる。
  useEffect(() => {
    if (layoutSignal === lastLayoutSignal.current) return;
    lastLayoutSignal.current = layoutSignal;
    const body = bodyRef.current;
    if (!body || rolling.current) return;

    body.setTranslation({ x: idlePos[0], y: REST_Y, z: idlePos[1] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [layoutSignal, idlePos]);

  // alignSignalが変化した = 「全てのサイコロが静止した」合図。ここで初めて
  // 整列位置へのスライドを開始する(静止した瞬間に個別に動き出すと、まだ
  // 転がっている他のサイコロがある間に動いてしまうため)。
  useEffect(() => {
    if (alignSignal === lastAlignSignal.current) return;
    lastAlignSignal.current = alignSignal;
    const pending = pendingAlign.current;
    if (!pending) return;
    align.current = { active: true, startTime: performance.now() / 1000, ...pending };
  }, [alignSignal]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    if (rolling.current) {
      rollElapsed.current += delta;
      const lv = body.linvel();
      const av = body.angvel();
      const linSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angSpeed = Math.hypot(av.x, av.y, av.z);

      if (linSpeed < SETTLE_LIN_SPEED && angSpeed < SETTLE_ANG_SPEED) {
        stillTime.current += delta;
      } else {
        stillTime.current = 0;
      }

      // 個数が多いと他のサイコロとの接触で速度が閾値をわずかに超え続け、
      // 自前の閾値判定だけではいつまでも「静止」と判定できないことがある
      // (=個数によって結果が確定せず固まって見える不具合)。MAX_ROLL_DURATIONを
      // 超えたら、まだ揺れていてもその時点の姿勢で強制的に確定させる。
      if (stillTime.current >= SETTLE_HOLD || rollElapsed.current >= MAX_ROLL_DURATION) {
        const r = body.rotation();
        const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const value = valueFromQuaternion(quat);

        // 物理演算の姿勢(角度)はそのまま採用する(意図的に補正しない)。
        // ただし物理ソルバーの許容誤差でわずかに床にめり込む/浮くことがあるため、
        // 現在の傾きのまま最下点がちょうど床面(y=0)に接するようYだけ補正する。
        let minY = Infinity;
        const v = new THREE.Vector3();
        const pos = geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i).applyQuaternion(quat);
          if (v.y < minY) minY = v.y;
        }
        const t = body.translation();
        body.setTranslation({ x: t.x, y: -minY, z: t.z }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);

        rolling.current = false;
        onSettle(index, value);
        // 整列はまだ開始しない。全てのサイコロが静止し、alignSignalが来てから
        // 一斉にスライドを始めるため、ここでは情報を保持するだけにする。
        // (傾いたままの姿勢からalignedQuaternionへ滑らかにスライドする過程で
        // 自然と真っ直ぐに揃う。)
        pendingAlign.current = { fromX: t.x, fromZ: t.z, fromQuat: quat.clone(), toQuat: alignedQuaternion(value) };
      }
      return;
    }

    // 全サイコロが静止した後、床に触れたまま整列位置まで滑らかにスライドしつつ、
    // 数字の向き(ヨー)も出目ごとに固定された向きへ揃える。
    const a = align.current;
    if (a.active) {
      const progress = Math.min(1, (performance.now() / 1000 - a.startTime) / ALIGN_DURATION);
      const eased = 1 - (1 - progress) ** 3;
      const cur = body.translation();
      body.setTranslation(
        { x: a.fromX + (idlePos[0] - a.fromX) * eased, y: cur.y, z: a.fromZ + (idlePos[1] - a.fromZ) * eased },
        true
      );
      const rotated = new THREE.Quaternion().slerpQuaternions(a.fromQuat, a.toQuat, eased);
      body.setRotation(rotated, true);
      // 静止済みのbodyでも重力で速度が蓄積し続けるため、スライド中は毎フレーム
      // ゼロに戻しておく(そうしないとスライド完了後に急に落下・跳ねてしまう)。
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (progress >= 1) a.active = false;
    }
  });

  // 床・壁・他のサイコロにぶつかった瞬間に呼ばれる。ぶつかった時点の速さを
  // 音の大きさ・高さに反映することで、勢いよくぶつかったかどうかが伝わるようにする。
  const handleCollision = () => {
    const body = bodyRef.current;
    if (!body) return;
    const lv = body.linvel();
    playDiceKnock(Math.hypot(lv.x, lv.y, lv.z));
  };

  return (
    <RigidBody
      ref={bodyRef}
      position={[idlePos[0], REST_Y, idlePos[1]]}
      colliders="hull"
      density={2.3}
      restitution={0.48}
      friction={0.6}
      linearDamping={0.25}
      angularDamping={0.3}
      onCollisionEnter={handleCollision}
    >
      <mesh geometry={geometry} material={baseFaceMaterials} castShadow receiveShadow />
    </RigidBody>
  );
}

// サイコロツールの3Dシーン本体。
// 指定した個数のサイコロをトレイ上に配置し、物理演算で転がして出目を確定する。
export default function DiceScene({
  count,
  trigger,
  onAllSettled,
}: {
  count: number;
  trigger: number;
  onAllSettled: (values: number[]) => void;
}) {
  // 各サイコロの出目を集計するための配列。stateにすると毎フレーム再レンダリングが
  // 走ってしまうため、refで保持し、全て揃った時だけonAllSettledを呼ぶ。
  const resultsRef = useRef<(number | null)[]>([]);
  const reportedTrigger = useRef(-1);
  // 値が変わるたびに「全サイコロが静止したので整列を始めてよい」という合図として
  // 各Dieに配る(全員が同時にスライドを始められるよう、1箇所に揃うのを待つ)。
  const [alignSignal, setAlignSignal] = useState(0);
  // 個数が変わって配置(idlePositions)が変わるたびに増える合図。既存・新規を問わず
  // 全サイコロに配り、少し上から落として新しいグリッド位置へ収めさせる。
  const [layoutSignal, setLayoutSignal] = useState(0);
  const prevCount = useRef(count);
  // インラインオブジェクトのままだと再レンダーのたびにR3Fが新しいcamera propと
  // 見なし、ResponsiveCameraが設定した位置/fovを毎回基準値へ引き戻してしまう
  // (RouletteScene参照)。ダイスは着地・整列のたびにstate更新が起きるため
  // 特に影響が大きい。参照を固定してそれを防ぐ。
  const initialCamera = useMemo(() => ({ position: [0, 7.6, 7.6] as [number, number, number], fov: 42 }), []);

  useEffect(() => {
    resultsRef.current = Array(count).fill(null);
  }, [count, trigger]);

  useEffect(() => {
    if (prevCount.current === count) return;
    prevCount.current = count;
    setLayoutSignal((s) => s + 1);
  }, [count]);

  // まだ一度も振っていない間の初期配置。個数が多いと横一列に詰め込むと落下軌道が
  // 重なって空中衝突・積み重なりが増える(=着地位置が不自然に高く見える)ため、
  // 1行あたり最大3個までにして必要なら複数行に折り返す。
  const idlePositions = useMemo<[number, number][]>(() => {
    const cols = Math.min(count, 3);
    const rows = Math.ceil(count / cols);
    const spacing = 1.2;
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return [(col - (cols - 1) / 2) * spacing, (row - (rows - 1) / 2) * spacing];
    });
  }, [count]);

  const handleSettle = (index: number, value: number) => {
    if (resultsRef.current.length !== count) return;
    resultsRef.current[index] = value;
    // 同じtriggerに対して二重に報告しないようreportedTriggerで防止する。
    if (reportedTrigger.current !== trigger && resultsRef.current.every((v) => v !== null)) {
      reportedTrigger.current = trigger;
      const values = resultsRef.current as number[];
      // 全員に整列を開始させ、そのスライドが終わるタイミング(ALIGN_DURATION後)で
      // 結果確定を通知する(効果音が整列完了とぴったり重なるようにするため)。
      setAlignSignal((s) => s + 1);
      setTimeout(() => onAllSettled(values), ALIGN_DURATION * 1000);
    }
  };

  return (
    <Canvas shadows camera={initialCamera} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ResponsiveCamera baseFov={42} referenceAspect={672 / 560} basePosition={[0, 7.6, 7.6]} pushBackStrength={-1} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8.5}
        shadow-camera-right={8.5}
        shadow-camera-top={8.5}
        shadow-camera-bottom={-8.5}
      />
      {/* リッチな見た目にするための補助的な色付きライト(青紫・ピンク)。 */}
      <pointLight position={[-4, 3, -3]} intensity={0.5} color="#818cf8" />
      <pointLight position={[4, 2, 4]} intensity={0.35} color="#f472b6" />
      {/* @react-three/rapierはWASMエンジンを非同期に初期化するためSuspenseで待機する。
          next/dynamicのloadingはモジュール自体の遅延importにのみ効き、
          Canvas配下(R3F独自のreactツリー)の内側では別途Suspenseが必要。 */}
      <Suspense fallback={null}>
        <Physics gravity={[0, -25, 0]}>
          <Tray />
          {Array.from({ length: count }).map((_, i) => (
            <Die
              key={i}
              index={i}
              idlePos={idlePositions[i]}
              trigger={trigger}
              alignSignal={alignSignal}
              layoutSignal={layoutSignal}
              onSettle={handleSettle}
            />
          ))}
        </Physics>
      </Suspense>
      {/* Bloom: 明るい部分がにじんで光るような演出。Vignette: 画面端を少し暗くして中央に視線を集める。 */}
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.9} intensity={0.55} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
