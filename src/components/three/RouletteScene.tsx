"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import {
  buildLabelCanvas,
  buildStarburstCanvas,
  buildSparkleCanvas,
  buildWoodGrainCanvas,
  buildBrushedMetalCanvas,
} from "@/lib/wheelTexture";
import { buildCasinoFeltTexture } from "@/lib/casinoFeltTexture";
import { playTick, playWinChime } from "@/lib/rouletteAudio";
import { useResponsiveFov, useResponsiveDistanceScale } from "@/lib/useResponsiveFov";

// 当選演出用の紙ふぶきの数・色(ゴールド基調のきらびやかな配色)。
const CONFETTI_COUNT = 48;
const CONFETTI_COLORS = ["#d4af37", "#f59e0b", "#fefce8", "#e11d48", "#9333ea", "#2563eb"];
const CONFETTI_GRAVITY = 9;
const CONFETTI_LIFE = 1.6;

export type ConfettiHandle = { burst: () => void };

// 当選確定時に中心から放射状に飛び散る紙ふぶき。
// パーティクルをロールの度に生成・破棄すると(ダイスの物理演算で経験した通り)
// WebGLコンテキストロストの原因になりうるため、固定数のメッシュを最初に1度だけ
// マウントし、burst()では位置・速度をリセットするだけにしている。
const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  // 描画(JSXのmap)にはrefではなくこの配列を使う(render中のref読み取りを避けるため)。
  const indices = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, i) => i), []);
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      mesh: null as THREE.Mesh | null,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      life: 0,
    }))
  );

  useImperativeHandle(ref, () => ({
    burst() {
      particles.current.forEach((p) => {
        if (!p.mesh) return;
        p.mesh.position.copy(CONFETTI_ORIGIN);
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 2.5;
        p.vel.set(Math.cos(angle) * speed, 3 + Math.random() * 2, Math.sin(angle) * speed * 0.6);
        p.angVel.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        p.life = CONFETTI_LIFE * (0.7 + Math.random() * 0.3);
        p.mesh.visible = true;
      });
    },
  }));

  useFrame((_, delta) => {
    particles.current.forEach((p) => {
      if (!p.mesh || p.life <= 0) return;
      p.life -= delta;
      if (p.life <= 0) {
        p.mesh.visible = false;
        return;
      }
      p.vel.y -= CONFETTI_GRAVITY * delta;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.rotation.x += p.angVel.x * delta;
      p.mesh.rotation.y += p.angVel.y * delta;
      p.mesh.rotation.z += p.angVel.z * delta;
    });
  });

  return (
    <>
      {indices.map((i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            particles.current[i].mesh = el;
          }}
        >
          <planeGeometry args={[0.09, 0.09]} />
          <meshBasicMaterial color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
});

// 当選確定時に一瞬だけ光る放射状のスターバースト(加算合成でパッと光って消える)。
// Confettiと同じ理由で、spriteを1つだけ最初に作っておき、flash()では
// スケール・不透明度をリセットするだけにしている。
const WIN_FLASH_LIFE = 0.4;
// まぶしすぎないよう、最大でもこの不透明度までしか光らせない。
const WIN_FLASH_PEAK_OPACITY = 0.5;
export type WinFlashHandle = { flash: () => void };

const WinFlash = forwardRef<WinFlashHandle>(function WinFlash(_props, ref) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => new THREE.CanvasTexture(buildStarburstCanvas()), []);
  const life = useRef(0);

  useImperativeHandle(ref, () => ({
    flash() {
      const sprite = spriteRef.current;
      if (!sprite) return;
      sprite.position.copy(CONFETTI_ORIGIN);
      sprite.scale.set(0.3, 0.3, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = WIN_FLASH_PEAK_OPACITY;
      life.current = WIN_FLASH_LIFE;
      sprite.visible = true;
    },
  }));

  useFrame((_, delta) => {
    const sprite = spriteRef.current;
    if (!sprite || life.current <= 0) return;
    life.current -= delta;
    const t = 1 - Math.max(0, life.current) / WIN_FLASH_LIFE;
    const scale = 0.3 + t * 2.4;
    sprite.scale.set(scale, scale, 1);
    (sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, (1 - t) * WIN_FLASH_PEAK_OPACITY);
    if (life.current <= 0) sprite.visible = false;
  });

  return (
    <sprite ref={spriteRef} visible={false} renderOrder={20}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
});

// 扇形(ホイールの1スライス)を厚みのある立体として描くための押し出し形状。
// 以前はcircleGeometryの厚み0のスライスだったが、ExtrudeGeometryでベベル付きの
// ブロックにすることで、光の当たり方に厚み・立体感が出る。
const WEDGE_DEPTH = 0.12;
function wedgeGeometry(radius: number, thetaStart: number, thetaLength: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, radius, thetaStart, thetaStart + thetaLength, false);
  shape.lineTo(0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: WEDGE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -WEDGE_DEPTH);
  return geometry;
}

