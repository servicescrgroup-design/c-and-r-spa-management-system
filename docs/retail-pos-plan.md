# Plan: Retail POS for Thai Shops, with Optional Regulated-Goods Modules

Written 4 October 2026. This plan adds a general retail point of sale to the existing platform. Any shop can use it: a convenience store, a coffee roaster, a pharmacy, a vape shop, a cannabis dispensary. The features a dispensary needs are optional modules a business switches on in settings. Nothing in the core sale flow mentions cannabis.

## 1. Recommendation in one paragraph

Add a `retail` business type to this codebase, next to the existing spa type. The platform already has the slow-to-build parts: multi-business accounts with row-level security, branches, staff roles and invites, registers and cash drawers with denomination counts, products with per-branch stock and adjustment history, sales with split payments, refunds, expenses, payroll, daily reports, accounting postings, and Thai/English menus. The new work is a product-first sale screen, barcode scanning, Thai tax receipts, PromptPay, receipt printing, and a set of optional modules: batch and lot tracking, weight-based sales, age verification, customer identity records, prescription-controlled products, a licensed-person-on-duty rule, and regulator reports. A shop turns on only the modules its goods require. One developer can reach a pilot shop in about 10 to 14 weeks, and the regulated modules add 3 to 4 weeks on top for the first regulated shop.

## 2. Module design

Each module is a boolean in `organizations.settings` with its own migration, its own UI, and its own checks in the checkout RPC. Modules only add rules. A shop with every module off gets a plain retail POS.

| Module | Setting key | What it adds | Who needs it |
|---|---|---|---|
| Batch tracking | `modules.batches` | Lot numbers on receiving, expiry dates, first-expiring-first-out picking, recall trace from supplier to sale, waste log | Pharmacies, food and drink, cosmetics, cannabis |
| Weight-based sales | `modules.weight` | Products sold by gram or kilogram, price tiers per weight (100 g, 250 g, 1 kg), scale input, numeric stock | Coffee, tea, bulk food, butchers, cannabis |
| Age verification | `modules.age_check` | Minimum age per product category, ID check prompt at checkout, refusal log | Alcohol, tobacco, vape, cannabis |
| Customer identity | `modules.identity` | ID or passport capture, nationality, PDPA consent, encrypted ID number, access log | Pharmacies, pawn shops, SIM sellers, cannabis |
| Controlled products | `modules.controlled` | Product class `controlled`. Sale of a controlled line needs an authorisation record on file (prescription, permit, licence) with a quantity cap and expiry. Writes an append-only dispensing register. | Pharmacies, cannabis, some chemicals |
| Licensed person on duty | `modules.licensed_duty` | A `licensed` role with licence number and expiry. Controlled lines sell only while a licensed person is clocked in at the branch. | Pharmacies (pharmacist on duty), cannabis (practitioner on site) |
| Supplier certification | `modules.supplier_certs` | Certificates on supplier records (GACP, GMP, FDA licence) with expiry warnings. Receiving refuses a batch from a supplier whose certificate has lapsed. | Pharmacies, food, cannabis |
| Regulator reports | `modules.regulator_reports` | Monthly report builder over the dispensing register, per branch, with a template chosen in settings and a "submitted on" stamp | Any shop that reports to a government office |

A cannabis dispensary turns on all eight. A coffee roaster turns on `weight` and maybe `batches`. A convenience store turns on `age_check` for beer and cigarettes and nothing else.

## 3. What Thai rules the modules cover

The modules are shaped by Thai rules that apply to several kinds of shop. Confirm the regulated ones with a lawyer before building, since cannabis rules changed three times between June 2025 and April 2026.

| Rule | Applies to | Module |
|---|---|---|
| VAT 7% once revenue passes 1.8 million THB a year. A POS that prints abbreviated tax invoices needs Revenue Department approval of the cash register. | Every shop | Core: VAT-inclusive pricing, abbreviated tax invoice (ใบกำกับภาษีอย่างย่อ), sequential invoice numbers per register |
| Personal Data Protection Act. Health data and ID numbers are sensitive. | Any shop storing customer identity | `identity`: consent, encryption, access log, retention policy |
| Minimum purchase age 20 for alcohol, tobacco, vape products, and cannabis. | Those shops | `age_check` |
| Pharmacist must be present for the sale of dangerous drugs. | Pharmacies | `licensed_duty`, `controlled` |
| Cannabis flower is a controlled herb (25 June 2025). Every flower sale needs a PT33 (ภท.33) prescription. Shops keep a dispensing log with patient name or passport, practitioner, product, quantity, and report monthly. A licensed practitioner must be on site. Flower must come from GACP-certified farms with batch records. Paper PT33 kept 1 year, accounts 3 years. CBD under 0.2% THC is exempt. | Cannabis | `controlled`, `licensed_duty`, `identity`, `batches`, `supplier_certs`, `regulator_reports` |

