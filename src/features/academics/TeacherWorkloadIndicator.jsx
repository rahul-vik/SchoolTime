import { teacherWorkloadColor } from "../../../shared/teacherWorkload.js";

/** Minimal workload strip for teacher cards (from latest generated timetable). */
export function TeacherWorkloadIndicator({ workload, T, ProgressBar }) {
  if (!workload) return null;
  const { assigned, max, pct } = workload;
  const color = teacherWorkloadColor(pct, T);

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${T.surfaceBorder}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 11, color: T.textSoft }}>Workload</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap" }}>
          {assigned}/{max}
          <span style={{ color: T.textSoft, fontWeight: 500 }}> · {pct}%</span>
        </span>
      </div>
      <ProgressBar value={assigned} max={max} color={color} height={4} />
    </div>
  );
}
