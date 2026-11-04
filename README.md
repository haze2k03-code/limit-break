# Limit Break

An anime-themed fitness tracker. Log gym workouts, runs, meals and sleep, see everything as graphs, set yearly and monthly goals, and rank up your power level with friends.

## Features

- **Gym**: build your routine from 50+ exercises (or add your own), edit sets/reps/kg, log workouts on any date, per-exercise progress graph with kg/month rate and estimated 1-rep max
- **Run**: distance, time, type; weekly km and pace-trend graphs
- **Diet**: calorie ring, macros, water, meal log, 30-day calorie and protein graphs
- **Sleep**: bedtime/wake log, hours-per-night and sleep-window graphs
- **Goals**: yearly and monthly goals with on-track / behind / done status
- **Past data**: add any old entry, or bulk-import a year of history as CSV
- **Power level & ranks**: +10 per gym or run day, +25 × streak for each consistent week (3+ training days), +100 per PR
- **Fighters**: everyone who signs up appears on a leaderboard; open anyone's progress and leave comments

## Tech

- Front end: plain HTML/CSS/JS (`index.html`, `client.js`), no build step
- API: Vercel serverless functions (`api/auth.js`, `api/db.js`)
- Database: MongoDB Atlas
- Auth: username + password (bcrypt), JWT bearer tokens

## Deploy (free)

1. **MongoDB Atlas**
   - Create a free M0 cluster at <https://www.mongodb.com/cloud/atlas>.
   - Database Access → add a database user.
   - Network Access → add `0.0.0.0/0` (Vercel's IPs change).
   - Connect → Drivers → copy the connection string.

2. **GitHub**
   ```bash
   git init
   git add .
   git commit -m "Limit Break"
   git branch -M main
   git remote add origin https://github.com/<your-username>/limit-break.git
   git push -u origin main
   ```

3. **Vercel**
   - <https://vercel.com/new> → import the repo. Framework preset: **Other**. No build command needed.
   - Settings → Environment Variables: add `MONGODB_URI` and `JWT_SECRET` (see `.env.example`).
   - Deploy. Your site will be at `https://<project>.vercel.app`.

## Run locally

```bash
npm install
npm i -g vercel
cp .env.example .env   # fill in your values
vercel dev             # http://localhost:3000
```

## Bulk import format

```
date,type,item,a,b,c
2025-11-12,lift,Chest Press,4,8,40        # exercise, sets, reps, kg
2025-11-14,run,Easy jog,5.0,31            # type, km, minutes
2025-11-15,diet,Daily total,2150,105      # food, kcal, protein g
2025-11-14,sleep,,00:45,07:30             # bedtime, wake
2025-11-15,weight,,66.2                   # kg
```

## API

| Method | Route | Body | |
|---|---|---|---|
| POST | `/api/auth` | `{ mode: "login" \| "register", username, password }` | returns `{ token, uid }` |
| GET | `/api/db?col=fighters` | | list a collection |
| GET | `/api/db?path=fighters/<uid>` | | read a document |
| PUT | `/api/db?path=...` | `{ data }` | create / replace |
| PATCH | `/api/db?path=...` | `{ data }` | merge |
| DELETE | `/api/db?path=...` | | delete |

Users can only write under `fighters/<their uid>/…`. Comments can be posted by any signed-in user as themselves and deleted by the author or the person they were written to.
