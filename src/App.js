import { useState, useEffect, useRef } from "react";

const CORS_PROXY = "https://corsproxy.io/?";

function encode(str) { return encodeURIComponent(str); }

async function fetchAllDeals(apiKey, subdomain) {
  let all = [], start = 0, more = true;
  while (more) {
    const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=100&start=${start}&status=all_not_deleted`;
    const r = await fetch(CORS_PROXY + encode(url));
    const d = await r.json();
    if (!d.success) throw new Error(d.error || "Pipedrive API error");
    const items = d.data || [];
    all = all.concat(items);
    more = d.additional_data?.pagination?.more_items_in_collection || false;
    start += 100;
  }
  return all;
}

async function writeToSheets(accessToken, spreadsheetId, deals) {
  const headers = ["ID", "Tytuł", "Wartość", "Waluta", "Status", "Etap", "Właściciel", "Organizacja", "Kontakt", "Data dodania", "Data zamknięcia", "Oczekiwana data zamknięcia"];
  const rows = deals.map(d => [
    d.id,
    d.title || "",
    d.value || 0,
    d.currency || "",
    d.status || "",
    d.stage_name || "",
    d.owner_name || "",
    d.org_name || "",
    d.person_name || "",
    d.add_time ? d.add_time.split(" ")[0] : "",
    d.close_time ? d.close_time.split(" ")[0] : "",
    d.expected_close_date || "",
  ]);
  const values = [headers, ...rows];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z10000:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.updatedRows - 1;
}

export default function App() {
  const [pipedriveKey, setPipedriveKey] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [autoInterval, setAutoInterval] = useState(0);
  const [deals, setDeals] = useState([]);
  const [preview, setPreview] = useState(false);
  const intervalRef = useRef(null);
  const [step, setStep] = useState("config");

  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem("pd_sync_config") || "{}");
      if (c.pipedriveKey) setPipedriveKey(c.pipedriveKey);
      if (c.subdomain) setSubdomain(c.subdomain);
      if (c.spreadsheetId) setSpreadsheetId(c.spreadsheetId);
      if (c.googleToken) setGoogleToken(c.googleToken);
      if (c.step) setStep(c.step);
    } catch {}
  }, []);

  useEffect(() => {
    if (autoInterval > 0) {
      intervalRef.current = setInterval(() => { doSync(true); }, autoInterval * 60 * 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      clearInterval(intervalRef.current);
    }
  }, [autoInterval, pipedriveKey, subdomain, spreadsheetId, googleToken]);

  function saveConfig() {
    localStorage.setItem("pd_sync_config", JSON.stringify({ pipedriveKey, subdomain, spreadsheetId, googleToken, step: "sync" }));
    setStep("sync");
    setStatus({ type: "success", msg: "Konfiguracja zapisana!" });
  }

  async function doSync(auto = false) {
    if (!pipedriveKey || !subdomain || !spreadsheetId || !googleToken) {
      setStatus({ type: "error", msg: "Uzupełnij wszystkie pola konfiguracyjne." });
      return;
    }
    setLoading(true);
    setStatus({ type: "info", msg: auto ? "⏱ Auto-sync w toku..." : "🔄 Synchronizacja w toku..." });
    try {
      const fetchedDeals = await fetchAllDeals(pipedriveKey, subdomain);
      setDeals(fetchedDeals);
      await writeToSheets(googleToken, spreadsheetId, fetchedDeals);
      const now = new Date().toLocaleTimeString("pl-PL");
      setLastSync(now);
      setStatus({ type: "success", msg: `✅ Zsynchronizowano ${fetchedDeals.length} transakcji o ${now}` });
    } catch (e) {
      setStatus({ type: "error", msg: `❌ Błąd: ${e.message}` });
    }
    setLoading(false);
  }

  const statusColors = { success: "#d1fae5", error: "#fee2e2", info: "#dbeafe" };
  const statusText = { success: "#065f46", error: "#991b1b", info: "#1e40af" };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", background: "#f8fafc", padding: "24px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔗</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>Pipedrive → Google Sheets</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Synchronizacja transakcji</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: "#e2e8f0", borderRadius: 10, padding: 4, marginBottom: 20 }}>
          {["config", "sync"].map(t => (
            <button key={t} onClick={() => setStep(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, background: step === t ? "#fff" : "transparent", color: step === t ? "#1e293b" : "#64748b", boxShadow: step === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all .2s" }}>
              {t === "config" ? "⚙️ Konfiguracja" : "🔄 Synchronizacja"}
            </button>
          ))}
        </div>

        {step === "config" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 16, color: "#1e293b" }}>Dane dostępowe</h2>

            <label style={labelStyle}>Pipedrive API Key</label>
            <input style={inputStyle} type="password" placeholder="np. a1b2c3d4e5f6..." value={pipedriveKey} onChange={e => setPipedriveKey(e.target.value)} />
            <p style={hintStyle}>Ustawienia → Dane osobiste → API → Twój klucz API</p>

            <label style={labelStyle}>Subdomena Pipedrive</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="np. mojafirma" value={subdomain} onChange={e => setSubdomain(e.target.value)} />
              <span style={{ color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>.pipedrive.com</span>
            </div>
            <p style={hintStyle}>Znajdziesz ją w pasku adresu po zalogowaniu</p>

            <label style={labelStyle}>Google Spreadsheet ID</label>
            <input style={inputStyle} placeholder="np. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" value={spreadsheetId} onChange={e => setSpreadsheetId(e.target.value)} />
            <p style={hintStyle}>Fragment URL arkusza: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit</p>

            <label style={labelStyle}>Google OAuth Access Token</label>
            <input style={inputStyle} type="password" placeholder="ya29...." value={googleToken} onChange={e => setGoogleToken(e.target.value)} />
            <p style={hintStyle}>
              Pobierz token na <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>OAuth 2.0 Playground</a> — wybierz scope: <code>https://www.googleapis.com/auth/spreadsheets</code>
            </p>

            <button onClick={saveConfig} style={btnPrimary}>
              Zapisz konfigurację →
            </button>
          </div>
        )}

        {step === "sync" && (
          <>
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#1e293b" }}>Synchronizacja ręczna</h2>
              <button onClick={() => doSync(false)} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
                {loading ? "⏳ Synchronizuję..." : "🔄 Synchronizuj teraz"}
              </button>
              {lastSync && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b" }}>Ostatnia synchronizacja: <strong>{lastSync}</strong></p>}
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#1e293b" }}>⏱ Auto-sync</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[0, 5, 15, 30, 60].map(m => (
                  <button key={m} onClick={() => setAutoInterval(m)} style={{ padding: "8px 16px", borderRadius: 8, border: "2px solid", borderColor: autoInterval === m ? "#3b82f6" : "#e2e8f0", background: autoInterval === m ? "#eff6ff" : "#fff", color: autoInterval === m ? "#1d4ed8" : "#475569", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                    {m === 0 ? "Wyłączony" : `Co ${m} min`}
                  </button>
                ))}
              </div>
              {autoInterval > 0 && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#16a34a" }}>✅ Auto-sync aktywny co {autoInterval} minut</p>}
            </div>

            {deals.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>📋 Podgląd danych ({deals.length})</h2>
                  <button onClick={() => setPreview(p => !p)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#475569" }}>
                    {preview ? "Ukryj" : "Pokaż"}
                  </button>
                </div>
                {preview && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          {["ID", "Tytuł", "Wartość", "Status", "Etap", "Właściciel"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deals.slice(0, 10).map((d, i) => (
                          <tr key={d.id} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                            <td style={tdStyle}>{d.id}</td>
                            <td style={tdStyle}>{d.title}</td>
                            <td style={tdStyle}>{d.value ? `${d.value} ${d.currency}` : "-"}</td>
                            <td style={tdStyle}><span style={{ background: d.status === "won" ? "#d1fae5" : d.status === "lost" ? "#fee2e2" : "#fef3c7", color: d.status === "won" ? "#065f46" : d.status === "lost" ? "#991b1b" : "#92400e", borderRadius: 5, padding: "2px 7px", fontSize: 12 }}>{d.status}</span></td>
                            <td style={tdStyle}>{d.stage_name || "-"}</td>
                            <td style={tdStyle}>{d.owner_name || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {deals.length > 10 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>... i {deals.length - 10} więcej</p>}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setStep("config")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: 0 }}>← Edytuj konfigurację</button>
          </>
        )}

        {status && (
          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: statusColors[status.type], color: statusText[status.type], fontSize: 14, fontWeight: 500 }}>
            {status.msg}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, marginTop: 16 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 4, fontFamily: "Inter, sans-serif" };
const hintStyle = { margin: "0 0 0", fontSize: 12, color: "#94a3b8" };
const btnPrimary = { width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#1e293b", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 20 };
const tdStyle = { padding: "7px 10px", borderBottom: "1px solid #f1f5f9", color: "#374151" };
