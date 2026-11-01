// Deterministisk oversetting fra rå observasjoner til kanoniske verdier.
// Samme regler som app/services/normalize.py.

export const MATERIAL_LABELS = {
  gold_18k: "Gull 18 k",
  gold_14k: "Gull 14 k",
  gold_filled: "Forgylt / doublé",
  silver_935: "Sølv 0.935",
  silver_925: "Sølv 0.925",
  silver_900: "Sølv 0.900",
  silver_875: "Sølv 0.875",
  silver_830: "Sølv 830",
  silver_800: "Sølv 0.800",
  steel: "Stål",
  base_metal: "Uedelt metall (argentan, nikkel o.l.)",
};

export const ESCAPEMENT_LABELS = {
  cylinder: "Sylindergang",
  lever: "Ankergang",
  verge: "Spindelgang",
  unknown: "Ukjent",
};

// Merkekunnskapen (data/makers.json) settes inn ved oppstart med setMakers().
let BRAND_ALIASES = { "Ω": "omega" };
let KNOWN_BRANDS = new Set(["omega"]);
let MAKERS = {};
let TIERS = {};
const COMPARABLE_WITH_UNSIGNED = new Set(["trade_name", "mass"]);
export const HAUTE_NOTE = "Ur fra dette merket kan være svært verdifulle, og navnet ble også forfalsket på enklere ur. " +
  "Få uret vurdert av en urmaker eller et auksjonshus før du kjøper eller selger.";

export function setMakers(data) {
  MAKERS = Object.fromEntries(data.makers.map((m) => [m.brand, m]));
  TIERS = data.tiers;
  const pairs = data.makers.flatMap((m) => [m.brand, ...m.aliases].map((a) => [a, m.brand]));
  pairs.sort((a, b) => b[0].length - a[0].length);   // lengste variant først
  BRAND_ALIASES = { "Ω": "omega", ...Object.fromEntries(pairs) };
  KNOWN_BRANDS = new Set(Object.keys(MAKERS));
}

export const tierOf = (brand) => (brand ? MAKERS[brand]?.tier ?? null : null);
export const unsignedLike = (facts) => !facts.brand || COMPARABLE_WITH_UNSIGNED.has(tierOf(facts.brand));

/** Det appen vet om navnet, eller null. */
export function makerInfo(brand) {
  const m = brand ? MAKERS[brand] : null;
  if (!m) return null;
  return { ...m, tier_label: TIERS[m.tier] ?? null, advice: m.tier === "haute" ? HAUTE_NOTE : null };
}

export function noSalesMessage(facts) {
  if (!isWatch(facts.category)) return "Appen har ingen egne salg i denne kategorien ennå. Se prisene funnet på nettet.";
  if (!facts.brand) return "Vi har ingen sammenlignbare salg av usignerte ur med disse egenskapene ennå.";
  const name = facts.brand_display || facts.brand;
  if (!tierOf(facts.brand)) {
    return `Vi har ingen salg av «${name}» og kjenner ikke navnet godt nok til å sammenligne med andre ur. ` +
      "Et ukjent navn kan være alt fra et lite forhandlernavn til et fint merke.";
  }
  return `Vi har ingen registrerte salg av ${MAKERS[facts.brand]?.display_name ?? name} ennå.`;
}
const UNSIGNED = new Set(["", "usignert", "unsigned", "ukjent", "unknown", "none", "null", "-", "ingen"]);
const NON_PRECIOUS = new Set(["base_metal", "steel"]);
const isPrecious = (m) => m.startsWith("silver_") || m === "gold_18k" || m === "gold_14k";

const OCR_FIXES = { o: "0", O: "0", D: "0", l: "1", I: "1", "|": "1", S: "5", s: "5", B: "8", Z: "2", z: "2" };
const SERIAL_PREFIX = /^\s*(n[o°º]\.?|nr\.?|no\.|#)\s*/i;
const SEPARATORS = /[\s.,'’_\-/]/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeBrand(raw) {
  const text = (raw ?? "").trim();
  const lowered = text.toLowerCase();
  if (UNSIGNED.has(lowered)) return null;
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (alias === "Ω") { if (text.includes(alias)) return canonical; continue; }
    if (new RegExp(`(^|[^a-z])${escapeRe(alias)}([^a-z]|$)`).test(lowered)) return canonical;
  }
  return lowered.replace(/\s+/g, " ");
}

