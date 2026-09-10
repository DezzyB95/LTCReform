# -*- coding: utf-8 -*-
import base64, io, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def b64(f): return base64.b64encode(open("fonts/" + f, "rb").read()).decode()

FONTS = """
@font-face{font-family:Archivo;font-weight:100 900;font-display:block;
 src:url(data:font/woff2;base64,%s) format('woff2');}
@font-face{font-family:'Source Sans 3';font-weight:100 900;font-display:block;
 src:url(data:font/woff2;base64,%s) format('woff2');}
""" % (b64("Archivo-700.woff2"), b64("SourceSans3-400.woff2"))

CSS = FONTS + """
*{box-sizing:border-box;margin:0;padding:0}
:root{--ground:#F7F5F1;--ink:#1C1C1A;--ink2:#5B5A55;--ink3:#8A877E;
      --slate:#2E4A62;--clay:#A8503C;--rule:#D9D5CC}
body{background:#333;font-family:'Source Sans 3',sans-serif}
.slide{width:1080px;height:1350px;background:var(--ground);color:var(--ink);
       padding:96px 88px;display:flex;flex-direction:column;position:relative;
       overflow:hidden;margin:0 0 24px}
.wide{width:1200px;height:675px;padding:72px 80px}
.eyebrow{font-family:Archivo;font-weight:600;font-size:26px;letter-spacing:.14em;
         text-transform:uppercase;color:var(--ink2)}
h1{font-family:Archivo;font-weight:800;font-size:104px;line-height:1.0;
   letter-spacing:-.02em;margin-top:34px}
h1.sm{font-size:82px}
h2{font-family:Archivo;font-weight:700;font-size:62px;line-height:1.06;
   letter-spacing:-.015em;margin-top:30px}
.rule{height:2px;background:var(--slate);margin:38px 0 0;width:170px}
.lede{font-size:38px;line-height:1.42;color:var(--ink);margin-top:38px;max-width:30ch}
.body{font-size:34px;line-height:1.45;color:var(--ink)}
.src{font-size:22px;line-height:1.38;color:var(--ink3);margin-top:auto;
     padding-top:34px;border-top:1px solid var(--rule)}
.grow{flex:1}
.fig{font-family:Archivo;font-weight:800;letter-spacing:-.035em;
     color:var(--slate);font-size:340px;line-height:.84}
.fig.alert{color:var(--clay)}
.fig.small{font-size:250px}
.figcap{font-size:41px;line-height:1.36;margin-top:46px;max-width:22ch}
ol.asks{list-style:none;margin-top:46px}
ol.asks li{display:flex;gap:28px;margin-bottom:54px}
ol.asks .n{font-family:Archivo;font-weight:700;font-size:42px;color:var(--clay);
           min-width:56px;line-height:1.2}
ol.asks .t{font-size:36px;line-height:1.38}
ol.asks b{font-weight:600}
.tl{margin-top:44px}
.tl .row{display:flex;gap:30px;padding:30px 0;border-top:1px solid var(--rule);align-items:baseline}
.tl .row:last-child{border-bottom:1px solid var(--rule)}
.tl .d{font-family:Archivo;font-weight:700;font-size:29px;color:var(--slate);
       min-width:230px;letter-spacing:-.01em}
.tl .w{font-size:32px;line-height:1.36}
.tl .row.last .d,.tl .row.last .w{color:var(--clay)}
.tl .row.last .w{font-weight:600}
.steps{margin-top:46px}
.steps .s{display:flex;gap:28px;margin-bottom:48px;align-items:baseline}
.steps .k{font-family:Archivo;font-weight:700;font-size:38px;color:var(--clay);min-width:52px}
.steps .v{font-size:35px;line-height:1.38}
.url{font-family:Archivo;font-weight:700;font-size:44px;color:var(--slate);
     margin-top:14px;letter-spacing:-.01em;word-break:break-all}
.mark{font-family:Archivo;font-weight:600;font-size:28px;color:var(--ink2);
      margin-top:auto;padding-top:34px;border-top:1px solid var(--rule)}
.kicker{font-size:33px;line-height:1.4;color:var(--ink2);margin-top:26px;max-width:26ch}
"""

