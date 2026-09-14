# Financial rules and worked examples

Implements R10–R15. This is an operational cash and receivables system, without statutory accounting or automatic tax calculations.

## F01 — Exact money and distinct records

All monetary values are integer EGP piastres. Use exact arithmetic, database BIGINT, and integer strings in JSON. Validate nonnegative amounts except explicit signed adjustment/movement entries. Display EGP with two decimal places.

Separate:
- Agreement: pricing/period/recurrence terms.
- Obligation: amount owed by one child for a category/service period.
- Installment: portion of a fixed obligation due on a date.
- Receipt/payment: actual money received outside the app.
- Allocation: which obligation/installment a receipt settles.
- Credit/adjustment/refund: explicit reasoned actions.
- Treasury movement: actual inflow/outflow or documented opening/closing adjustment.

An agreement or obligation creates no treasury movement. A parent account does not own duplicate obligations; child finance is shared by its authorized guardians.

## F02 — Billing arrangements

### Recurring monthly

Agreement stores child/family allocation, category, amount, starts_on, optional ends_on, first_period, due_day, and active/paused/ended state. Due dates are Cairo calendar dates. Clamp day 29–31 to the last day of short months. First approved period is generated when the agreement is activated; later occurrences are generated at Cairo month start.

Occurrence key is agreement_id + child_id + service_period_start + category. Enforce uniqueness in PostgreSQL. Lock agreement/state while deciding eligibility and generating a charge. A retried or concurrent worker cannot duplicate it.

After outage, generate eligible missed periods through the current date, in bounded batches. Do not generate paused agreement periods or dates after ends_on. Intentionally disabled finance periods need an admin-approved catch-up preview before generation. A parent access block does not stop billing.

No automatic daily proration or attendance-based discounts. Staff enter an agreed first-period amount if needed. Price changes create an agreement version effective at the start of a future service period; issued obligations and receipts retain prior terms.

### Fixed term/year with installments

Store the full normal and agreed amounts for a defined period. Equal child allocation creates each child's obligation. Installments are due portions of that obligation; their sum must equal the agreed amount. Never add installment rows to debt a second time.

Admin can use equal scheduling helpers and adjust dates/amounts before approval. Rounding remainder follows the stable order rule. A fully paid installment does not pay future installments automatically unless an allocation explicitly includes them.

### Additional fee

Create an independent category/description/amount obligation, optionally with a service start/end date. No automatic repetition arises from those dates. Registration, books, uniforms, trips, and manually agreed additional charges use this path.

## F03 — Family discount and equal allocation

Normal tuition total N; final agreed tuition A; family discount = N - A. Require 0 <= A <= N for this discount action. Additional charges or surcharges use another action.

Split A equally among included children for the same agreement/period. Each gets floor(A / child_count) piastres; distribute leftover piastres by ascending stable child ID. Store the final allocations; never recompute old ones when a sibling joins/leaves/transfers.

Example: normal combined tuition EGP 10,000, agreed EGP 8,000, two children → discount EGP 2,000; obligation EGP 4,000 each. Paid today EGP 2,000 → outstanding family amount EGP 6,000 and treasury inflow EGP 2,000. Today's receipt never determines the discount.

Normal child prices can differ; agreed net shares are still equal by user decision. Do not report an individual negative discount when a child's share exceeds its original list price; display family discount and the agreed child allocation separately. Bus/trip/additional fees are excluded from this tuition allocation.

A new term or renewal uses explicit confirmed pricing; do not blindly inherit a historic family discount. A recurring agreement retains its approved allocated amount until a future-effective change.

## F04 — Collection, paid status, and uncertain outcomes

The paid control is a shortcut for a receipt action with amount, collection date, method, account, allocations, and operator. It is not an editable boolean disconnected from finance.

Compute remaining from effective obligations/adjustments minus active allocations and applied credits. Partial tuition collection is allowed; an installment can be unpaid/partial/paid. Bus charge settlement requires its full outstanding amount in one successful action. Final payroll settlement also requires the exact remaining amount.

Allocate a receipt explicitly to child/category/obligation/installment. A family payment across branches produces linked per-branch receipts into each destination treasury; require scope to all affected branches and commit the operation atomically. Never put a cross-branch total into one branch without declared allocation.

