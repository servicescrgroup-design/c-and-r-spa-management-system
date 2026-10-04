# POS Build List: Front-End POS, Teamwork Back End, and POS Back Office

Written 4 October 2026. This is the full list of what to build, in build order. It pulls the proven features from the C and R spa system already in this repo and adds a retail sale flow plus a set of compliance modules that each business turns on or off to match its licence.

Entry flow:

```
/sign-in  (one page, staff and owners)
   |
   v
/choose   (two large buttons)
   |-- Front-End POS  --> /pos          (tablet layout, selling and the shift)
   |-- Back-End System --> /backend     (hub page with two icons)
                               |-- Teamwork        --> /backend/team   (people, time, pay, checklists)
                               |-- POS Back Office --> /backend/office (products, stock, money, reports, settings)
```

A cashier with only the front desk role goes straight to `/pos` after sign-in. Anyone with manager or owner rights sees `/choose`. The hub at `/backend` shows only the icons the person's role allows.

---

## Part A. Platform and stack

Keep the current stack. It is already deployed and working for the spa.

| Layer | Choice | Already in repo |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript | yes |
| Styling | Tailwind 4, lucide icons, the `ui/` button, card, input, label components | yes |
| Database and auth | Supabase Postgres, Supabase Auth (email, phone), row-level security, RPC functions in `app` schema with `public` wrappers | yes |
| Storage | Supabase Storage for product images, HR documents, scans | yes |
| Payments | `PaymentProvider` interface, Stripe adapter | yes. Add PromptPay and a Thai acquirer adapter |
| Hosting | Vercel | yes |
| Validation | zod | yes |
| Tests | Playwright installed | yes, no tests yet |

Build tasks:

- [ ] A1. Add `organizations.business_type` enum: `spa`, `retail`. Default `spa` for the existing rows.
- [ ] A2. Add `organizations.settings.modules` JSON with every module flag false. Add `src/lib/modules.ts` with `MODULES` list and `hasModule(org, key)`.
- [ ] A3. Add `licensed` to `role_type`. Keep `therapist` for spa businesses.
- [ ] A4. Update `role-labels.ts` to label roles per business type (retail: Owner, Admin (Backend Team), Cashier, Licensed person).
- [ ] A5. Change `branch_inventory.quantity_on_hand` and `pos_transaction_items.quantity` from integer to `numeric(10,3)`. Run the spa checkout, refund, and daily report afterwards.
- [ ] A6. Add `promptpay` and `card_local` to `pos_payment_method`.
- [ ] A7. Add Playwright smoke tests for sign-in, open drawer, one sale, close drawer. These guard every later change.

---

## Part B. Sign-in and the chooser

### B1. Sign-in page `/sign-in`

- [ ] One form for staff and owners: email or phone, password. Reuse `staff-login-form.tsx` and `phone-auth-form.tsx`.
- [ ] Business picker when the same email belongs to more than one business (the multi-business tables already support this).
- [ ] Strong password rules already in `password-rules.ts`.
- [ ] Forgot password by email link.
- [ ] Language toggle Thai/English in the corner (existing `language-toggle.tsx`).
- [ ] After sign-in: front desk only → `/pos`. Manager or owner → `/choose`. Licensed role only → `/pos`. Customer accounts never reach these pages; they go to `/account`.

### B2. Chooser page `/choose`

- [ ] Two large tiles: Front-End POS and Back-End System. Each shows the business name, branch, and the store colour already in `store-colors.ts`.
- [ ] Remember the last choice per device in local storage and offer a "go there again" shortcut, never an automatic redirect.
- [ ] Sign-out link.

### B3. Back-end hub `/backend`

- [ ] Two icons: Teamwork and POS Back Office. Hide an icon when the role has no page behind it.
- [ ] Small status strip under the icons: open drawers right now, today's sales, staff clocked in, items under reorder level.
- [ ] Global search (existing `admin-search.tsx` and `search-index.ts`) that finds products, customers, staff, sales.

---

## Part C. Front-End POS `/pos`

Tablet-first. Large touch targets, one screen per job, no scrolling in the cart. Taken from the spa POS and reshaped for retail.

### C1. Register and shift

