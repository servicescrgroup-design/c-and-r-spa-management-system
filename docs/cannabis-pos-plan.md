# Plan: POS System for Cannabis Stores in Thailand

Written 4 October 2026. The legal section reflects public reporting up to that date. Confirm it with a Thai lawyer before you build the compliance features, because the rules changed three times between June 2025 and April 2026 and the Cannabis and Hemp Act is still moving through parliament.

## 1. Recommendation in one paragraph

Build the cannabis POS as a second business type inside this codebase, not as a new app. The spa system already has the parts a dispensary needs and that take the longest to build: multi-business accounts with row-level security, branches, staff roles and invites, registers and cash drawers with denomination counts, products with per-branch stock and adjustment history, sales with split payments, refunds, expenses, payroll, daily reports, accounting postings, and Thai/English menus. The cannabis-specific work is the prescription-controlled sale, batch and gram-level stock, a practitioner role, the dispensing register, monthly regulator reports, and Thai tax receipts. That is roughly 12 to 16 weeks for one full-time developer to a pilot store, versus 6 to 9 months from scratch.

## 2. What Thai law requires of the software (as of October 2026)

These are the rules that shape the product. Each one maps to a feature in section 5.

| Rule | Source | What the POS must do |
|---|---|---|
| Cannabis flower is a controlled herb. Every flower sale needs a PT33 (ภท.33) prescription from a licensed Thai practitioner. | Ministry of Public Health notification, 25 June 2025 | Block flower checkout without a valid prescription on file. Record prescription number, practitioner, issue date, expiry (about 30 days), condition, and allowed quantity. Enforce the quantity cap across the prescription's lifetime. |
| A licensed practitioner (doctor, pharmacist, Thai traditional medicine practitioner) must be on site during opening hours. | Supervision rules reported from January 2026 | Add a `practitioner` role. Require a practitioner clock-in before flower sales open. Log who was on duty for every sale. |
| Flower must come from GACP-certified farms, and shops must keep supply chain records. | DTAM guidance | Supplier records with GACP certificate number and expiry. Every receiving entry carries a batch or lot number, and every sale line references the batch it came from. |
| Keep a dispensing log: patient name or passport number, practitioner, product, quantity. Report to the authorities monthly. | DTAM guidance | A dispensing register table written automatically at checkout, plus a monthly export in the format the provincial health office accepts. |
| Minimum age 20. No sales to pregnant or breastfeeding women. | Cannabis control notifications | Capture date of birth or passport at registration. Hard stop under 20. Record the patient's self-declaration. |
| Retention: paper PT33 for 1 year, accounts and supporting evidence for 3 years. | Reported DTAM and Revenue Department practice | Store scanned prescriptions in Supabase Storage. Never hard-delete sales, customers, or prescriptions. |
| CBD products under 0.2% THC are exempt from the prescription rule. Edibles, cosmetics, and other products fall under separate FDA rules. | MoPH notifications | Product flag `regulated_class`: `flower`, `cbd_exempt`, `other`. Only `flower` triggers the prescription flow. |
| Personal Data Protection Act (PDPA) treats health data as sensitive. | PDPA 2019 | Explicit consent screen at patient registration, access log on patient records, a retention and deletion policy. |
| VAT 7% once revenue passes 1.8 million THB a year. A POS that prints abbreviated tax invoices needs Revenue Department approval of the cash register. | Revenue Code | VAT-inclusive pricing, abbreviated tax invoice layout, sequential invoice numbers per register, and the data the approval form asks for. Confirm the approval process with your accountant. |

Open legal questions to settle in week 1:

1. Does the on-site practitioner issue the PT33 at the counter, or do customers arrive with one? Most shops do the first. The sale flow in section 5 supports both.
2. Exact columns and file format of the monthly report your provincial health office accepts (paper, Excel, or portal upload).
3. Whether a shop licence renewal after 30 April 2026 needs a credential that affects how you record staff.
4. Which Thai acquirer will take card payments from a cannabis business. Stripe lists cannabis as a prohibited business, so the current Stripe integration cannot be used for these sales.

## 3. Architecture: what you reuse and what you add

Reuse unchanged:

