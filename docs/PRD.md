# PRD: Fixed Asset Count & Verification App

Oct 28, 2026 · @SAKIB

## Overview

We will build a mobile-first web app that lets the ACNABIN team count and verify 100% of the client's fixed assets against the SAP Fixed Asset Register (FAR), using the FAR **Fixed Asset** number as the tag number. The app replaces manual Excel counting and produces the completed Count & Verification workbook.

**Problem.** About 6,000 tagged assets must be found, checked and evidenced. The FAR has no location, serial number or custodian, so in Excel a counter has to search for every tag by hand. Duplicate counts, missing photos and end-of-day consolidation slow the team down and weaken the audit trail.

**Goals**

- Every physically verifiable FAR asset ends with a result: Verified, Not Found, Not Accessible, Qty Short/Excess, or with a condition or tag issue.
- Every asset marked Found has a location, a condition and at least one photo.
- Coverage by count and by cost is visible live, by asset class and by location.
- One-click export to the Count & Verification workbook and the client's Movement Register format.

**Non-goals (v1):** depreciation or NBV recalculation, posting to SAP, printing new tags, and blind floor-to-sheet counting (dropped in favour of FAR-driven verification).

**FAR facts (SAP extract 14 Jan 2026, as at 30 Jun 2025)**

| Item | Value |
| --- | --- |
| Rows in extract (cost line + depreciation line per asset) | 11,961 |
| Unique assets | 6,485 |
| Assets with cost > 0 | 6,336 |
| Physically verifiable (count, inspect, vehicle) | 6,013 · cost Tk 344.7 cr |
| Document / site check (land, AUC, asset clearing) | 323 |
| Group assets with a quantity in the description | 58 |
| Fields available | Asset no., description, class, G/L, capitalised date, cost, depreciation, NBV |
| Fields missing | Location, serial no., model, custodian |

## Users and roles

Five roles log in; the client representative signs on the counter's device without an account.

| Role | Main device | Can do |
| --- | --- | --- |
| Counter | Phone | Scan or search a tag, record verification, add photos, log Found-not-in-FAR items and movements for assigned locations |
| Team Lead | Phone / PC | Everything a counter can do, plus assign locations, resolve sync conflicts, reopen a closed location |
| Reviewer | PC / tablet | Review records and photos, approve or send back, record client explanations |
| Manager / Partner | PC | Read-only dashboard and exports, final sign-off, lock the engagement |
| Admin | PC | Create engagements, import the FAR, add users (form or CSV), manage drop-down lists |
| Client representative | Counter's device | Sign off a closed location (name, designation, signature) |

Counters never see cost or NBV; Reviewer and above do.

## User flows

The core loop is scan, verify, save: one tag takes under a minute when the asset is in front of the counter.

**Setup (Admin, before fieldwork)**

1. Create the engagement (client, FY, count period).
2. Import the FAR; the app collapses it to one row per asset and assigns each a method (Count, Inspect, Vehicle, Document).
3. Create buildings, floors and rooms; assign them to counters.
4. Add users by form or CSV; they receive an invite email.

**Count (Counter, on site)**

1. Open an assigned room and set the session (building, floor, room) once.
2. Scan the tag barcode/QR or type the tag number.
3. Tag in FAR and not yet verified: the asset's FAR description opens; the counter fills the verification form and takes photos.
4. Tag in FAR and already verified elsewhere: the app shows where and when, then asks whether it moved (log a movement) or is a duplicate tag (flag).
5. Tag not in FAR, or no tag: the counter logs it under Found Not in FAR.
6. Save and scan the next tag.

&#91;embedded content: scan decision · 2 checks, 3 outcomes\]

A tag goes to the verification form only if it is in the FAR and not yet verified; everything else is logged, never dropped.

**Close a location (Counter + Team Lead)**

1. Review assets verified in the room and any left Pending.
2. Record rooms or areas not accessed, with reason.
3. Client representative signs; the location locks.

**Review (Reviewer)**

1. Filter records by result, class or location.
2. Open photos, approve or send back with a comment.
3. Record client explanations for Not Found and Found Not in FAR items.

**Close the engagement (Manager)**

1. FAR assets still Pending are marked Not Found with a reason.
2. Manager signs off; data locks; exports are produced.

## Counter guide (mobile Chrome)

Counters use the app in Chrome on their own phone, installed to the home screen; nothing is downloaded from the Play Store. One asset takes about 30–40 seconds.

**First time (about 2 minutes)**