- [ ] Open drawer with a float count by denomination (existing `denomination-counter.tsx`, `open-drawer-form.tsx`).
- [ ] Shared drawers: several cashiers on one drawer with a members list (existing `cash_drawer_members`).
- [ ] Switch or join a drawer (existing `drawer-switch-button.tsx`, `drawer-join-button.tsx`).
- [ ] Close drawer: count by denomination, system expected cash, difference, cash to send to the office excluding the float kept (existing `close-drawer-form.tsx` and `drawer-cash.ts`).
- [ ] One store per day per device setting (existing migration 0056).
- [ ] Live clock in the header (existing).
- [ ] Register access per staff member (existing `staff-register-access.tsx`).

### C2. Sell screen `/pos/sell` (new, product-first)

- [ ] Barcode field with focus by default. A USB scanner types into it. Scan adds a line or raises the quantity.
- [ ] Category tiles and a product grid with images (existing `product-catalog.tsx` images and branch overrides).
- [ ] Search by name, SKU, barcode, brand.
- [ ] Cart: quantity stepper, line discount, line note, remove.
- [ ] Whole-sale discount, percent or fixed, with a reason and the staff member who applied it (existing `pos_discounts`).
- [ ] Attach a customer by phone or name, or create one in two fields (existing `findOrCreateCustomer`).
- [ ] Hold a cart and recall it later. Several held carts per register.
- [ ] Price tiers for weight products when the `weight` module is on (see Part F).
- [ ] Customer panel on the left appears only when `identity` or `controlled` is on.
- [ ] Tax display: VAT-inclusive price with the VAT part shown on the receipt.

### C3. Payment

- [ ] Cash with quick-amount buttons and change due.
- [ ] PromptPay: show the branch QR on screen, cashier taps "paid" after seeing the bank app. Dynamic QR with automatic confirmation when the acquirer adapter is live.
- [ ] Card through the Thai acquirer adapter. Stripe stays available for businesses whose goods Stripe accepts.
- [ ] Split payment across methods and card surcharge (existing migration 0017).
- [ ] Gift card redeem, store credit, package credit (existing tables and flows).
- [ ] Tips on card or cash (existing `tips` table and posting).
- [ ] Deposit applied to a sale (existing deposit ledger) for businesses that take bookings.

### C4. Receipt

- [ ] Thai abbreviated tax invoice layout: shop legal name, tax ID, branch number, sequential invoice number per register, date and time, lines, VAT 7% line, payment method, cashier.
- [ ] Print to an 80 mm thermal printer. Step one: browser print stylesheet. Step two: ESC/POS over the local network with a cash drawer kick.
- [ ] Email or LINE a receipt link when the customer is attached.
- [ ] Reprint from the sales list.

### C5. Sales list and refunds

- [ ] Today's sales with filters (existing `sales-list.tsx` and `sale-detail-panel.tsx`).
- [ ] Edit a sale before the shift closes (existing migration 0071).
- [ ] Void with reason and manager PIN. Delete sale for owners only (existing migration 0072).
- [ ] Refund whole or partial, stock goes back, payments reversed per method (existing refund flow).

### C6. Expenses from the till

- [ ] Petty cash out with category, vendor, photo of the slip (existing `expense-composer.tsx`, `pos-expense-list.tsx`).
- [ ] Transport fee and other configurable expense options (existing migration 0087).

### C7. Shift report

- [ ] Sales by method, refunds, expenses, cash expected, cash counted, difference, staff on shift (existing `daily-report-view.tsx`).
- [ ] Print and send to the office.

### C8. Checklist

- [ ] Opening and closing checklists per store with a daily board (existing `checklist-board.tsx`).

### C9. Appointments and queue (spa businesses only, hidden for retail)

- [ ] Keep the existing queue, appointments, bed tracking, and therapist flow untouched behind `business_type = 'spa'`.

### C10. Offline tolerance

- [ ] Sell page as a PWA. Cache the catalogue and prices. Queue sales for up to 4 hours and replay. Show a clear offline badge. Controlled-product checks stay online-only.

---

## Part D. Back End: Teamwork `/backend/team`

Everything about people, time, and pay. Pulled from the spa system's HR, scheduling, and payroll.

### D1. Staff

