import { useEffect, useState } from "react";
import { UiIcon } from "../shared/uiPrimitives";
import { getGenerationPhase, solverLabel, tipForGeneration } from "./generationProgress";

const SPIN_KEYFRAMES = `
@keyframes stGenSpin {
  to { transform: rotate(360deg); }
}
@keyframes stGenPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes stGenShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

function badgeStyle(color) {
  return {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    background: `${color}18`,
    color,
    fontWeight: 700,
  };
}

export function TimetableGeneratingPanel({ progress, timetableSolver, T, ProgressBar }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const solver = timetableSolver || "hybrid";
  const phase = getGenerationPhase(progress, solver);
  const tip = tipForGeneration(solver, tipIndex);
  const advanced = solver === "hybrid" || solver === "cp_sat";

  useEffect(() => {
    const tipIv = setInterval(() => setTipIndex((i) => i + 1), 4000);
    const clockIv = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      clearInterval(tipIv);
      clearInterval(clockIv);
    };
  }, []);

  const slowHint = elapsedSec >= 8 && advanced;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        padding: "18px 16px",
        borderRadius: 12,
        background: `linear-gradient(135deg, ${T.brand}14 0%, ${T.surfaceAlt} 55%, ${T.surfaceAlt} 100%)`,
        border: `1px solid ${T.brand}35`,
      }}
    >
      <style>{SPIN_KEYFRAMES}</style>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            flexShrink: 0,
            border: `3px solid ${T.surfaceBorder}`,
            borderTopColor: T.brand,
            animation: "stGenSpin 0.85s linear infinite",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4, lineHeight: 1.3 }}>{phase.title}</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.45, marginBottom: 8 }}>{phase.detail}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ ...badgeStyle(T.brand), fontSize: 10 }}>{solverLabel(solver)}</span>
            {elapsedSec > 0 && <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>{elapsedSec}s</span>}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.brand, flexShrink: 0, lineHeight: 1 }}>{progress}%</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <ProgressBar value={progress} max={100} color={T.brand} height={10} />
        <div
          aria-hidden
          style={{
            marginTop: 4,
            height: 3,
            borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${T.brand}55, transparent)`,
            backgroundSize: "200% 100%",
            animation: "stGenShimmer 1.6s ease-in-out infinite",
          }}
        />
      </div>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          animation: "stGenPulse 2.2s ease-in-out infinite",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <UiIcon name="preferences" size={14} stroke={T.brand} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{tip}</div>
        </div>
      </div>
      {slowHint && (
        <div style={{ marginTop: 10, fontSize: 11, color: T.textSoft, lineHeight: 1.45, display: "flex", gap: 6, alignItems: "center" }}>
          <UiIcon name="period" size={13} stroke={T.textSoft} />
          Still working — large schools or Hybrid mode can take up to a minute. Please keep this tab open.
        </div>
      )}
    </div>
  );
}