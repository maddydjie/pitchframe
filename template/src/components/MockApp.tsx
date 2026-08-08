import React from "react";
import { ACCENT, SURFACE, SURFACE_ALT, TEXT, alpha } from "../theme";

/**
 * The fallback surface when a screenshot is missing.
 *
 * Capture is the flakiest part of the pipeline — a dev server that won't boot,
 * a route behind auth, a broken build. When that happens the video still has
 * to render, so the beat degrades to an abstracted product surface instead of
 * a hole in the timeline.
 *
 * Deliberately generic and never labelled with the product's name: an honest
 * abstraction reads as design, a fake screenshot reads as a lie.
 */

const Row: React.FC<{ w: number; dim?: number }> = ({ w, dim = 0.1 }) => (
  <div style={{ width: `${w}%`, height: 12, borderRadius: 6, background: alpha(TEXT, dim) }} />
);

export const MockApp: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      background: `linear-gradient(160deg, ${SURFACE_ALT} 0%, ${SURFACE} 100%)`,
      color: TEXT,
    }}
  >
    <div
      style={{
        width: 220,
        padding: "28px 22px",
        borderRight: `1px solid ${alpha(TEXT, 0.07)}`,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: ACCENT, opacity: 0.9 }} />
        <Row w={55} dim={0.16} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
        {[70, 52, 61, 45, 58].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: alpha(i === 1 ? ACCENT : TEXT, i === 1 ? 0.85 : 0.12),
              }}
            />
            <Row w={w} dim={i === 1 ? 0.22 : 0.08} />
          </div>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: "30px 34px", display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Row w={22} dim={0.24} />
        <div style={{ width: 108, height: 32, borderRadius: 9, background: alpha(ACCENT, 0.9) }} />
      </div>

      <div style={{ display: "flex", gap: 18 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 118,
              borderRadius: 14,
              border: `1px solid ${alpha(TEXT, 0.07)}`,
              background: alpha(TEXT, 0.025),
              padding: 20,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Row w={40} dim={0.1} />
            <div
              style={{
                width: "52%",
                height: 26,
                borderRadius: 7,
                background: alpha(i === 0 ? ACCENT : TEXT, i === 0 ? 0.75 : 0.2),
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          borderRadius: 14,
          border: `1px solid ${alpha(TEXT, 0.07)}`,
          background: alpha(TEXT, 0.02),
          padding: 24,
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        {[34, 48, 41, 62, 55, 74, 68, 88, 79, 96, 84, 100].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: "6px 6px 2px 2px",
              background:
                i > 8
                  ? `linear-gradient(180deg, ${ACCENT} 0%, ${alpha(ACCENT, 0.25)} 100%)`
                  : alpha(TEXT, 0.09),
            }}
          />
        ))}
      </div>
    </div>
  </div>
);