- [ ] Staff list by branch with roles and register access (existing `staff` pages).
- [ ] Invite by email with a signed link (existing `invite-staff-form.tsx`, `staff-invite/[token]`).
- [ ] Role editor: owner, admin, cashier, licensed, therapist for spa (existing `staff-role-editor.tsx`).
- [ ] HR detail: join date, documents, required document checklist, certifications with expiry (existing `staff-hr-detail.tsx`, `certifications-manager.tsx`, `required-documents-form.tsx`).
- [ ] Licence fields for the licensed role: licence type, number, expiry, scan. Warn 30 days before expiry.
- [ ] Freelance or contract workers (existing migration 0036).

### D2. Time and attendance

- [ ] Clock in and out with audit (existing `therapist_clock_sessions`, migration 0058). Rename in the UI to "clock sessions" for retail.
- [ ] Close stale sessions automatically (existing migration 0077).
- [ ] Licensed-on-duty clock-in when the `licensed_duty` module is on (Part F).

### D3. Scheduling

- [ ] Shift calendar per branch (existing `schedule-calendar.tsx`, `new-schedule-form.tsx`).
- [ ] Rooms and beds stay spa-only.

### D4. Payroll

- [ ] Payroll periods, entries, adjustments, day locks (existing payroll engine, migration 0029).
- [ ] Commission rules per product category for retail (existing `commission_rules` table used for services today).
- [ ] Guarantees and waivers (existing migration 0060 and 0082) kept for spa, optional for retail.
- [ ] Cashier payroll board (existing `receptionist-payroll-board.tsx`).
- [ ] Export to CSV (existing `payroll/export/route.ts`).
- [ ] Payout change log (existing migration 0026).

### D5. Checklists

- [ ] Checklist editor per store and per day type (existing `checklist-editor.tsx`).

### D6. Staff portal

- [ ] A personal page where staff see their shifts, clock sessions, earnings, and documents (existing therapist portal, generalised).

---

## Part E. Back End: POS Back Office `/backend/office`

Everything about goods, money, and reports.

### E1. Dashboard

- [ ] Owner dashboard with revenue chart, branch comparison, today versus last week (existing `owner-dashboard-view.tsx`, `revenue-chart.tsx`).
- [ ] Get-started checklist for a new business (existing `setup-progress.ts`, `try-it-checklist.tsx`).

### E2. Products

- [ ] Product list, categories with images and colours (existing `category-manager.tsx`).
- [ ] Product edit: name in Thai and English plus the other menu languages with auto-translate (existing `service-language-fields.tsx` pattern), SKU, barcode list, brand, cost, retail price, images in order, active flag, track-stock flag.
- [ ] Unit label and amount (existing migration 0033).
- [ ] Per-branch price and availability overrides (existing `branch_product_overrides`).
- [ ] Combos and bundles (existing `service_combos` pattern, applied to products).
- [ ] Packages and gift cards for businesses that sell them (existing).
- [ ] Minimum age per category when `age_check` is on.
- [ ] Product class `standard` or `controlled` when `controlled` is on.

### E3. Stock

- [ ] Stock per branch with reorder level and reorder quantity (existing `branch_inventory`).
- [ ] Receive stock against a vendor with cost (existing `receive-stock-form.tsx`).
- [ ] Adjust with reason: damage, count correction, transfer (existing `adjust-stock-form.tsx`, editable adjustments migration 0045).
- [ ] Stock history per product (existing `inventory-history.tsx`).
- [ ] Transfer between branches.
- [ ] Stock count sheet: print, count, enter, post the differences.
- [ ] Low stock and expiry lists.

### E4. Vendors and purchasing

- [ ] Vendor records (existing `vendors`, `new-vendor-form.tsx`).
- [ ] Purchase orders: draft, sent, received, with partial receiving.
- [ ] Certificates on vendors when `supplier_certs` is on.

### E5. Sales and customers

- [ ] All transactions across branches with filters and export (existing `transactions` page).
- [ ] Customer list, profile, purchase history, notes, marketing opt-in (existing `customers`).
- [ ] Identity fields and access log when `identity` is on.

### E6. Money

- [ ] Registers and drawer sessions per branch with shift history (existing `registers-manager.tsx`, `register-shifts.tsx`).
- [ ] Expenses with categories, vendors, approval, and photo (existing `expense-table.tsx`).
- [ ] Accounting: chart of accounts, journal entries, periods, automatic postings from sales, refunds, tips, expenses, deposits (existing migrations 0008, 0009, 0084).
- [ ] Daily report per branch and consolidated (existing `daily-report-page.tsx`).

### E7. Reports

