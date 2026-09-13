# Loan Management Application Structure

The frontend is now split into focused JavaScript files instead of keeping all application logic in `app.js`.

## Frontend modules

- `app.js` — application bootstrap and DOM event wiring only.
- `js/core.js` — shared utilities, validation, API/data access, schedules, authentication helpers.
- `js/navigation.js` — page routing/navigation.
- `js/dashboard.js` — dashboard and overview.
- `js/customers.js` — customer registration, profiles and customer actions.
- `js/loans.js` — loan creation, editing and loan details.
- `js/collections.js` — today's collection and Pending Payments.
- `js/payments.js` — payment entry, payment history and repayment schedule.
- `js/reports.js` — reports and analytics.
- `js/admin.js` — blacklist, expired people, backup/import and settings.

Scripts are loaded in dependency order from `index.html`, with `app.js` loaded last so all feature functions are available before bootstrap/event wiring runs.

## Pending Payments

Pending Payments is not date-filtered. It loads the complete explicit pending queue across all dates/years. The page has one search box for customer name, mobile, Khata or loan ID.


## v1.4.3 UI update
- Payment History KPI cards use a responsive 4-column desktop / 2-column mobile layout so financial values stay inside their cards.
- Payment History switches from the dense desktop table to touch-friendly payment cards on small screens.
- Payment History filters stack and use larger touch targets on mobile.
- Existing Pending Payments behavior is preserved: no date filter, all pending records initially, search-only filtering.

### v1.4.4
The Loans list presentation is handled in `js/loans.js` with compact table sizing in `styles.css`. The list omits the Loan Type column; Loan Type remains available in loan creation/edit/detail workflows.
