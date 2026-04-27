import { useCallback, useEffect, useState } from "react";
import { createCreditPurchaseRequest, getMyCreditPurchaseRequests, getPurchasePackInfo } from "../../api";

/**
 * Owner/admin: choose number of packs → submit request → platform portal approves before credits are added.
 */
export function PurchaseCreditsPage({ navigate, notify, onCreditsUpdated, onBack, onSubmitted, ui }) {
  const { T, css, Btn, Input } = ui;
  const [packSize, setPackSize] = useState(10);
  const [priceCents, setPriceCents] = useState(0);
  const [packCountStr, setPackCountStr] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [recent, setRecent] = useState([]);

  const packCount = Math.max(0, Math.floor(parseInt(packCountStr, 10) || 0));
  const totalCredits = (Number.isFinite(packCount) && packCount > 0 ? packCount : 0) * packSize;
  const totalPrice = (Number.isFinite(packCount) && packCount > 0 ? packCount : 0) * priceCents;

  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const [info, list] = await Promise.all([getPurchasePackInfo(), getMyCreditPurchaseRequests()]);
      setPackSize(Number(info.packSize) || 10);
      setPriceCents(Number(info.priceCents) || 0);
      setRecent(list.requests || []);
    } catch (e) {
      const message = e?.message || "Could not load purchase options";
      const isAuthError =
        message === "Missing auth token" ||
        message === "Invalid auth token" ||
        message.includes("Sign in again");
      if (isAuthError) {
        notify("Your session expired. Please sign in again.", "warning");
        if (onBack) onBack();
        else navigate("dashboard");
        return;
      }
      setLoadErr(message);
    }
  }, [navigate, notify, onBack]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Math.floor(parseInt(packCountStr, 10));
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      notify("Enter a whole number of packs between 1 and 500.", "warning");
      return;
    }
    setBusy(true);
    try {
      const out = await createCreditPurchaseRequest({ packCount: n, note: note.trim() || undefined });
      notify(out.message || "Request submitted", "success");
      setNote("");
      setPackCountStr("1");
      await load();
      if (onSubmitted) onSubmitted();
      else navigate("dashboard");
    } catch (err) {
      notify(err.message || "Request failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ ...css.card, padding: 22 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, color: T.brand }}>Purchase timetable credits</h1>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: T.textMid, lineHeight: 1.55 }}>
          Credits are added to your school only after a <strong>platform operator approves</strong> your request. You are not charged in-app; list price is for your records.
        </p>
        {loadErr && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{loadErr}</p>}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14, padding: "12px 14px", background: T.surfaceAlt, borderRadius: 10, border: `1px solid ${T.surfaceBorder}` }}>
            <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>Pack size (per pack)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.brand, marginTop: 4 }}>{packSize} credits</div>
            {priceCents > 0 && (
              <div style={{ fontSize: 12, color: T.textMid, marginTop: 6 }}>
                List price: {(priceCents / 100).toFixed(2)} per pack (informational)
              </div>
            )}
          </div>
          <Input
            label="Number of packs to request"
            value={packCountStr}
            onChange={setPackCountStr}
            placeholder="e.g. 3"
            help={`Total credits requested: ${totalCredits} (${packSize} × packs).`}
          />
          <Input label="Note to operator (optional)" value={note} onChange={setNote} placeholder="Invoice reference, PO number, etc." />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <Btn type="button" variant="ghost" onClick={() => (onBack ? onBack() : navigate("dashboard"))} disabled={busy}>Back</Btn>
            <Btn type="submit" disabled={busy}>{busy ? "Sending…" : "Send purchase request"}</Btn>
          </div>
        </form>
      </div>
      {recent.length > 0 && (
        <div style={{ ...css.card, marginTop: 16, padding: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: T.text }}>Your recent requests</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.textMid, lineHeight: 1.6 }}>
            {recent.slice(0, 8).map((r) => (
              <li key={r.id}>
                {r.created_at}: {r.credits_total} credits ({r.status})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