- [ ] Sales by product, category, hour, cashier, payment method.
- [ ] Margin by product using `cogs_cents` already on each line.
- [ ] Stock value and turnover.
- [ ] Refund and discount report with reasons.
- [ ] Export CSV and PDF.

### E8. Branches and settings

- [ ] Branches with address, phone, timezone, directions, brand colour, order (existing `branch-settings-form.tsx`, migrations 0032, 0043, 0049, 0088).
- [ ] Business settings: legal name Thai and English, tax ID, VAT registered, invoice prefix, receipt header and footer text.
- [ ] Licence profile page (Part F) with module toggles and parameters.
- [ ] Public business page and booking page remain for spa businesses (existing `/b/[slug]`, `/book`).

---

## Part F. Compliance modules, switched on per licence

Each module is a toggle on the Licence profile page under POS Back Office settings. Every module has its own migration, its own UI pieces, and its own check inside the checkout RPC. With all modules off, the system is a plain retail POS. Business owners set the parameters themselves to match the law their licence falls under.

### F1. Licence profile page `/backend/office/settings/licence`

- [ ] Licence type and number, issuing office, expiry date, scan upload. Warn 60 days before expiry.
- [ ] Toggle per module with a one-line description of what it changes.
- [ ] Parameters per module (listed below).
- [ ] Preset buttons that set the toggles for common cases: Plain retail, Alcohol and tobacco, Pharmacy, Cannabis dispensary (Thailand, 2025 rules). A preset is only a starting point; every field stays editable.
- [ ] Change log: who changed which toggle and when.

### F2. Module: batches `modules.batches`

Parameters: require batch on receiving (yes/no), picking rule (first expiring first out, or manual), block sale of expired stock (yes/no).

- [ ] `product_batches`: product, vendor, batch number, received date, expiry date, quantity received, quantity remaining, certificate file, attributes JSON (any goods-specific values such as potency, origin, grade).
- [ ] Receiving form gains batch fields. Stock adjustments and sale lines carry `batch_id`.
- [ ] Cart picks the batch by rule, cashier can override.
- [ ] Batch labels with QR code. Scanning a label picks that batch.
- [ ] Recall trace: from a batch to every sale and customer, from a sale to its batch and vendor.
- [ ] Waste and destruction log with reason, witness, photo.

### F3. Module: weight `modules.weight`

Parameters: unit (g or kg), decimal places, scale input mode (keyboard wedge or manual).

- [ ] `products.sold_by = 'weight'`.
- [ ] `product_price_tiers`: amount, unit, price. Example tiers 1 g, 3.5 g, 7 g, 100 g, 1 kg.
- [ ] Cart line accepts a weight. Price picks the tier or the per-unit price.
- [ ] Stock in the same unit.

### F4. Module: age_check `modules.age_check`

Parameters: minimum age (default 20), method required (visual, ID scan, ID number entry), log refusals (yes/no).

- [ ] `product_categories.min_age`.
- [ ] Checkout prompt when the cart contains an age-limited line. Cashier confirms the method used.
- [ ] `age_check_log` with pass or refusal.

### F5. Module: identity `modules.identity`

Parameters: ID types accepted (Thai ID, passport, other), fields required, consent text in Thai and English, retention period in months.

- [ ] Customer fields: ID type, encrypted ID number, last 4 in plain text, nationality, consent timestamp, declarations JSON (for example a self-declaration a licence requires).
- [ ] Consent screen at registration, shown on the tablet to the customer.
- [ ] `customer_access_log` on every read of an identity record.
- [ ] Retention job that flags records past the retention period for review.

### F6. Module: controlled `modules.controlled`

Parameters: authorisation kind label (prescription, permit, licence), reference number format, default validity in days, quantity cap unit, allow issue at counter (yes/no), scan required (yes/no).

- [ ] `products.product_class = 'controlled'`.
- [ ] `authorisations`: customer, kind, reference number, issued by, issued on, expires on, condition or purpose code, maximum quantity, quantity used, scan file, status.
- [ ] Cart refuses a controlled line without an active authorisation with enough quantity left.
- [ ] Authorisation picker and remaining-quantity meter in the cart.
- [ ] Issue-at-counter form for the licensed role when allowed.
- [ ] `dispensing_log`: append-only, one row per controlled line, written by trigger. Refund writes a reversing row.
- [ ] Dispensing register page with filters and export.

### F7. Module: licensed_duty `modules.licensed_duty`

