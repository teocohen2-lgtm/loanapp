# PesoLoan — Philippine online loan app (local demo)

Express 5 + TypeScript + Prisma + PostgreSQL backend, React 19 + Vite + Tailwind frontend.
**Demo only:** SMS, GCash, Maya, InstaPay and PESONet are simulated and no money moves.
The loan module is deliberately disabled when `NODE_ENV=production`.

## 1. Prerequisites

- Node.js 22+ and npm
- PostgreSQL **12 or newer** (the migrations use `ALTER TYPE ... ADD VALUE`)

## 2. Create the database

```bash
psql -U postgres -c "CREATE USER ph_loan_user WITH PASSWORD 'loanapp';"
psql -U postgres -c "CREATE DATABASE ph_loan OWNER ph_loan_user;"
```

## 3. Backend

```bash
cd backend
npm ci --include=dev
cp .env.example .env        # skip if you already have a .env you want to keep
```

Edit `backend/.env`:

| Variable | What to set |
|---|---|
| `DATABASE_URL` | `postgresql://ph_loan_user:loanapp@localhost:5432/ph_loan?schema=public` |
| `JWT_SECRET` | a random 32+ character string |
| `ENCRYPTION_KEY` | a **different** random 32+ character string |
| `CORS_ORIGINS` | `http://localhost:5173` (must match the address you open in the browser exactly; `127.0.0.1` is a different origin) |
| `NODE_ENV` | `development` (keep this locally: the OTP is shown on screen instead of sent by SMS) |

Generate each secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Never change `ENCRYPTION_KEY` on a database that already holds KYC data, or stored ID numbers become unreadable.

Then create the tables, load demo data, and start the API:

```bash
npx prisma generate
npm run db:setup            # = prisma migrate deploy + seed
npm run dev                 # http://localhost:4000
```

Check it: `curl http://localhost:4000/health/db` should return `{"status":"ok","database":"connected"}`.

## 4. Frontend (second terminal)

```bash
cd frontend
npm ci
cp .env.example .env        # skip if .env already exists
npm run dev                 # http://localhost:5173
```

## 5. Demo accounts (created by `npm run seed`)

| Role | Mobile | Password |
|---|---|---|
| Admin | `09170000001` | `Admin#12345` |
| KYC reviewer | `09170000002` | `Reviewer#12345` |
| Borrower, KYC approved | `09170000003` | `Borrower#12345` |
| Borrower, no KYC yet | `09170000004` | `Newbie#12345` |

Seeding also creates the default pricing: **3.00% per month, ₱50.00 processing fee**, documentary stamp tax paid by the lender.
Re-running `npm run seed` resets these four accounts' passwords and roles. The seeder refuses to run with `NODE_ENV=production`.

## 6. Try the whole flow

1. Sign in as the approved borrower (`09170000003`). Open **Apply**, choose ₱5,000 for 3 months, choose GCash, enter `09171234567`, tick the box and submit.
2. Sign out, sign in as admin (`09170000001`). **Loans** → *Approve*, then *Release*. (A GCash number or bank account ending in `0000` makes the simulated provider reject the payout, to test failure handling.)
3. Sign in as the borrower again. **My loans** → open the loan → *Pay* each installment via GCash, Maya, InstaPay or PESONet. After the last one the loan shows REPAID.
4. New-user path: **Create account** with any valid number (e.g. `09171234568`). The 6-digit code appears in a blue box on screen. Complete **Verification** (ID type, number, ID photo, selfie), then sign in as the reviewer (`09170000002`) → **KYC queue** → approve.
5. Admin → **Pricing** to create a new rate/fee version or set a custom rate for one borrower (applies to new applications only).

## 7. Philippine specifics implemented

