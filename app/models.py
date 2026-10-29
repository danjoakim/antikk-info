"""Pydantic-modeller: kontrakten mellom vision, tjenestene og API-et."""

from typing import Literal

from pydantic import BaseModel, Field

Escapement = Literal["cylinder", "lever", "verge", "unknown"]
ImageRole = Literal["dial", "caseback", "cuvette", "movement", "movement_closeup", "caseback_closeup"]


# --- Det vision-modellen ser (aldri år eller pris) ---------------------------

class VisionFacts(BaseModel):
    dial_text: str | None = Field(None, description="Tekst på urskiven, ordrett")
    brand_signed: str | None = Field(None, description="Merkenavn slik det står på ur eller verk")
    movement_serial: str | None = Field(None, description="Nummer gravert på urverket, ordrett")
    case_number: str | None = Field(None, description="Nummer stemplet i kassen, ordrett")
    escapement: Escapement = "unknown"
    escapement_evidence: str | None = Field(None, description="Hva i bildet som viser gangtypen")
    case_stamps: list[str] = Field(default_factory=list, description="Stempler ordrett")
    jewels: int | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    unreadable: list[str] = Field(default_factory=list)
    retake_hints: list[str] = Field(default_factory=list)


# --- Normaliserte, kanoniske verdier ----------------------------------------

class MaterialMatch(BaseModel):
    stamp: str
    material: str
    label: str


class NormalizedFacts(BaseModel):
    brand: str | None = None               # kanonisk: 'omega', None = usignert
    movement_serial: int | None = None
    case_number: int | None = None
    escapement: Escapement = "unknown"
    material: str | None = None
    material_matches: list[MaterialMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# --- Bekreftet av brukeren før oppslag ---------------------------------------

class ConfirmedFacts(BaseModel):
    brand: str | None = None
    movement_serial: str | None = None
    case_number: str | None = None
    escapement: Escapement = "unknown"
    material: str | None = Field(None, description="Kanonisk materialkode; utledes av stempler hvis tom")
    case_stamps: list[str] = Field(default_factory=list)
    item_type: str = "pocket_watch"


# --- Resultater fra databasen ------------------------------------------------

DatingStatus = Literal["dated", "no_serial", "unknown_brand", "out_of_range"]


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


class AnalyzeResponse(BaseModel):
    mode: Literal["mock", "live"]
    facts: VisionFacts
    normalized: NormalizedFacts


class LookupResponse(BaseModel):
    normalized: NormalizedFacts
    dating: DatingResult
    valuation: Valuation | None
    valuation_message: str | None = None