Parameters: which product classes need a licensed person present, grace minutes after clock-out.

- [ ] `licensed_shifts` with clock in and out per branch.
- [ ] Checkout RPC refuses the listed classes when nobody licensed is on duty.
- [ ] Each sale records the licensed person on duty.
- [ ] Dashboard badge showing who is on duty now.

### F8. Module: supplier_certs `modules.supplier_certs`

Parameters: certificate kinds required (free text list, for example GACP, GMP, FDA licence), block receiving when lapsed (yes/no).

- [ ] `supplier_certificates`: vendor, kind, number, expiry, file.
- [ ] Receiving checks the required kinds and expiry.
- [ ] Expiry warnings on the vendor list.

### F9. Module: regulator_reports `modules.regulator_reports`

Parameters: reporting office name, period (monthly or quarterly), template (CSV columns or a PDF form), due day.

- [ ] Report builder over `dispensing_log`, batches, and waste for a branch and period.
- [ ] Generate, download, mark submitted with date and who submitted.
- [ ] Reminder on the hub when a report is due in 7 days.

### F10. Preset: Cannabis dispensary (Thailand, rules as of October 2026)

What the preset sets, so an owner can see it and change it. Confirm with a lawyer; the rules changed in June 2025, January 2026, and April 2026.

| Setting | Value | Reason |
|---|---|---|
| batches | on, require batch, block expired | Flower must come from GACP farms with batch records |
| weight | on, grams, 2 decimals | Flower sells by weight |
| age_check | on, minimum 20 | Legal minimum age |
| identity | on, Thai ID or passport, consent text, 36 months retention | Dispensing log needs name or passport; PDPA; 3-year accounts retention |
| controlled | on, kind "PT33 prescription", 30 days validity, cap in grams, issue at counter allowed, scan required | Every flower sale needs a PT33; practitioners issue on site; paper kept 1 year |
| licensed_duty | on, class controlled | A licensed practitioner must be on site |
| supplier_certs | on, kinds GACP, block when lapsed | GACP sourcing |
| regulator_reports | on, monthly, provincial health office | Monthly reporting |
| Product class | flower products `controlled`; CBD under 0.2% THC and accessories `standard` | CBD exemption |

Other presets: Plain retail sets everything off. Alcohol and tobacco sets `age_check` only. Pharmacy sets `batches`, `identity`, `controlled` with kind "prescription", `licensed_duty`, `supplier_certs`.

---

## Part G. Data model summary

New tables and columns, in migration order after 0095.

```
0096  organizations.business_type, settings.modules, tax_id, legal_name_th, vat_registered
      role_type + 'licensed'
0097  products.barcode, brand, sold_by, product_class; product_barcodes
      product_categories.min_age
      numeric quantities on branch_inventory and pos_transaction_items
0098  pos_registers.tax_invoice_prefix, next_invoice_no
      pos_transactions.invoice_no, vat_cents
      pos_payment_method + 'promptpay', 'card_local'
0099  held_carts (register, staff, cart json, created_at)
0100  purchase_orders, purchase_order_lines
0101  stock_transfers, stock_counts, stock_count_lines
0102  licence_profiles (org, licence_type, number, office, expires_on, file, change_log)
0103  module weight: product_price_tiers
0104  module batches: product_batches, batch_id columns, waste_log
0105  module supplier_certs: supplier_certificates
0106  module identity: customer identity columns, customer_access_log
0107  module age_check: age_check_log
0108  module controlled: licensed_staff, authorisations, dispensing_log,
      pos_transactions.authorisation_id, licensed_on_duty_staff_id
0109  module licensed_duty: licensed_shifts
0110  module regulator_reports: regulator_reports
```

Rules that apply to all of it:

- Every table carries `org_id`, filled by the existing `app.fill_org_id` trigger, with the existing restrictive RLS policy.
- Money in integer cents, quantities in `numeric(10,3)`.
- Nothing in `pos_transactions`, `authorisations`, `dispensing_log`, or `audit_log` is hard-deleted.

---

## Part H. Server functions (RPC)

Follow the existing pattern: a function in the `app` schema, a `public` wrapper, called from a server action in `src/lib/`.