- Auth, business signup, staff invites, the `owner` / `manager` / `front_desk` roles, multi-business RLS (`app.current_org_id`, `app.fill_org_id`).
- Branches, registers, cash drawer sessions, denomination counting, shared drawers, shift reports.
- `products`, `product_categories`, `branch_inventory`, `inventory_adjustments`, product images and branch overrides.
- `pos_transactions`, `pos_transaction_items`, `pos_payments`, `pos_discounts`, refunds, split payments.
- Expenses, vendors, payroll engine, accounting postings, daily report, owner dashboard.
- Thai and English translations, `auto-translate` component, store colours.

Add:

- `organizations.business_type` enum (`spa`, `cannabis`). Navigation, dashboard cards, and the sale screen switch on it. Spa-only modules (therapists, queue, rooms and beds, booking page) stay hidden for cannabis businesses.
- A cannabis sale screen under `src/app/(pos)/pos/dispense/` instead of reusing the massage-oriented `sale` page.
- A `practitioner` value on `role_type`.
- A payment provider for PromptPay QR and a Thai acquirer behind the existing `PaymentProvider` interface in `src/lib/payments/provider.ts`.

Keep everything in one repo and one Supabase project. A cannabis business and a spa business are different `organizations` rows, so RLS isolation already applies.

## 4. Data model additions

New migrations, continuing from 0096:

```
0096_business_type.sql
  organizations.business_type enum default 'spa'
  role_type add value 'practitioner'

0097_cannabis_products.sql
  products: regulated_class enum (flower, cbd_exempt, other)
            strain text, thc_percent numeric, cbd_percent numeric
            form enum (flower, pre_roll, oil, edible, topical, accessory)
            sold_by enum (unit, weight)   -- weight is in grams
  branch_inventory.quantity_on_hand: integer -> numeric(10,3) for gram stock
  pos_transaction_items.quantity:     integer -> numeric(10,3)
  product_price_tiers (product_id, grams numeric, price_cents)   -- 1g, 3.5g, 7g, 14g

0098_suppliers_batches.sql
  suppliers (org_id, name, gacp_certificate_no, gacp_expires_on, licence_no, contact)
  product_batches (org_id, product_id, supplier_id, batch_no, received_on,
                   harvest_date, expiry_date, grams_received numeric,
                   grams_remaining numeric, coa_file_path, thc_percent, cbd_percent)
  inventory_adjustments.batch_id
  pos_transaction_items.batch_id

0099_patients_prescriptions.sql
  customers: id_type enum (thai_id, passport), id_number_encrypted text,
             id_last4 text, nationality text, consent_at timestamptz,
             pregnant_or_breastfeeding_declared boolean
  practitioners (staff_id, licence_type enum, licence_no, licence_expires_on)
  prescriptions (org_id, customer_id, practitioner_staff_id, pt33_no,
                 issued_on, expires_on, condition_code, max_grams numeric,
                 grams_dispensed numeric default 0, scan_file_path, status)
  pos_transactions.prescription_id, pos_transactions.practitioner_on_duty_staff_id

0100_dispensing_register.sql
  dispensing_log (org_id, branch_id, transaction_id, customer_id,
                  prescription_id, practitioner_staff_id, product_id,
                  batch_id, grams numeric, dispensed_at)
  -- append-only; trigger writes one row per flower line at checkout
  practitioner_shifts (branch_id, staff_id, started_at, ended_at)
  waste_log (branch_id, product_id, batch_id, grams, reason, witness_staff_id, photo_path)
  customer_access_log (customer_id, staff_id, action, at)   -- PDPA

0101_tax_invoices.sql
  pos_registers.tax_invoice_prefix text, next_invoice_no integer
  pos_transactions.invoice_no text, vat_cents integer
  organizations: tax_id text, vat_registered boolean, legal_name_th text
```

Changing `quantity` from integer to numeric touches the spa sale flow too. Do it early, in phase 1, and run the existing spa checkout end to end afterwards.

## 5. Feature phases

### Phase 0: Discovery and compliance sign-off (1 to 2 weeks)

- Visit two or three target shops. Record their actual flow from the customer walking in to leaving, including how the practitioner consults and where the paper PT33 goes.
- Get the four open legal questions from section 2 answered in writing.
- Get the monthly report template from the provincial health office.
- Pick the acquirer and confirm they accept the business. Get PromptPay merchant QR details from the shop's bank.
- Decide hardware: tablet or laptop, receipt printer model, scale model, label printer.

Deliverable: a one-page requirements sheet signed by the shop owner.

### Phase 1: Foundation (2 weeks)