/** Renser et avlest nummer. Returnerer [tall | null, advarsler]. */
export function cleanSerial(raw, label) {
  if (raw == null || !String(raw).trim()) return [null, []];
  const text = String(raw).replace(SERIAL_PREFIX, "").replace(SEPARATORS, "");
  if (!text) return [null, [`${label}: kunne ikke tolkes («${raw}»).`]];
  const digitShare = [...text].filter((c) => c >= "0" && c <= "9").length / text.length;
  if (digitShare < 0.6) return [null, [`${label}: «${raw}» ser ikke ut som et nummer.`]];
  const fixed = [...text].map((c) => OCR_FIXES[c] ?? c).join("");
  const warnings = [];
  if (fixed !== text) warnings.push(`${label}: tolket «${raw}» som ${fixed}. Sjekk sifrene mot uret.`);
  if (!/^\d+$/.test(fixed)) return [null, [...warnings, `${label}: «${raw}» inneholder tegn som ikke er siffer.`]];
  if (fixed.length < 3 || fixed.length > 9) return [null, [...warnings, `${label}: ${fixed} har uvanlig antall siffer.`]];
  return [Number(fixed), warnings];
}

/** Finner kassematerialet fra stempler via hallmarks-tabellen. */
export function detectMaterial(hallmarks, stamps) {
  const matches = [];
  let cuvetteBaseMetal = false;
  for (const stamp of stamps ?? []) {
    const text = String(stamp).toLowerCase().replaceAll(",", ".").trim();
    if (!text) continue;
    const onCuvette = text.includes("cuvette");
    for (const rule of hallmarks) {
      if (new RegExp(rule.pattern).test(text)) {
        // «Cuvette Métal» sier bare at det indre lokket er av metall, ikke hva kassen er laget av.
        if (onCuvette && NON_PRECIOUS.has(rule.material)) { cuvetteBaseMetal = true; continue; }
        matches.push({ priority: rule.priority, stamp, material: rule.material, label: rule.label });
      }
    }
  }
  if (!matches.length) {
    if (cuvetteBaseMetal) {
      return { material: null, matches: [], warnings: ["Bare cuvetten (det indre lokket) er merket metall. Det sier ikke hva kassen er laget av. " +
        "Se etter stempel i det ytre lokket, eller velg materiale manuelt."] };
    }
    return { material: null, matches: [], warnings: stamps?.length ? ["Fant ikke noe kjent materialstempel. Velg materiale manuelt."] : [] };
  }
  matches.sort((a, b) => b.priority - a.priority);
  const found = new Set(matches.map((m) => m.material));
  const precious = [...found].filter(isPrecious);
  const warnings = [];
  if (precious.length && [...found].some((m) => NON_PRECIOUS.has(m))) {
    warnings.push("Både edelt og uedelt metall er stemplet på kassen. Ofte er bare innerlokket (cuvetten) i metall. " +
      "Bekreft materialet for selve kassen.");
  }
  if (precious.length > 1) warnings.push("Flere ulike edelmetallstempler er funnet. Bekreft materialet.");
  const unique = [...new Map(matches.map((m) => [m.stamp + m.material, { stamp: m.stamp, material: m.material, label: m.label }])).values()];
  return { material: matches[0].material, matches: unique, warnings };
}

