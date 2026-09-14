# Loan Due-Date Fix

## Rule
The loan application/disbursement date is NOT an EMI due date.

For an EMI loan:
- Loan date = 14-Jun-2026
- Installment 1 = 14-Jul-2026
- Installment 2 = 14-Aug-2026
- Installment 3 = 14-Sep-2026
- ...
- For 12 months, installment 12 = 14-Jun-2027

## Changes
- New repayment schedules start one month after the loan start date.
- Existing configured schedules are normalized using installment number so installment 1 is one month after the loan date.
- Duration remains exactly the configured number of installments.
- Interest calculation remains monthly and reducing-balance/flat-monthly according to the loan method.
- Repayment Schedule UI remains the clean 8-column version: Sr No, Due Date, Principal, Interest, EMI, Paid, Remaining, Status.
- Penalty is not displayed in the repayment schedule.

No database tables are changed by this package.