1. Open the invite email, tap the link, set a password and log in.
2. In Chrome tap **⋮ → Add to Home screen** (or **Install app**); the app icon opens full screen like a normal app.
3. On the first scan, tap **Allow** for camera and location (works because the site is HTTPS on Vercel).

**Each asset**

1. **Pick the room:** My Locations → *Head Office › 2nd Floor › Room 202*. Every save carries this location until the room is changed.
2. **Tap Scan:** the camera opens; point at the tag, it beeps. Unreadable tag → **Type tag** or search by description.
3. **The asset card opens** with the FAR description and class (no cost).
4. **Tap, don't type:** Found (Yes after a scan), Condition (Good / Fair / Poor / Damaged / Idle / Not Working), Tag status (OK / Damaged / Missing), In use (Yes / No). Serial no. typed or scanned; Remarks only if unusual.
5. **Tap Photo:** rear camera; 1 photo, or 2 if damaged or the tag has an issue.
6. **Tap Save & Scan Next:** the camera reopens.

**Warnings**

| Message | Counter does |
| --- | --- |
| Already verified in Room 201 by Rafi, 10:12 | Taps **Moved** (logs a movement) or **Duplicate tag** (flags it) |
| Tag not in FAR | Fills the Found Not in FAR form, tag already filled in |
| No tag on the asset | Taps **+ Not in FAR**, describes it, adds a photo, saves |

**End of room**

1. Tap **Close Room** to see the count verified there.
2. Note any area not accessed, e.g. "Store locked, key with Admin".
3. Client representative signs with a finger on screen; the room locks.

The top bar shows sync status: green *Saved*, or orange *3 waiting* on a weak signal; the app retries on its own.

**Tips for the team:** carry a power bank (camera and GPS drain the battery); never use Incognito (it loses unsent records); use the torch button in dark stores. iPhones work the same way in Chrome or Safari.

## Functional requirements

30 requirements; 23 are P0 and make up the MVP needed for the pilot.

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| FR-01 | Setup | Create an engagement: client, FY, FAR cut-off date, count period | P0 - MVP |
| FR-02 | Setup | Import the SAP FAR extract and collapse it to one row per asset (rules in Data model) | P0 - MVP |
| FR-03 | Setup | Assign a method by asset class (Count, Inspect, Vehicle, Document); exclude assets with cost = 0 | P0 - MVP |
| FR-04 | Setup | Maintain buildings, floors and rooms; assign them to counters | P0 - MVP |
| FR-05 | Setup | Add users by form or CSV with an invite email; deactivate users, never delete | P0 - MVP |
| FR-06 | Count | Scan barcode/QR with the phone camera, with torch; type the tag as fallback | P0 - MVP |
| FR-07 | Count | Search by tag number or description; works offline | P0 - MVP |
| FR-08 | Count | Verification form: Found? (Yes / No / Not Accessible), location from session, department, user/custodian, tag status, serial no., brand/model, physical qty, condition, in use, remarks | P0 - MVP |
| FR-09 | Count | Photos: at least 1 when Found; a 2nd when condition is Poor/Damaged/Not Working or the tag has an issue; compressed to about 300 KB on the phone | P0 - MVP |
| FR-10 | Count | Result calculated automatically: Verified, Verified - Condition Issue, Verified - Tag Issue, Qty Short, Qty Excess, Not Found, Not Accessible, Pending | P0 - MVP |
| FR-11 | Count | Warn when a tag is already verified (where, when, by whom); counter picks Moved or Duplicate tag | P0 - MVP |
| FR-12 | Count | Group assets: FAR qty read from the description; physical qty entered per location and summed | P0 - MVP |
| FR-13 | Count | Batch scan mode: continuous scanning, defaults Found / Good, details completed later | P1 - before full count |
| FR-14 | Found Not in FAR | Log untagged or unknown-tag items: description, brand/model, serial, probable class, qty, condition, photo; a typed tag is checked against the FAR | P0 - MVP |
| FR-15 | Inspection | Buildings and decoration: condition, use, at least 4 photos | P1 - before full count |
| FR-16 | Vehicle | Registration, chassis and engine no., odometer, papers seen with expiry dates, photos | P1 - before full count |
| FR-17 | Document check | Land, AUC, asset clearing: check type, document ref, date, progress %, photo | P1 - before full count |
| FR-18 | Movement | Log moves during the count period: from, to, dates, qty, status, gate pass, authorised by; verify-on-return list | P0 - MVP |
| FR-19 | Location close | Record areas not accessed with reason; client sign-off; location locks | P0 - MVP |
| FR-20 | Review | Queue filtered by result, class, location; approve or send back with comment; record client explanation | P0 - MVP |
| FR-21 | Review | Random re-check sample of verified records | P2 - later |
| FR-22 | Dashboard | Coverage by count and cost per class and location; results; conditions; counter productivity | P0 - MVP |
| FR-23 | Export | Count & Verification workbook in the agreed format (FA\_Count\_Verification\_Sheet.xlsx) | P0 - MVP |
| FR-24 | Export | Movement Register filled in the client's exact template | P0 - MVP |
| FR-25 | Export | Photo evidence pack (PDF/zip by tag) and exception schedule | P1 - before full count |
| FR-26 | Offline | FAR rows for assigned locations cached on the device; records and photos queued and synced when online | P0 - MVP |
| FR-27 | Audit trail | Every record keeps user, time, GPS, device; edits keep the old value and a reason; no hard delete | P0 - MVP |
| FR-28 | Access | Row-level security by role and assignment; cost hidden from counters | P0 - MVP |
| FR-29 | Engagement close | Pending assets moved to Not Found with a reason; Manager sign-off locks the data | P0 - MVP |
| FR-30 | Tagging | Print new tag labels for untagged assets and damaged tags | P2 - later |

