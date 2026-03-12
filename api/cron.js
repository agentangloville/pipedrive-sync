import crypto from "crypto";

function buildJwt(email, key) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = b64(header) + "." + b64(payload);
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(key, "base64url");
  return unsigned + "." + signature;
}

async function getAccessToken(email, privateKey) {
  const jwt = buildJwt(email, privateKey);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error_description || d.error);
  return d.access_token;
}

async function fetchAllDeals(apiKey, subdomain) {
  let all = [], start = 0, more = true;
  while (more) {
    const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=100&start=${start}&status=all_not_deleted`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.success) throw new Error(d.error || "Pipedrive API error");
    all = all.concat(d.data || []);
    more = d.additional_data?.pagination?.more_items_in_collection || false;
    start += 100;
  }
  return all;
}

async function fetchAllPersons(apiKey, subdomain) {
  let all = [], start = 0, more = true;
  while (more) {
    const url = `https://${subdomain}.pipedrive.com/api/v1/persons?api_token=${apiKey}&limit=100&start=${start}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.success) break;
    all = all.concat(d.data || []);
    more = d.additional_data?.pagination?.more_items_in_collection || false;
    start += 100;
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

const D = {
  crmId: "9a593a72e1ac99aa6228dadfcbbcb48a875cbc4b",
  closingDate: "47072fdbb046948cf50a291844f2724a6a6cdfc8",
  discountedAmount: "87832e6fd2b4ef37ae64965eca3552f027e29b72",
  leadStatus: "6b39cbc903089df55061333fae3642370c932c76",
  product: "a398a4e4adedfc6bb29d2a122456c638bb98b480",
  url: "da0e8c45be94fd682b276658f8aba7cc57ce59b7",
  utmSource: "8f6db0ecef4491e2500a7459c389d2b4770e6714",
  utmMedium: "6184ff13bbf896cb8d94779e3891dfa303835fd6",
  utmCampaign: "0640b6ea3f8e6c9680a36fc9c6621b48eb6e3344",
  utmContent: "d120eb0051e3ea871290c6222ceae5bdee626358",
  recordIdZoho: "302906ff491b84c82a54fbb38717ba24b4621c0a",
  studentFirstName: "a3d933768e6b8f330dc4c710c2247086e1d61eb0",
  studentLastName: "0bd641c177e6eadceabf4e27e30cb8d86fe2c3ea",
  studentGender: "406f206da48b48233e4c965c33e8bd1be6ab40e8",
  leadSource: "6676ea5153546b00a89ef9292506b258a0d2d348",
  depositDate: "82a6cf74b03fae50cfcacc809ac48fe1e63f4ddf",
};

const P = {
  provincia: "d0e9d806c2711711c2732a0b1e5f0d09d104b479",
  studentDob: "f444ce72d8d5c2869c0d04bf0c31f892c5138d79",
  marketingConsent: "59e9bc2065371b1b02bc41100f1ba8f439d29f78",
  marketingConsentPhone: "2f93092a3e9e19cc8fdc6b6a0dba7d5306fe72ca",
  utmSource: "9b4b49b382b5a7c3906022852c9e49d286dff72a",
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow Vercel cron (no auth header) or correct secret
    if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const startTime = Date.now();
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  const subdomain = process.env.PIPEDRIVE_SUBDOMAIN;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);
    const [deals, persons] = await Promise.all([
      fetchAllDeals(apiKey, subdomain),
      fetchAllPersons(apiKey, subdomain),
    ]);

    const personMap = {};
    persons.forEach(p => { personMap[p.id] = p; });

    const headers = [
      "Deal - Title", "Deal - CRM ID", "Deal - Closing Date", "Deal - Deal created",
      "Deal - Discounted amount", "Deal - Contact person", "Deal - Owner",
      "Person - Email - Work", "Person - Email - Home", "Person - Email - Other",
      "Deal - ID", "Deal - Lead Status", "Deal - Product", "Deal - URL",
      "Deal - utm_source", "Deal - utm_medium", "Deal - utm_campaign", "Deal - utm_content",
      "Deal - Lost reason", "Person - Provincia", "Deal - Stage", "Deal - Status",
      "Person - ID", "Deal - Record Id (Deals_zoho)", "Person - Marketing consent",
      "Person - Marketing consent phone", "Person - Phone - Work", "Person - Phone - Home",
      "Person - Phone - Mobile", "Person - Phone - Other", "Deal - Student First Name",
      "Deal - Student Last Name", "Person - Student DOB", "Deal - Student Gender",
      "Deal - Lead Source", "Deal - Deposit Date", "Deal - Last activity date",
      "Deal - Source origin", "Deal - Source channel", "Deal - Source origin ID",
      "Deal - Source channel ID", "Person - utm_source"
    ];

    const rows = deals.map(d => {
      const pid = d.person_id?.value || d.person_id;
      const p = personMap[pid] || null;
      return [
        d.title || "", d[D.crmId] || "", d[D.closingDate] || "",
        d.add_time ? d.add_time.split(" ")[0] : "", d[D.discountedAmount] || "",
        d.person_name || "", d.owner_name || "",
        getEmail(p, "work"), getEmail(p, "home"), getEmail(p, "other"),
        d.id || "", d[D.leadStatus] || "", d[D.product] || "", d[D.url] || "",
        d[D.utmSource] || "", d[D.utmMedium] || "", d[D.utmCampaign] || "",
        d[D.utmContent] || "", d.lost_reason || "",
        p ? (p[P.provincia] || "") : "", d.stage_name || "", d.status || "",
        pid || "", d[D.recordIdZoho] || "",
        p ? (p[P.marketingConsent] || "") : "",
        p ? (p[P.marketingConsentPhone] || "") : "",
        getPhone(p, "work"), getPhone(p, "home"), getPhone(p, "mobile"), getPhone(p, "other"),
        d[D.studentFirstName] || "", d[D.studentLastName] || "",
        p ? (p[P.studentDob] || "") : "", d[D.studentGender] || "",
        d[D.leadSource] || "", d[D.depositDate] || "", d.last_activity_date || "",
        d.origin || "", d.channel || "", d.origin_id || "", d.channel_id || "",
        p ? (p[P.utmSource] || "") : "",
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
    const logRow = [now, `Zsynchronizowano ${deals.length} transakcji`, `${duration}s`, "OK"];

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
          body: JSON.stringify({ values: [[now, `Błąd: ${e.message}`, "", "ERROR"]] }),
        }
      );
    } catch {}
    res.status(500).json({ error: e.message });
  }
}