const RADIUS = 2;
// 色付きスライスの半径。ExtrudeGeometryのベベルが外側にわずかにはみ出すため、
// ゴールドのベゼル(RADIUS基準)からスライスの縁が飛び出して見えないよう、
// スライス自体はRADIUSよりわずかに小さく作る。
const WEDGE_RADIUS = RADIUS - 0.04;
// ホイールの外側に一回り大きい台座面を敷く。
const TABLE_RADIUS = RADIUS + 1.0;
// ルーレット台がその上に乗っている、もっと大きな緑の床の一辺の長さ。
const BIG_FLOOR_SIZE = TABLE_RADIUS * 5;

// --- カジノのルーレット台らしい枠周りのパーツ ---
// 単純な円柱・箱の組み合わせではなく、旋盤で挽いたような断面をLatheGeometryで
// 回転させることで、ボウル外壁やタレット(中心の軸受け)に本物らしい凹凸を出す。

// ボール・トラック(ホイールの外側、ボウル壁との間にある傾斜したすり鉢状の帯)の内外半径・高さ。
const TRACK_INNER_R = RADIUS + 0.1;
const TRACK_OUTER_R = RADIUS + 0.34;
const TRACK_BASE_Z = 0.02;
const TRACK_TOP_Z = 0.12;
// ボール・トラックの傾斜面(開いた円錐台)。radiusBottom/Topの半径差が傾斜になる。
const ballTrackGeometry = new THREE.CylinderGeometry(TRACK_OUTER_R, TRACK_INNER_R, TRACK_TOP_Z - TRACK_BASE_Z, 64, 1, true);

// トラックの外周に並ぶダイヤ型の弾き石(本物のルーレットでボールを弾く「ダイヤモンド」を模したもの)。
const DEFLECTOR_COUNT = 8;
const DEFLECTOR_RADIUS = TRACK_OUTER_R - 0.02;
const DEFLECTOR_Z = (TRACK_BASE_Z + TRACK_TOP_Z) / 2 + 0.03;

// ボウル外壁(樽のように膨らんで、リム付近ですぼまる断面)。回転体なのでフラットなトーラスより
// はるかに複雑な輪郭になる。
const BOWL_BASE_Z = TRACK_TOP_Z;
const BOWL_TOP_Z = 0.32;
const bowlProfile = [
  new THREE.Vector2(TRACK_OUTER_R, BOWL_BASE_Z),
  new THREE.Vector2(TRACK_OUTER_R + 0.03, BOWL_BASE_Z + 0.03),
  new THREE.Vector2(RADIUS + 0.6, BOWL_BASE_Z + 0.09),
  new THREE.Vector2(RADIUS + 0.58, BOWL_BASE_Z + 0.15),
  new THREE.Vector2(RADIUS + 0.44, BOWL_TOP_Z - 0.03),
  new THREE.Vector2(RADIUS + 0.46, BOWL_TOP_Z),
];
const bowlWallGeometry = new THREE.LatheGeometry(bowlProfile, 96);
// ボウル上下の縁を留める、真鍮の帯金(輪郭断面の両端に合わせる)。
const bowlBandBottomRadius = bowlProfile[0].x;
const bowlBandBottomZ = bowlProfile[0].y;
const bowlBandTopRadius = bowlProfile[bowlProfile.length - 1].x;
const bowlBandTopZ = bowlProfile[bowlProfile.length - 1].y;
// フェルトはボウルの最大直径より内側では常に隠れて見えないので、そこから外側だけ敷けば十分。
// (内側まで敷いてしまうと、傾斜したボール・トラック越しに緑がのぞいて見えてしまう)
const FELT_INNER_R = Math.max(...bowlProfile.map((p) => p.x)) - 0.02;

// スライスの縁とフェルトの間を埋める、木製の裾(スカート)。ボール・トラックやボウル壁だけでは
// スライスの外周からフェルトまでの間に段差が残り、ボウルが「浮いて」見えてしまうため、
// スライスの縁(狭い)からフェルトの内側(広い)まで届く円錐状のシェルで実際に橋渡しし、
// どの角度から見てもホイールの木枠がスライスへ直接接しているように見せる。
const SKIRT_TOP_R = WEDGE_RADIUS - 0.03;
const SKIRT_BOTTOM_R = FELT_INNER_R;
const SKIRT_TOP_Z = -0.02;
const SKIRT_BOTTOM_Z = -0.1;
const skirtGeometry = new THREE.CylinderGeometry(
  SKIRT_TOP_R,
  SKIRT_BOTTOM_R,
  SKIRT_TOP_Z - SKIRT_BOTTOM_Z,
  64,
  1,
  true
);

// 中心のタレット(軸受け)。半径が上に向かって単調に細くなる「ウェディングケーキ」型の
// 段差にすることで、環境マップなしのメタル素材でも段差(棚)面が上からの光を確実に受けて
// 明るく見え、垂直な立ち上がり面は影になり、旋盤挽きの真鍮パーツらしい陰影が出る。
const turretProfile = [
  new THREE.Vector2(0.3, 0),
  new THREE.Vector2(0.3, 0.02),
  new THREE.Vector2(0.2, 0.05),
  new THREE.Vector2(0.2, 0.1),
  new THREE.Vector2(0.13, 0.13),
  new THREE.Vector2(0.13, 0.2),
  new THREE.Vector2(0.07, 0.24),
  new THREE.Vector2(0.07, 0.3),
  new THREE.Vector2(0, 0.34),
];
const turretGeometry = new THREE.LatheGeometry(turretProfile, 48);
const TURRET_TOP_Z = turretProfile[turretProfile.length - 1].y;