## Data model and FAR import

The asset table is keyed on the SAP Fixed Asset number, which is also the physical tag number.

| Entity | Key fields |
| --- | --- |
| engagement | id, client, FY, FAR cut-off, count start/end, status |
| profile | user id, name, role, active |
| location | building, floor, room, assigned counter |
| asset | tag no. (Fixed Asset), description, class, G/L, capitalised on, cost, acc. depreciation, NBV, FAR qty, method |
| verification | tag no., found, count date, counter, location, department, user/custodian, tag status, serial, brand/model, physical qty, condition, in use, remarks, result, review status |
| photo | verification id, file path, SHA-256 hash, taken at, GPS |
| found\_not\_in\_far | location, tag found (if any), description, brand/model, serial, probable class, qty, condition, client explanation, resolution |
| movement | movement id, tag no., from, to, issue date, receive date, qty, status, gate pass, authorised by |
| doc\_check | tag no., check type, document ref, date, progress %, remarks |
| audit\_log | entity, record id, field, old value, new value, reason, user, time |

**FAR import rules**

1. Skip the top SUBTOTAL row; the header is row 2.
2. Split rows into cost lines and depreciation lines (G/L name contains "Depreciation").
3. Collapse to one row per Fixed Asset: cost from the cost line, accumulated depreciation from the depreciation line, NBV = cost + acc. depreciation.
4. Set the method from the asset class: Count (IT, furniture, office equipment, moulds, plant & machinery, construction machinery, loose tools, lab), Inspect (building, decoration), Vehicle, Document (land, all AUC, asset clearing).
5. Exclude assets with cost = 0 at the cut-off (149 in the current extract) and keep them in a reference list.
6. Read FAR qty from the description ("275 pcs", "1 set"); default 1.
7. Check that imported totals equal the source totals before the import is accepted.
8. Map location, serial no. and custodian if the client supplies a fuller extract.

**Result logic** (same as the workbook): blank Found = Pending; No = Not Found; Not Accessible = Not Accessible; physical qty below/above FAR qty = Qty Short / Qty Excess; condition Poor, Damaged, Idle or Not Working = Verified - Condition Issue; tag status other than Tag OK = Verified - Tag Issue; otherwise Verified.

## Outputs

The main output is the Count & Verification workbook, generated from app data in the agreed Excel format, with formulas left live.

| Output | Format | Content |
| --- | --- | --- |
| Count & Verification workbook | Excel (format of FA\_Count\_Verification\_Sheet.xlsx) | Summary, How to Fill, Count Sheet (FAR columns, verification columns, Result, Review), Found Not in FAR, Land/AUC & Clearing, Lists |
| Asset Movement Register | Excel, client template (Fixed\_Asset\_Movement\_Register\_Remarks\_HBL.xlsx) | One tab per building/floor, 15 rows a page, template layout unchanged |
| Exception schedule | Excel | Not Found, Qty Short/Excess, condition and tag issues, Found Not in FAR, with client explanations |
| Photo evidence pack | PDF / zip | Photos grouped by tag no., with time, GPS and counter |
| Location close-out | PDF | Per location: totals by result, areas not accessed, counter and client signatures |

Exports are generated on the server by filling stored templates, so the format stays fixed. Only row height grows for long text.