export const WINDING_LABELS = { key: "Nøkkeloppstrekk", stem: "Krone (remontoir)", unknown: "Ukjent" };
export const LAYOUT_LABELS = { bar: "Broer (Lépine)", three_quarter_plate: "Trekvart plate", full_plate: "Hel plate", unknown: "Ukjent" };
export const LOCATION_LABELS = {
  dial: "urskiven", outer_lid_outside: "ytre lokk, utsiden", outer_lid_inside: "ytre lokk, innsiden",
  cuvette_outside: "cuvetten, utsiden", cuvette_inside: "cuvetten, innsiden", movement: "urverket",
  case_rim: "kassekanten", front: "forsiden", back: "baksiden", base: "undersiden", inside: "innsiden",
  lid: "lokket", side: "siden", handle: "hanken eller skaftet", label: "etiketten", unknown: "ukjent sted",
};
/** Kategorier. Ur har egne felt og tabeller; de andre bruker de generelle feltene. Samme som app/models.py. */
export const CATEGORY_LABELS = {
  pocket_watch: "Lommeur", wristwatch: "Armbåndsur", clock: "Klokke (vegg, bord, gulv)",
  silver_metal: "Sølv og metall", porcelain_ceramics: "Porselen og keramikk", glass: "Glass",
  jewelry: "Smykker", furniture: "Møbler", art: "Kunst (malerier, grafikk, skulptur)",
  textile: "Tekstiler", toy: "Leker", electronics: "Elektronikk, spill og media", book_paper: "Bøker og papir", lighting: "Lamper og lys", other: "Annet",
};
export const WATCH_CATEGORIES = new Set(["pocket_watch", "wristwatch"]);
export const isWatch = (category) => WATCH_CATEGORIES.has(category ?? "pocket_watch");
// Merketyper som kan si noe om kassematerialet. Eiergravering, reparasjoner og kassemakermerker gjør ikke det.
const MATERIAL_MARK_TYPES = new Set(["fineness", "hallmark_symbol", "inscription", "other"]);
const CITY_SUFFIX = /[,\s]*(à\s+|a\s+)?(gen[eèé]ve|geneva|genf|la chaux-de-fonds|le locle|bienne|biel|suisse|switzerland|swiss made|schweiz)\s*$/i;
const where = (loc) => LOCATION_LABELS[loc] ?? loc;

export const isKnownBrand = (brand) => KNOWN_BRANDS.has(brand);

/** [kanonisk nøkkel, visningsnavn, kjent merke]. Bynavn som «Genève» tas ikke med i nøkkelen. */
export function brandInfo(raw) {
  const display = String(raw ?? "").trim();
  if (UNSIGNED.has(display.toLowerCase())) return [null, null, false];
  const stripped = display.replace(CITY_SUFFIX, "").replace(/^[\s,]+|[\s,]+$/g, "");
  const canonical = normalizeBrand(stripped || display);
  return [canonical, display, KNOWN_BRANDS.has(canonical)];
}

/** Merker fra cuvetten får prefikset «Cuvette:», slik at metallmerket der ikke avgjør kassematerialet. */
const stampText = (m) => (m.location?.startsWith("cuvette") ? `Cuvette: ${m.text}` : m.text);

/** Grupperer like nummer på tvers av deler. Innrissede nummer regnes som reparasjonsmerker. */
function analyseNumbers(numbers) {
  const groups = new Map();
  const repairs = [];
  const warnings = [];
  for (const n of numbers ?? []) {
    if (n.method === "scratched") { repairs.push(`${n.value} (${where(n.location)})`); continue; }
    const [value] = cleanSerial(n.value, "Nummer");
    if (value == null) {
      warnings.push(`Så bort fra «${n.value}» (${where(n.location)}): ikke et rent nummer, kanskje et reparasjonsmerke.`);
      continue;
    }
    const locs = groups.get(value) ?? [];
    if (!locs.includes(n.location)) locs.push(n.location);
    groups.set(value, locs);
  }
  const result = [...groups].map(([value, locations]) => ({ value, locations, role: locations.includes("movement") ? "movement" : "case" }));
  result.sort((a, b) => b.locations.length - a.locations.length);
  const caseGroups = result.filter((g) => g.role === "case");
  if (caseGroups.length > 1) {
    warnings.push(`Ulike nummer i kassen (${caseGroups.map((g) => g.value).join(", ")}). Lokkene kan være satt sammen ` +
      "av forskjellige ur, eller ett av numrene betyr noe annet.");
  }
  return { groups: result, repairs, warnings };
}

