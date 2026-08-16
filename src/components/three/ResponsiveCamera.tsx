import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useResponsiveFov, useResponsiveDistanceScale } from "@/lib/useResponsiveFov";

// カメラのfov・距離をスマホ縦画面などの縦長canvasに合わせて補正する、Canvas直下に
// 置くだけの小さなコンポーネント(見た目には何も描画しない)。カメラの位置・向きを
// 他のロジックが毎フレーム制御していないシーン(ダイス・コイントス)向け。
// ルーレットのように別途カメラ位置を自前で計算しているシーンでは、position指定が
// 競合してしまうため、代わりにuseResponsiveFov/useResponsiveDistanceScaleを直接使うこと。
export default function ResponsiveCamera({
  baseFov,
  referenceAspect,
  basePosition,
  maxFov,
  pushBackStrength = 2,
}: {
  baseFov: number;
  referenceAspect: number;
  basePosition: [number, number, number];
  maxFov?: number;
  // useResponsiveDistanceScaleは本来「寄せる」ための倍率(0.7〜1)だが、この
  // コンポーネントでは高さ(y)は基準のまま変えず、x/zだけを原点に対して遠近させる
  // 平行移動に使う(倍率を反転: 正だと縦長画面ほど原点から遠ざかる、負だと近づく)。
  pushBackStrength?: number;
}) {
  const fovRef = useResponsiveFov(baseFov, referenceAspect, maxFov);
  const distanceScaleRef = useResponsiveDistanceScale(referenceAspect);

  useFrame(({ camera }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (camera.fov !== fovRef.current) {
      camera.fov = fovRef.current;
      camera.updateProjectionMatrix();
    }

    const pushBack = 1 + (1 - distanceScaleRef.current) * pushBackStrength;
    camera.position.set(basePosition[0] * pushBack, basePosition[1], basePosition[2] * pushBack);
  });

  return null;
}
