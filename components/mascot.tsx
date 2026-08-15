import Image from "next/image";

/**
 * 차차 마스코트.
 *
 * 표시 크기 상한은 160px이다. 원본 시트가 1024px라 한 포즈가 약 300px이고,
 * 그 이상 키우면 레티나에서 흐려진다 (public/mascot/README.md 참조).
 */
export type MascotPose =
  | "greet"
  | "excited"
  | "wink"
  | "worried"
  | "puzzled"
  | "sleeping"
  | "surprised";

const LABEL: Record<MascotPose, string> = {
  greet: "차차가 인사하고 있어요",
  excited: "차차가 링크를 확인하러 가고 있어요",
  wink: "차차가 윙크하고 있어요",
  worried: "차차가 걱정하고 있어요",
  puzzled: "차차가 갸웃하고 있어요",
  sleeping: "차차가 자고 있어요",
  surprised: "차차가 놀라고 있어요",
};

export function Mascot({
  pose,
  size = 140,
  className = "",
}: {
  pose: MascotPose;
  /** 160 이하로 유지할 것 */
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={`/mascot/poses/chacha-${pose}.webp`}
      alt={LABEL[pose]}
      width={size}
      height={size}
      priority={pose === "greet"}
      className={`h-auto w-auto object-contain ${className}`}
      style={{ maxHeight: size }}
    />
  );
}
