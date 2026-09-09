# The Care Floor Petition — website

A complete, self-hosted website for the petition to the Indiana General Assembly and the
Care Floor Coalition. People sign the petition and join the coalition on the page; every
signature and sign-up is saved to a database and emailed to the organizer immediately;
a password-protected admin area exports the signatures and prints the delivery packet
that goes to legislators.

```
petition/
  public/index.html      the public site (dashboard, petition, sign form, coalition form)
  server.js              API, admin pages, CSV export, printable delivery packet
  db.js                  SQLite schema (signatures, members)
  mailer.js              Gmail / SMTP / console email
  test/smoke.js          end-to-end API test (npm test)
  Dockerfile, fly.toml   deployment
  .env.example           every setting, explained
  Care_Floor_Petition_IGA.docx   Word version: cover letter, petition, signature sheets, exhibits
```

## What happens when someone signs

1. The form checks the entry in the browser, then posts it to `/api/sign`.
2. The server validates it again (Indiana county, real ZIP, signer type, attestation),
   drops honeypot bots, rate-limits by connection, and rejects a second signature from the
   same name and ZIP.
3. The signature is written to `data/petition.db`.
4. An email with the full record goes to **dezzerea70@gmail.com** (change with
   `ORGANIZER_EMAIL`). If the signer gave an email, they get a receipt with next steps.
5. The live tally and, if they opted in, the public supporter list update.

Joining the coalition (`/api/join`) works the same way: name, personal email or cell, county,
role, employer *type* (never the name), how they can help, willingness to testify, and
consent. You get an email; they get a welcome note.

## Admin

`/admin` (HTTP basic auth, `ADMIN_USER` / `ADMIN_PASSWORD`):

- **Overview**: totals, counties represented, breakdown by county and signer type.
- **Signatures**: every record; mark verified; delete. **Members**: every sign-up.
- **CSV export** for both tables.
- **Delivery packet**: the petition text plus *Exhibit B, Schedule of Signatures Collected
  Online*, grouped by county, with a certification block. Filter to one county, then
  print or save as PDF from the browser. Attach it behind the paper signature sheets.

## Run it locally

```
cd petition
npm install
cp .env.example .env        # fill in GMAIL_APP_PASSWORD and ADMIN_PASSWORD
npm start                   # http://localhost:3000
npm test                    # runs the API smoke test on a throwaway database
```

Without mail credentials the server still works and prints each email to the console.

## Gmail setup (five minutes)

1. Turn on 2-Step Verification for the Google account.
2. Go to https://myaccount.google.com/apppasswords and create an app password named "petition".
3. Put the 16-character password in `.env` as `GMAIL_APP_PASSWORD`, with `GMAIL_USER=dezzerea70@gmail.com`.

Gmail allows roughly 500 messages a day from a personal account, which is plenty. If the
campaign outgrows that, switch to any SMTP provider with the `SMTP_*` settings.

## Deploy on Fly.io (persistent disk, about $2–3/month)

```
flyctl launch --no-deploy --copy-config --name care-floor-petition
flyctl volumes create petition_data --size 1 --region ord
flyctl secrets set GMAIL_USER=dezzerea70@gmail.com GMAIL_APP_PASSWORD=xxxx ADMIN_PASSWORD=xxxx PUBLIC_URL=https://care-floor-petition.fly.dev
flyctl deploy
```

Any host that runs a Docker container with a persistent volume works the same way
(Railway, Render with a disk, a $5 VPS). **The database must be on a persistent disk**;
without one, a redeploy erases the signatures. Point a custom domain at it when ready.

Back up regularly: download both CSVs from `/admin`, or copy `data/petition.db`.

## Rules that apply to this site

- The signature records and member list are contact data. They never go in this repo
  (`data/`, `.env`, and `*.db` are git-ignored) or on a shared drive.
- Reply to members only from a personal, non-work channel. Never reference a member's
  workplace in writing.
- The public supporter list shows first name, last initial, role, and county, opt-in only.
  Addresses are never shown anywhere public.
- No facility is named as a wrongdoer anywhere on the site. No resident information is
  requested or accepted.
- Every number on the page has a source in the footer. Re-verify anything older than six
  months. Facts were verified September 9, 2026.

Legal and policy information, not legal advice.