SITE = "staffthefloor.netlify.app"

slides = []

# 1 — cover
slides.append(("01-cover", """
<p class="eyebrow">Petition &middot; Indiana General Assembly &middot; 2027</p>
<h1 style="font-size:86px;margin-top:30px">A floor under<br>the care, and a floor<br>under the people<br>who give it.</h1>
<div class="rule"></div>
<p class="lede" style="margin-top:34px">Indiana sets no minimum number of care hours a nursing home resident must
receive. The federal minimum is repealed until 2034. This petition asks the General
Assembly to set one.</p>
<div class="grow"></div>
<p class="src">Sign it at %s</p>
""" % SITE, "Petition to the 125th Indiana General Assembly, 2027 session. A floor under the care, and a floor under the people who give it. Indiana sets no minimum number of care hours a nursing home resident must receive. The federal minimum is repealed until 2034. This petition asks the General Assembly to set one. Sign it at %s" % SITE))

# 2 — 0.00
slides.append(("02-zero", """
<p class="eyebrow">What Indiana law requires</p>
<div class="grow" style="display:flex;flex-direction:column;justify-content:center">
  <div class="fig alert">0.00</div>
  <p class="figcap">certified nurse aide hours per resident, per day, required by Indiana
  law. Indiana is one of 18 states with no direct care staffing minimum of any kind.</p>
</div>
<p class="src">410 IAC 16.2-3.1-17. Consumer Voice, State Nursing Home Staffing Standards
Summary Report.</p>
""", "Zero point zero zero certified nurse aide hours per resident, per day, required by Indiana law. Indiana is one of 18 states with no direct care staffing minimum of any kind. Source: 410 IAC 16.2-3.1-17, and Consumer Voice, State Nursing Home Staffing Standards Summary Report."))

# 3 — 50th
slides.append(("03-fiftieth", """
<p class="eyebrow">Where that leaves us</p>
<div class="grow" style="display:flex;flex-direction:column;justify-content:center">
  <div class="fig">50th</div>
  <p class="figcap">of the 50 states and D.C. for total nurse staffing hours per resident,
  adjusted for how sick residents are.</p>
</div>
<p class="src">IndyStar analysis of federal payroll-based staffing data, March 18, 2025.</p>
""", "Fiftieth of the 50 states and D.C. for total nurse staffing hours per resident, adjusted for how sick residents are. Source: IndyStar analysis of federal payroll-based staffing data, March 18, 2025."))

# 4 — money
slides.append(("04-money", """
<p class="eyebrow">Where the money went</p>
<div class="grow" style="display:flex;flex-direction:column;justify-content:center">
  <div class="fig small">$2.6B</div>
  <p class="figcap">of $5.6 billion in supplemental Medicaid payments generated by Indiana
  nursing homes over about 15 years was kept by the county hospitals that hold their
  licenses, and spent on hospital construction, equipment and operations.</p>
</div>
<p class="src">IndyStar &ldquo;Careless&rdquo; investigation, March 2025, from county
hospital records obtained after a 2022 public records lawsuit.</p>
""", "Two point six billion dollars of 5.6 billion dollars in supplemental Medicaid payments generated by Indiana nursing homes over about 15 years was kept by the county hospitals that hold their licenses, and spent on hospital construction, equipment and operations. Source: IndyStar Careless investigation, March 2025, from county hospital records obtained after a 2022 public records lawsuit."))

