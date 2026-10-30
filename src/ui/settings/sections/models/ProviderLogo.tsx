import type { CSSProperties } from "react";
import { Icon } from "@/ui/components";
import { providerBrands } from "@/ai/model-providers";
import marks from "./provider-icons.json";

/** Local SVG artwork from models.dev and Lobe Icons (MIT); no third-party image requests. */
export function ProviderLogo({
  brand,
  size = "md",
}: {
  brand?: string;
  size?: "sm" | "md" | "lg";
}) {
  const info = providerBrands.find((p) => p.id === brand);
  const svg = marks[brand as keyof typeof marks];
  return (
    <span
      className="pp-provider-logo"
      data-size={size}
      style={
        {
          "--provider-ink": info?.color ?? "var(--pp-accent)",
          "--provider-mark": svg
            ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
            : undefined,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {svg ? (
        <span className="pp-provider-logo__mark" />
      ) : (
        <Icon name="sliders" size={23} />
      )}
    </span>
  );
}
