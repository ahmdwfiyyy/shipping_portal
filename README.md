# Shipping Rate Portal

A web app that compares international courier rates (DHL, FedEx, UPS) for shipping a parcel from Malaysia, and lets an admin upload new rate cards.

- **Landing page (public):** explains what the portal does and how chargeable weight works. No rates are shown before sign-in.
- **Rate Calculator (staff password):** search for the destination country, enter box size and weight, and see every service's price, cheapest first, with a "Best rate" badge.
- **Admin Rate Upload (admin password):** upload a new Excel rate card to replace the current rates. Staff signed in with the site password are asked for the admin password first.

## Tech stack

| Part | Technology |
| --- | --- |
| Backend | FastAPI (Python), pandas, openpyxl, PyJWT, passlib |
| Frontend | React + TypeScript + Tailwind CSS (Vite) |
| Rate data | `backend/DATA EXTRACT Rev1.xlsx` (git-ignored, see below) |
| Packaging | Docker and Docker Compose (nginx serves the frontend) |

## Project structure

```
shipping-portal/
├── docker-compose.yml
├── env.example             # copy to .env and fill in real values
├── .gitignore
├── backend/
│   ├── app.py              # API: login, calculate, destinations, upload-rates
│   ├── DATA EXTRACT Rev1.xlsx  # current rate card (confidential, not in git)
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── nginx.conf
    ├── vercel.json         # used when deploying the frontend to Vercel
    ├── Dockerfile
    └── src/
        ├── main.tsx
        ├── index.css       # Tailwind setup, brand colours (@theme) and fonts
        ├── App.tsx         # session handling, header, calculator, login and admin upload
        ├── Landing.tsx     # public landing page
        ├── Ui.tsx          # shared styles, icons and small components
        ├── vite-env.d.ts
        └── assets/carsem-logo.png
```

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer
- Git
- Docker Desktop (only if you want to run with Docker)

## Run locally (development)

You need two terminals.

**Terminal 1: backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

API docs are at http://localhost:8000/docs

**Terminal 2: frontend**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server forwards `/api` requests to port 8000.

Before starting the backend, copy the rate card into `backend/DATA EXTRACT Rev1.xlsx`. It is confidential, so it is listed in `.gitignore` and does not come with the repository.

After the first time, you only need to activate the virtual environment and run the `uvicorn` and `npm run dev` commands again.

## Run with Docker

1. Copy `env.example` to `.env` and set your own values:
   ```
   SECRET_KEY=a-long-random-string
   ADMIN_PASSWORD=a-strong-password
   SITE_PASSWORD=password-you-give-to-staff
   ```
2. Make sure `backend/DATA EXTRACT Rev1.xlsx` exists (Docker creates a folder with that name if it doesn't).
3. Run:
   ```bash
   docker compose up --build
   ```
4. Open http://localhost.

Nginx serves the frontend and forwards `/api` to the backend container. Rate card uploads are written to `backend/DATA EXTRACT Rev1.xlsx` on your machine, so they survive restarts.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | `change-me-in-production` | Signs login tokens. Always set your own in production. |
| `ADMIN_PASSWORD` | `admin123` | Admin password. Also works at the normal sign-in and gives admin rights. Change it before real use. |
| `SITE_PASSWORD` | `staff123` | Shared password for staff who use the calculator. Change it before real use. |
| `RATES_FILE` | `backend/DATA EXTRACT Rev1.xlsx` | Path of the rate card. Point it at a persistent disk (for example `/data/rates.xlsx`) when hosting. |

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

## How the price is calculated

```
CBM               = length x width x height        (sizes in metres)
Volumetric weight = CBM x 200                      (same as cm³ / 5000)
Chargeable weight = max(actual weight, volumetric weight)

Up to the heaviest "Per Shipment" break of the service:
  billed weight = the first weight break at or above the chargeable weight
  total         = that break's price

Above it:
  billed weight = chargeable weight rounded up to a whole kg
  total         = billed weight x the "Per KG" rate of the band it falls in
```

Example: a 0.4 x 0.3 x 0.3 m box (0.036 CBM) weighing 1.2 kg has a volumetric weight of 7.2 kg, so each service is priced at its 7.5 kg break. Services with no rate for the weight (for example, too heavy) are left out of the results.

## API endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/login` | Public | Exchange the site or admin password for a token (role `user` or `admin`) valid for 8 hours |
| GET | `/api/destinations` | Signed in | Countries for the search box, with how many services serve each |
| GET | `/api/rates-info` | Signed in | When the rate card was last changed, plus carrier, service and destination counts |
| POST | `/api/calculate` | Signed in | Compare every service for a parcel |
| POST | `/api/upload-rates` | Admin (Bearer token) | Replace the rate card with an uploaded `.xlsx` or `.xls` file |

An upload is rejected, and the current rates are left untouched, if the file is missing a required sheet or column.

## Deployment

The frontend and backend can be hosted separately:

1. **Backend on Render:** create a Web Service from the GitHub repo with Root Directory `backend` and the Docker runtime. Set `SECRET_KEY`, `ADMIN_PASSWORD`, `SITE_PASSWORD` and `PORT=8000`.
2. **Frontend on Vercel:** edit `frontend/vercel.json` and replace `YOUR-BACKEND-NAME.onrender.com` with the Render address. Import the repo with Root Directory `frontend`.

Notes:

- On Render's free tier the disk is not persistent, so a rate card uploaded through the admin page is lost when the service restarts or redeploys. The rate card is not in git, so a fresh deploy starts without one: upload it through the admin page after each deploy, or use a paid instance with a disk and set `RATES_FILE`.
- Everyone with the site password can see prices. Change `SITE_PASSWORD` if it is shared outside the team.

## Git workflow

```bash
git add .
git commit -m "Describe what you changed"
git push
```

For larger changes such as a redesign, work on a branch:

```bash
git checkout -b prettier-ui
# make changes, commit them, then merge into main when happy
```

## Security checklist before real use

- [ ] Change `ADMIN_PASSWORD` and `SITE_PASSWORD` from the defaults
- [ ] Set a long random `SECRET_KEY`
- [ ] Never commit your `.env` file
- [ ] Replace the `YOUR-BACKEND-NAME` placeholder in `frontend/vercel.json` if deploying to Vercel
- [ ] Consider limiting CORS `allow_origins` in `backend/app.py` to your own domain