// 固定ポインター(はじきレバー)は、ボウル壁の外側・フェルトの上に立てる。
const POINTER_RADIUS = TABLE_RADIUS - 0.22;
const POINTER_Z = 0.13;
// 本物のルーレットのポケットを思わせる、艶のある赤・黒の交互配色。
const WEDGE_RED = "#c8102e";
const WEDGE_BLACK = "#0d0d0f";
// 「0」ポケットの緑。奇数個の項目では赤黒だけで円環をきれいに交互配置できない
// (奇数長の閉路は2色で塗り分け不可能)ため、本物のルーレットで0が緑になっているのと
// 同じ発想で、最後の1枠だけ緑にして帳尻を合わせる。
const WEDGE_GREEN = "#0e7a41";
// 仕切り・リム・ポインター台座に使う、艶やかなゴールドのトリムカラー。
const TRIM_COLOR = "#d4af37";

function assignWedgeColors(n: number): string[] {
  if (n <= 1) return [WEDGE_RED];
  const colors: string[] = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? WEDGE_RED : WEDGE_BLACK));
  if (n % 2 !== 0) colors[n - 1] = WEDGE_GREEN;
  return colors;
}
// ポインター(赤い矢印)を配置する角度。真上ではなく盤の横に置く。当選判定もこの角度を基準に計算する。
const POINTER_ANGLE = 0;
// ホイール全体を見下ろすように傾ける角度(Wheelのルートgroupの回転と合わせる)。
const WHEEL_TILT = -0.42;
// 着地時、当選スライスのラベル(sprite)が来る位置のワールド座標。
// 当選スライスの中心は必ずPOINTER_ANGLEに揃うため、ラベルの半径・奥行き
// (RADIUS*0.62, z=0.08。ラベルsprite自体の配置と合わせている)をその角度・
// Wheelの傾き(WHEEL_TILT)で変換すれば、着地した瞬間のラベルの位置が求まる。
// 紙ふぶきをここから飛ばすことで、「当選した文字」から飛び散るように見せる。
const CONFETTI_ORIGIN = new THREE.Vector3(RADIUS * 0.62, 0, 0.08)
  .applyAxisAngle(new THREE.Vector3(0, 0, 1), POINTER_ANGLE)
  .applyAxisAngle(new THREE.Vector3(1, 0, 0), WHEEL_TILT);
// 当選確定後にカメラが寄っていく先の位置。ポインター・当選ラベルのあるCONFETTI_ORIGIN側に
// 少し回り込みつつ寄る(見下ろす角度は保ったまま距離だけ詰める、というほど単純ではなく、
// x方向にも動かして「その項目とポインターの周辺」がフレームの中心に来るようにしている)。
const ZOOM_CAMERA_POS = new THREE.Vector3(2.5, 1.3, 3.0);
const ORIGIN_VEC = new THREE.Vector3(0, 0, 0);
// カメラが寄り切るまで/次のスピンで元に戻るまでの秒数。
const ZOOM_IN_DURATION = 0.9;
const ZOOM_OUT_DURATION = 0.55;
// 「回す」ボタン1回につき最低でも何周させるか(勢いよく回っている見た目にするため)。
const SPINS = 5;
// 1回の回転アニメーションにかける秒数。
const DURATION = 4.2;
// 当選スライスの発光パルスが続く秒数。
const GLOW_DURATION = 1.3;
// 通常時のラベル幅の上限(項目数が少ない時にこの幅で頭打ちになる)。
const MAX_LABEL_WIDTH = 0.85;
// ラベルの縦横比(幅に対する高さの比率)。
const LABEL_ASPECT = 0.32 / 0.85;
// 当選ラベルの文字を拡大する倍率(等倍からこの倍率へ滑らかに近づける)。
const LABEL_WIN_SCALE = 1.35;
// 当選ラベルの目標サイズ。項目数が増えて通常のラベルが小さくなっていても、
// 当選時は常にこの一定サイズまで拡大する(=誰が当たったか項目数によらず読める)。
const WINNER_LABEL_SCALE: [number, number] = [
  MAX_LABEL_WIDTH * LABEL_WIN_SCALE,
  MAX_LABEL_WIDTH * LABEL_WIN_SCALE * LABEL_ASPECT,
];
// ペグがポインター通過時に光る、ごく短い発光パルスの秒数(クリック音と同期させるため短め)。
const PEG_FLASH_DURATION = 0.15;

// 最初は速く、後半にかけて滑らかに減速するイージング関数(5乗のease-out)。
// 「ルーレットが徐々に止まっていく」自然な動きを再現する。
function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

