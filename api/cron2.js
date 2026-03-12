import crypto from "crypto";

function buildJwt(email, key) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = b64(header) + "." + b64(payload);
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  return unsigned + "." + sign.sign(key, "base64url");
}

async function getAccessToken(email, privateKey) {
  const jwt = buildJwt(email, privateKey);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error_description || d.error);
  return d.access_token;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchAll(apiKey, subdomain, entity) {
  let all = [], start = 0, more = true;
  while (more) {
    const url = `https://${subdomain}.pipedrive.com/api/v1/${entity}?api_token=${apiKey}&limit=500&start=${start}${entity === "deals" ? "&status=all_not_deleted" : ""}`;
    const r = await fetch(url);
    if (r.status === 429) { await delay(2000); continue; }
    const d = await r.json();
    if (!d.success) break;
    all = all.concat(d.data || []);
    more = d.additional_data?.pagination?.more_items_in_collection || false;
    start += 500;
    if (more) await delay(500);
  }
  return all;
}

function getEmail(person, label) {
  if (!person?.email) return "";
  const f = person.email.find(x => x.label?.toLowerCase() === label.toLowerCase());
  return f ? f.value : "";
}

function getPhone(person, label) {
  if (!person?.phone) return "";
  const f = person.phone.find(x => x.label?.toLowerCase() === label.toLowerCase());
  return f ? f.value : "";
}

// Deal custom field keys for anglovillespzoo
const D = {
  source: "29b3442c950f854d7daba562fd22bb94d132d5ad",
  utmSource: "e25825cf1ede421aad3f2202305a1d61c89ab79c",
  utmMedium: "100ccb847c59d1a8fa34b63f196c1bd17b9f08b3",
  utmCampaign: "4f469c9528699fbab764ff3c912239b91a4db517",
  utmContent: "a2ac65af42ba68b90a26d43d9fdc669467402687",
  url: "e59aba576d9dfdeb587ba20f08f615360b348164",
  depositDate: "bfb7b2cecfc466f831d19a209dcf06013568f088",
  unsubscribes: "7b73b34d4450ee54ad4ef4440148a5032fe5481b",
  referralId: "ec0f453140b476b2f6badcdaef1192aaebf62acc",
};

// Person custom field keys for anglovillespzoo
const P = {
  utmSource: "20f25ba5f3b132c1aaefea4bafafded5f4969753",
  utmMedium: "95f0f2cbae6dcb6255abdd44c7b6d8d64bc9ae25",
  utmCampaign: "5ad6f98637eeea1858b26fa68518c25c1aed58af",
  utmContent: "41fc7c51636ef348639284709da2d1cb6a1f5c60",
  utmTerm: "c3cf04a332cfe3df531a7116f69d332820b9514b",
  pdChannel: "fa99850701fdb0b6bc31a15c122b62bcf382d499",
  countryCode: "bd89b9aeecd44fa9ab59ab18d5b06d06f3ad37dc",
  countryOfOrigin: "83b1d010db6971a338f138befc91dd9650850ce0",
  dob: "00fa19c629ccefbc17214d75cebbc187ad64fbe7",
};

export default async function handler(req, res) {
  const startTime = Date.now();
  const apiKey = process.env.PIPEDRIVE_API_KEY_2;
  const subdomain = process.env.PIPEDRIVE_SUBDOMAIN_2;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID_2;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);
    const [deals, persons] = await Promise.all([
      fetchAll(apiKey, subdomain, "deals"),
      fetchAll(apiKey, subdomain, "persons"),
    ]);

    const personMap = {};
    persons.forEach(p => { personMap[p.id] = p; });

    const headers = [
      "Deal - Title", "Deal - Owner",
      "Person - Email - Work", "Person - Email - Home", "Person - Email - Other",
      "Person - Phone - Work", "Person - Phone - Home", "Person - Phone - Mobile", "Person - Phone - Other",
      "Deal - Deal created", "Deal - deal_utm_content", "Deal - deal_utm_source",
      "Deal - deal_utm_medium", "Deal - ID", "Deal - Pipeline", "Deal - Source",
      "Deal - Stage", "Person - ID", "Person - Owner",
      "Person - pd_utm_campaign", "Person - pd_utm_content", "Person - pd_utm_medium",
      "Person - Person created", "Person - pd_utm_source", "Person - pd_utm_term",
      "Deal - deal_utm_campaign", "Person - pd_channel", "Person - Country code",
      "Person - Country of origin", "Deal - Contact person", "Deal - Lost reason",
      "Deal - Status", "Deal - Deposit Payment Date", "Deal - Unsubscribes",
      "Person - DOB", "Person - Name", "Deal - Referral ID"
    ];

    const rows = deals.map(d => {
      const pid = d.person_id?.value || d.person_id;
      const p = personMap[pid] || null;
      return [
        d.title || "",
        d.owner_name || "",
        getEmail(p, "work"), getEmail(p, "home"), getEmail(p, "other"),
        getPhone(p, "work"), getPhone(p, "home"), getPhone(p, "mobile"), getPhone(p, "other"),
        d.add_time ? d.add_time.split(" ")[0] : "",
        d[D.utmContent] || "",
        d[D.utmSource] || "",
        d[D.utmMedium] || "",
        d.id || "",
        d.pipeline_id || "",
        d[D.source] || "",
        d.stage_name || "",
        pid || "",
        p ? (p.owner_name || "") : "",
        p ? (p[P.utmCampaign] || "") : "",
        p ? (p[P.utmContent] || "") : "",
        p ? (p[P.utmMedium] || "") : "",
        p ? (p.add_time ? p.add_time.split(" ")[0] : "") : "",
        p ? (p[P.utmSource] || "") : "",
        p ? (p[P.utmTerm] || "") : "",
        d[D.utmCampaign] || "",
        p ? (p[P.pdChannel] || "") : "",
        p ? (p[P.countryCode] || "") : "",
        p ? (p[P.countryOfOrigin] || "") : "",
        d.person_name || "",
        d.lost_reason || "",
        d.status || "",
        d[D.depositDate] || "",
        d[D.unsubscribes] || "",
        p ? (p[P.dob] || "") : "",
        p ? (p.name || "") : "",
        d[D.referralId] || "",
      ];
    });

    const values = [headers, ...rows];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:BZ10000:clear`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const now = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
    const logRow = [now, `[PD2] Zsynchronizowano ${deals.length} transakcji`, `${duration}s`, "OK"];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet2!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [logRow] }),
      }
    );

    res.status(200).json({ success: true, deals: deals.length, duration: `${duration}s` });
  } catch (e) {
    try {
      const accessToken = await getAccessToken(clientEmail, privateKey);
      const now = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet2!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[now, `[PD2] Błąd: ${e.message}`, "", "ERROR"]] }),
        }
      );
    } catch {}
    res.status(500).json({ error: e.message });
  }
}