## Non-functional requirements and stack

The app must work fully offline on a mid-range Android phone and run on a Next.js + Supabase stack hosted on Vercel.

| Area | Requirement |
| --- | --- |
| Devices | Phone-first for counting (one-hand use, large tap targets); table layouts on PC for review, admin and dashboard |
| Offline | Counting, photos and lookups work with no network; queue syncs automatically; conflicts go to the Team Lead |
| Performance | Tag lookup under 1 second on 6,500 cached assets; saving a record under 2 seconds offline |
| Photos | Compressed on the phone to about 1,600 px / 300 KB; uploaded straight from the browser to storage, never through Vercel functions |
| Security | Supabase Auth; row-level security by role and assignment; service key only in Vercel environment variables; private photo storage with signed URLs |
| Audit | No hard deletes; full edit history; photo hashes stored |
| Availability | Data and photos backed up daily during fieldwork |

| Layer | Choice |
| --- | --- |
| Front end | Next.js PWA (installable), IndexedDB for offline cache and queue |
| Scanning | html5-qrcode or ZXing (camera barcode and QR) |
| Back end | Supabase Postgres, Auth, Storage, row-level security |
| Hosting | Vercel (HTTPS, needed for camera access) |
| Server routes | Vercel API routes for user invites and FAR import; a Python function (openpyxl) for Excel exports |
| Photo storage | Supabase Storage during fieldwork; copied to a Google Shared Drive when a location closes (to confirm) |

## Success metrics

| Metric | Target |
| --- | --- |
| FAR assets with a final result (not Pending) at engagement close | 100% |
| Found assets with location, condition and at least one photo | 100% |
| Records sent back by Reviewer | under 5% |
| Counting speed after the pilot | 40+ assets per counter-hour |
| Time from last count to final workbook | 1 day |

## Release plan

1. **Build MVP (P0):** FAR import, users and locations, scan and verify, Found Not in FAR, movements, offline sync, review, dashboard, workbook and Movement Register exports. About 3 weeks.
2. **Pilot:** one floor, two counters, one day; measure assets per hour and fix issues. 2 days.
3. **P1 before full count:** batch scan, inspection, vehicle and document checks, evidence pack. About 1 week, partly alongside the pilot.
4. **Full count:** all sites; daily review and close-out of each location.
5. **P2 after count:** review sampling, tag printing.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| FAR is as at 30 Jun 2025 | Additions and disposals since then show as Found Not in FAR or Not Found | Get an updated extract as at the count date |
| FAR has no location | Counters can't plan a route from the FAR; Not Found items are hard to chase | Ask for location / cost centre in the SAP extract; app records the actual location |
| Physical tags may not carry the SAP number | Scans fail; manual matching | Check sample tags in the pilot; allow other tag formats with a mapping table |
| Weak network on site | Lost work | Offline-first design and visible sync status |
| Moulds and machinery off-site | Low coverage on high-value classes (Tk 48 cr) | Site visits or third-party confirmation |
| Assets moved during the count | Double or missed counts | Already-verified warning and Movement log |

## Open questions

- [ ] Do the physical tags show the 8-digit SAP Fixed Asset number?
- [ ] Can the client give an updated FAR with location, cost centre and serial number?
- [ ] Is there a value threshold below which assets are not counted?
- [ ] Is ACNABIN also applying new tags as part of the assignment?
- [ ] Is the client's Fixed Asset Data Collection Sheet still a required output, alongside the Count & Verification workbook?
- [ ] Photo storage: Supabase only, or copy to Google Shared Drive at location close?
- [ ] Definitions for the exception codes FI, NS, UL, OB, NA, MS, if they are still to be used

---

## Clarifications (review of PRD v1.0, 31 Oct 2026)

- Roles: exactly three (`admin`, `manager`, `counter` = User / Counter). Team Lead / Reviewer roles are removed; existing such users were migrated to Manager (`supabase/08_prd_alignment.sql`).
- No user may approve a record they verified themselves (enforced by DB trigger); only Manager/Admin approve.
- Users cannot change their own role or active status (DB trigger).
- Counter report access: Live Count and Movement only, without cost/NBV. Exception and Final reports are Admin/Manager.
- Hard deletes are blocked on verification, photo, found-not-in-FAR, movement, doc-check and audit tables; audit_log is append-only.
- Closed/locked engagements reject verification changes except by Admin.
- Open items (not yet built): barcode/QR scanning, offline queue and sync, report-generation log, signed-off room re-sign rule, offline conflict rule, FAR re-upload rule.