Questions to settle in week 1 for a regulated pilot shop:

1. Does the licensed person issue the authorisation at the counter, or do customers arrive with one? The flow in section 6 supports both.
2. The exact columns and file format of the monthly report the local office accepts.
3. Which Thai acquirer takes card payments for the shop's goods. Stripe prohibits cannabis merchants and restricts tobacco and vape, so the existing Stripe integration stays for the spa and for ordinary retail only.

## 4. Architecture: what you reuse and what you add

Reuse unchanged:

- Auth, business signup, staff invites, the `owner` / `manager` / `front_desk` roles, multi-business RLS (`app.current_org_id`, `app.fill_org_id`).
- Branches, registers, cash drawer sessions, denomination counting, shared drawers, shift reports.
- `products`, `product_categories`, `branch_inventory`, `inventory_adjustments`, product images and branch overrides.
- `pos_transactions`, `pos_transaction_items`, `pos_payments`, `pos_discounts`, refunds, split payments.
- Expenses, vendors, payroll engine, accounting postings, daily report, owner dashboard.
- Thai and English translations, `auto-translate` component, store colours.

Add:

- `organizations.business_type` enum (`spa`, `retail`). Navigation, dashboard cards, and the sale screen switch on it. Spa-only modules (therapists, queue, rooms and beds, booking page) stay hidden for retail businesses.
- A product-first sale screen under `src/app/(pos)/pos/sell/` with a barcode field, category grid, cart, and payment panel. The spa `sale` page stays as it is.
- Module settings in `organizations.settings.modules`, read by one helper, `src/lib/modules.ts`, so every check is a single `hasModule(org, "batches")` call.
- A `licensed` value on `role_type`.
- A payment provider for PromptPay QR and a Thai acquirer behind the existing `PaymentProvider` interface in `src/lib/payments/provider.ts`.

Everything stays in one repo and one Supabase project. Each shop is its own `organizations` row, so RLS isolation already applies.

## 5. Data model

Core migrations, continuing from 0096:

```
0096_business_type_and_modules.sql
  organizations.business_type enum default 'spa'
  organizations.settings.modules jsonb (all false by default)
  organizations: tax_id text, legal_name_th text, vat_registered boolean
  role_type add value 'licensed'

0097_retail_products.sql
  products: barcode text, brand text, sold_by enum (unit, weight) default 'unit'
            min_age integer null, product_class enum (standard, controlled) default 'standard'
  product_barcodes (product_id, barcode)        -- one product, several pack sizes
  branch_inventory.quantity_on_hand: integer -> numeric(10,3)
  pos_transaction_items.quantity:     integer -> numeric(10,3)

0098_tax_invoices.sql
  pos_registers: tax_invoice_prefix text, next_invoice_no integer
  pos_transactions: invoice_no text, vat_cents integer
  pos_payment_method add value 'promptpay', 'card_local'
```

Module migrations, each one independent and safe to run on a shop that never uses it:

```
0099_module_weight.sql
  product_price_tiers (product_id, amount numeric, unit text, price_cents)

0100_module_batches.sql
  product_batches (org_id, product_id, supplier_id, batch_no, received_on,
                   expiry_date, quantity_received numeric, quantity_remaining numeric,
                   certificate_file_path, attributes jsonb)
  inventory_adjustments.batch_id, pos_transaction_items.batch_id
  waste_log (branch_id, product_id, batch_id, quantity, reason, witness_staff_id, photo_path)

0101_module_supplier_certs.sql
  supplier_certificates (vendor_id, kind text, number text, expires_on date, file_path)

0102_module_identity.sql
  customers: id_type enum (thai_id, passport, other), id_number_encrypted text,
             id_last4 text, nationality text, consent_at timestamptz, declarations jsonb
  customer_access_log (customer_id, staff_id, action, at)

0103_module_age_check.sql
  age_check_log (transaction_id, staff_id, method text, passed boolean, at)

0104_module_controlled.sql
  licensed_staff (staff_id, licence_type text, licence_no text, expires_on date)
  authorisations (org_id, customer_id, kind text, reference_no text,
                  issued_by_staff_id, issued_on, expires_on, condition_code text,
                  max_quantity numeric, quantity_used numeric default 0,
                  scan_file_path, status)
  pos_transactions: authorisation_id, licensed_on_duty_staff_id
  dispensing_log (org_id, branch_id, transaction_id, customer_id, authorisation_id,
                  licensed_staff_id, product_id, batch_id, quantity, dispensed_at)
  -- append-only, written by trigger for every controlled line

0105_module_licensed_duty.sql
  licensed_shifts (branch_id, staff_id, started_at, ended_at)

0106_module_regulator_reports.sql
  regulator_reports (org_id, branch_id, period_month date, template text,
                     file_path, generated_at, submitted_at)
```

