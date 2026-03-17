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

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const MIN_DATE_1 = "2025-10-08";

async function fetchAllDeals(apiKey, subdomain) {
let all = [], start = 0, more = true;
while (more) {
    const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=500&start=${start}&status=all_not_deleted`;
    const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=500&start=${start}&status=all_not_deleted&sort=add_time ASC`;
const r = await fetch(url);
if (r.status === 429) { await delay(2000); continue; }
const d = await r.json();
if (!d.success) throw new Error(d.error || "Pipedrive API error");
    all = all.concat(d.data || []);
    const items = (d.data || []).filter(deal => {
      const addDate = deal.add_time ? deal.add_time.split(" ")[0] : "";
      return addDate >= MIN_DATE_1;
    });
    all = all.concat(items);
more = d.additional_data?.pagination?.more_items_in_collection || false;
start += 500;
if (more) await delay(500);
@@ -172,7 +178,7 @@
const values = [headers, ...rows];

await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:BZ10000:clear`,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:BZ200000:clear`,
{ method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
);