Transaction: lock affected balances/accounts/period state; validate actor and amount; insert receipt and allocations; insert signed movement; append audit and notification; write idempotency result; commit.

If the network drops after commit, retry with the same client operation ID and identical payload returns the original result/receipt. Reuse with different payload is a conflict. The browser checks operation status before offering a new operation. Concurrent distinct operations cannot over-allocate the same remaining debt.

Do not allow silent overpayment. Offer a separately confirmed parent-credit receipt, using an explicit credit record and actual treasury movement.

## F05 — Reminders and manual blocking

An installment becomes overdue on the Cairo date after its due date while a balance remains. Create one deduplicated notice per installment/recipient; send again only on explicit staff action or a newly approved reminder policy. Preserve identity so edits/corrections do not spam.

Notification recipients include authorized finance staff and linked finance-enabled guardians. No SMS/WhatsApp delivery. Blocked parents cannot read the app; pending debt remains visible to staff. An authorized admin may block access and set a contact-nursery message manually; never couple overdue calculation to automatic account suspension.

## F06 — Treasury, accounts, and closing

Each branch has a default treasury account. Additional bank/wallet accounts are optional, coded, branch-owned, and shown with their actual collection method. Cash collection defaults to the branch treasury. A transfer made externally is recorded in the selected real account; do not also credit the cashbox.

Record an explicit opening balance as one signed OPENING_BALANCE movement. Account balance is the sum of all posted signed movements, including that opening entry and each original/reversal exactly once; do not also add a separate opening-balance field or omit an original while counting its reversal. Never initialize cash from imported child debt. Internal account transfers produce equal opposite movements in one transaction and are excluded from profit.

Daily closing stores account/date, expected amount, counted amount, difference, actor, and revision. Difference is reported; posting a shortage/surplus adjustment requires an explicit authorized action and reason. Closed dates cannot receive invisible backdated changes.

Large expense thresholds are nursery settings. Payments over the threshold require the configured approving capability before settlement. Zero/default disabled threshold must be explicit, not an accidental infinite block.

## F07 — Expenses, corrections, credit, and refunds

Create pending expense with category, branch, optional classroom attribution, amount, due date, note, and optional document. It appears under upcoming spending but affects cash only when paid. Salary/advance expenses derive from payroll source records; do not manually create duplicate salary expense entries.

Sensitive corrections require capability + user entitlement + scope + reason. Preserve old values and references with reversing/replacement records; lock all affected balances. No direct delete of a settled payment or arbitrary writable paid_total field.

Reducing tuition after payment can create credit; it does not automatically return money. Apply credit to a later obligation with an allocation and no new cash. Record an actual refund as a treasury outflow linked to available refundable payment/credit. Reject refunds greater than refundable amounts. Refund payment methods are recorded, not initiated by the app.

For an old closed date, require authorized reopen or an explicitly current-dated correction. Display the effective business date and keep the audit timestamp. Refunds after transfer must reference the original receipt/account, or an explicitly funded/authorized alternative account; do not silently rewrite the original branch.

## F08 — Child branch transfer

Lock the child, active obligations, outstanding installments, relevant agreement state, and any concurrent receipt operations. Compute outstanding amount at commit time.

Create a transfer record with child, source/destination branches, effective date, transferred amount, itemized due balances, actor, reason, and idempotency key. Move ownership of the outstanding portions/due installments to the destination. Keep original charge and receipt attribution. A partially paid obligation may have original paid history plus transferred remainder; do not clone its full gross amount as new debt.

Example: A charged EGP 4,000 and received EGP 1,500. Transfer remainder EGP 2,500 to B. Treasury A remains +1,500; B remains unchanged during transfer. Later receipt of EGP 2,500 credits B. Nursery collection total = EGP 4,000, not EGP 6,500.

Preserve due dates. Any existing current-period occurrence retains its identity; only its remaining ownership moves. Later recurring occurrences use the committed destination at generation, subject to the transfer's effective date. Do not duplicate or reprice an existing period. Source/destination managers see allowed transfer summaries; parents see the permitted child's continuous account. Source reports show receivable transferred out; destination shows transferred in; nursery-wide debt is unchanged.

