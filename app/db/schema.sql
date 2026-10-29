-- Oppslagstabeller. Databasen konkluderer; vision-modellen bare observerer.
-- Alle rader har kilde og is_demo, slik at ubekreftede data alltid kan vises som det de er.

-- Serienummerintervaller → produksjonsår.
-- Publiserte tabeller angir ofte bare grenser ("1 000 000 = 1895, 1 500 000 = 1902"),
-- så et intervall kan dekke flere år (year_from–year_to).
CREATE TABLE IF NOT EXISTS serial_ranges (
    id           INTEGER PRIMARY KEY,
    brand        TEXT    NOT NULL,                      -- kanonisk, små bokstaver: 'omega'
    number_type  TEXT    NOT NULL DEFAULT 'movement'    -- hvilket nummer tabellen gjelder
                 CHECK (number_type IN ('movement', 'case')),
    serial_start INTEGER NOT NULL,
    serial_end   INTEGER NOT NULL,
    year_from    INTEGER NOT NULL,
    year_to      INTEGER NOT NULL,
    source       TEXT    NOT NULL,
    is_demo      INTEGER NOT NULL DEFAULT 1,
    CHECK (serial_end >= serial_start),
    CHECK (year_to >= year_from)
);
CREATE INDEX IF NOT EXISTS idx_serial_lookup
    ON serial_ranges (brand, number_type, serial_start, serial_end);

-- Stempler → kanonisk materiale. Brukes av normaliseringen.
CREATE TABLE IF NOT EXISTS hallmarks (
    id        INTEGER PRIMARY KEY,
    pattern   TEXT    NOT NULL,   -- regulært uttrykk mot stempelteksten (små bokstaver)
    material  TEXT    NOT NULL,   -- silver_800, base_metal, ...
    label     TEXT    NOT NULL,   -- forklaring som vises til brukeren
    region    TEXT,
    priority  INTEGER NOT NULL DEFAULT 50,  -- høyere vinner ved flere treff
    is_demo   INTEGER NOT NULL DEFAULT 1
);

-- Realiserte salg (hammerpriser). Ikke utropspriser, ikke guidepriser.
CREATE TABLE IF NOT EXISTS auction_results (
    id            INTEGER PRIMARY KEY,
    item_type     TEXT    NOT NULL DEFAULT 'pocket_watch',
    brand         TEXT,                    -- NULL = usignert
    material      TEXT    NOT NULL,
    escapement    TEXT,                    -- cylinder, lever, verge, NULL = ukjent
    condition     TEXT,
    price_nok     INTEGER NOT NULL CHECK (price_nok > 0),
    price_basis   TEXT    NOT NULL DEFAULT 'hammer' CHECK (price_basis IN ('hammer', 'incl_premium')),
    sale_date     TEXT    NOT NULL,        -- ISO-dato
    auction_house TEXT    NOT NULL,
    source_url    TEXT,
    notes         TEXT,
    is_demo       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_auction_lookup
    ON auction_results (item_type, brand, material, escapement);

-- Grov periode ut fra kjennetegn, brukt når serienummeret ikke kan dateres.
-- Periodene for alle kjennetegn som er kjent, snittes; resultatet er et intervall, aldri et årstall.
CREATE TABLE IF NOT EXISTS period_rules (
    id        INTEGER PRIMARY KEY,
    feature   TEXT    NOT NULL CHECK (feature IN ('winding', 'escapement', 'movement_layout')),
    value     TEXT    NOT NULL,
    year_from INTEGER NOT NULL,
    year_to   INTEGER NOT NULL,
    note      TEXT    NOT NULL,
    source    TEXT    NOT NULL,
    is_demo   INTEGER NOT NULL DEFAULT 1,
    CHECK (year_to >= year_from),
    UNIQUE (feature, value)
);