- `business_type` and navigation switch. A cannabis owner signing up sees Products, Batches, Patients, Dispense, Register, Reports, Staff, Expenses.
- Product model: strain, THC/CBD, form, regulated class, sold by weight, price tiers.
- Gram-based stock. Convert the two integer columns to numeric.
- Supplier and batch receiving: receive a batch, attach the certificate of analysis PDF, stock lands on the branch under that batch.
- Low stock and expiry warnings on the inventory page.

Deliverable: an owner can set up a shop, load suppliers, receive batches, and see gram stock per branch.

### Phase 2: Compliant sale flow (3 to 4 weeks)

The checkout for a flower sale, step by step:

1. **Practitioner on duty check.** The dispense screen refuses flower lines unless a practitioner is clocked in at this branch. Non-flower products sell normally.
2. **Patient lookup or registration.** Search by phone, passport last 4, or name. New patient: name, date of birth, ID type and number, nationality, PDPA consent, pregnancy declaration. The system refuses anyone under 20.
3. **Prescription.** Pick an active prescription or create one. The on-duty practitioner enters PT33 number, condition, maximum grams, and expiry. The budtender can photograph the paper form with the tablet camera and attach it.
4. **Cart.** Add flower by tier (1g, 3.5g, 7g) or by weighed amount typed from the scale. Each line picks the oldest batch with enough stock (first expiring, first out), with a manual override. The cart shows grams remaining on the prescription and blocks going over.
5. **Payment.** Cash with change calculation, PromptPay QR (static QR on screen plus a "paid" confirmation by staff, or a dynamic QR from the acquirer in phase 4), card via the Thai acquirer. Split payments already work.
6. **Receipt.** Abbreviated tax invoice with sequential number, VAT line, shop tax ID, and the prescription number. Print to a thermal printer. Optional Thai or English.
7. **Records.** The dispensing log, prescription grams used, batch stock, and inventory adjustments all update in one database transaction through an RPC, the same pattern as the existing `sell_*` functions.

Also in this phase: refunds that return grams to the batch and reverse the dispensing log entry, and a void with a reason and manager PIN.

Deliverable: a full compliant sale in under 90 seconds for a returning patient.

### Phase 3: Compliance reporting and audit (2 weeks)

- Dispensing register page: filter by date, practitioner, patient, batch. Export CSV and PDF.
- Monthly regulator report in the exact template from phase 0, generated per branch per month, with a "submitted on" stamp.
- Batch traceability: from a batch, see every sale it went into. From a sale, see the batch and supplier. This is what you need for a recall.
- Waste and destruction log with witness and photo.
- Prescription expiry list and patient history.
- Audit log on patient records (PDPA) and on every stock adjustment.
- Document retention: nothing in `prescriptions`, `dispensing_log`, or `pos_transactions` can be deleted, only marked.

Deliverable: the owner can hand an inspector a month's register and a batch trace in under a minute.

### Phase 4: Payments, hardware, and offline (2 to 3 weeks)

