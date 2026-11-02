import type { ReactNode } from "react";
import { getExternalWebUrl } from "@/lib/external-url";

/**
 * The initiative's design link, only for http(s). Anything else stored (the
 * API accepts any URL: `javascript:`, `data:`, `file:`) shows as plain text,
 * never as an `href`.
 */
export function DesignLink({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  const href = getExternalWebUrl(url);
  if (!href) {
    return (
      <span className="break-all text-muted-foreground text-xs">{url}</span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
