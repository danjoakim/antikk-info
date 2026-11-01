"""Pydantic-modeller: kontrakten mellom vision, tjenestene og API-et."""

from typing import Literal

from pydantic import BaseModel, Field

Escapement = Literal["cylinder", "lever", "verge", "unknown"]
Winding = Literal["key", "stem", "unknown"]          # nøkkeloppstrekk / krone (remontoir)
MovementLayout = Literal["bar", "three_quarter_plate", "full_plate", "unknown"]
# «photo» = bildet er ikke merket; modellen avgjør selv hva det viser.
ImageRole = Literal["photo", "dial", "caseback", "caseback_closeup", "cuvette", "cuvette_inside",
                    "movement", "movement_closeup"]

# Hva slags gjenstand det er. Ur har egne felt og tabeller; de andre kategoriene bruker de generelle feltene.
Category = Literal["pocket_watch", "wristwatch", "clock", "silver_metal", "porcelain_ceramics", "glass", "jewelry",
                   "furniture", "art", "textile", "toy", "electronics", "music", "film", "book_paper", "lighting", "other"]
WATCH_CATEGORIES = {"pocket_watch", "wristwatch"}

CATEGORY_LABELS: dict[str, str] = {
    "pocket_watch": "Lommeur", "wristwatch": "Armbåndsur", "clock": "Klokke (vegg, bord, gulv)",
    "silver_metal": "Sølv og metall", "porcelain_ceramics": "Porselen og keramikk", "glass": "Glass",
    "jewelry": "Smykker", "furniture": "Møbler", "art": "Kunst (malerier, grafikk, skulptur)",
    "textile": "Tekstiler", "toy": "Leker", "electronics": "Elektronikk og spill", "music": "Musikk (LP, CD, kassett)", "film": "Film (DVD, Blu-ray, VHS)", "book_paper": "Bøker og papir", "lighting": "Lamper og lys",
    "other": "Annet",
}

# Hvor på gjenstanden et nummer eller merke ble funnet. De første er for lommeur, resten er generelle.
Location = Literal["dial", "outer_lid_outside", "outer_lid_inside", "cuvette_outside", "cuvette_inside",
                   "movement", "case_rim", "front", "back", "base", "inside", "lid", "side", "handle", "label",
                   "unknown"]
NumberMethod = Literal["stamped", "engraved", "scratched", "unknown"]
MarkType = Literal["fineness", "hallmark_symbol", "maker_mark", "factory_mark", "signature", "label",
                   "inscription", "owner_engraving", "repair_mark", "other"]

LOCATION_LABELS: dict[str, str] = {
    "dial": "urskiven",
    "outer_lid_outside": "ytre lokk, utsiden",
    "outer_lid_inside": "ytre lokk, innsiden",
    "cuvette_outside": "cuvetten, utsiden",
    "cuvette_inside": "cuvetten, innsiden",
    "movement": "urverket",
    "case_rim": "kassekanten",
    "front": "forsiden",
    "back": "baksiden",
    "base": "undersiden",
    "inside": "innsiden",
    "lid": "lokket",
    "side": "siden",
    "handle": "hanken eller skaftet",
    "label": "etiketten",
    "unknown": "ukjent sted",
}


# --- Det vision-modellen ser (aldri år eller pris) ---------------------------

class NumberObservation(BaseModel):
    value: str = Field(description="Nummeret ordrett")
    location: Location = "unknown"
    method: NumberMethod = "unknown"
    prefix: str | None = Field(None, description="Tekst rett foran nummeret, f.eks. «No»")


class MarkObservation(BaseModel):
    text: str = Field(description="Merket ordrett, eller beskrevet med ord om det er et symbol")
    location: Location = "unknown"
    type: MarkType = "other"


class PhotoObservation(BaseModel):
    index: int = Field(description="Bildets nummer, fra 1")
    shows: Location = "unknown"


class VisionFacts(BaseModel):
    category: Category = "other"
    object_type: str | None = Field(None, description="Hva gjenstanden er, på norsk, f.eks. «kaffekanne»")
    title: str | None = Field(None, description="Tittel på bok, plate, film, spill eller trykk, slik den står")
    creator: str | None = Field(None, description="Forfatter, kunstner, komponist eller band, slik det står")
    description: str | None = Field(None, description="Kort, nøktern beskrivelse av det som synes")
    materials: list[str] = Field(default_factory=list, description="Synlige materialer, på norsk")
    style_cues: list[str] = Field(default_factory=list, description="Synlige stil- og utførelsestrekk, uten årstall")
    photos: list[PhotoObservation] = Field(default_factory=list, description="Hva hvert bilde viser")
    dial_text: str | None = Field(None, description="Tekst på urskiven, ordrett")
    brand_signed: str | None = Field(None, description="Merke- eller produsentnavn slik det står på uret")
    numbers: list[NumberObservation] = Field(default_factory=list)
    marks: list[MarkObservation] = Field(default_factory=list)
    escapement: Escapement = "unknown"
    escapement_evidence: str | None = None
    winding: Winding = "unknown"
    winding_evidence: str | None = None
    movement_layout: MovementLayout = "unknown"
    jewels: int | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    unreadable: list[str] = Field(default_factory=list)
    retake_hints: list[str] = Field(default_factory=list)


