import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  hasMeaningfulEventDescription,
  prepareDescriptionHtmlForDisplay,
} from "@/lib/eventDescriptionHtml";

/** Renders stored event description HTML safely (bold / italic / underline). */
export default function EventDescriptionDisplay({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const safe = useMemo(() => prepareDescriptionHtmlForDisplay(html), [html]);
  const hasContent = hasMeaningfulEventDescription(safe);
  if (!hasContent) return null;

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-gray-700",
        "[&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        // TipTap "blank line" is often <p></p>; empty <p> has no height unless forced (matches editor
        // gaps). 1.3em == the paragraph line-height below; `lh` is unsupported before iOS 16.4.
        "[&_p:empty]:min-h-[1.3em] [&_p:empty]:block",
        "[&_p]:leading-[1.3]",
        // Line breaks inside a paragraph are inline; give them block spacing like normal line gaps.
        "[&_br]:block [&_br]:mb-[0.65em]",
        "[&_strong]:font-semibold [&_b]:font-semibold",
        "[&_em]:italic [&_i]:italic",
        "[&_u]:underline",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