- **Currency:** PHP (₱), formatted with `Intl` `en-PH`; loan data stored as exact decimals.
- **Mobile numbers:** `09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX`, `+639XXXXXXXXX` (spaces/hyphens allowed) are accepted and stored as `+639XXXXXXXXX`, validated on both client and server.
- **Government IDs:** UMID (12 digits), SSS (10), PhilSys/National ID (16), Driver's License (11 characters, e.g. N01-23-456789), TIN (9 or 12), PRC (6–8). Formats are sanity checks only; a human reviewer verifies the ID itself. ID numbers are stored AES-256-GCM encrypted. (`PASSPORT` remains in the database enum for old rows but is not offered.)
- **Payout and repayment channels:** GCash and Maya (PH mobile number), InstaPay and PESONet (bank + 8–20 digit account number; 10 major banks listed).
- **Loan terms:** ₱1,000–₱50,000, 1–12 months, monthly diminishing-balance amortization, rounded to centavos, final installment clears the balance.
- **Interest rules:** SEC MC No. 14, s. 2025 (effective 1 April 2026) caps unsecured loans of ₱10,000 or less and up to 4 months at 6% nominal and 12% effective interest per month, with penalties capped at 5% per month and total cost capped at 100% of principal. This app applies the nominal and effective caps and the 100% cost check to **every** loan, including the larger/longer ones the circular does not cover. Late penalties are not charged in this demo.
- **Documentary requirements:** shown on the Verification screen (valid government ID, ID photo, selfie with ID, address, 18+, mobile number, payout account in the borrower's name). Consent under the Data Privacy Act of 2012 (RA 10173) is collected at registration.

## 8. Commands

| Where | Command | Purpose |
|---|---|---|
| backend | `npm run typecheck` | TypeScript check |
| backend | `npm test` | builds, then runs 16 unit/HTTP tests (no database needed) |
| backend | `npm run test:integration` | OTP concurrency test; needs a **separate** disposable DB, see `TEST_DATABASE_URL` below |
| backend | `npm run make-admin -- 09171234567 [ADMIN\|REVIEWER]` | promote an existing user |
| frontend | `npm run build` | type-check and production build |

```bash
export TEST_DATABASE_URL='postgresql://ph_loan_user:loanapp@localhost:5432/ph_loan_test?schema=public'
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:integration
```

## 9. API summary

Public: `GET /api/meta`, `POST /api/auth/{register,verify-otp,resend-otp,login,forgot-password,reset-password}`.
Signed in: `GET /api/auth/me`, `GET /api/kyc/me`, `POST /api/kyc/submit`.
Borrower: `GET /api/loans/pricing`, `POST /api/loans/calculator`, `POST|GET /api/loans/applications`, `GET /api/loans/applications/:id`, `POST /api/loans/applications/:id/payments`.
Reviewer/admin: `GET /api/kyc/admin/pending`, `GET /api/kyc/admin/:userId`, `GET /api/kyc/admin/:userId/image/:type`, `PATCH /api/kyc/admin/:userId/review`.
Admin: `GET /api/loans/admin/applications`, `PATCH /api/loans/admin/applications/:id/review`, `POST /api/loans/admin/applications/:id/disburse`, `GET|POST /api/loans/admin/policies`, `GET /api/loans/admin/borrowers`, `PUT /api/loans/admin/borrowers/:userId/rate`.

## 10. Known limitations and before-launch work

Not verified in the build environment: running against a real PostgreSQL (migrations, seed, live flows) and a real browser session. Run the walkthrough in section 6 to confirm on your machine.

- `npm run lint` in `frontend` fails because `typescript-eslint` does not yet support the pinned TypeScript 7.0. Pin `typescript` to a 5.x/6.x release in `frontend/package.json` and reinstall to fix.
- SMS, payments and disbursement are mocks (`backend/src/services/mock/`). Real provider adapters are required before launch.
- The session token is kept in `sessionStorage` (survives refresh, cleared when the tab closes). There is no refresh-token or revocation design.
- Late penalties, partial or early payments, collections, and a notification system are not implemented.
- Before real use you need: SEC registration as a lending/financing company and a compliance review of rates, fees and disclosures; a tax review of documentary stamp tax; real SMS and payment adapters; durable image storage and a retention policy; shared rate limiting if you run more than one instance; and a dependency audit.
- Render blueprints are unchanged. They run the API in production mode, where signup and the loan module are intentionally disabled.