# --- Normaliserte, kanoniske verdier ----------------------------------------

class MaterialMatch(BaseModel):
    stamp: str
    material: str
    label: str


class NumberGroup(BaseModel):
    """Samme nummer funnet ett eller flere steder."""
    value: int
    locations: list[str]
    role: Literal["movement", "case"]


class NormalizedFacts(BaseModel):
    category: str = "pocket_watch"
    object_type: str | None = None
    title: str | None = None
    creator: str | None = None
    description: str | None = None
    materials: list[str] = Field(default_factory=list)
    other_numbers: list[str] = Field(default_factory=list)   # modell-, mønster- og dekornummer o.l.
    brand: str | None = None               # kanonisk: 'omega', None = usignert
    brand_display: str | None = None       # slik navnet står på uret
    known_brand: bool = False              # finnes i merkelisten vår
    retailer: str | None = None            # forhandlersignatur når produsenten er en annen
    movement_serial: int | None = None
    case_number: int | None = None
    number_groups: list[NumberGroup] = Field(default_factory=list)
    numbers_match: bool = False            # samme kassenummer på flere deler
    repair_marks: list[str] = Field(default_factory=list)
    owner_engravings: list[str] = Field(default_factory=list)
    escapement: Escapement = "unknown"
    winding: Winding = "unknown"
    movement_layout: MovementLayout = "unknown"
    material: str | None = None
    material_matches: list[MaterialMatch] = Field(default_factory=list)
    case_stamps: list[str] = Field(default_factory=list)   # merker som teller for materialet
    warnings: list[str] = Field(default_factory=list)


# --- Bekreftet av brukeren før oppslag ---------------------------------------

class ConfirmedFacts(BaseModel):
    brand: str | None = None
    movement_serial: str | None = None
    case_number: str | None = None
    escapement: Escapement = "unknown"
    winding: Winding = "unknown"
    movement_layout: MovementLayout = "unknown"
    material: str | None = Field(None, description="Kanonisk materialkode; utledes av stempler hvis tom")
    case_stamps: list[str] = Field(default_factory=list)
    item_type: str = "pocket_watch"        # kategori, se Category
    object_type: str | None = None
    title: str | None = None
    creator: str | None = None
    materials: list[str] = Field(default_factory=list)


# --- Resultater fra databasen ------------------------------------------------

DatingStatus = Literal["dated", "no_serial", "unknown_brand", "out_of_range", "no_tables"]


class PeriodEstimate(BaseModel):
    """Grov periode ut fra kjennetegn (oppstrekk, gang, verktype) når serienummer ikke kan brukes."""
    year_from: int
    year_to: int
    basis: list[str]
    display: str
    is_demo: bool


class DatingResult(BaseModel):
    status: DatingStatus
    message: str
    number_used: Literal["movement", "case"] | None = None
    serial: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    estimate: int | None = None
    display: str | None = None     # f.eks. "ca. 1909"
    method: str | None = None
    source: str | None = None
    is_demo: bool = False
    period: PeriodEstimate | None = None


class ComparableSale(BaseModel):
    price_nok: int
    sale_date: str
    condition: str | None
    auction_house: str
    source_url: str | None
    is_demo: bool


class Valuation(BaseModel):
    min: int
    median: int
    max: int
    currency: str = "NOK"
    n_sales: int
    period: str
    match_level: str
    match_label: str
    sufficient_data: bool
    criteria_dropped: list[str]
    caveats: list[str]
    comparables: list[ComparableSale]
    is_demo: bool


class Suggestion(BaseModel):
    """Et bilde som trolig vil gi mer, og hvorfor."""
    location: str
    label: str
    reason: str


class AnalyzeResponse(BaseModel):
    mode: Literal["mock", "live"]
    facts: VisionFacts
    normalized: NormalizedFacts
    suggestions: list[Suggestion] = Field(default_factory=list)


class SourceLink(BaseModel):
    title: str
    url: str


class MakerInfo(BaseModel):
    display_name: str
    summary: str
    country: str | None = None
    place: str | None = None
    founded: int | None = None
    tier: str | None = None
    tier_label: str | None = None
    advice: str | None = None
    interpretation: str | None = None
    number_note: str | None = None
    sources: list[SourceLink] = Field(default_factory=list)
    is_verified: bool = False


class SaleSearch(BaseModel):
    """Ferdig søk etter solgte eksemplarer på et eksternt prisarkiv."""
    site: str
    label: str
    note: str
    query: str
    url: str


class LookupResponse(BaseModel):
    normalized: NormalizedFacts
    dating: DatingResult
    valuation: Valuation | None
    valuation_message: str | None = None
    maker: MakerInfo | None = None
    sale_searches: list[SaleSearch] = []
