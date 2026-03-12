const delay = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  const { apiKey, subdomain } = req.query;

  if (!apiKey || !subdomain) {
    return res.status(400).json({ error: "Missing apiKey or subdomain" });
  }

  try {
    let all = [], start = 0, more = true;
    while (more) {
      const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=500&start=${start}&status=all_not_deleted`;
      const r = await fetch(url);
      if (r.status === 429) { await delay(2000); continue; }
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Pipedrive API error");
      all = all.concat(d.data || []);
      more = d.additional_data?.pagination?.more_items_in_collection || false;
      start += 500;
      if (more) await delay(500);
    }

    let persons = [], pStart = 0, pMore = true;
    while (pMore) {
      const url = `https://${subdomain}.pipedrive.com/api/v1/persons?api_token=${apiKey}&limit=500&start=${pStart}`;
      const r = await fetch(url);
      if (r.status === 429) { await delay(2000); continue; }
      const d = await r.json();
      if (!d.success) break;
      persons = persons.concat(d.data || []);
      pMore = d.additional_data?.pagination?.more_items_in_collection || false;
      pStart += 500;
      if (pMore) await delay(500);
    }

    res.status(200).json({ success: true, data: all, persons });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
