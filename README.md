# Carsem Shipping Portal

A web app for comparing international courier rates (DHL, FedEx, UPS) for shipments from Malaysia, keeping a history of submitted quotes, and giving administrators a dashboard and control over the rate card.

## What it does

**Staff** (own login)
- Search 250 destination countries, enter one or more boxes (size in metres, weight in kg) and compare every service, cheapest first.
- See how each price was worked out: weight break or per-kg rate, plus the fuel surcharge.
- Pick a service, add a customer reference and remarks, and **submit it to the history**. The full comparison is saved, and the quotation can be printed or saved as a PDF.

**Admins** (everything staff can do, plus)
- **Dashboard:** quotes, spend, average cost, cost per kg, savings compared with the most expensive option, and how often the cheapest service was picked. Charts show quotes over time, top destinations, price bands, carrier share and cost per kg by carrier. Every chart has a table view.
- **History:** every submitted quote, with search, filters (dates, carrier, staff), the printable quotation and **Export to Excel**.
- **Rate cards:** see the card in use and its data check, upload a new card with a **preview of what changes**, keep every version (download any, **switch back** in one click), and browse every country's price tables.
- **Users:** create staff and admin accounts, reset passwords, deactivate accounts.
- **Settings:** fuel surcharge per carrier, and the "rate card is out of date" warning age.
- **Activity log:** sign-ins, quotes, uploads, account and settings changes.

## Tech stack

| Part | Technology |
| --- | --- |
| Backend | FastAPI (Python), SQLAlchemy, pandas, openpyxl, PyJWT, passlib |
| Database | SQLite locally, PostgreSQL in production (e.g. Neon on Vercel) |
| Frontend | React + TypeScript + Tailwind CSS (Vite), Recharts for the dashboard |
| Hosting | Vercel (static site + Python serverless function), or Docker Compose |

## Project structure

```
shipping_portal/
├── vercel.json             # Vercel: builds the frontend, serves the API from api/index.py
├── api/index.py            # Vercel entry point for the FastAPI backend
├── requirements.txt        # Python packages for Vercel (points at backend/requirements.txt)
├── docker-compose.yml
├── env.example             # copy to .env and fill in real values
├── backend/
│   ├── app.py              # login, account, calculator and quote endpoints
│   ├── admin.py            # admin endpoints: dashboard, history, rate cards, users, settings, activity
│   ├── pricing.py          # reading rate cards and calculating prices (no web code)
│   ├── auth.py             # passwords, tokens, roles, login lockout
│   ├── store.py            # settings, active rate card cache, first-run setup
│   ├── db.py               # database tables
│   ├── tests/              # automated tests (pytest)
│   ├── data/               # local SQLite database (not in git)
│   └── DATA EXTRACT Rev1.xlsx  # confidential rate card, imported on first run (not in git)
└── frontend/src/
    ├── App.tsx             # header, navigation, which pages each role sees
    ├── Calculator.tsx      # rate comparison and "Submit to history"
    ├── QuoteSheet.tsx      # printable quotation
    ├── LoginPage.tsx       # sign in and change password
    ├── Landing.tsx         # public landing page
    ├── DestinationSearch.tsx
    ├── admin/              # Dashboard, History, RateCards, Users, Settings (+ activity log)
    ├── api.ts              # API helper, types, formatting
    └── Ui.tsx              # shared styles, icons and components
```

## Run locally

You need two terminals. Put the rate card at `backend/DATA EXTRACT Rev1.xlsx` first; it is imported into the database the first time the backend starts. It is confidential, so it is listed in `.gitignore` and does not come with the repository.

**Terminal 1: backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

**Terminal 2: frontend**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in as `admin` / `admin123` (or the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set). Then add staff accounts under **Users**. API docs are at http://localhost:8000/docs.

The local database is `backend/data/portal.db`. Delete it to start again from scratch.

### Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

The tests use a small made-up rate card and a throw-away database. They never touch the real rate card or your local data.

## Deploy to Vercel

Vercel does not keep files between requests, so accounts, quote history and rate cards are stored in a **PostgreSQL** database.

1. **Create a database.** In the Vercel project go to **Storage → Create → Neon (Postgres)**, or create one at neon.tech. Copy its connection string.
2. **Import the repository** in Vercel. Keep the Root Directory as the repository root; `vercel.json` handles the build.
3. **Set environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the Postgres connection string (added automatically if you used Vercel Storage) |
   | `SECRET_KEY` | a long random string, at least 32 characters |
   | `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` | the first admin account |

4. **Deploy**, sign in as the admin, open **Rate Cards** and upload `DATA EXTRACT Rev1.xlsx`. It is not in git, so it is never deployed with the code.
5. Add staff accounts under **Users**.

Limits to know: Vercel functions accept uploads up to 4.5 MB (the rate card is about 0.35 MB), and the first request after a quiet period takes a few seconds while the function starts.

## Run with Docker

