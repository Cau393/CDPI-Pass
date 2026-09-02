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
 * The wrapper controls the display ratio; no duplicate or blur is rendered.
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
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        {...(priority ? ({ fetchpriority: "high" } as { fetchpriority: "high" }) : {})}
      />
    </div>
  );
}