/**
 * facts: enten observasjoner fra bildeanalysen (source "vision") eller brukerbekreftede verdier (source "confirmed").
 * Samme regler som app/services/normalize.py.
 */
export function normalize(hallmarks, facts, source) {
  const warnings = [];
  let groups = [], repairs = [], owner = [], stamps, movement, caseNo, explicitMaterial = null, retailer = null;
  let otherNumbers = [];
  const category = (source === "vision" ? facts.category : facts.item_type) || (source === "vision" ? "other" : "pocket_watch");
  const watch = WATCH_CATEGORIES.has(category);
  let [brand, display, known] = source === "vision" ? brandInfo(facts.brand_signed) : brandInfo(facts.brand);

  if (source === "vision") {
    // Et kjent produsentnavn et annet sted på uret slår et ukjent navn og en forhandlersignatur.
    if (!known || tierOf(brand) === "retailer") {
      const named = new Set(["inscription", "factory_mark", "signature", "label"]);
      const others = [...(facts.marks ?? []).filter((m) => named.has(m.type)).map((m) => m.text), facts.dial_text];
      for (const text of others) {
        const info = brandInfo(text);
        if (info[2] && info[0] !== brand && tierOf(info[0]) !== "retailer") {
          if (known) retailer = display;
          [brand, display, known] = info;
          break;
        }
      }
    }
    const a = watch ? analyseNumbers(facts.numbers) : {
      // Modell-, mønster- og dekornummer betyr noe annet enn serienummer på ur; de vises bare.
      groups: [], warnings: [],
      repairs: (facts.numbers ?? []).filter((n) => n.method === "scratched").map((n) => `${n.value} (${where(n.location)})`),
    };
    if (!watch) {
      otherNumbers = (facts.numbers ?? []).filter((n) => n.method !== "scratched")
        .map((n) => `${n.prefix ? `${n.prefix} ` : ""}${n.value} (${where(n.location)})`);
    }
    groups = a.groups;
    warnings.push(...a.warnings);
    repairs = [...a.repairs, ...(facts.marks ?? []).filter((m) => m.type === "repair_mark").map((m) => `${m.text} (${where(m.location)})`)];
    owner = (facts.marks ?? []).filter((m) => m.type === "owner_engraving").map((m) => `${m.text} (${where(m.location)})`);
    stamps = (facts.marks ?? []).filter((m) => MATERIAL_MARK_TYPES.has(m.type)).map(stampText);
    movement = groups.find((g) => g.role === "movement")?.value ?? null;
    caseNo = groups.find((g) => g.role === "case")?.value ?? null;
  } else {
    const [m, w1] = cleanSerial(facts.movement_serial, "Verksnummer");
    const [c, w2] = cleanSerial(facts.case_number, "Kassenummer");
    movement = m; caseNo = c;
    warnings.push(...w1, ...w2);
    stamps = [...(facts.case_stamps ?? [])];
    explicitMaterial = facts.material || null;
  }

  const detected = detectMaterial(hallmarks, stamps);
  let material;
  if (explicitMaterial) {
    if (MATERIAL_LABELS[explicitMaterial]) material = explicitMaterial;
    else { warnings.push(`Ukjent materialkode «${explicitMaterial}».`); material = detected.material; }
  } else {
    material = detected.material;
    warnings.push(...detected.warnings);
  }
  const caseGroup = groups.find((g) => g.role === "case");
  return {
    category, object_type: facts.object_type ?? null, description: source === "vision" ? facts.description ?? null : null,
    materials: [...(facts.materials ?? [])], other_numbers: otherNumbers,
    brand, brand_display: display, known_brand: known, retailer,
    movement_serial: movement, case_number: caseNo,
    number_groups: groups, numbers_match: !!caseGroup && caseGroup.locations.length > 1,
    repair_marks: repairs, owner_engravings: owner,
    escapement: facts.escapement || "unknown", winding: facts.winding || "unknown",
    movement_layout: facts.movement_layout || "unknown",
    material, material_matches: detected.matches, case_stamps: stamps, warnings,
  };
}