# 5 — timeline
slides.append(("05-timeline", """
<p class="eyebrow">Why now</p>
<h2>The federal floor is gone<br>for the rest of the decade.</h2>
<div class="tl">
  <div class="row"><div class="d">May 2024</div><div class="w">A federal minimum is set: 3.48 care hours per resident day, RN on site around the clock.</div></div>
  <div class="row"><div class="d">April 2025</div><div class="w">A federal court in Texas vacates the rule.</div></div>
  <div class="row"><div class="d">July 2025</div><div class="w">Congress bars enforcement until after September 30, 2034.</div></div>
  <div class="row"><div class="d">February 2026</div><div class="w">The repeal takes effect. One RN on site 8 hours a day is all that returns.</div></div>
  <div class="row last"><div class="d">Indiana</div><div class="w">Never had a standard of its own.</div></div>
</div>
<p class="src">CMS interim final rule, 90 Fed. Reg., Dec. 3, 2025, effective Feb. 2, 2026.
Public Law 119-21, sec. 71111.</p>
""", "Why now: the federal floor is gone for the rest of the decade. May 2024, a federal minimum is set of 3.48 care hours per resident day with an RN on site around the clock. April 2025, a federal court in Texas vacates the rule. July 2025, Congress bars enforcement until after September 30, 2034. February 2026, the repeal takes effect and one RN on site 8 hours a day is all that returns. Indiana never had a standard of its own. Source: CMS interim final rule, 90 Federal Register, December 3, 2025, effective February 2, 2026, and Public Law 119-21 section 71111."))

# 6 — asks 1-3
slides.append(("06-asks-1", """
<p class="eyebrow">The petition asks the General Assembly to</p>
<ol class="asks">
  <li><span class="n">1</span><span class="t">Introduce, hear in committee, and <b>enact the Indiana Nursing Home Direct Care Staffing and Accountability Act</b> in the 2027 session.</span></li>
  <li><span class="n">2</span><span class="t">Set a <b>direct care staffing floor</b>: 3.00 hours per resident day from July 1, 2027 and 3.48 from July 1, 2028, including 2.45 aide hours and an RN on site 24 hours a day, with staffing set above the minimum by how sick residents actually are, unannounced verification surveys, and staffing posted publicly every shift.</span></li>
  <li><span class="n">3</span><span class="t">Protect <b>every caregiver who reports an unsafe condition or refuses an unsafe assignment</b>, with a presumption of retaliation, a private right of action, and a finding on systemic cause before any aide is disciplined, fired, or placed on the registry for something short staffing caused.</span></li>
</ol>
<p class="src">Full text of the petition and the draft Act at %s</p>
""" % SITE, "The petition asks the General Assembly to: One, introduce, hear in committee, and enact the Indiana Nursing Home Direct Care Staffing and Accountability Act in the 2027 session. Two, set a direct care staffing floor of 3.00 hours per resident day from July 1, 2027 and 3.48 from July 1, 2028, including 2.45 aide hours and an RN on site 24 hours a day, with staffing set above the minimum by how sick residents actually are, unannounced verification surveys, and staffing posted publicly every shift. Three, protect every caregiver who reports an unsafe condition or refuses an unsafe assignment, with a presumption of retaliation, a private right of action, and a finding on systemic cause before any aide is disciplined, fired, or placed on the registry for something short staffing caused. Full text at %s" % SITE))

