// Shared constants and input validation. The browser validates too, but the
// server is the authority: never trust a request body.
const COUNTIES = "Adams,Allen,Bartholomew,Benton,Blackford,Boone,Brown,Carroll,Cass,Clark,Clay,Clinton,Crawford,Daviess,Dearborn,Decatur,DeKalb,Delaware,Dubois,Elkhart,Fayette,Floyd,Fountain,Franklin,Fulton,Gibson,Grant,Greene,Hamilton,Hancock,Harrison,Hendricks,Henry,Howard,Huntington,Jackson,Jasper,Jay,Jefferson,Jennings,Johnson,Knox,Kosciusko,LaGrange,Lake,LaPorte,Lawrence,Madison,Marion,Marshall,Martin,Miami,Monroe,Montgomery,Morgan,Newton,Noble,Ohio,Orange,Owen,Parke,Perry,Pike,Porter,Posey,Pulaski,Putnam,Randolph,Ripley,Rush,St. Joseph,Scott,Shelby,Spencer,Starke,Steuben,Sullivan,Switzerland,Tippecanoe,Tipton,Union,Vanderburgh,Vermillion,Vigo,Wabash,Warren,Warrick,Washington,Wayne,Wells,White,Whitley".split(",");

const ROLES = [
  "A current CNA / QMA in Indiana long-term care",
  "A current LPN / RN in Indiana long-term care",
  "Other current long-term care staff (dietary, housekeeping, laundry, activities, therapy)",
  "A former long-term care worker",
  "A nursing home resident",
  "A family member of a resident",
  "An Indiana resident who supports this",
  "An organization (consumer, aging, disability, labor, faith, legal, academic)",
];

const HELP = [
  "Collect paper signatures in my county",
  "Be a quiet county contact for other workers",
  "Contact my legislators",
  "Testify or submit written testimony",
  "Host a listening session",
  "Share my story (with written consent, later)",
  "Help with public records requests",
  "Review the bill or the data",
  "Print, meeting space, or other support",
];

const EMPLOYER_TYPES = ["County-hospital-licensed nursing home", "Privately owned nursing home", "Assisted living or memory care", "Home health or hospice", "Staffing agency", "Hospital", "Not currently working in care", "Not applicable"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const PHONE_RE = /^[\d\s().+-]{7,20}$/;

const s = (v, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const bool = (v) => v === true || v === "true" || v === "on" || v === 1 || v === "1";
const norm = (v) => s(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const shortName = (name) => { const p = name.split(" "); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
const shortRole = (role) => role.replace(/^A |^An |^Other /, "").replace(/ in Indiana long-term care$/, "").replace(/ \(.*\)$/, "");

function validateSignature(b) {
  const v = {
    name: s(b.name, 80), street: s(b.street, 120), city: s(b.city, 60), zip: s(b.zip, 10), county: s(b.county, 40), role: s(b.role, 120),
    email: s(b.email, 120).toLowerCase(), phone: s(b.phone, 20),
    public_listing: bool(b.public_listing) ? 1 : 0, join_coalition: bool(b.join_coalition) ? 1 : 0,
  };
  const missing = [];
  if (v.name.length < 2 || !/\S\s+\S/.test(v.name)) missing.push("your full printed name");
  if (v.street.length < 4) missing.push("street address");
  if (v.city.length < 2) missing.push("city");
  if (!ZIP_RE.test(v.zip)) missing.push("a 5-digit ZIP");
  if (!COUNTIES.includes(v.county)) missing.push("county");
  if (!ROLES.includes(v.role)) missing.push("who you are");
  if (v.email && !EMAIL_RE.test(v.email)) missing.push("a valid email (or leave it blank)");
  if (v.phone && !PHONE_RE.test(v.phone)) missing.push("a valid phone (or leave it blank)");
  if (!bool(b.attest)) missing.push("the attestation checkbox");
  if (v.join_coalition && !v.email && !v.phone) missing.push("an email or phone so the coalition can reach you");
  if (missing.length) return { ok: false, error: "Still needed: " + missing.join(", ") + "." };
  v.dedupe_key = norm(v.name) + "|" + v.zip.slice(0, 5);
  return { ok: true, values: v };
}

function validateMember(b) {
  const helpList = Array.isArray(b.help) ? b.help : (typeof b.help === "string" && b.help ? [b.help] : []);
  const v = {
    name: s(b.name, 80), email: s(b.email, 120).toLowerCase(), phone: s(b.phone, 20), county: s(b.county, 40), role: s(b.role, 120),
    employer_type: s(b.employer_type, 60), help: helpList.map((h) => s(h, 80)).filter((h) => HELP.includes(h)).join("; "),
    testify: bool(b.testify) ? 1 : 0, county_contact: bool(b.county_contact) ? 1 : 0, message: s(b.message, 1000), contact_pref: s(b.contact_pref, 20),
  };
  if (v.employer_type && !EMPLOYER_TYPES.includes(v.employer_type)) v.employer_type = "";
  const missing = [];
  if (v.name.length < 2) missing.push("your name");
  if (!v.email && !v.phone) missing.push("an email or a phone number");
  if (v.email && !EMAIL_RE.test(v.email)) missing.push("a valid email");
  if (v.phone && !PHONE_RE.test(v.phone)) missing.push("a valid phone number");
  if (!COUNTIES.includes(v.county)) missing.push("county");
  if (!ROLES.includes(v.role)) missing.push("who you are");
  if (!bool(b.consent)) missing.push("the consent checkbox");
  if (missing.length) return { ok: false, error: "Still needed: " + missing.join(", ") + "." };
  v.dedupe_key = v.email ? "e:" + v.email : "p:" + v.phone.replace(/\D/g, "");
  return { ok: true, values: v };
}

function validateLegislator(b) {
  const v = { chamber: s(b.chamber, 10), district: parseInt(b.district, 10), name: s(b.name, 80), party: s(b.party, 20), email: s(b.email, 120), phone: s(b.phone, 30), office: s(b.office, 120), committees: s(b.committees, 300), stance: s(b.stance, 40), notes: s(b.notes, 2000) };
  if (!["House", "Senate"].includes(v.chamber)) return { ok: false, error: "Chamber must be House or Senate." };
  const max = v.chamber === "House" ? 100 : 50;
  if (!(v.district >= 1 && v.district <= max)) return { ok: false, error: `District must be 1–${max} for the ${v.chamber}.` };
  if (v.name.length < 2) return { ok: false, error: "Name is required." };
  if (v.email && !EMAIL_RE.test(v.email)) return { ok: false, error: "Email looks wrong." };
  return { ok: true, values: v };
}

module.exports = { COUNTIES, ROLES, HELP, EMPLOYER_TYPES, EMAIL_RE, ZIP_RE, PHONE_RE, s, bool, norm, shortName, shortRole, validateSignature, validateMember, validateLegislator };
