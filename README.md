# Shipping Rate Portal

A web app that compares courier shipping costs for a parcel and lets an admin upload new rate cards.

- **Rate Calculator (public):** choose a destination, enter box size and weight, and see every courier's price, cheapest first, with a "Best Rate" badge.
- **Admin Rate Upload (password protected):** log in and upload a new Excel rate card to replace the current rates.

## Tech stack

| Part | Technology |
| --- | --- |
| Backend | FastAPI (Python), pandas, openpyxl, PyJWT, passlib |
| Frontend | React + Vite |
| Rate data | `backend/rates.xlsx` |
| Packaging | Docker and Docker Compose (nginx serves the frontend) |

## Project structure

```
shipping-portal/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── app.py              # API: login, calculate, destinations, upload-rates
│   ├── rates.xlsx          # current rate card
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── nginx.conf
    ├── vercel.json         # used when deploying the frontend to Vercel
    ├── Dockerfile
    └── src/
        ├── main.jsx
        └── App.jsx         # the whole UI; colours and fonts are in the `theme` object at the top
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

After the first time, you only need to activate the virtual environment and run the `uvicorn` and `npm run dev` commands again.

## Run with Docker

1. Copy `.env.example` to `.env` and set your own values:
   ```
   SECRET_KEY=a-long-random-string
   ADMIN_PASSWORD=a-strong-password
   ```
2. Make sure `backend/rates.xlsx` exists (Docker creates a folder with that name if it doesn't).
3. Run:
   ```bash
   docker compose up --build
   ```
4. Open http://localhost.

Nginx serves the frontend and forwards `/api` to the backend container. Rate card uploads are written to `backend/rates.xlsx` on your machine, so they survive restarts.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | `change-me-in-production` | Signs login tokens. Always set your own in production. |
| `ADMIN_PASSWORD` | `admin123` | Admin login password. Change it before real use. |
| `RATES_FILE` | `backend/rates.xlsx` | Path of the rate card. Point it at a persistent disk (for example `/data/rates.xlsx`) when hosting. |

## Rate card format (`rates.xlsx`)

The workbook must have two sheets with these exact names and columns.

**`Zone_Mapping`**

| Courier | Destination | Zone Code |
| --- | --- | --- |
| DHL Express | Selangor | Zone A |

**`Rates`**

| Courier | Zone Code | Base Weight (kg) | Base Price (MYR) | Incremental Price per 0.5kg |
| --- | --- | --- | --- | --- |
| DHL Express | Zone A | 0.5 | 8.5 | 1.5 |

Each courier needs its own rows in both sheets. The Courier text must match exactly between the two sheets.

## How the price is calculated

```
Volumetric weight = (length x width x height) / 5000
Chargeable weight = max(actual weight, volumetric weight)
Extra steps       = ceil( max(0, chargeable weight - base weight) / 0.5 )
Total cost        = base price + (extra steps x incremental price)
```

Example: a 40 x 30 x 30 cm box weighing 1.2 kg has a volumetric weight of 7.2 kg, so 7.2 kg is charged.

## API endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/destinations` | Public | List destinations for the dropdown |
| POST | `/api/calculate` | Public | Compare couriers for a parcel |
| POST | `/api/login` | Public | Exchange the admin password for a token valid for 8 hours |
| POST | `/api/upload-rates` | Admin (Bearer token) | Replace the rate card with an uploaded `.xlsx` or `.xls` file |

An upload is rejected, and the current rates are left untouched, if the file is missing a required sheet or column.

## Deployment

The frontend and backend can be hosted separately:

1. **Backend on Render:** create a Web Service from the GitHub repo with Root Directory `backend` and the Docker runtime. Set `SECRET_KEY`, `ADMIN_PASSWORD` and `PORT=8000`.
2. **Frontend on Vercel:** edit `frontend/vercel.json` and replace `YOUR-BACKEND-NAME.onrender.com` with the Render address. Import the repo with Root Directory `frontend`.

Notes:

- On Render's free tier the disk is not persistent, so a rate card uploaded through the admin page is lost when the service restarts or redeploys. To change rates permanently, replace `backend/rates.xlsx` in the repo and push. For uploads that persist, use a paid instance with a disk and set `RATES_FILE`.
- The calculator and its API are public. Anyone with the web address can see prices. Restrict access if the rates are confidential.

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

- [ ] Change `ADMIN_PASSWORD` from the default
- [ ] Set a long random `SECRET_KEY`
- [ ] Never commit your `.env` file
- [ ] Decide whether the calculator should require a login