1. Copy `env.example` to `.env` and set your own values.
2. Make sure `backend/DATA EXTRACT Rev1.xlsx` exists (Docker creates a folder with that name if it doesn't).
3. Run `docker compose up --build` and open http://localhost.

The database is kept in `backend/data/` on your machine, so history survives restarts.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | `change-me-in-production` | Signs login tokens. Always set your own. |
| `DATABASE_URL` | SQLite file in `backend/data/` | Database. Must be PostgreSQL on Vercel. |
| `ADMIN_USERNAME` | `admin` | First admin account, created only when there are no users yet. |
| `ADMIN_PASSWORD` | `admin123` | Password of that first admin. Change it before real use. |
| `ADMIN_FULL_NAME` | `Administrator` | Name shown for that admin. |
| `SEED_RATE_CARD` | `backend/DATA EXTRACT Rev1.xlsx` | Rate card imported when the database has none. |
| `TZ_OFFSET_HOURS` | `8` | Time zone for dashboard days and date filters (Malaysia is UTC+8). |

Fuel surcharges and the rate card age warning are set by admins in the app, under **Settings**.

## Rate card format (`DATA EXTRACT Rev1.xlsx`)

The workbook must have two sheets with these exact names. Extra columns are allowed and ignored.

**`COUNTRY MAPPING`**: which services deliver to each country, and in which zone.

| Column | Example | Meaning |
| --- | --- | --- |
| CountryOption | Singapore | Name shown in the search box |
| Carrier | UPS | DHL, FDX or UPS |
| ServiceKey | UPS-IWES | Links to the `MASTER RATE` sheet |
| ServiceName | UPS Worldwide Express Saver | Name shown in the results |
| RateZone | 1 | Zone used for pricing |
| RateScope | Singapore | `GENERIC`, or a country name when it has its own price list |

**`MASTER RATE`**: the prices.

| Column | Example | Meaning |
| --- | --- | --- |
| ServiceKey, ZoneCode, RateScope | UPS-IWES, 1, Singapore | Match a row in `COUNTRY MAPPING` |
| Container | Pkg | `Pkg` (parcel) or `Pal` (pallet freight) |
| RateType | Per Shipment | `Per Shipment` (fixed price) or `Per KG` |
| WeightFrom, WeightTo | 7.5, 7.5 | Weight break (per shipment) or weight band (per kg) |
| RateMYR | 87.89 | Price in MYR |

When a new card is uploaded, the admin first sees a data check (prices missing for a zone, heavier weights costing less, similar country names with different services) and what changes compared with the card in use.

## How the price is calculated

```
For each box (sizes in metres):
  CBM               = length x width x height
  Volumetric weight = CBM x 200                      (same as cm³ / 5000)
  Box charged at    = max(actual weight, volumetric weight)

Chargeable weight = sum of every box's charged weight x its quantity

For each service, up to its heaviest "Per Shipment" break:
  billed weight = the first weight break at or above the chargeable weight
  base price    = that break's price
Above it:
  billed weight = chargeable weight rounded up to a whole kg
  base price    = billed weight x the "Per KG" rate of the band it falls in

Total = base price + fuel surcharge (base price x the carrier's fuel %)
```

Example: one 0.4 x 0.3 x 0.3 m box (0.036 CBM) weighing 1.2 kg has a volumetric weight of 7.2 kg, so each service is priced at its 7.5 kg break. Services with no rate for the weight (for example, too heavy) are left out of the results.

## API endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/login` | Public | Username + password → token (8 hours). Locks for 5 minutes after 5 wrong attempts |
| GET | `/api/me` · POST `/api/me/password` | Signed in | Your account · change your password |
| GET | `/api/destinations` | Signed in | Countries for the search box |
| GET | `/api/rates-info` | Signed in | Rate card date, counts and fuel surcharges |
| POST | `/api/calculate` | Signed in | Compare every service for a shipment |
| POST | `/api/quotes` | Signed in | Submit a comparison to the history (prices are recalculated on the server) |
| GET | `/api/admin/stats` | Admin | Dashboard figures for a date range |
| GET | `/api/admin/quotes` · `/quotes/{id}` · `/quotes/export` | Admin | History list, one quote, Excel export |
| GET/POST/PATCH | `/api/admin/users` | Admin | List, create and update accounts |
| GET/POST | `/api/admin/rate-cards` · `/preview` · `/{id}/activate` · `/{id}/download` | Admin | Rate card versions |
| GET | `/api/admin/rate-card/country` · `/rate-card/health` | Admin | Price tables for a country · data check |
| GET/PUT | `/api/admin/settings` | Admin | Fuel surcharges and rate card age warning |
| GET | `/api/admin/activity` | Admin | Activity log |

## Security checklist before real use

- [ ] Set a long random `SECRET_KEY`
- [ ] Change the first admin's password (sign in, then use the key icon in the header)
- [ ] Never commit `.env`, `backend/data/` or the rate card. All three are already in `.gitignore`
- [ ] Give each staff member their own account, and deactivate accounts when people leave
- [ ] Consider limiting CORS `allow_origins` in `backend/app.py` to your own domain
