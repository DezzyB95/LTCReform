// Address -> Indiana House and Senate district, using the U.S. Census Bureau
// geocoder (free, no key, public). Documentation:
// https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
//
// The "geographies" endpoint returns, for a matched address, the current
// state legislative districts as "State Legislative Districts - Upper"
// (SLDU = Senate) and "State Legislative Districts - Lower" (SLDL = House).
// District codes arrive zero-padded ("089"); we store them as integers.
const BASE = "https://geocoding.geo.census.gov/geocoder/geographies/address";

async function lookupDistricts({ street, city, zip }, { timeoutMs = 6000, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams({
    street, city, state: "IN", zip: String(zip).slice(0, 5),
    benchmark: "Public_AR_Current", vintage: "Current_Current",
    layers: "State Legislative Districts - Upper,State Legislative Districts - Lower",
    format: "json",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${BASE}?${params}`, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "care-floor-petition/1.0" } });
    if (!r.ok) return { status: "error", error: `geocoder HTTP ${r.status}` };
    const data = await r.json();
    return parseCensusResponse(data);
  } catch (e) {
    return { status: "error", error: e.name === "AbortError" ? "geocoder timeout" : e.message };
  } finally { clearTimeout(timer); }
}

function parseCensusResponse(data) {
  const matches = data && data.result && Array.isArray(data.result.addressMatches) ? data.result.addressMatches : [];
  if (!matches.length) return { status: "nomatch" };
  const m = matches[0];
  const g = m.geographies || {};
  const upper = (g["State Legislative Districts - Upper"] || [])[0];
  const lower = (g["State Legislative Districts - Lower"] || [])[0];
  const num = (o, key) => { if (!o) return null; const v = parseInt(String(o[key] || "").replace(/\D/g, ""), 10); return Number.isFinite(v) && v > 0 ? v : null; };
  const senate = num(upper, "SLDU"), house = num(lower, "SLDL");
  if (!senate && !house) return { status: "nomatch" };
  return {
    status: "done", house, senate,
    matched: m.matchedAddress || null,
    lat: m.coordinates ? Number(m.coordinates.y) : null, lon: m.coordinates ? Number(m.coordinates.x) : null,
  };
}

module.exports = { lookupDistricts, parseCensusResponse };
