# apt-tinder

Tinder-style review tool for 3BR SF apartments under $9k/mo.
Scrapes daily, emails new finds, lets you swipe left/right/up on the web.

- **Right swipe / →** : Yes
- **Left swipe / ←** : Nope
- **Up swipe / ↑** : Maybe (uncertain)

Sources: Craigslist (RSS, reliable), Zillow, Redfin, Realtor.com, Zumper, Apartments.com, Trulia, PadMapper, HotPads, Facebook Marketplace, californiaapartments.com (via Apify, token optional).

Deduplicates across sources, tracks every price seen, geocodes via OpenStreetMap, categorizes by SF neighborhood, marks listings unavailable after 3 days of not appearing in any reliable source.

## Stack

- **Next.js 15** (App Router) on Vercel
- **Postgres** on Supabase (free tier, 500 MB is plenty)
- **Drizzle** ORM
- **Resend** for daily digest email
- **Leaflet + OpenStreetMap** for maps (zero API keys)
- **framer-motion** for swipe gestures

---

## 1. Local setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, DIRECT_URL (from Supabase), RESEND_API_KEY, CRON_SECRET
npm run db:push       # creates tables in Supabase
npm run scrape        # populate listings (Craigslist works out of the box)
npm run dev
```

Open http://localhost:3000.

## 2. Supabase setup

1. Create a project at https://supabase.com (free tier).
2. Project Settings → Database → **Connection string** → pick:
   - **Transaction** mode (port 6543) → paste into `DATABASE_URL`
   - **Session** mode (port 5432) → paste into `DIRECT_URL` (used by drizzle-kit migrations)
3. Run `npm run db:push` to apply the schema.

## 3. Deploy to Vercel

```bash
npx vercel link        # link to (or create) project "sf-apt-finder"
npx vercel env add DATABASE_URL production
npx vercel env add DIRECT_URL production
npx vercel env add RESEND_API_KEY production
npx vercel env add CRON_SECRET production         # any long random string
npx vercel env add SITE_URL production            # https://apt-tinder.viraat.dev
npx vercel env add EMAIL_FROM production          # see Resend section below
npx vercel env add EMAIL_TO production            # viraat.laldas@gmail.com,sambruns2000@gmail.com
npx vercel --prod
```

### Custom domain (`apt-tinder.viraat.dev`)

In the Vercel dashboard → Project → **Settings → Domains** → add `apt-tinder.viraat.dev`.
Vercel will tell you the CNAME to add at your DNS provider (`cname.vercel-dns.com`).

### Cron

`vercel.json` schedules `/api/cron` at `5 14 * * *` UTC = **7:05 AM PT during PDT** (Mar-Nov).
During PST (Nov-Mar), 7:05 AM PT is `5 15 * * *`. Vercel Cron uses UTC and does not auto-adjust
for DST, so adjust manually twice a year or leave it landing at 6:05 AM half the year.

> Note: Hobby plan caps function timeout at 60s. The full scrape may exceed that.
> Upgrade to Pro for 300s, or trim sources / move heavy scrapes to a separate worker.

## 4. Resend setup

The Resend API key in `.env.example` is already wired up. To send to external emails (not
just your verified Resend account), you must **verify a sending domain** at
https://resend.com/domains. Add the DNS records, then set:

```
EMAIL_FROM="SF Apt Finder <apts@yourdomain.com>"
```

Until then, sends from `onboarding@resend.dev` only reach the Resend account owner email
(Resend's free-tier sandbox).

## 5. Scrape sources & how they're handled

| Source | Method | Works out of box? |
|---|---|---|
| Craigslist | RSS | ✅ Yes |
| Zillow | JSON endpoint | ⚠️ Sometimes; often blocks cloud IPs |
| Redfin | gis-csv endpoint | ⚠️ Sometimes |
| Realtor.com | RDC GraphQL | ⚠️ Sometimes |
| Zumper | Public search API | ⚠️ Sometimes |
| Apartments.com | Apify actor | 🔑 Needs `APIFY_TOKEN` |
| Trulia | Apify actor | 🔑 Needs `APIFY_TOKEN` |
| PadMapper | Apify actor | 🔑 Needs `APIFY_TOKEN` |
| HotPads | Apify actor | 🔑 Needs `APIFY_TOKEN` |
| Facebook Marketplace | Apify actor | 🔑 Needs `APIFY_TOKEN` |
| californiaapartments.com | Apify actor | 🔑 Needs `APIFY_TOKEN` |

To enable the Apify-backed sources, sign up at https://apify.com (free tier ~ 1k actor runs/mo),
grab a token, and set `APIFY_TOKEN`. Actor IDs are in [`lib/scrapers/apify.ts`](lib/scrapers/apify.ts).

If a source goes silent the orchestrator logs the failure to `scrape_runs` and keeps going,
nothing else breaks.

## 6. Deduplication

Across sources, listings are merged by canonical ID:

1. `addressLine + zip + bedrooms` (normalized) if address is present
2. `lat,lng` rounded to ~10m + bedrooms + sqft if only coordinates
3. Otherwise per-source unique ID

When the same place is listed at different prices, we **store every price** in `prices_by_source`
and use the **lowest** as the canonical `price`. The swipe card surfaces all prices side by side.

## 7. Availability tracking

Each scrape run, the orchestrator:

1. Upserts every listing seen (revives `unavailable` ones back to `available`)
2. After all scrapers finish, if any **reliable source succeeded**, marks any listing
   not seen in **3+ days** as `unavailable`.

Unavailable listings:
- Are filtered out of the swipe deck and map by default
- Still appear in your `/liked` shortlist, greyed out with a "No longer listed" badge,
  so you don't lose history.

## 8. Manual triggers

```bash
# Run the scrape locally and (optionally) send the digest email
npm run scrape -- --email

# Trigger a remote run on Vercel
curl -H "Authorization: Bearer $CRON_SECRET" https://apt-tinder.viraat.dev/api/cron
```

## 9. Project layout

```
app/
  page.tsx               - Swipe deck (default route)
  map/                   - Map view, sidebar grouped by neighborhood
  liked/                 - Yes / Maybe / Nope columns
  api/cron/route.ts      - Daily scrape + email
  api/listings/route.ts  - Listings feed
  api/decisions/route.ts - Save / undo swipes
lib/
  db/                    - Drizzle schema + client
  scrapers/              - One file per source + orchestrator
  dedup.ts               - Canonical ID + merge
  geocode.ts             - Nominatim wrapper (rate-limited)
  neighborhoods.ts       - SF bbox lookup
  email.ts               - Resend digest composer
components/
  swipe-deck.tsx         - Tinder UI w/ left/right/up gestures
  listing-map.tsx        - Leaflet map + price pins
vercel.json              - Daily cron
```
