-- DEMODATA. Alt her har is_demo = 1 og må verifiseres mot minst to kilder før bruk.
-- Auksjonssalgene er FIKTIVE eksempler for å demonstrere flyten, ikke ekte salg.

-- Omega, verksnummer → år. Grenser etter hyppig siterte offentlige tabeller
-- (1 000 000 = 1895, 1 500 000 = 1902, 2 000 000 = 1908, 3 000 000 = 1912, 4 000 000 = 1916, 5 000 000 = 1923).
-- Se LOGG.md, åpent spørsmål 1: for eldre Omega kan kassenummer være riktig nummer.
INSERT INTO serial_ranges (brand, number_type, serial_start, serial_end, year_from, year_to, source, is_demo) VALUES
  ('omega', 'movement', 1000000, 1499999, 1895, 1901, 'DEMO: offentlig siterte Omega-tabeller, ikke verifisert', 1),
  ('omega', 'movement', 1500000, 1999999, 1902, 1907, 'DEMO: offentlig siterte Omega-tabeller, ikke verifisert', 1),
  ('omega', 'movement', 2000000, 2999999, 1908, 1911, 'DEMO: offentlig siterte Omega-tabeller, ikke verifisert', 1),
  ('omega', 'movement', 3000000, 3999999, 1912, 1915, 'DEMO: offentlig siterte Omega-tabeller, ikke verifisert', 1),
  ('omega', 'movement', 4000000, 4999999, 1916, 1922, 'DEMO: offentlig siterte Omega-tabeller, ikke verifisert', 1);

-- Stempler. Mønstrene kjøres mot stempelteksten med små bokstaver og komma byttet til punktum.
INSERT INTO hallmarks (pattern, material, label, region, priority, is_demo) VALUES
  ('(^|[^0-9])(0\.)?750([^0-9]|$)|18 ?k',             'gold_18k',    'Gull 18 karat (0.750)', NULL, 90, 1),
  ('(^|[^0-9])(0\.)?585([^0-9]|$)|14 ?k',             'gold_14k',    'Gull 14 karat (0.585)', NULL, 85, 1),
  ('helvetia',                                       'gold_18k',    'Sveitsisk kontrollmerke for 18 k gull (Helvetia-hode)', 'CH 1882–1933', 88, 1),
  ('ekorn|squirrel|écureuil|ecureuil',               'gold_14k',    'Sveitsisk kontrollmerke for 14 k gull (ekorn)', 'CH 1882–1933', 83, 1),
  ('(^|[^0-9])(0\.)?935([^0-9]|$)',                   'silver_935',  'Sølv 0.935', NULL, 80, 1),
  ('(^|[^0-9])(0\.)?925([^0-9]|$)|sterling',          'silver_925',  'Sølv 0.925 (sterling)', NULL, 78, 1),
  ('(^|[^0-9])(0\.)?900([^0-9]|$)',                   'silver_900',  'Sølv 0.900', NULL, 76, 1),
  ('(^|[^0-9])(0\.)?875([^0-9]|$)',                   'silver_875',  'Sølv 0.875', NULL, 75, 1),
  ('bjørn|bjorn|bear|ours',                          'silver_875',  'Sveitsisk kontrollmerke for sølv 0.875 (bjørn)', 'CH 1882–1933', 74, 1),
  ('(^|[^0-9])(0\.)?800([^0-9]|$)',                   'silver_800',  'Sølv 0.800', NULL, 70, 1),
  ('tiur|auerhahn|grouse|tétras|tetras|coq de bruy',  'silver_800',  'Sveitsisk kontrollmerke for sølv 0.800 (tiur)', 'CH 1882–1933', 69, 1),
  ('doubl[ée]|plaqu[ée]|gold ?filled|(^|[^a-z])g\.?f\.?([^a-z]|$)', 'gold_filled', 'Forgylt / doublé (ikke massivt gull)', NULL, 40, 1),
  ('acier|stahl|steel|stål',                         'steel',       'Stål', NULL, 30, 1),
  ('argentan|alpac+a|alpaka|neusilber|nysølv|maillechort|nickel|m[ée]tal', 'base_metal', 'Uedelt metall (argentan, nikkel o.l.)', NULL, 20, 1);

