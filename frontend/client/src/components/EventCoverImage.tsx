import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EventCoverImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Hero/LCP: eager load with high fetch priority. Default is lazy. */
  priority?: boolean;
  fallback?: ReactNode;
  "data-testid"?: string;
}

/**
 * Event poster that keeps the source aspect ratio (`object-contain`).
 * Letterbox gaps are filled with a blurred, darkened copy of the same image
 * so the card never shows empty bars or stretched artwork.
 */
export default function EventCoverImage({
  src,
  alt,
  className,
  priority = false,
  fallback,
  "data-testid": testId,
}: EventCoverImageProps) {
  if (!src) {
    return (
      <div
        className={cn("relative overflow-hidden bg-gray-900", className)}
        data-testid={testId}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-gray-900", className)}
      data-testid={testId}
    >
      <img
        aria-hidden="true"
        alt=""
        src={src}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
      />
      <div className="absolute inset-0 bg-black/30" />
      <img
        src={src}
        alt={alt}
        className="relative z-10 h-full w-full object-contain"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        {...(priority ? ({ fetchpriority: "high" } as { fetchpriority: "high" }) : {})}
      />
    </div>
  );
}