# 7 — asks 4-6
slides.append(("07-asks-2", """
<p class="eyebrow">The petition asks the General Assembly to</p>
<ol class="asks">
  <li><span class="n">4</span><span class="t">Make <b>penalties cost more than compliance</b>: not reduced when the home corrects, not paid out of Medicaid money, not charged to residents, and deposited in a direct care restitution fund.</span></li>
  <li><span class="n">5</span><span class="t">Require county hospitals that hold nursing home licenses to <b>spend at least 80 percent</b> of the supplemental Medicaid payments a home generates on direct care at that home, publish a facility-by-facility accounting every year, and repay what was diverted.</span></li>
  <li><span class="n">6</span><span class="t">Recognize the <b>direct care workforce as a party</b> to how nursing homes are run, and invite workers, residents and families to testify when the Act is heard.</span></li>
</ol>
<p class="src">Full text of the petition and the draft Act at %s</p>
""" % SITE, "The petition asks the General Assembly to: Four, make penalties cost more than compliance, not reduced when the home corrects, not paid out of Medicaid money, not charged to residents, and deposited in a direct care restitution fund. Five, require county hospitals that hold nursing home licenses to spend at least 80 percent of the supplemental Medicaid payments a home generates on direct care at that home, publish a facility-by-facility accounting every year, and repay what was diverted. Six, recognize the direct care workforce as a party to how nursing homes are run, and invite workers, residents and families to testify when the Act is heard. Full text at %s" % SITE))

# 8 — sign
slides.append(("08-sign", """
<p class="eyebrow">Add your name</p>
<h2 style="font-size:70px">Indiana residents<br>can sign it today.</h2>
<div class="steps">
  <div class="s"><span class="k">1</span><span class="v">Read the petition and sign it at the link. Name, home address, county. Your address is never published.</span></div>
  <div class="s"><span class="k">2</span><span class="v">Print a sheet from the same page and collect ten signatures in ink. Paper is what gets delivered to the Statehouse.</span></div>
  <div class="s"><span class="k">3</span><span class="v">Look up your two legislators and hand them the names from their own district.</span></div>
</div>
<p class="url">%s</p>
<p class="kicker">If you work in a facility: use a personal phone and a personal email,
never a work account.</p>
<p class="mark">Together Network &middot; Care Floor Coalition &middot; Indiana</p>
""" % SITE, "Add your name. Indiana residents can sign it today. One, read the petition and sign it at the link. Name, home address, county. Your address is never published. Two, print a sheet from the same page and collect ten signatures in ink. Paper is what gets delivered to the Statehouse. Three, look up your two legislators and hand them the names from their own district. Sign at %s. If you work in a facility, use a personal phone and a personal email, never a work account. Together Network, Care Floor Coalition, Indiana." % SITE))

# wide card for Bluesky / X
wide = ("09-wide", """
<p class="eyebrow">Petition &middot; Indiana General Assembly &middot; 2027 session</p>
<h1 class="sm" style="font-size:64px;margin-top:22px">Indiana requires zero aide hours<br>per nursing home resident.</h1>
<div class="rule" style="margin-top:26px"></div>
<p class="lede" style="font-size:29px;margin-top:26px;max-width:44ch">The federal minimum is repealed until 2034. This petition asks the General Assembly for a state staffing floor, protection for caregivers who report, and Medicaid money that reaches the bedside.</p>
<p class="src" style="font-size:20px">410 IAC 16.2-3.1-17 &middot; Public Law 119-21 &middot; Sign at %s</p>
""" % SITE, "Petition to the Indiana General Assembly, 2027 session. Indiana requires zero aide hours per nursing home resident. The federal minimum is repealed until 2034. This petition asks the General Assembly for a state staffing floor, protection for caregivers who report, and Medicaid money that reaches the bedside. Sign at %s" % SITE)

html = ["<meta charset='utf-8'><style>%s</style>" % CSS]
for name, inner, _ in slides:
    html.append('<div class="slide" id="%s">%s</div>' % (name, inner))
html.append('<div class="slide wide" id="%s">%s</div>' % (wide[0], wide[1]))
io.open("slides.html", "w", encoding="utf-8").write("\n".join(html))

alt = ["ALT TEXT — paste one per image when you upload.",
       "Every campaign image needs it. Most of the audience reads on a phone, and some use a screen reader.", ""]
for name, _, a in slides + [wide]:
    alt.append("%s.png" % name)
    alt.append(a)
    alt.append("")
io.open("alt-text.txt", "w", encoding="utf-8").write("\n".join(alt))
print("built %d slides + 1 wide card" % len(slides))
