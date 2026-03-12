export default async function handler(req, res) {
  const { apiKey, subdomain } = req.query;

  if (!apiKey || !subdomain) {
    return res.status(400).json({ error: "Missing apiKey or subdomain" });
  }

  try {
    let all = [], start = 0, more = true;
    while (more) {
      const url = `https://${subdomain}.pipedrive.com/api/v1/deals?api_token=${apiKey}&limit=100&start=${start}&status=all_not_deleted`;
      const r = await fetch(url);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Pipedrive API error");
      const items = d.data || [];
      all = all.concat(items);
      more = d.additional_data?.pagination?.more_items_in_collection || false;
      start += 100;
    }
    res.status(200).json({ success: true, data: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