The `attributes jsonb` on batches and the `kind` text on authorisations hold the goods-specific fields. A cannabis shop stores `thc_percent`, `cbd_percent`, `strain` in attributes and uses kind `pt33`. A pharmacy uses kind `prescription`. The schema does not need to know.

Changing `quantity` from integer to numeric touches the spa sale flow. Do it first, in phase 1, and run the spa checkout and refund end to end afterwards.

## 6. Feature phases

### Phase 0: Discovery (1 week)

- Visit the pilot shop and one shop of a different kind. Record the flow from the customer walking in to leaving.
- List which modules each pilot shop needs.
- Pick the acquirer and get PromptPay merchant QR details from the shop's bank.
- Decide hardware: tablet or laptop, barcode scanner, receipt printer, scale if `weight` is on, label printer if `batches` is on.

Deliverable: a one-page requirements sheet per pilot shop with its module list.

### Phase 1: Foundation (2 weeks)

- `business_type`, module settings, and the navigation switch. A retail owner signing up sees Products, Stock, Customers, Sell, Register, Reports, Staff, Expenses.
- Barcodes, brands, numeric stock, price tiers.
- Settings page with the module toggles and the tax fields.
- Stock receiving against a vendor, with low stock warnings.

Deliverable: an owner can set up a shop, load products with barcodes, receive stock, and see stock per branch.

### Phase 2: Core sale flow (3 weeks)

The Sell screen, step by step:

1. **Scan or tap.** Barcode field has focus by default. Scanning adds a line. The category grid covers products without barcodes.
2. **Cart.** Quantity, line discount, whole-sale discount with reason, customer attach by phone (optional).
3. **Payment.** Cash with change calculation, PromptPay QR shown on screen with staff confirmation, card via the Thai acquirer, split payments.
4. **Receipt.** Abbreviated tax invoice with sequential number, VAT line, shop tax ID. Print to a thermal printer. Thai or English.
5. **Records.** Sale, payments, stock adjustments, and accounting postings in one database transaction through an RPC, the same pattern as the existing `sell_*` functions.

Also: refunds that return stock, void with reason and manager PIN, held carts, a quick "open drawer" button, and the existing shift close.

Deliverable: a scan-to-receipt sale in under 30 seconds.

### Phase 3: Payments, hardware, and offline (2 to 3 weeks)

- PromptPay dynamic QR through the chosen acquirer as a new `PaymentProvider`. Webhook marks the sale paid.
- Thermal receipt printing. Simplest path: a browser print stylesheet at 80 mm. Better path: ESC/POS over the local network from a small print service on the shop's PC, which also opens the cash drawer.
- USB barcode scanners work as keyboards. No driver work.
- Offline tolerance: Thai shops lose internet. Make the Sell page a PWA that caches the catalogue and queues sales for a few hours, then replays them. Controlled-product checks stay online-only.

Deliverable: a sale works on a tablet with a scanner and printer through a short internet outage.

### Phase 4: Optional modules (3 to 4 weeks, only the ones a pilot shop needs)

Built in dependency order. Each one ships behind its toggle and leaves the core flow untouched when off.

- **weight** (3 days): price tiers, scale input on the grams field, numeric cart lines.
- **batches** (1 week): receiving with lot and expiry, first-expiring-first-out picking, batch on each sale line, recall trace, waste log, QR batch labels.
- **supplier_certs** (2 days): certificates with expiry on vendor records, receiving refuses lapsed suppliers.
- **age_check** (2 days): minimum age per category, ID prompt at checkout, refusal log.
- **identity** (4 days): ID capture, encryption with a server-side key, last 4 in plain text, PDPA consent screen, access log.
- **licensed_duty** (3 days): licensed role, clock-in, duty check in the checkout RPC.
- **controlled** (1 week): authorisation records with quantity caps and expiry, scan attach via tablet camera, authorisation picker in the cart, remaining-quantity meter, dispensing register, refunds that reverse the register entry.
- **regulator_reports** (3 days): monthly builder with a template per shop type, CSV and PDF, submitted stamp.

Deliverable for a cannabis pilot: a full compliant sale for a returning patient in under 90 seconds.

### Phase 5: Pilot and go-live (2 weeks)

- Load the pilot shop's real products and stock.
- Two days of shadow operation.
- Fix list, then switch.
- Train staff with a one-page Thai guide per role.
- Submit the Revenue Department cash register approval if the shop is VAT-registered.

## 7. Screens

POS (tablet, large touch targets):

