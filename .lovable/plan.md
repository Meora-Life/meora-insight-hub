## What I verified against your live database

- 13 patients, 597 results, `flat_view_all_results` all readable with the anon key.
- Real categories are: Gut & Microbiome (91 tests), Biochemistry (28), Nutrients (20), Urine (19), Haematology (17), Hormones (13), Heart (9), Cancer Markers, Thyroid, Autoimmunity, Environmental Toxins, Metabolic, Brain Health, Allergies, Infections, Bone Health, Sexual Health, Biological Age.
- Flags in use: `normal` (404), `high` (77), `low` (51), `below_detection_limit` (42), `not_detected` (14), `abnormal` (9). Your spec didn't cover `below_detection_limit` — I'll badge it grey as "Below Detection".
- `flat_view_all_results` does **not** expose `range_type`, `range_low`, `range_high` — only the display text and optimal bounds. So range bars need `test_definitions` loaded alongside (one extra small query, joined client-side).
- There is no "Immune Regulation", "Liver" or "Renal" category — those live as subcategories under Biochemistry. Immune will map to Haematology + Autoimmunity; Liver and Renal to Biochemistry subcategory/test-name matching.
- The anon key currently allows **writes** to `patients` (I created and will remove a throwaway test row). Worth tightening later; the upload form relies on it for now.

## Notes on your spec vs. this stack

- This project runs on TanStack Start, not plain Vite + React Router, and isn't deployed to Vercel — it publishes from Lovable. So: routes under `src/routes/`, and the Claude call runs in a built-in server function (equivalent of your edge function, same prompt, same shape) rather than a Supabase edge function. No CORS issue either way.
- Supabase URL + anon key go in `src/lib/supabase.ts` reading `import.meta.env.VITE_*`. Your Anthropic key is stored as a server secret and never reaches the browser.
- Password gate is server-verified: `meora2026` is stored as a secret, checked in a server function, and unlock persists in an encrypted session cookie. Same UX (shake + "Incorrect password"), but the password isn't sitting in the JS bundle.

## Build plan

**Foundation**
- Design tokens in `src/styles.css`: dark `#1A2B35`, cream `#FAF7F2`, orange `#E8571A`, body `#222222`, status green/amber/red. Fraunces + DM Sans loaded via `<link>` in the root route. 12px radius, soft-shadow white cards. No emojis.
- Typed Supabase client + a `types.ts` mirroring patients / test_definitions / flat view rows. Strict TypeScript, no `any`.
- Shared patient selection via URL search param (`?patient=PAT-001`) so Results and Dashboard stay in sync and are linkable.
- Data layer: TanStack Query hooks for patients, test definitions, and a patient's flat results. Skeleton loaders and real empty states.

**Password gate**
- Secrets: `SITE_PASSWORD` = meora2026, plus a generated session secret.
- `/unlock` route: centred cream page, styled "M" mark, "MeorAI" in Fraunces, tagline, single password field, orange Enter button, shake on failure. All three app pages gated behind it.

**Header + Home (`/`)**
- Dark nav bar: M mark + MeorAI, links Home · Results · Dashboard.
- Hero on cream: Fraunces headline, subtext, two stat pills (biomarker + category counts read live from the database rather than hardcoded).
- Upload card: first/last name, DOB, sex, PDF / CSV / Manual-paste toggle. CSV headers matched against `test_definitions.test_name` with a match preview. Submit creates the patient + submission rows and shows the success state; parsing is Phase 2, file reference stored only.
- Existing patients grid (3-up): name, DOB, sex, result count, last test date, and Excluded / High Risk / Synthetic badges from the notes field. Cards link to Results with the patient preselected.

**Results (`/results`)**
- Patient dropdown, four-stat summary strip, filter pills (All / Optimal / Suboptimal / Out of Range / Other).
- Results grouped by category with count headers. Each row: test name, value + unit, date, status badge, and an SVG range bar handling bilateral, upper_bound (0 → 2×), lower_bound (0 → 150), and qualitative (badge only). Badge logic exactly as you specified, with `below_detection_limit` added.
- AI Health Summary card, collapsed by default, "Generate Summary" in orange, loading state, sectioned output. Calls a server function that sends your exact prompt to claude-sonnet-4-5 with the patient's flagged results.

**Dashboard (`/dashboard`)**
- Dark hero card: name in Fraunces, chronological age from DOB, biological age from the Biological Age test with a signed delta badge, last test date, biomarker and submission counts. Red/amber alert banner across the top for EXCLUSION / HIGH RISK patients, with the reason from notes.
- Eight SVG arc dials (4×2): Cardiovascular, Metabolic, Hormonal, Thyroid, Immune, Liver, Renal, Gut — scored 100/70/30/0 per your rules and averaged, colour-banded, "Insufficient data" under 3 results.
- Wearables strip: four cards with your per-patient hardcoded values, trend arrows, zeros/dashes for exclusion patients.
- Recommended Protocols on cream: all nine trigger rules, each card with name, biomarker rationale, urgency badge, and the "Discuss with your doctor" note.

**Finishing**
- Per-route head metadata, responsive down to tablet, and a browser pass over all three pages with a real patient to verify data, bars, dials and the AI summary end-to-end.

### Technical details
- Secrets requested during build: `ANTHROPIC_API_KEY`. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set to your project values.
- Server functions live in `src/lib/*.functions.ts`; the Anthropic call and password check never enter the client bundle.
- The app's own Lovable Cloud backend is not enabled — all data comes from your Meora Supabase project via the anon key.