Require authority over both branches to execute transfer. A payment concurrent with transfer either completes before the transfer calculation or follows the newly committed ownership; it cannot be lost or counted twice.

Implemented effective-date default (D45): transfers take effect on today's Cairo date; scheduled/backdated transfers are rejected. A newly issued occurrence, including delayed catch-up issued after transfer, uses committed placement at generation. Zero-balance ownership anchors ensure later authorized reversals restore debt at the current owner, but only positive remaining due items count in the transfer amount. Unused credits keep their original branch/origins. Reclassifying paid tuition and refunds still require historical source authority. See [CHILD_BRANCH_TRANSFERS.md](CHILD_BRANCH_TRANSFERS.md).

## F09 — Bus and activity settlement

Bus subscription records service period, amount, child, administrative permission, and the corresponding obligation. Paid is derived from complete valid settlement. Reject any positive receipt below or above the required bus balance; a free bus subscription is explicitly zero-priced and shown as No fee, not as a fabricated payment.

Initial eligibility rule D12: subscribed, active, fully paid for applicable period, and permission enabled. UI may use checkboxes but must show period and amount and invoke finance services. Unchecking paid opens an authorized reversal flow; it cannot erase money.

Trip selected children get a notification. Participation requires recorded permission plus paid fee or an explicitly free event. Teacher roster displays each state separately. Record externally obtained consent with actor/date; no parent approval form. Canceling an event creates credits/refunds through F07, not deletion of receipts.

Implemented Phase 18 default: event permission is the latest append-only externally obtained guardian-consent event. A paid cancellation and every affected TRIP reduction execute in one transaction after activity/participant and canonical financial locks. The unchanged Phase 16 reduction equation lowers unpaid value, restores applied credit, then creates source-linked noncash credit for released receipt value; cancellation itself never moves cash. The deferred validator permits only explicitly typed TUITION or TRIP reductions and still requires the obligation category to match. BUS remains excluded. Retry/concurrent cancellation cannot append a second history row or credit. Disabled Transport/Activities blocks new mutations and reminders while authorized staff history remains readable.

## F10 — Payroll

Employee profile has basic monthly salary. A payroll period snapshots that salary. Additions, deductions, penalties, and advances are manual month-scoped actions with reason/actor. Working hours/attendance never enter the formula.

Each period has one explicit paying branch/account independent of operational multi-branch assignments. A staff transfer does not prorate salary or move old payroll outflows. Authorized changes can set the future paying branch; preserve existing period attribution (D27).

Advances are paid immediately into an advance source record plus treasury outflow. Lock the monthly employee balance and enforce aggregate advances + deductions/penalties <= basic salary; prevent individual actions from passing separately and exceeding the cap together. Additions do not silently increase that user-defined cap.

Final payable = salary snapshot + additions - deductions/penalties - already-paid advances. Pay the full remainder once. Unique employee_id + month settlement key and locked period prevent double salary payment. A zero remainder closes the period with no zero-valued treasury payment.

Example: salary 5,000; advance 1,000; deduction 300 → final payment 3,700. Total cash outflow = 1,000 + 3,700 = 4,700. Count neither salary 5,000 nor advance 1,000 again in expense reports.

Prior months retain their paid/unpaid history and may be settled independently. No adjustment automatically rolls into another month. Salary edits affect future unapproved periods only. Correcting paid payroll uses explicit audited financial correction, never toggling paid to false.

## F11 — Reports and reconciliation

Collections report: actual receipts by effective collection date, less explicit refunds where shown. Cash-based operating result: collections + separately identified other income - refunds - actual operating outflows. Exclude internal transfers, imported opening debt, new charges, and noncash discounts.

Treasury movement reports include all real movements and explain opening/closing adjustments separately. Pending expenses and uncollected debt appear as separate indicators.

Classroom reporting uses explicit source attribution; do not distribute rent or other shared costs invisibly. Show unattributed branch costs separately and label classroom cash contribution if allocation is incomplete.

Every total must drill down to its source rows and reconcile against the same filtered query used by PDF/Excel exports. No mock or hardcoded production chart values.
