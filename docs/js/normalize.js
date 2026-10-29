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

const BRAND_ALIASES = {
  omega: "omega", "Ω": "omega", longines: "longines", zenith: "zenith", tissot: "tissot",
  iwc: "iwc", "international watch": "iwc", doxa: "doxa", cortebert: "cortebert",
  tavannes: "tavannes", cyma: "cyma", moeris: "moeris", roskopf: "roskopf",
};
const KNOWN_BRANDS = new Set(Object.values(BRAND_ALIASES));
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
  for (const stamp of stamps ?? []) {
    const text = String(stamp).toLowerCase().replaceAll(",", ".").trim();
    if (!text) continue;
    for (const rule of hallmarks) {
      if (new RegExp(rule.pattern).test(text)) {
        matches.push({ priority: rule.priority, stamp, material: rule.material, label: rule.label });
      }
    }
  }
  if (!matches.length) {
    return { material: null, matches: [], warnings: stamps?.length ? ["Fant ikke noe kjent materialstempel. Velg materiale manuelt."] : [] };
  }
  matches.sort((a, b) => b.priority - a.priority);
  const found = new Set(matches.map((m) => m.material));
  const precious = [...found].filter(isPrecious);
  const warnings = [];
  if (precious.length && [...found].some((m) => NON_PRECIOUS.has(m))) {
    warnings.push("Både edelt og uedelt metall er stemplet. Ofte er bare innerlokket (cuvetten) i metall. " +
      "Bekreft materialet for selve kassen.");
  }
  if (precious.length > 1) warnings.push("Flere ulike edelmetallstempler er funnet. Bekreft materialet.");
  const unique = [...new Map(matches.map((m) => [m.stamp + m.material, { stamp: m.stamp, material: m.material, label: m.label }])).values()];
  return { material: matches[0].material, matches: unique, warnings };
}

/**
 * facts: enten observasjoner fra bildeanalysen (source "vision") eller brukerbekreftede verdier (source "confirmed").
 */
export function normalize(hallmarks, facts, source) {
  const warnings = [];
  let brand;
  let explicitMaterial = null;
  if (source === "vision") {
    brand = normalizeBrand(facts.brand_signed);
    if (!brand && facts.dial_text && KNOWN_BRANDS.has(normalizeBrand(facts.dial_text))) brand = normalizeBrand(facts.dial_text);
  } else {
    brand = normalizeBrand(facts.brand);
    explicitMaterial = facts.material || null;
  }

  const [movement, w1] = cleanSerial(facts.movement_serial, "Verksnummer");
  const [caseNo, w2] = cleanSerial(facts.case_number, "Kassenummer");
  warnings.push(...w1, ...w2);

  const detected = detectMaterial(hallmarks, facts.case_stamps);
  let material;
  if (explicitMaterial) {
    if (MATERIAL_LABELS[explicitMaterial]) material = explicitMaterial;
    else { warnings.push(`Ukjent materialkode «${explicitMaterial}».`); material = detected.material; }
  } else {
    material = detected.material;
    warnings.push(...detected.warnings);
  }

  return {
    brand, movement_serial: movement, case_number: caseNo,
    escapement: facts.escapement || "unknown", material,
    material_matches: detected.matches, warnings,
  };
}
