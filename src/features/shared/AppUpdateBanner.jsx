import { Btn } from "./uiPrimitives";
import { hardRefreshSchoolTimeApp } from "./appUpdateUtils";

/** Production-only strip; parent gates visibility. */
export function AppUpdateBanner({ productName = "SchoolTime" }) {
  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "linear-gradient(90deg, #0E3E5F 0%, #135a87 100%)",
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        fontSize: 13,
        fontWeight: 600,
        zIndex: 200,
      }}
    >
      <span style={{ lineHeight: 1.35 }}>
        A new version of {productName} is ready. Refresh to load the latest fixes and features.
      </span>
      <Btn
        type="button"
        onClick={() => hardRefreshSchoolTimeApp()}
        style={{ flexShrink: 0, background: "#fff", color: "#0E3E5F", border: "none", fontWeight: 700 }}
      >
        Refresh now
      </Btn>
    </div>
  );
}