// ホイール縁に並ぶ黒いペグ(でっぱり)。おもちゃのスピナーで、矢印(ポインター)が
// 1つずつカチカチと弾かれていく縁の突起を模したもの。仕切りの数だけ、ホイールの
// 縁のすぐ外側に立てる(ホイールと一緒に回転する)。ポインターを通過した瞬間に
// 白く光らせる演出のため、各ペグのmaterialをmaterialRefsに集めておく。
function PegBumps({
  angles,
  radius,
  texture,
  materialRefs,
}: {
  angles: number[];
  radius: number;
  texture: THREE.Texture;
  materialRefs: RefObject<(THREE.MeshStandardMaterial | null)[]>;
}) {
  return (
    <>
      {angles.map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0.03]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.04, 0.04, 0.07, 12]} />
          <meshStandardMaterial
            ref={(el) => {
              materialRefs.current[i] = el;
            }}
            color={TRIM_COLOR}
            map={texture}
            roughness={0.25}
            metalness={0.85}
            emissive="#ffffff"
            emissiveIntensity={0}
          />
        </mesh>
      ))}
    </>
  );
}

// ホイール本体(カラフルな扇形メッシュ + ラベル + 回転アニメーション)。
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
    targetIndex: -1,
  });
  // 当選スライスの発光パルス演出。停止直後に光り、1秒強で自然に消える。
  const glow = useRef({ index: -1, startTime: 0 });
  const wedgeMaterialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 当選ラベルの文字拡大演出。発光と違って自然には減衰させず、次のスピンが
  // 始まるまで拡大したまま保持する(結果が誰の目にも分かりやすいように)。
  const winnerIndexRef = useRef(-1);
  const labelSpriteRefs = useRef<(THREE.Sprite | null)[]>([]);
  // 回転中にポインターが仕切りを何個越えたか(クリック音を鳴らすタイミングの判定用)。
  const lastBoundary = useRef(0);
  // ポインターを通過した瞬間に光らせるペグの発光パルス(クリック音と同期させる)。
  const pegFlash = useRef({ index: -1, startTime: 0 });
  const pegMaterialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // 着地の瞬間の演出: カメラの一瞬の揺れ(残り秒数)とポインターの弾みスケール。
  const shakeTime = useRef(0);
  const pointerRef = useRef<THREE.Group>(null);
  // 中心の宝石トッパーは回転していない時もゆっくり回り、明滅して豪華さを演出する。
  const gemRef = useRef<THREE.Mesh>(null);
  const gemMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const { camera } = useThree();
  const baseCameraPos = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    baseCameraPos.current = camera.position.clone();
  }, [camera]);
  // スマホ縦画面など縦長のcanvasでもカメラが遠く感じないよう、fov・カメラ距離を補正する。
  // カメラ位置は下のuseFrameで毎フレーム自前計算しているため、専用コンポーネントは使わず
  // ここでhookを直接使ってその計算に組み込む。
  const fovRef = useResponsiveFov(42, 672 / 560);
  const distanceScaleRef = useResponsiveDistanceScale(672 / 560);
  // 当選確定後、カメラが当選項目とポインターの周辺にじわっと寄っていく演出。
  // t: 0(通常視点)〜1(寄り切った視点)、dir: +1で寄る/-1で戻る/0で静止(その場で保持)。
  const zoom = useRef({ t: 0, dir: 0 as -1 | 0 | 1 });
  const zoomLookTarget = useRef(new THREE.Vector3());

  const n = Math.max(items.length, 1);
  const sliceAngle = (Math.PI * 2) / n;

  // 項目数に応じて、隣接スライスが同色にならないよう調整した配色。
  const wedgeColors = useMemo(() => assignWedgeColors(n), [n]);

  // 各項目のラベルテクスチャ。背後のスライス(赤/黒/緑)の色をバッジのaccentColorとして渡し、
  // 文字色も自動でその色に合わせたコントラストになるようにする。
  const labelTextures = useMemo(
    () => items.map((label, i) => new THREE.CanvasTexture(buildLabelCanvas(label, wedgeColors[i]))),
    [items, wedgeColors]
  );

  // 質感を出すためのテクスチャ群(一度だけ生成し、以後は使い回す)。
  const sparkleTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildSparkleCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);
  const goldSparkleTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildSparkleCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    return tex;
  }, []);
  // ホイール本体(ボウル+ゴールドのふち)がその上に乗っている、もっと大きな緑の床。
  // コイントスのテーブルと同じcasinoFeltTextureを使い、1枚のまま(リピートなし)敷く。
  const bigFloorTexture = useMemo(() => new THREE.CanvasTexture(buildCasinoFeltTexture()), []);
  // ボウル・タレット・トラック用の大面積テクスチャ(質感を分けるため金・銀・木で別々に生成)。
  const goldBrushedTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildBrushedMetalCanvas("#c9a227"));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 3);
    return tex;
  }, []);
  const silverBrushedTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildBrushedMetalCanvas("#d8dee6"));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 2);
    return tex;
  }, []);
  const woodTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildWoodGrainCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 2);
    return tex;
  }, []);

  // ラベルの大きさ。項目数が増えて1スライスが細くなるほど、隣のラベルと
  // 重ならないよう幅を縮める(項目4件のときは元のサイズ0.85のまま)。
  const labelScale = useMemo<[number, number]>(() => {
    const labelRadius = RADIUS * 0.62;
    const maxWidth = 2 * labelRadius * Math.sin(sliceAngle / 2) * 0.85;
    const width = Math.min(MAX_LABEL_WIDTH, maxWidth);
    return [width, width * LABEL_ASPECT];
  }, [sliceAngle]);


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
    // ポインター(はじきレバー)はPOINTER_ANGLEの位置に固定されているので、
    // 「目標スライスの中心がその角度に来るために必要な追加回転量」を計算する。
    const required =
      ((POINTER_ANGLE - (midAngle + jitter)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // 前回までの回転量はそのまま維持しつつ(＝毎回必ず「前に」回る)、
    // 指定回数分フル回転させてから目標角度に着地させる。
    const finalAngle = current - currentMod + SPINS * Math.PI * 2 + required;

    anim.current = {
      spinning: true,
      startAngle: current,
      targetAngle: finalAngle,
      startTime: performance.now() / 1000,
      winner: items[targetIndex],
      targetIndex,
    };
    // 新しいロールが始まったら、前回の当選演出が残っていれば消しておく。
    // glow.current.indexをただ-1にするだけだと、発光の減衰(1.3秒)が終わる前に
    // 再度回した場合にその時点のemissiveIntensityが残ったままになってしまうため、
    // 直前の当選スライスがあれば明示的に消灯させてからリセットする。
    if (glow.current.index >= 0) {
      const prevMaterial = wedgeMaterialRefs.current[glow.current.index];
      if (prevMaterial) prevMaterial.emissiveIntensity = 0;
    }
    glow.current = { index: -1, startTime: 0 };
    winnerIndexRef.current = -1;
    lastBoundary.current = Math.floor(current / sliceAngle);
    // 前回の当選でカメラが寄ったままなら、通常視点に戻し始める。
    zoom.current.dir = -1;
  }, [spinToken, items, n, sliceAngle]);

  // 毎フレーム、経過時間に応じてイージングをかけながら回転角を更新する。
  useFrame(({ camera: frameCamera }, delta) => {
    const s = anim.current;
    if (s.spinning && spinRef.current) {
      const now = performance.now() / 1000;
      const t = Math.min(1, (now - s.startTime) / DURATION);
      const eased = easeOutQuint(t);
      const angle = s.startAngle + (s.targetAngle - s.startAngle) * eased;
      spinRef.current.rotation.z = angle;

      // ポインターが仕切りを越えるたびに、実物のクリッカーのような音を鳴らし、
      // その瞬間ポインターの位置にあるペグを光らせる。
      const boundary = Math.floor(angle / sliceAngle);
      if (boundary !== lastBoundary.current) {
        lastBoundary.current = boundary;
        playTick();
        const pegIndex = (((Math.round((POINTER_ANGLE - angle) / sliceAngle) % n) + n) % n);
        pegFlash.current = { index: pegIndex, startTime: now };
      }

      if (t >= 1) {
        s.spinning = false;
        glow.current = { index: s.targetIndex, startTime: now };
        winnerIndexRef.current = s.targetIndex;
        shakeTime.current = 0.35;
        zoom.current.dir = 1;
        onResult(s.winner);
      }
    }

    // 当選スライスの発光パルス(sinカーブで立ち上がって減衰する)。
    const g = glow.current;
    if (g.index >= 0) {
      const elapsed = performance.now() / 1000 - g.startTime;
      const material = wedgeMaterialRefs.current[g.index];
      if (material) {
        material.emissiveIntensity = elapsed < GLOW_DURATION ? Math.sin((elapsed / GLOW_DURATION) * Math.PI) * 1.6 : 0;
      }
      if (elapsed >= GLOW_DURATION) glow.current = { index: -1, startTime: 0 };
    }

    // 当選ラベルの拡大(対象は項目数によらず一定サイズへ、他は通常サイズへ、毎フレーム滑らかに近づける)。
    const labelDamp = 1 - Math.exp(-10 * delta);
    for (let i = 0; i < labelSpriteRefs.current.length; i += 1) {
      const sprite = labelSpriteRefs.current[i];
      if (!sprite) continue;
      const target = i === winnerIndexRef.current ? WINNER_LABEL_SCALE : labelScale;
      sprite.scale.x = THREE.MathUtils.lerp(sprite.scale.x, target[0], labelDamp);
      sprite.scale.y = THREE.MathUtils.lerp(sprite.scale.y, target[1], labelDamp);
    }

    // ペグの発光パルス(通過直後にパッと光ってすぐ消える)。
    const pf = pegFlash.current;
    if (pf.index >= 0) {
      const elapsed = performance.now() / 1000 - pf.startTime;
      const material = pegMaterialRefs.current[pf.index];
      if (material) {
        material.emissiveIntensity = elapsed < PEG_FLASH_DURATION ? 1.4 * (1 - elapsed / PEG_FLASH_DURATION) : 0;
      }
      if (elapsed >= PEG_FLASH_DURATION) pegFlash.current = { index: -1, startTime: 0 };
    }

    // 着地の瞬間、カメラを一瞬だけ揺らして「当たった」手応えを出す(game feelの定番、screen shake)。
    if (shakeTime.current > 0) {
      shakeTime.current = Math.max(0, shakeTime.current - delta);
    }
    // 当選項目とポインターの周辺にカメラが寄っていく/戻る演出。
    // 結果確定時のstate更新でRouletteToolが再レンダーされるとitems配列が新しい参照になり、
    // Canvasのcamera propも再適用されてカメラが基準位置に戻されることがあるため、
    // 寄り切って静止した後も毎フレーム位置・注視点を明示的に指定し続けて上書きする。
    const z = zoom.current;
    if (z.dir !== 0) {
      const duration = z.dir > 0 ? ZOOM_IN_DURATION : ZOOM_OUT_DURATION;
      z.t = THREE.MathUtils.clamp(z.t + (z.dir * delta) / duration, 0, 1);
      if ((z.dir > 0 && z.t >= 1) || (z.dir < 0 && z.t <= 0)) z.dir = 0;
    }
    if (frameCamera instanceof THREE.PerspectiveCamera && frameCamera.fov !== fovRef.current) {
      frameCamera.fov = fovRef.current;
      frameCamera.updateProjectionMatrix();
    }
    if (baseCameraPos.current) {
      const eased = easeOutQuint(z.t);
      const pos = baseCameraPos.current.clone().lerp(ZOOM_CAMERA_POS, eased).multiplyScalar(distanceScaleRef.current);
      if (shakeTime.current > 0) {
        const strength = 0.06 * (shakeTime.current / 0.35);
        pos.x += (Math.random() - 0.5) * strength;
        pos.y += (Math.random() - 0.5) * strength;
      }
      camera.position.copy(pos);
      camera.lookAt(zoomLookTarget.current.lerpVectors(ORIGIN_VEC, CONFETTI_ORIGIN, eased));
    }

    // ポインターも着地の瞬間にバウンドさせる(スケールをsinカーブで一瞬膨らませる)。
    const g2 = glow.current;
    if (pointerRef.current) {
      const elapsed = g2.index >= 0 ? performance.now() / 1000 - g2.startTime : Infinity;
      const bounce = elapsed < 0.4 ? 1 + Math.sin((elapsed / 0.4) * Math.PI) * 0.5 : 1;
      pointerRef.current.scale.setScalar(bounce);
    }

    // 中心の宝石トッパーは常にゆっくり回転・明滅させ、止まっている時も豪華に見せる。
    if (gemRef.current) {
      gemRef.current.rotation.y += delta * 1.1;
      gemRef.current.rotation.x += delta * 0.6;
    }
    if (gemMaterialRef.current) {
      gemMaterialRef.current.emissiveIntensity = 0.35 + 0.25 * Math.sin((performance.now() / 1000) * 2.2);
    }
  });

  // 各スライスの境界(=ポケット同士の仕切り)に立てるゴールドの仕切り板の角度。
  const dividerAngles = useMemo(() => Array.from({ length: n }, (_, i) => i * sliceAngle), [n, sliceAngle]);

  // 厚みのある扇形ジオメトリ(スライスごと)。
  const wedgeGeometries = useMemo(
    () => Array.from({ length: n }, (_, i) => wedgeGeometry(WEDGE_RADIUS, i * sliceAngle, sliceAngle)),
    [n, sliceAngle]
  );

  return (
    // ホイール全体を少し手前に傾けて見下ろすような、立体感のある構図にする。
    <group rotation={[WHEEL_TILT, 0, 0]}>
      {/* ルーレット台(ボウル+フェルト台座)がその上に乗っている、もっと大きな緑の床。
          コイントスのテーブルと同じ質感のテクスチャを、台よりさらに一段低い位置に敷く。 */}
      <mesh position={[0, 0, -0.3]} receiveShadow>
        <planeGeometry args={[BIG_FLOOR_SIZE, BIG_FLOOR_SIZE]} />
        <meshStandardMaterial map={bigFloorTexture} roughness={0.9} metalness={0} />
      </mesh>
      {/* ルーレット台本体の木製ベース板。ボウルの壁やトラックは薄いシェル形状なので、
          隙間から下の緑の床が透けて見えることがある。台の全周をこの茶色い円盤で
          裏打ちしておくことで、どこから覗いても緑ではなく木の色が見えるようにする。 */}
      <mesh position={[0, 0, -0.19]} receiveShadow>
        <circleGeometry args={[TABLE_RADIUS, 64]} />
        <meshStandardMaterial color="#ffffff" map={woodTexture} roughness={0.6} metalness={0} />
      </mesh>
      {/* ホイールより一回り大きい、木製の台座(回転しない)。緑のフェルトはさらに外側の
          大きな床だけにして、ルーレット本体の周りは全体を木のパーツで統一する。
          ボウル壁より内側は常に隠れるので、輪(リング)状にして無駄な範囲を敷かない。 */}
      <mesh position={[0, 0, -0.08]} receiveShadow>
        <ringGeometry args={[FELT_INNER_R, TABLE_RADIUS, 64]} />
        <meshStandardMaterial color="#ffffff" map={woodTexture} roughness={0.6} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* テーブル縁の太いゴールドのふち(トーラスで丸みのある縁取りにする)。 */}
      <mesh position={[0, 0, -0.07]}>
        <torusGeometry args={[TABLE_RADIUS - 0.08, 0.065, 16, 64]} />
        <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.25} metalness={0.85} />
      </mesh>

      <group ref={spinRef}>
        {/* 項目数ぶんの扇形(CircleGeometryのthetaStart/thetaLengthで1スライスずつ描画)。
            おもちゃのスピナーを思わせる原色パレットを順番に割り当てる。 */}
        {items.map((_, i) => (
          <mesh key={`wedge-${i}`} geometry={wedgeGeometries[i]} castShadow receiveShadow>
            <meshPhysicalMaterial
              ref={(el) => {
                wedgeMaterialRefs.current[i] = el;
              }}
              color={wedgeColors[i]}
              map={sparkleTexture}
              roughness={0.25}
              metalness={0.4}
              clearcoat={1}
              clearcoatRoughness={0.15}
              emissive="#ffffff"
              emissiveIntensity={0}
            />
          </mesh>
        ))}
        {/* スライスの境界に立つ、細めのゴールドの仕切り板(太いリムとの対比であえて細く)。 */}
        {dividerAngles.map((angle, i) => (
          <mesh
            key={`divider-${i}`}
            position={[Math.cos(angle) * RADIUS * 0.5, Math.sin(angle) * RADIUS * 0.5, 0.05]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[RADIUS, 0.04, 0.09]} />
            <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.25} metalness={0.85} />
          </mesh>
        ))}
        {/* ホイール縁のペグ(でっぱり)。回すたびにポインターがカチカチ弾かれていく突起。 */}
        <PegBumps angles={dividerAngles} radius={RADIUS + 0.04} texture={goldSparkleTexture} materialRefs={pegMaterialRefs} />
        {/* 各スライスの中央あたりにラベル(sprite)を配置。
            仕切り板・スポークなど実際に厚みのあるパーツより奥行き上は手前(0.08)に
            置いているが、斜めカメラだと奥行きだけでは前後関係が逆転して隠れることがあるため、
            depthTestを切ってどの角度からでも必ずラベルが最前面に見えるようにする。 */}
        {items.map((_, i) => {
          const mid = i * sliceAngle + sliceAngle / 2;
          const r = RADIUS * 0.62;
          return (
            <sprite
              key={`label-${i}`}
              ref={(el) => {
                labelSpriteRefs.current[i] = el;
              }}
              position={[Math.cos(mid) * r, Math.sin(mid) * r, 0.08]}
              scale={[labelScale[0], labelScale[1], 1]}
              renderOrder={10}
            >
              <spriteMaterial map={labelTextures[i]} depthWrite={false} depthTest={false} />
            </sprite>
          );
        })}
        {/* 外周の太いゴールドのベゼル(細い仕切り・スポークとの対比で存在感を持たせる)と、
            放射状のスポーク付きハブ。 */}
        <mesh position={[0, 0, 0.03]}>
          <ringGeometry args={[RADIUS - 0.2, RADIUS, 64]} />
          <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.25} metalness={0.85} />
        </mesh>
        {dividerAngles.map((angle, i) => (
          <mesh key={`spoke-${i}`} position={[0, 0, 0.06]} rotation={[0, 0, angle + sliceAngle / 2]}>
            <boxGeometry args={[0.34, 0.045, 0.02]} />
            <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.25} metalness={0.85} />
          </mesh>
        ))}
        {/* 中心のタレット(軸受け)。段差のある断面をLatheGeometryで回転させた、
            旋盤挽きの真鍮パーツらしい輪郭。てっぺんにダイヤモンドのトッパーを乗せる。 */}
        <mesh geometry={turretGeometry} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <meshStandardMaterial
            color={TRIM_COLOR}
            map={goldBrushedTexture}
            roughness={0.35}
            metalness={0.6}
            emissive={TRIM_COLOR}
            emissiveIntensity={0.25}
          />
        </mesh>
        <mesh ref={gemRef} position={[0, 0, TURRET_TOP_Z + 0.13]}>
          <icosahedronGeometry args={[0.15]} />
          <meshPhysicalMaterial
            ref={gemMaterialRef}
            color="#f8fafc"
            roughness={0.05}
            metalness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.05}
            emissive="#93c5fd"
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>

      {/* スライスの縁からフェルトの内側まで届く、木製の裾(スカート)。ボウル・ボールトラックが
          宙に浮いて見えないよう、ここでスライスの外周に実際に接する土台を作っておく。 */}
      <mesh
        geometry={skirtGeometry}
        position={[0, 0, (SKIRT_TOP_Z + SKIRT_BOTTOM_Z) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color="#ffffff" map={woodTexture} roughness={0.6} metalness={0} side={THREE.DoubleSide} />
      </mesh>

      {/* ボール・トラック。ホイール外周とボウル壁の間にある、すり鉢状に傾斜した帯。
          本物のルーレットでボールが転がる部分を模し、外周にダイヤ型の弾き石を並べる。 */}
      <mesh
        geometry={ballTrackGeometry}
        position={[0, 0, (TRACK_BASE_Z + TRACK_TOP_Z) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#d8dee6"
          map={silverBrushedTexture}
          roughness={0.35}
          metalness={0.6}
          emissive="#8a94a3"
          emissiveIntensity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {Array.from({ length: DEFLECTOR_COUNT }, (_, i) => {
        const angle = (i / DEFLECTOR_COUNT) * Math.PI * 2;
        return (
          <mesh
            key={`deflector-${i}`}
            position={[Math.cos(angle) * DEFLECTOR_RADIUS, Math.sin(angle) * DEFLECTOR_RADIUS, DEFLECTOR_Z]}
            rotation={[0, 0, angle]}
            scale={[1, 1.8, 1]}
          >
            <octahedronGeometry args={[0.055]} />
            <meshPhysicalMaterial
              color="#e5e7eb"
              roughness={0.3}
              metalness={0.5}
              clearcoat={1}
              clearcoatRoughness={0.1}
              emissive="#8a94a3"
              emissiveIntensity={0.25}
            />
          </mesh>
        );
      })}

      {/* ターンド加工(旋盤挽き)の木製ボウル外壁。単純なトーラスではなく、樽状に膨らんで
          リム付近ですぼまる断面をLatheGeometryで回転させ、上下を真鍮の帯金で留める。 */}
      <mesh geometry={bowlWallGeometry} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#ffffff" map={woodTexture} roughness={0.55} metalness={0} />
      </mesh>
      <mesh position={[0, 0, bowlBandBottomZ]}>
        <torusGeometry args={[bowlBandBottomRadius, 0.025, 12, 64]} />
        <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0, bowlBandTopZ]}>
        <torusGeometry args={[bowlBandTopRadius, 0.03, 12, 64]} />
        <meshStandardMaterial color={TRIM_COLOR} map={goldBrushedTexture} roughness={0.2} metalness={0.9} />
      </mesh>

      {/* 透明なドームカバー。おもちゃのスピナーによくある、ホイール全体を覆う
          浅いプラスチックカバーを模した薄い演出(低いopacityで下がしっかり見える)。
          球の半径を大きめに取り、そのごく一部(極付近)だけを使うことで、
          「半径=高さ」の背の高い半球ではなく、平たい浅いドーム形状にしている。
          中心の宝石トッパーが収まるよう、通常のトイスピナーより少し背を高くしてある。 */}
      <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[7.5, 32, 16, 0, Math.PI * 2, 0, 0.35]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.1}
          roughness={0.05}
          metalness={0}
          depthWrite={false}
        />
      </mesh>

      {/* ポインター(赤い三角形の矢印)。ボウル壁の外側、フェルトの上に固定された旗のように
          立てる。常に固定角度に位置し、ホイールとは一緒に回転しない。着地の瞬間にバウンドする。 */}
      <group ref={pointerRef} rotation={[0, 0, POINTER_ANGLE]}>
        <mesh position={[POINTER_RADIUS, 0, POINTER_Z]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.16, 0.36, 3]} />
          <meshPhysicalMaterial color="#dc2626" roughness={0.2} metalness={0.1} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
      </group>
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
  const confettiRef = useRef<ConfettiHandle>(null);
  const winFlashRef = useRef<WinFlashHandle>(null);

  // 着地して当選項目が確定した瞬間に紙ふぶき+スターバースト+チャイムを鳴らしてから、親に結果を伝える。
  const handleResult = (winner: string) => {
    confettiRef.current?.burst();
    winFlashRef.current?.flash();
    playWinChime();
    onResult(winner);
  };

  // 親(RouletteTool)は結果確定のたびに再レンダーされ、そのたびにitemsも新しい配列参照になる。
  // ここをインラインのオブジェクトリテラルのままにすると、Canvasの`camera`propが毎回新規オブジェクトと
  // 見なされてR3Fがカメラのposition/fovを都度再適用し、Wheel側でuseFrame中に動かしているカメラ位置
  // (当選時のズームイン演出)がその都度[0, 2.4, 6.5]へ引き戻されてしまう。参照を固定して防ぐ。
  const initialCamera = useMemo(() => ({ position: [0, 2.4, 6.5] as [number, number, number], fov: 42 }), []);

  return (
    <Canvas shadows camera={initialCamera} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={1.3} color="#fff4dc" castShadow shadow-mapSize={[1024, 1024]} />
      {/* カジノのステージ照明のような、ゴールド×ピンク×紫の光でゴージャスな雰囲気を出す。
          drei<Environment>によるHDR映り込みも試したが、PMREM生成の負荷でWebGL
          コンテキストロスト(このコードベースで過去にも起きたのと同種の不具合)が
          再現したため、光源を増やす軽量な方法に留めている。 */}
      <pointLight position={[-3, 3, 3]} intensity={0.6} color="#f59e0b" />
      <pointLight position={[3, 2, -2]} intensity={0.45} color="#c026d3" />
      <pointLight position={[0, 4, -4]} intensity={0.5} color="#fff4dc" />
      {/* 中心のタレット(旋盤挽きの真鍮)を近くから照らし、段差の陰影をはっきり見せるための補助光。 */}
      <pointLight position={[0.5, 3.5, 1.5]} intensity={0.7} color="#fff0cc" distance={5} />
      <Wheel items={items} spinToken={spinToken} onResult={handleResult} />
      <Confetti ref={confettiRef} />
      <WinFlash ref={winFlashRef} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.85} intensity={0.85} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.4} />
      </EffectComposer>
    </Canvas>
  );
}
