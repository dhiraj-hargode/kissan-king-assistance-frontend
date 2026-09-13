# Loan Management — Final Clean Build

## Included
- Administrator-only login/registration and forgot-password flow
- Customer registration for Maharashtra (district dropdown + PIN suggestion)
- Customer management, blacklist, expired/deceased archive
- Loan creation/editing with EMI YES/NO, 12-month reducing default for EMI loans
- Repayment schedules
- Today's Collection with explicit **Add to Pending** ownership
- Pending Payments with persistent pending queue and payment collection
- Payment Entry and Payment History
- Monthly Report and Graphs & Analytics
- Dashboard with banking-style KPIs and Top Overdue Customers → History navigation
- Backup / Export, Excel import, data validation, Settings

## Removed
- User Management UI and related management endpoints/functions
- Audit Logs UI and audit logging functionality
- Historical version folders and README files

## Run
1. Install Node.js 22.5+.
2. Run `npm install`.
3. Run `npm start` or double-click `start-server.bat`.
4. Open `http://localhost:8080`.

Business data is stored server-side in SQLite under `data/`. Authentication data remains server-side and is not exposed in the business-data backup.

## v1.3.2 Dashboard & Analytics update
- Dashboard: Collection Trend and Overdue Risk moved to the final/bottom dashboard row.
- All Year Revenue: years are explicitly grouped in reverse chronological order (newest year first), with months newest first within each year.
- Graphs & Analytics: replaced Loan Status chart with Activity chart showing New Customers, New Loans, and Completed Loans for the selected year.
- Completed loan activity is counted by the date the loan principal was fully paid (or `completedAt` when available).


## v1.3.5 Dashboard Pending-Queue Fix
- **Top Overdue Customers** is now sourced from the same explicit **Pending Payments** queue used by the Pending Payments page.
- Only installments explicitly added with **Add to Pending** are eligible.
- Fully paid/closed loans and expired/deceased customers are excluded.
- Only pending installments whose due date is before the selected/current date are shown in Top Overdue Customers.
- The Pending Payments page and dashboard now share one canonical pending-queue calculation to prevent the two screens from showing different records.


### v1.4.3
Responsive Payment History UI: KPI cards no longer overflow, filters are mobile-friendly, and payment rows become touch-friendly cards on small screens.

### v1.4.4 UI update
- Loans list no longer shows the Loan Type column.
- Loans Actions column is compact and sized to the action dropdown instead of taking unnecessary table width.
- Existing loan creation/edit/detail functionality still retains Loan Type where it is needed.
