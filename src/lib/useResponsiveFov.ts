import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

// 横方向の見える範囲(画角)が画面の縦横比によらずできるだけ一定になるよう、
// three.jsのcamera.fov(垂直画角)をcanvasの実際のアスペクト比に合わせて補正する。
// スマホ縦画面のような縦長(aspect<1)のcanvasでは、基準画角のままだと横方向が
// 大きくズームインしたように見えてしまう(垂直画角は一定でも、水平方向の見える
// 範囲はaspectに比例して狭まるため)ので、その分だけ垂直画角を広げて相殺する。
//
// baseFov/referenceAspectは、そのシーンのカメラ位置・演出を実際にチューニングした
// 際の(desktopの横長な)canvasのfovとアスペクト比。返り値はrefなので、useFrame内で
// 「基準fov」として毎フレーム参照できる(FOVパンチなど他の動的fov演出と併用可能)。
export function useResponsiveFov(baseFov: number, referenceAspect: number, maxFov = 78) {
  const fovRef = useRef(baseFov);
  const { size } = useThree();

  useEffect(() => {
    const aspect = size.width / size.height;
    const targetHalfTan = Math.tan((baseFov * Math.PI) / 360) * referenceAspect;
    const verticalFov = (Math.atan(targetHalfTan / aspect) * 360) / Math.PI;
    fovRef.current = Math.min(maxFov, Math.max(baseFov, verticalFov));
  }, [size.width, size.height, baseFov, referenceAspect, maxFov]);

  return fovRef;
}

// fovを広げるだけだと縦方向の余白が増え、被写体が「遠くに小さく」見えてしまうため、
// アスペクト比が狭い(スマホ縦画面など)ほどカメラを原点に少し寄せるための倍率(0.7〜1)。
// カメラの位置を毎フレーム自前で計算しているシーン(ルーレットの当選ズーム演出など)は、
// この倍率を自分のカメラ位置計算に掛け合わせて使う。
export function useResponsiveDistanceScale(referenceAspect: number) {
  const scaleRef = useRef(1);
  const { size } = useThree();

  useEffect(() => {
    const aspect = size.width / size.height;
    scaleRef.current = Math.min(1, Math.max(0.7, 0.7 + 0.3 * Math.min(1, aspect / referenceAspect)));
  }, [size.width, size.height, referenceAspect]);

  return scaleRef;
}
