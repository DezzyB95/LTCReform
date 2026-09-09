# The Care Floor Petition — website

A complete, self-hosted website for the petition to the Indiana General Assembly and the
Care Floor Coalition. It is built to be run by one organizer, kept running for years, and
extended as the campaign grows.

**Every signature and every coalition sign-up is emailed to dezzerea70@gmail.com the
moment it is made.** That address is fixed in `lib/mailer.js`, not a setting. In production
the server refuses to start unless email sending is configured, so nothing can be collected
silently.

## What it does

**For the public**
- The dashboard: the sourced case, the legislative window, the four parts of the Act, the
  coalition charter, the formal petition, and how petitions work at the Statehouse.
- **Sign the petition.** Name, residence address, county, who they are, optional email and
  phone. The server validates, stores, looks up the signer's **Indiana House and Senate
  district** from the address (U.S. Census geocoder, free, no key), emails you the record,
  and emails the signer a receipt with a **confirm link** and a **remove-my-details link**.
  The page tells them their districts and, once you fill the directory, their legislators.
- **Join the coalition.** Contact details, county, role, employer *type* (never the name),
  how they can help, willingness to testify. You get an email; they get a welcome note.
- Live tally (online + paper), opt-in supporter list, an announcement banner you set in
  admin, and a privacy page at `/privacy`.

**For the organizer, at `/admin`** (password-protected)
- **Overview**: totals, confirmed count, counties, signatures **by House and Senate
  district** with the legislator's name and your recorded stance, districts still pending.
- **Signatures**: filter by county, district, confirmed/unconfirmed, no district, text
  search; mark verified; delete.
- **Members**: the coalition list with everything they told you.
- **Legislators**: a directory of the 150 members, added one at a time or pasted as CSV,
  with party, contact, committees, stance, and a **contact log** per legislator (who
  visited, what they said, follow-up date).
- **Paper sheets**: log each batch of paper signatures by county; they count toward the
  public tally.
- **Delivery packet**: the petition plus *Exhibit B, Schedule of Signatures Collected
  Online*. Print it for all signatures by county or district, for one county, or **for one
  legislator**, in which case it opens with a cover letter addressed to them and states how
  many signers live in their district. Print or save as PDF from the browser.
- **Settings**: goal, banner, coalition name and contact line for cover letters, key dates.
- **Exports and backup**: CSV of signatures, members, legislators; a one-click download of
  the whole database.
- Background jobs every five minutes resend any email that failed and finish any district
  lookups that timed out. A button runs them on demand.

## Set-up in ten minutes

```
cd petition
npm install
cp .env.example .env
```

Edit `.env`:

1. **Email.** Turn on 2-Step Verification for the Google account, create an app password at
   https://myaccount.google.com/apppasswords, and put it in `GMAIL_APP_PASSWORD`.
   Gmail allows roughly 500 messages a day, which is plenty; any SMTP provider works too.
2. **Admin password.** Set `ADMIN_PASSWORD` to something long.
3. **Public URL.** Set `PUBLIC_URL` to the site's address once you have one; it goes in the
   confirm and remove links.

```
npm start        # http://localhost:3000, /admin for the organizer
npm test         # runs the full test suite on a throwaway database
```

## Going public

Any host that runs a Docker container with a persistent disk works. The database must be
on a persistent volume; without one a redeploy erases signatures.

**Fly.io** (about $2–3 a month):
```
flyctl launch --no-deploy --copy-config --name care-floor-petition
flyctl volumes create petition_data --size 1 --region ord
flyctl secrets set GMAIL_USER=dezzerea70@gmail.com GMAIL_APP_PASSWORD=xxxx ADMIN_PASSWORD=xxxx PUBLIC_URL=https://care-floor-petition.fly.dev NODE_ENV=production
flyctl deploy
```

**Any VPS or home server with Docker:** `docker compose up -d` (reads `.env`, keeps data in
`./data`). Put a domain in front of it with the host's HTTPS.

After the first deploy: open `/admin`, paste the legislator roster into **Legislators**
(export it from iga.in.gov after the November 2026 election), set the banner and contact
line in **Settings**, and download a backup weekly.

## How the code is organized

```
server.js            wires everything; start here
lib/db.js            SQLite + numbered migrations (add a new entry to change the schema)
lib/validate.js      counties, roles, validation rules shared by every route
lib/mailer.js        the fixed coalition address, Gmail/SMTP transport, every email's text
lib/geocode.js       address -> House/Senate district via the Census geocoder
lib/jobs.js          retry failed emails, finish pending district lookups
routes/api.js        /api/sign, /api/join, /api/stats, /api/wall, /confirm, /remove
routes/admin.js      everything under /admin
views/petition.js    the petition text (one place) and the delivery packet
views/layout.js      admin page shell
public/              the site itself (index.html, privacy.html)
test/smoke.js        30+ end-to-end checks; CI runs them on every push
```

To change the petition wording, edit `views/petition.js` and the matching text in
`public/index.html`. To add a field, add a migration in `lib/db.js`, a rule in
`lib/validate.js`, the column in the route, and a test.

## Rules that apply here, same as the rest of the repo

- Signature records and the member list are contact data. They never go in this repo
  (`data/`, `.env`, `*.db` are git-ignored) or on a shared drive. Download backups to a
  personal device.
- Reply to members only from a personal, non-work channel. Never reference a member's
  workplace in writing.
- The public supporter list shows first name, last initial, role, and county, opt-in only.
  Addresses appear only in the delivery packet handed to legislators.
- No facility is named as a wrongdoer anywhere on the site. No resident information is
  requested or accepted.
- Every number on the page has a source in the footer. Re-verify anything older than six
  months. Facts verified September 9, 2026.

Legal and policy information, not legal advice.