- PromptPay dynamic QR through the chosen acquirer (Opn, 2C2P, GB Prime Pay, or the bank's API) as a new `PaymentProvider`. Webhook marks the sale paid.
- Thermal receipt printing. Simplest path: a browser print stylesheet at 80mm width. Better path: ESC/POS over the local network from a small print service on the shop's PC, which also opens the cash drawer.
- Scale: most USB scales emit keyboard-style output. Support "read from scale" by focusing the grams field. Avoid Web Serial unless the pilot shop's scale needs it.
- Batch labels with a QR code. Scanning a label at the counter picks that batch.
- Offline tolerance: Thai shops lose internet. Make the dispense page a PWA that caches the catalogue and queues sales for up to a few hours, then replays them. Prescription validation stays online-only, so offline mode allows sales only against prescriptions already cached with remaining grams.

Deliverable: a sale works on a tablet with a printer, a scale, and a short internet outage.

### Phase 5: Pilot and go-live (2 to 3 weeks)

- Load the pilot shop's real products and batches.
- Two days of shadow operation: staff ring sales on the new system while the old process continues.
- Fix list, then switch.
- Train staff with a one-page Thai-language guide per role.
- Submit the Revenue Department cash register approval if the shop is VAT-registered.

## 6. Screens

POS (tablet, large touch targets):

- Dispense: patient panel on the left, product grid in the middle, cart and prescription meter on the right.
- Patients: search, register, consent, history.
- Prescriptions: list for the on-duty practitioner, create, attach scan.
- Register and drawer: existing pages.
- Sales and refunds: existing pages with batch and prescription columns added.

Back office:

- Products and price tiers.
- Batches and receiving, with certificate upload.
- Suppliers with GACP expiry warnings.
- Dispensing register and monthly report.
- Waste log.
- Staff with practitioner licence fields.
- Settings: tax ID, VAT status, invoice prefix, receipt text.
- Existing: expenses, payroll, accounting, daily report, dashboard.

## 7. Roles

| Role | Can |
|---|---|
| owner | Everything, all branches. |
| manager | Branch setup, products, batches, reports, voids, refunds. |
| front_desk (relabel "budtender" for cannabis businesses) | Dispense, register patients, take payment, open and close drawer. Cannot create prescriptions. |
| practitioner (new) | Clock in as on duty, create and edit prescriptions, view patient history. Can also dispense if given front_desk too. |

The existing `role-labels.ts` already maps internal role names to display names, so "budtender" is a label change, not a schema change.

## 8. Timeline and effort

Assumes one full-time developer working with Claude Code, and a shop owner who answers questions within a day.

| Phase | Weeks | Cumulative |
|---|---|---|
| 0 Discovery | 1 to 2 | 2 |
| 1 Foundation | 2 | 4 |
| 2 Sale flow | 3 to 4 | 8 |
| 3 Reporting | 2 | 10 |
| 4 Payments and hardware | 2 to 3 | 13 |
| 5 Pilot | 2 to 3 | 16 |

Phase 2 is the critical path. Phases 3 and 4 can overlap if a second developer joins.

Running costs for one shop: Supabase Pro at 25 USD a month covers a few shops. Vercel Pro at 20 USD a month. Acquirer fees around 1.5% to 3.65% per card transaction and 0 to 0.5% for PromptPay depending on the bank. Hardware per counter: tablet, 80mm thermal printer, cash drawer, 0.01g scale, label printer, roughly 15,000 to 25,000 THB.

## 9. Risks

1. **The law moves again.** The Cannabis and Hemp Act could change licensing or ban retail flower sales. Keep the prescription and reporting logic in its own module so it can be changed without touching the sale engine. Build the product classes so a shop can keep selling CBD and accessories if flower stops.
2. **Payments.** Stripe is out. Thai acquirers also screen cannabis merchants. If none accept the shop, you ship with cash and static PromptPay QR, which is how most shops operate today.
3. **Regulator report format.** If the provincial office wants paper, build the PDF to match their form exactly. Do not guess the columns.
4. **Patient data.** Encrypt ID numbers at rest using Supabase Vault or a server-side key, store only the last 4 digits in plain text, and log every read.
5. **Weight precision.** Grams as `numeric(10,3)` across the schema. Never use floating point for stock or prices.
6. **Spa regressions.** The integer-to-numeric change and the navigation switch touch spa code. Run the spa checkout, refund, and daily report after phase 1.

## 10. First week's tasks

1. Book the shop visits and the lawyer call.
2. Create migration 0096 with `business_type` and the `practitioner` role, and the navigation switch in `src/components/pos/pos-nav.tsx` and `src/components/admin/admin-nav.tsx`.
3. Draft the dispense screen as a static mockup and test it with one budtender for layout.
4. Ask the pilot shop's bank for PromptPay merchant QR details and ask Opn or 2C2P whether they onboard cannabis dispensaries.

## Sources used for the legal section

- Thai Cannabis Laws 2026: terms.law/Thai/cannabis/cannabis-2025-status.html
- The Thaiger, Cannabis in Thailand 2026 medical-only rules: thethaiger.com/guides/cannabis/cannabis-thailand-2026-medical-rules
- Silk Legal, Thailand Restricts Cannabis Under New Regulations: silklegal.com/thailand-restricts-cannabis-under-new-regulations-what-businesses-need-to-know/
- Juslaws, Amendment to Cannabis Law on 25 June 2025: juslaws.com/articles/amendment-cannabis-laws-25-june-2025
- Thai Cannamed, Cannabis Dispensary Licence in Thailand 2026: thaicannamed.com/cannabis-dispensary-licence-in-thailand/
- Emerhub, Guide to Starting a Cannabis Business in Thailand: emerhub.com/thailand/guide-to-starting-a-cannabis-business-in-thailand/
- Cannabis Regulations AI, Thailand 2025 recriminalization compliance: cannabisregulations.ai/cannabis-and-hemp-regulations-compliance-ai-blog/thailand-2025-cannabis-recriminalization-compliance
