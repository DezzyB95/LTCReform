// Builds the paper petition packet as Letter-size PDFs using Chromium.
//   Part 1: the petition text and signature sheets
//   Part 2: what people need to know (the case, the Act, the coalition, how petitions work, rights, circulating)
// Outputs: Care_Floor_Petition.pdf (both parts), Care_Floor_Petition_Part1_Petition.pdf, Care_Floor_Petition_Part2_Information.pdf
// Run: node scripts/make-paper-petition.js [number of signature sheets]
const fs = require("fs");
const path = require("path");
const { PETITION, petitionHtml } = require("../views/petition");

const SHEETS = Number(process.argv[2] || 3);
const ROWS = 12;
const DIR = path.join(__dirname, "..");
const EMAIL = "dezzerea70@gmail.com";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
  @page { size: Letter; margin: 0.7in 0.75in; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11.5pt; line-height: 1.4; color: #000; margin: 0; }
  h1 { text-align: center; font-size: 15pt; letter-spacing: .05em; text-transform: uppercase; margin: 0; }
  .sub { text-align: center; font-weight: 700; font-size: 10.5pt; margin: 6px 0 14px; }
  .w { padding-left: 1.6em; text-indent: -1.6em; margin: 0 0 8px; }
  ol { padding-left: 26px; } li { margin-bottom: 6px; }
  p { margin: 0 0 9px; }
  .part { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: baseline; font-family: Arial, Helvetica, sans-serif; }
  .part b { font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; }
  .part span { font-size: 9pt; color: #333; }
  .sheet, .pb { page-break-before: always; }
  .sheetno { text-align: center; font-weight: 700; font-size: 10.5pt; margin: 0 0 10px; }
  .join { font-size: 9.5pt; line-height: 1.3; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td { border: 1px solid #000; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; background: #eee; }
  .sig tbody td { height: 23pt; }
  .n { width: 18pt; text-align: center; } .d { width: 58pt; }
  .note { font-size: 8.5pt; font-style: italic; margin: 8px 0 8px; }
  .circ { font-size: 9.5pt; margin: 8px 0 12px; }
  .lines { font-size: 9.5pt; margin: 0 0 10px; }
  /* part 2 */
  .info h2 { font-family: Arial, Helvetica, sans-serif; font-size: 13.5pt; margin: 18px 0 8px; letter-spacing: -.01em; }
  .info h3 { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 12px 0 4px; }
  .info p, .info li { font-size: 10.5pt; line-height: 1.4; }
  .info li { margin-bottom: 5px; }
  .nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 8px 0 14px; }
  .nums div { border: 1px solid #000; padding: 8px 8px 6px; }
  .nums b { display: block; font-family: Arial, Helvetica, sans-serif; font-size: 22pt; line-height: 1; margin-bottom: 4px; }
  .nums span { font-size: 8.5pt; line-height: 1.25; display: block; }
  .nums small { font-size: 7.5pt; color: #333; display: block; margin-top: 4px; }
  .two { }
  table.t th, table.t td { font-size: 9pt; padding: 4px 6px; vertical-align: top; }
  table.t th { text-align: left; }
  .box { border: 1px solid #000; padding: 10px 12px; margin: 10px 0; page-break-inside: avoid; }
  table.t tr, .nums div, .info li { page-break-inside: avoid; }
  .info h2, .info h3 { page-break-after: avoid; }
  .box b.big { font-family: Arial, Helvetica, sans-serif; font-size: 20pt; display: block; margin-bottom: 4px; }
  .src { font-size: 8.5pt; color: #333; }
  .src li { font-size: 8.5pt; margin-bottom: 2px; }
  .foot { font-size: 9pt; color: #333; margin-top: 14px; }
`;

const partHeader = (n, title, right) => `<div class="part"><b>Part ${n} · ${esc(title)}</b><span>${esc(right)}</span></div>`;

// ---------------- Part 1 ----------------
const sheet = (n) => `
<section class="sheet">
  <h1>${esc(PETITION.title)}</h1>
  <p class="sub">${esc(PETITION.subtitle)}</p>
  <p class="sheetno">Signature Sheet ${n} of ${SHEETS} &nbsp;·&nbsp; attach to the petition text</p>
  <p class="join">We, the undersigned residents of the State of Indiana, exercising the right secured by Article 1, Section 31 of the Constitution of the State of Indiana, join in the Petition to the Indiana General Assembly set out on the attached pages, and respectfully pray that the General Assembly enact the Indiana Nursing Home Direct Care Staffing and Accountability Act in its 2027 regular session, protect the direct care workers who report unsafe conditions, require nursing facility supplemental Medicaid payments to be spent on direct care, and recognize the direct care workforce, through the Care Floor Coalition, as a party to nursing home policy in Indiana. Each of us has signed once, in our own handwriting, on the date shown.</p>
  <table class="sig">
    <thead><tr><th class="n">#</th><th>Signature</th><th>Printed name</th><th>Residence address (street, city, ZIP)</th><th>County</th><th class="d">Date</th></tr></thead>
    <tbody>${Array.from({ length: ROWS }, (_, i) => `<tr><td class="n">${i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}</tbody>
  </table>
  <p class="note">Signers must be residents of Indiana. Complete your own line in your own handwriting; a signer with a disability may authorize another person to write for them. Use your residence address, not a work address. One signature per person across all sheets. Nothing here is published; the petition is delivered to your own state representative and senator.</p>
  <p class="circ"><b>Circulator's statement.</b> I circulated this sheet and, to the best of my knowledge, each signature was made in my presence by the person whose name appears beside it.</p>
  <p class="lines">Circulator's signature ____________________________________ &nbsp; Printed name ____________________________________</p>
  <p class="lines">County ______________________________ &nbsp; Date ______________________ &nbsp; Return to: The Care Floor Coalition · ${EMAIL}</p>
</section>`;

const part1 = `
${partHeader(1, "The petition", "Sign this part. Read Part 2 first if you want the background.")}
${petitionHtml({ extraClosing: `<p style="margin-top:12px">Presented to the [House of Representatives / Senate] by the Honorable ______________________________, District ____, on ______________, 20____, for referral to the Committee on ______________________________.</p><p>Submitted on behalf of the petitioners by The Care Floor Coalition · ${EMAIL}. Total signatures attached: ______ on ______ sheets.</p>` })}
${Array.from({ length: SHEETS }, (_, i) => sheet(i + 1)).join("")}`;

// ---------------- Part 2 ----------------
const part2 = `
<section class="info">
${partHeader(2, "What you need to know", "Background for signers and circulators. Every figure has a source on the last page.")}
<h1 style="text-align:left;text-transform:none;letter-spacing:0;font-family:Arial,Helvetica,sans-serif;font-size:17pt">A floor under the care, and a floor under the people who give it.</h1>
<p>Indiana has no minimum direct care staffing standard for nursing homes. The federal one was repealed in February 2026 and cannot be enforced until at least 2034. This petition asks the Indiana General Assembly to pass the Indiana Nursing Home Direct Care Staffing and Accountability Act in the 2027 session, and to recognize the people who do direct care, through the Care Floor Coalition, as a party to how those homes are run.</p>

<h2>The case, in five numbers</h2>
<div class="nums">
  <div><b>50th</b><span>of the 50 states and D.C. for nurse staffing hours per resident, adjusted for how sick residents are.</span><small>IndyStar analysis of federal data, Mar. 2025</small></div>
  <div><b>$2.6B</b><span>of $5.6 billion in supplemental Medicaid money generated by Indiana nursing homes was kept by the county hospitals that hold their licenses.</span><small>IndyStar, from records won in court</small></div>
  <div><b>88%</b><span>of Indiana nursing homes staffed below what their own residents' assessed needs required, Q1 2026.</span><small>Long Term Care Community Coalition</small></div>
  <div><b>0.00</b><span>certified nurse aide hours per resident day required by Indiana law. One of 18 states with no direct care minimum.</span><small>410 IAC 16.2-3.1-17; Consumer Voice</small></div>
  <div><b>2034</b><span>The federal staffing standard was repealed Feb. 2, 2026, and Congress barred enforcing one until after Sept. 30, 2034.</span><small>90 Fed. Reg. (Dec. 3, 2025); P.L. 119-21</small></div>
</div>
<p><b>How the money leaves the building.</b> A county hospital takes the nursing home's license, which unlocks a higher government-owner Medicaid rate, roughly $108 more per resident per day on a base near $297. The hospital sends the state a transfer, the state draws about two federal dollars for every local one, and the hospital keeps most of what comes back. Seven of 22 county hospitals that answered a records request admitted keeping 66 to 70 percent. It went to hospital buildings, equipment, ambulances, and technology. This was legal. That is the point.</p>

<h2>What the Act does</h2>
<div class="two">
<div>
<h3>1. Sets a floor, then checks it in person (IC 16-28-17)</h3>
<ul>
<li>3.00 total direct care hours per resident day from July 1, 2027; 3.48 from July 1, 2028, with 2.45 CNA hours and an RN on site around the clock.</li>
<li>No shift below 80% of the daily requirement; no averaging past 24 hours; no counting hours past 16 consecutive.</li>
<li>Annual unannounced surveys where a nurse or therapist watches real transfers, weighs residents, and interviews at least five aides privately. Thirty percent start nights or weekends.</li>
<li>Per-shift public posting of census and staff actually working. A staffing committee in every building, at least half elected floor staff.</li>
</ul>
<h3>2. Protects the aide who speaks (IC 16-28-18)</h3>
<ul>
<li>Anonymous reports straight to the state; on-site investigation within 2, 10, or 30 days; written findings in 60. No closing a report on the facility's paperwork alone.</li>
<li>Adverse action within 180 days of a report is presumed retaliation. Private right of action: reinstatement, double back pay, at least $10,000, expungement, attorney's fees.</li>
<li><b>Systemic cause determination.</b> Before an aide is reported to the nurse aide registry, disciplined, or fired, the state must decide whether short staffing, missing equipment, a false assist level, or facility direction caused the act. If it did, the facility is cited instead.</li>
</ul>
</div>
<div>
<h3>3. Makes violation cost more than compliance (IC 16-28-19)</h3>
<ul>
<li>$1,000 to $10,000 per day for staffing deficits; $50,000 per person for retaliation; $100,000 for false staffing data; plus the money the facility saved by breaking the rule, plus 25%.</li>
<li>No waiving or settling staffing and retaliation penalties. Not payable from Medicaid money or charged to residents. Owners, management companies, and landlords jointly liable.</li>
</ul>
<h3>4. Requires the money to reach the care (IC 16-22-15, IC 16-28-20)</h3>
<ul>
<li>County hospitals must spend at least 80% of the supplemental Medicaid payments a home generates on direct care at that home. Not on hospital construction, debt, fees, marketing, or lobbying.</li>
<li>Public facility-by-facility accounting every year, audited by the State Board of Accounts; diverted money repaid with interest.</li>
<li>Every Medicaid nursing facility: at least 70% of Medicaid revenue on direct care, 55% on direct care wages, with audited public cost reports.</li>
</ul>
<p style="font-size:9.5pt"><b>It is a moderate bill.</b> The second-phase floor equals the repealed federal standard and sits below the 4.1-hour research benchmark and below what D.C., Rhode Island, Illinois, Florida, Massachusetts, New York, and California already require. The worker protection chapter has essentially no fiscal note.</p>
</div>
</div>

<h2>Worker safety and resident safety are the same problem</h2>
<p>A resident's right only exists if someone can act on it without losing their job. When a resident refuses care and the aide honors that refusal, the aide gets written up. The right is on paper and the retaliation is real. Fix the retaliation and the rights start working on their own.</p>
<table class="t"><tr><th style="width:44%">What the worker gets</th><th>What the resident gets, on the same day</th></tr>
<tr><td>The right to report short staffing or missed care without being written up, anonymously, to the state directly</td><td>Complaints from the people who actually saw the shift, investigated on site instead of closed on the facility's paperwork</td></tr>
<tr><td>The right to refuse a task the worker reasonably believes will endanger a resident</td><td>No one-person transfers of a two-person resident because the second person was never scheduled</td></tr>
<tr><td>Working lifts and correct slings, a 72-hour repair clock, and a log staff can read</td><td>Fewer drops, fewer falls during transfer, fewer skin tears</td></tr>
<tr><td>An assist level that matches what the worker actually has to do, verified by a surveyor who watches</td><td>A care plan that tells the truth about how much help the resident needs, and staffing built on it</td></tr>
<tr><td>A hearing on systemic cause before a registry finding ends a career</td><td>The cause gets cited and fixed instead of the aide being replaced by the next one facing the same shift</td></tr>
<tr><td>A seat on a staffing committee with a written answer to every recommendation</td><td>Staffing decisions made by people who were on the floor at 3 a.m.</td></tr>
<tr><td>No more than 16 consecutive hours counted, no routine mandatory overtime</td><td>Care from someone in their eighth hour, not their nineteenth</td></tr>
</table>

<h2>The Care Floor Coalition</h2>
<p>An independent, Indiana-based, industry-wide coalition of the people who do direct care and the people who depend on it. Non-partisan. No dues. Not a union and not a substitute for one; not a law firm; never a place to send resident information or anything from inside a building.</p>
<div class="two">
<div>
<h3>Five rights on the floor</h3>
<ol>
<li><b>The right to report, and to be investigated.</b> Anonymous reports to the state, on-site investigation on a deadline, a presumption of retaliation for 180 days after.</li>
<li><b>The right to refuse an unsafe assignment and write it down.</b> Protected activity with a private right of action behind it.</li>
<li><b>The right to accurate assist levels and working equipment.</b> Two-person mechanical assist by presumption for the residents who need it, rebuttable only by a therapist who watched.</li>
<li><b>The right to a systemic cause determination before the registry.</b> The facility is cited for the cause instead of the aide.</li>
<li><b>The right to a seat where staffing is decided.</b> A staffing committee in every building; a direct care employee on every county hospital's facility advisory committee.</li>
</ol>
</div>
<div>
<h3>Who joins</h3>
<ul>
<li>Current CNAs, QMAs, LPNs, RNs, and dietary, housekeeping, laundry, and activities staff in Indiana long-term care.</li>
<li>Former staff, who can say publicly what current staff cannot.</li>
<li>Residents and their families, the group legislators actually answer.</li>
<li>Consumer, aging, disability, labor, faith, legal, and academic organizations, with one bounded ask each.</li>
</ul>
<h3>To join</h3>
<p>Email ${EMAIL} from a personal, non-work address with your name, county, role, and how you can help: collecting signatures, being a quiet county contact, contacting legislators, testifying, hosting a listening session, or reviewing the bill or the data.</p>
<div class="box"><b class="big">30 days</b>If something happens to you after you report a safety problem, the window to file a retaliation complaint with the Indiana Department of Labor (IOSHA) is <b>30 calendar days</b> from the adverse action. Federal OSHA is also 30 days. Most people lose it appealing internally. Write everything down, with dates, on your own phone.</div>
</div>
</div>

<h2>How a petition works at the Indiana Statehouse</h2>
<div class="two">
<div>
<h3>The right</h3>
<p>"No law shall restrain any of the inhabitants of the State from assembling together in a peaceable manner, to consult for their common good; nor from instructing their representatives; nor from applying to the General Assembly for redress of grievances." Constitution of the State of Indiana, Article 1, Section 31.</p>
<h3>What it can and cannot do</h3>
<p>Indiana has no citizen initiative or referendum. A petition cannot put a law on the ballot or force a vote. Its power is that a legislator presents it, it enters the record, it is referred to a committee, and every office that receives it counts the names from its own district.</p>
<h3>How it enters the chamber</h3>
<p>A member of the House or Senate presents a petition or memorial; it is filed with the chamber's clerk and referred by the presiding officer to a committee. Senate rules require a committee report before action. The likely committees are House Public Health and Senate Health and Provider Services.</p>
</div>
<div>
<h3>The form each sheet follows</h3>
<ul>
<li>Identical petition text on every sheet, with sheet numbers and the circulator's name.</li>
<li>Each signer's signature, printed name, and residence address in their own handwriting, the convention Indiana's statutory petitions use, plus county and date.</li>
<li>Indiana residents only, one signature per person, no notarization.</li>
</ul>
<h3>The timeline</h3>
<ul>
<li><b>Now to mid-November 2026:</b> the sponsor window. A legislator has to agree to carry the bill.</li>
<li><b>November 17, 2026:</b> Organization Day. The 125th General Assembly convenes to organize. Petitions delivered.</li>
<li><b>January 2027:</b> session reconvenes. 2027 is the long budget session, where nursing home Medicaid reimbursement is actually set.</li>
<li><b>April 29, 2027:</b> adjournment deadline.</li>
</ul>
<h3>Know your rights while you circulate</h3>
<ul>
<li>Talking with coworkers about staffing, pay, scheduling, and safety is protected concerted activity under federal labor law for most private-sector employees, union or not. Protected does not mean nobody will retaliate; it means retaliation is illegal and you can file. Document everything, with dates.</li>
<li>Find your state representative and senator by address at iga.in.gov/legislative/find-legislators.</li>
</ul>
</div>
</div>

<h2>How to circulate this petition</h2>
<ol>
<li><b>Print the whole packet.</b> Part 1 (the petition text) travels with every set of signature sheets. Print more sheets as needed and number them by hand.</li>
<li><b>Who can sign.</b> Any resident of Indiana, once. Signers write their own line: signature, printed name, home address, county, date.</li>
<li><b>Where to collect.</b> Kitchen tables, church halls, family council meetings, union halls, community events, parking lots after shift. Not inside a facility, not on a break room table, and never photographed at a workplace.</li>
<li><b>If you work in a facility.</b> Circulate off the clock and off the property. Do not use a work email or phone for anything about this petition. A current employee should not be the name on a delivery cover letter; ask a family member or former colleague to deliver.</li>
<li><b>Sign the circulator's statement</b> at the bottom of each sheet when it is full or when you stop collecting.</li>
<li><b>Return the sheets.</b> Photograph or scan each completed sheet and email it to ${EMAIL}, then keep the originals flat in one folder. Originals are what get delivered to the Statehouse.</li>
<li><b>Ask each signer one more thing:</b> to look up their two legislators. Signatures are sorted by district and delivered to each signer's own legislators before Organization Day and again in January.</li>
<li><b>Never collect</b> resident names, room numbers, diagnoses, photos from inside a building, or documents taken from an employer. The petition asks for a law; it names no facility and describes no individual case.</li>
</ol>

<h2>Sources</h2>
<ol class="src">
<li>IndyStar, Tony Cook and Emily Hopkins, "Careless" investigation; March 18, 2025 accounting of $2.6B of $5.6B retained by 21 county hospitals; Indiana ranked 50th for acuity-adjusted staffing. Summarized by Newsweek and Becker's Hospital Review, March 2025.</li>
<li>Long Term Care Community Coalition, staffing alert, Q1 2026 payroll-based journal data: 88% of Indiana homes below expected staffing.</li>
<li>Consumer Voice, State Nursing Home Staffing Standards Summary Report: eighteen states, Indiana included, with no direct care minimum.</li>
<li>410 IAC 16.2-3.1-17: 0.5 licensed nurse hours per resident day; RN 8 consecutive hours daily.</li>
<li>CMS, Repeal of Minimum Staffing Standards for Long-Term Care Facilities, interim final rule, 90 Fed. Reg., Dec. 3, 2025, effective Feb. 2, 2026; Public Law 119-21, § 71111.</li>
<li>Health and Hospital Corporation of Marion County v. Talevski, 599 U.S. 166 (2023).</li>
<li>Indiana Constitution, Art. 1 § 31; IC 2-2.1-1-2 and -3 (session dates); IC 3-8-6-6 (signer conventions).</li>
<li>Indiana Department of Labor, IOSHA Whistleblower Protection Unit: 30-day filing window; federal OSHA § 11(c).</li>
<li>Draft Indiana Nursing Home Direct Care Staffing and Accountability Act; The Care Floor coalition brief; The Indiana Nursing Home Ledger, September 2026.</li>
</ol>
<p class="foot">The Care Floor Coalition · a project of Together Network, Indiana long-term care workers, former workers, and families · ${EMAIL}. General information, not legal advice. Facts verified September 9, 2026; re-verify anything time-sensitive before relying on it. No facility is named as a wrongdoer and no resident information is requested.</p>
</section>`;

const doc = (body, title) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const b = await chromium.launch();
  const jobs = [
    ["Care_Floor_Petition.pdf", doc(part1 + '<div class="pb"></div>' + part2, "The Care Floor Petition")],
    ["Care_Floor_Petition_Part1_Petition.pdf", doc(part1, "The Care Floor Petition · Part 1")],
    ["Care_Floor_Petition_Part2_Information.pdf", doc(part2, "The Care Floor Petition · Part 2")],
  ];
  for (const [name, html] of jobs) {
    const p = await b.newPage();
    await p.setContent(html, { waitUntil: "load" });
    const out = path.join(DIR, name);
    await p.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true });
    await p.close();
    console.log("wrote", name, fs.statSync(out).size, "bytes");
  }
  await b.close();
})();
