// Søk etter solgte eksemplarer på eksterne prisarkiv. Samme regler som app/services/salesearch.py;
// ordlistene ligger i data/sale_search.json.

function terms(data, facts, brandName, itemType, lang, materialWithBrand) {
  const out = [data.item_types[itemType][lang]];
  const material = data.materials[facts.material ?? ""]?.[lang];
  if (brandName) {
    out.push(brandName);
    if (material && materialWithBrand) out.push(material);
  } else {
    if (material) out.push(material);
    const escapement = data.escapements[facts.escapement ?? ""]?.[lang];
    if (escapement) out.push(escapement);
  }
  return out;
}

function encode(list, join) {
  const words = list.join(" ").toLowerCase().split(/\s+/).filter(Boolean);
  if (join === "_") return words.map((w) => w.replace(/[^\p{L}\p{N}_]+/gu, "")).filter(Boolean).join("_");
  return words.map((w) => encodeURIComponent(w)).join("+");
}

export function saleSearchLinks(data, facts, brandName = null, itemType = "pocket_watch") {
  if (!data?.item_types?.[itemType]) return [];
  return data.sites.filter((site) => brandName || !site.brand_only).map((site) => {
    const list = (site.brand_only ? [brandName] : terms(data, facts, brandName, itemType, site.lang, site.material_with_brand))
      .filter((t, i, all) => t && t.trim() && all.indexOf(t) === i);
    if (!list.length || (!brandName && list.length < 2 && itemType === "other")) return null;
    return { site: site.id, label: site.label, note: site.note, query: list.join(" "),
             url: site.url.replace("{q}", encode(list, site.join)) };
  }).filter(Boolean);
}