- Sell: barcode field and category grid in the middle, cart and payment on the right. With `identity` or `controlled` on, a customer panel appears on the left.
- Customers: search, register, consent, history. Identity fields appear only with `identity` on.
- Authorisations (`controlled`): list for the licensed person on duty, create, attach scan.
- Register, drawer, sales, refunds: existing pages, with batch and authorisation columns added when those modules are on.

Back office:

- Products, barcodes, price tiers.
- Stock and receiving. Batch fields appear with `batches` on.
- Vendors. Certificates appear with `supplier_certs` on.
- Dispensing register and regulator reports (`controlled`, `regulator_reports`).
- Waste log (`batches`).
- Staff, with licence fields for the `licensed` role.
- Settings: module toggles, tax ID, VAT status, invoice prefix, receipt text.
- Existing: expenses, payroll, accounting, daily report, dashboard.

## 8. Roles

| Role | Can |
|---|---|
| owner | Everything, all branches. |
| manager | Branch setup, products, stock, reports, voids, refunds. |
| front_desk (label "cashier" for retail) | Sell, register customers, take payment, open and close drawer. |
| licensed (new, only with `licensed_duty` or `controlled`) | Clock in as on duty, create and edit authorisations, view customer history. Can also sell if given front_desk too. |

`role-labels.ts` already maps internal role names to display names per business, so "cashier" and "pharmacist" or "practitioner" are label changes, not schema changes.

## 9. Timeline and effort

Assumes one full-time developer working with Claude Code, and a shop owner who answers questions within a day.

| Phase | Weeks | Cumulative |
|---|---|---|
| 0 Discovery | 1 | 1 |
| 1 Foundation | 2 | 3 |
| 2 Core sale flow | 3 | 6 |
| 3 Payments and hardware | 2 to 3 | 9 |
| 4 Modules (all eight) | 3 to 4 | 13 |
| 5 Pilot | 2 | 15 |

A plain retail shop with no modules reaches pilot at week 11. A cannabis dispensary reaches pilot at week 15. Phases 3 and 4 can overlap with a second developer.

Running costs: Supabase Pro at 25 USD a month covers several shops. Vercel Pro at 20 USD a month. Acquirer fees around 1.5% to 3.65% per card transaction and 0 to 0.5% for PromptPay depending on the bank. Hardware per counter: tablet, scanner, 80 mm thermal printer, cash drawer, roughly 10,000 to 15,000 THB. Add 3,000 to 8,000 THB for a 0.01 g scale and a label printer if the shop needs them.

## 10. Risks

1. **Regulated goods rules change.** Cannabis rules may change again under the Cannabis and Hemp Act. Because the rules live in modules, a shop can switch `controlled` off and keep selling its unregulated lines on the same system.
2. **Payments.** Stripe is out for cannabis, tobacco, and vape. Thai acquirers screen those merchants too. The fallback is cash and static PromptPay QR, which is how most of those shops run today.
3. **Module interaction bugs.** Test the checkout RPC with every module combination the pilot shops use, plus all off and all on.
4. **Customer data.** Encrypt ID numbers at rest, keep only the last 4 digits in plain text, and log every read.
5. **Precision.** Quantities as `numeric(10,3)` across the schema. Never floating point for stock or prices.
6. **Spa regressions.** The integer-to-numeric change and the navigation switch touch spa code. Run the spa checkout, refund, and daily report after phase 1.

## 11. First week's tasks

1. Book the pilot shop visits.
2. Create migration 0096 with `business_type`, module settings, and the `licensed` role, plus the navigation switch in `src/components/pos/pos-nav.tsx` and `src/components/admin/admin-nav.tsx`.
3. Write `src/lib/modules.ts` with `hasModule` and the module list, and the settings page toggles.
4. Draft the Sell screen as a static mockup and test the layout with one cashier.
5. Ask the pilot shop's bank for PromptPay merchant QR details and ask Opn or 2C2P whether they onboard the shop's category.

## Sources used for the regulated-goods rules

- Thailand Cannabis Laws 2026: terms.law/Thai/cannabis/cannabis-2025-status.html
- The Thaiger, Cannabis in Thailand 2026 medical-only rules: thethaiger.com/guides/cannabis/cannabis-thailand-2026-medical-rules
- Silk Legal, Thailand Restricts Cannabis Under New Regulations: silklegal.com/thailand-restricts-cannabis-under-new-regulations-what-businesses-need-to-know/
- Juslaws, Amendment to Cannabis Law on 25 June 2025: juslaws.com/articles/amendment-cannabis-laws-25-june-2025
- Thai Cannamed, Cannabis Dispensary Licence in Thailand 2026: thaicannamed.com/cannabis-dispensary-licence-in-thailand/
- Emerhub, Guide to Starting a Cannabis Business in Thailand: emerhub.com/thailand/guide-to-starting-a-cannabis-business-in-thailand/