-- FIKTIVE referansesalg (hammerpris i NOK). Erstattes med kuraterte, lenkede salg.
INSERT INTO auction_results (item_type, brand, material, escapement, condition, price_nok, sale_date, auction_house, notes, is_demo) VALUES
  -- Usignerte sylinderur i uedelt metall
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'slitt',       250, '2019-03-14', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'ikke i gang', 180, '2019-11-02', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'god',         350, '2020-06-20', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'god',         300, '2021-02-11', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'ikke i gang', 150, '2021-09-30', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'god',         400, '2022-05-08', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'slitt',       220, '2022-12-01', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'svært god',   450, '2023-04-15', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'god',         280, '2024-01-27', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'base_metal', 'cylinder', 'slitt',       200, '2024-10-19', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  -- Usignerte sylinderur i sølv 0.800
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'god',         450, '2020-02-09', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'svært god',   900, '2021-05-22', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'god',         600, '2022-03-03', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'slitt',       500, '2023-08-17', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'god',         750, '2024-06-12', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', NULL, 'silver_800', 'cylinder', 'ikke i gang', 650, '2025-01-25', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  -- Omega med ankergang i sølv 0.800
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'god',         1800, '2019-05-18', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'svært god',   2400, '2020-10-04', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'god',         2100, '2021-04-28', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'svært god',   3200, '2022-02-14', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'ikke i gang', 1500, '2022-11-09', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'god',         2700, '2023-06-01', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'svært god',   3800, '2024-03-23', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_800', 'lever', 'slitt',       2200, '2025-02-15', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  -- Omega med ankergang i sølv 0.875 (bevisst få salg: viser trinnvis utvidelse)
  ('pocket_watch', 'omega', 'silver_875', 'lever', 'god',         2600, '2021-08-07', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'silver_875', 'lever', 'svært god',   3100, '2023-10-21', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  -- Omega med ankergang i uedelt metall
  ('pocket_watch', 'omega', 'base_metal', 'lever', 'god',          900, '2020-01-18', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'base_metal', 'lever', 'svært god',   1600, '2021-12-11', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'base_metal', 'lever', 'god',         1300, '2023-03-04', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1),
  ('pocket_watch', 'omega', 'base_metal', 'lever', 'slitt',       1100, '2024-09-28', 'DEMO (fiktivt salg)', 'Fiktiv demopost', 1);

-- Grove perioder for kjennetegn. Brede, forsiktige intervaller; må verifiseres mot faglitteratur.
INSERT INTO period_rules (feature, value, year_from, year_to, note, source, is_demo) VALUES
  ('winding', 'key',   1700, 1890, 'Nøkkeloppstrekk dominerte til kroneoppstrekk (remontoir) tok over, gradvis fra 1860- til 1890-tallet.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('winding', 'stem',  1860, 1970, 'Kroneoppstrekk ble vanlig på lommeur fra 1860–1870-tallet.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('escapement', 'verge',    1650, 1870, 'Spindelgang er den eldste gangtypen og forsvant fra vanlige lommeur i løpet av 1800-tallet.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('escapement', 'cylinder', 1820, 1940, 'Sylindergang ble masseprodusert i Sveits fra 1800-tallet og fram til 1930-tallet.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('escapement', 'lever',    1820, 1990, 'Ankergang har vært brukt fra tidlig 1800-tall og gir lite datering alene.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('movement_layout', 'bar',                 1830, 1940, 'Verk med separate broer (Lépine-kaliber).', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('movement_layout', 'three_quarter_plate', 1850, 1950, 'Trekvart plate.', 'DEMO: generell urhistorie, ikke verifisert', 1),
  ('movement_layout', 'full_plate',          1650, 1900, 'Hel plate, vanlig på eldre engelske og tidlige ur.', 'DEMO: generell urhistorie, ikke verifisert', 1);
