// Discogs: databasen over musikkutgivelser (LP, CD, kassett) og markedsplassen deres.
// Finner riktig utgivelse ut fra strekkode, katalognummer eller artist og tittel, og henter
// laveste pris og antall til salgs akkurat nå. Søk krever brukerens egen Discogs-nøkkel.

const API = "https://api.discogs.com";
const MAX_CANDIDATES = 4;

/** Plukker ut det Discogs kan søke på fra bildeanalysen. */
export function discogsQuery(facts, normalized) {
  const nums = facts.numbers ?? [];
  const pick = (re) => nums.find((n) => re.test(n.prefix ?? ""))?.value ?? null;
  const barcode = (pick(/ean|upc|barcode|strekkode/i) ?? "").replace(/\D/g, "") || null;
  return {
    barcode: barcode && barcode.length >= 8 ? barcode : null,
    catno: pick(/cat/i),
    artist: normalized.creator ?? facts.creator ?? null,
    title: normalized.title ?? facts.title ?? null,
    label: normalized.brand_display ?? facts.brand_signed ?? null,
  };
}

/** Søkene i prioritert rekkefølge: strekkode, katalognummer, artist og tittel. */
export function searchUrls(q, token) {
  const urls = [];
  const make = (params) => `${API}/database/search?${new URLSearchParams({ type: "release", per_page: "10", ...params, token })}`;
  if (q.barcode) urls.push(make({ barcode: q.barcode }));
  if (q.catno) urls.push(make(q.label ? { catno: q.catno, label: q.label } : { catno: q.catno }));
  if (q.catno && q.label) urls.push(make({ catno: q.catno }));
  if (q.artist && q.title) urls.push(make({ artist: q.artist, release_title: q.title }));
  else if (q.title) urls.push(make({ release_title: q.title }));
  return urls;
}

function formatWhat(formats = []) {
  const f = formats.join(" ").toLowerCase();
  if (/vinyl/.test(f)) return /7"|single/.test(f) ? "singel (vinyl)" : "LP-plate";
  if (/cd/.test(f)) return "CD";
  if (/cass/.test(f)) return "kassett";
  return null;
}

/** Gjør Discogs-treff om til forslag i samme form som identifiseringen. */
export function toCandidates(results, { exact = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const r of results ?? []) {
    if (!r?.id || !r.title) continue;
    const label = (r.label ?? [])[0] ?? null;
    const key = `${r.catno ?? ""}|${r.country ?? ""}|${r.year ?? ""}|${r.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [artist, ...rest] = String(r.title).split(" - ");
    const uri = String(r.uri ?? `/release/${r.id}`);
    out.push({
      name: r.title, what: formatWhat(r.format), maker: label, creator: rest.length ? artist.trim() : null,
      title: rest.length ? rest.join(" - ").trim() : r.title,
      why: [r.year || "år ukjent", r.country, [label, r.catno].filter(Boolean).join(" "), (r.format ?? []).join(", ")].filter(Boolean).join(" · "),
      check: r.catno && r.catno !== "none" ? `Se etter katalognummeret ${r.catno} på ryggen eller etiketten.` : null,
      url: uri.startsWith("http") ? uri : `https://www.discogs.com${uri}`, site: "discogs.com",
      catno: r.catno && r.catno !== "none" ? r.catno : null,
      thumb: r.thumb || null, discogs: { id: r.id, year: r.year ? Number(r.year) || null : null, country: r.country ?? null },
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  // «Sjekk» skal peke på det som faktisk skiller kortene: katalognummer, ellers land, ellers år.
  const differs = (k) => new Set(out.map((c) => k(c) ?? "")).size > 1;
  const byCatno = differs((c) => c.catno), byCountry = differs((c) => c.discogs.country), byYear = differs((c) => c.discogs.year);
  for (const c of out) {
    if (byCatno && c.catno) continue;
    if (byCountry && c.discogs.country) c.check = `Se etter produksjonslandet (${c.discogs.country}) på etiketten eller omslaget, ofte «Made in …».`;
    else if (byYear && c.discogs.year) c.check = `Se etter årstallet ${c.discogs.year} på etiketten eller baksiden.`;
    else c.check = null;
  }
  for (const c of out) delete c.catno;
  const decided = out.length === 1 || (exact && out.length > 0 && results.length === 1);
  return { candidates: decided ? out.slice(0, 1).map((c) => ({ ...c, check: null })) : out, decided: decided && out.length > 0 };
}

async function getJson(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error("Fikk ikke kontakt med Discogs.");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Discogs godtok ikke nøkkelen. Sjekk den under «meny».");
  if (res.status === 429) throw new Error("For mange søk mot Discogs akkurat nå. Prøv igjen om et minutt.");
  if (!res.ok) throw new Error(`Discogs svarte med feil (${res.status}).`);
  return body;
}

/** Finner utgivelsen. Gir { candidates, decided, source } – tom liste når ingenting passer. */
export async function discogsIdentify(facts, normalized, token, { signal } = {}) {
  const q = discogsQuery(facts, normalized);
  for (const [i, url] of searchUrls(q, token).entries()) {
    const body = await getJson(url, signal);
    const results = body.results ?? [];
    if (results.length) return { ...toCandidates(results, { exact: i === 0 && !!q.barcode }), source: "discogs" };
  }
  return { candidates: [], decided: false, source: "discogs" };
}

/** Markedet akkurat nå: laveste pris og antall til salgs (i euro; omregnes til kroner i appen). */
export function parseStats(body) {
  const low = body?.lowest_price;
  return {
    lowest: low && typeof low.value === "number" ? { value: low.value, currency: String(low.currency ?? "EUR").toUpperCase() } : null,
    forSale: Number.isInteger(body?.num_for_sale) ? body.num_for_sale : 0,
  };
}

export async function discogsStats(releaseId, token, { signal } = {}) {
  const url = `${API}/marketplace/stats/${encodeURIComponent(releaseId)}?${new URLSearchParams({ curr_abbr: "EUR", token })}`;
  return parseStats(await getJson(url, signal));
}