- [ ] `sell_retail(cart, payments, customer, authorisation, batch picks)`: one transaction that validates every module rule, writes the sale, payments, stock adjustments, dispensing log, accounting postings, and returns the invoice number.
- [ ] `refund_retail(transaction, lines, method)`: reverses stock, payments, dispensing log, postings.
- [ ] `hold_cart`, `recall_cart`.
- [ ] `receive_stock(vendor, lines with batch)`, `transfer_stock`, `post_stock_count`.
- [ ] `issue_authorisation`, `close_authorisation`.
- [ ] `start_licensed_shift`, `end_licensed_shift`.
- [ ] `build_regulator_report(branch, period)`.
- [ ] `next_invoice_no(register)` with a row lock so two tablets never share a number.

---

## Part I. Hardware

| Item | Note | Cost (THB) |
|---|---|---|
| Tablet 10 to 11 inch or a laptop | Chrome or Safari, PWA installed | 8,000 to 15,000 |
| USB or Bluetooth barcode scanner | Keyboard wedge, no driver | 800 to 2,500 |
| 80 mm thermal receipt printer | Network model for ESC/POS and drawer kick | 2,500 to 5,000 |
| Cash drawer | Opens from the printer | 1,500 to 3,000 |
| Scale 0.01 g (weight module) | Keyboard-wedge output or manual entry | 1,500 to 6,000 |
| Label printer (batches module) | QR batch labels | 2,500 to 6,000 |

---

## Part J. Build order

Each step ends with the Playwright smoke tests green and a push.

1. **Week 1.** Part A tasks A1 to A7. Sign-in, chooser, hub (Part B).
2. **Weeks 2 to 3.** Products, stock, vendors in the back office (E2, E3, E4 without purchase orders). Settings page with tax fields (E8).
3. **Weeks 4 to 6.** Sell screen, payment, receipt, sales list, refunds, held carts (C2 to C5). Register and shift already work (C1).
4. **Week 7.** Shift report, expenses, checklist wired for retail (C6 to C8). Reports (E7).
5. **Week 8.** Teamwork hub: staff, clock sessions, scheduling, payroll with product commissions, staff portal (Part D). Most of it is relabelling and hiding spa-only parts.
6. **Weeks 9 to 10.** PromptPay and acquirer adapter, ESC/POS printing, offline PWA (C3, C4, C10). Purchase orders, transfers, stock counts (E3, E4).
7. **Weeks 11 to 14.** Licence profile and the eight modules in this order: weight, batches, supplier_certs, age_check, identity, licensed_duty, controlled, regulator_reports (Part F). Presets last.
8. **Weeks 15 to 16.** Pilot shop: load real data, two days shadow running, fixes, staff training with a one-page Thai guide per role, Revenue Department cash register approval if VAT-registered.

A plain retail shop can go live after week 10. A regulated shop goes live after week 16.

---

## Part K. Testing checklist before each pilot

- [ ] Sign in as each role and confirm the landing page and visible icons.
- [ ] Open drawer, 20 sales mixing cash, PromptPay, split, discount, held cart, refund, void. Close drawer. Shift report matches by hand.
- [ ] Receipt numbers are sequential across two tablets on one register.
- [ ] Every module on and off, and the pilot shop's exact combination, through the sell RPC.
- [ ] Controlled sale refused without authorisation, without a licensed person on duty, over the cap, and after expiry.
- [ ] Batch trace from a sale back to the vendor and from a batch forward to every customer.
- [ ] Identity read appears in the access log.
- [ ] Offline: pull the network, make 3 sales, reconnect, confirm they post once each.
- [ ] Spa business still books, queues, sells, refunds, and reports as before.

---

## Part L. Open questions to settle before week 11

1. Which Thai acquirer accepts the pilot shop's goods. Stripe prohibits cannabis and restricts tobacco and vape.
2. The exact file format the pilot shop's reporting office accepts for the regulator report.
3. Whether the Revenue Department cash register approval is needed for the pilot shop (only when VAT-registered).
4. Whether the licensed person issues authorisations at the counter at the pilot shop, or customers bring them.

Sources for the cannabis preset: terms.law Thailand Cannabis Laws 2026; The Thaiger, Cannabis in Thailand 2026 medical rules; Silk Legal, Thailand Restricts Cannabis Under New Regulations; Juslaws, Amendment to Cannabis Law on 25 June 2025; Thai Cannamed, Cannabis Dispensary Licence in Thailand 2026; Emerhub, Guide to Starting a Cannabis Business in Thailand.
