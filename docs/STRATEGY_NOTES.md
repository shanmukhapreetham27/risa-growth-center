# Strategy, research and calculations

Author: Shanmukha Preetham Bukka · Challenge B, Sponsorship Growth · City: Bengaluru

This section backs the three slide deck. Every figure is labelled:
**Sourced** comes from the provided CampusFest 2025 sponsor dataset;
**External** comes from cited research (links in §9);
**Assumption** is my estimate, with its basis stated;
**Simulated** is data generated for the app with a fixed seed (payments, budgets, spend, seed tasks).

The deck treats CampusFest 2025 as last year's baseline and plans a new Bengaluru edition. The app replays the 2025 campaign as a command center.

## 1. Goal and headline

Goal: maximise sponsorship **cash collected before the festival**.

| Case | Cash collected before the fest | Signed value | Deals | vs 2025 confirmed cash (₹20,00,000) |
|---|---|---|---|---|
| Base | ₹24,46,227 (₹24.5L) | ₹27,31,255 | 28.1 | 1.2x |
| Stretch | ₹52,83,518 (₹52.8L) | ₹55,99,915 | 50.8 | 2.6x |

## 2. Why Bengaluru

1. **Students (External):** Bengaluru Urban has 1,148 colleges, the most of any district in India (AISHE 2023 to 24). Jaipur is next with 742.
2. **Brands (External):** Bengaluru is one of India's top two D2C hubs, with $3.4B raised across 342 deals between 2015 and Q1 2026. Delhi NCR is first, with $3.5B across 434 deals (Inc42 D2C 3.0 Report 2026). Bengaluru also drew about $4.6B across nearly 300 deals in 2025, close to 45% of India's startup funding.
3. **Fit with last year's sponsors (Sourced):** the 2025 sponsor categories (Food and beverage, Consumer products, Mobility, Education, Media, Personal care) are the consumer and youth categories these hubs produce.
4. **Why not Delhi NCR (Inference):** NCR edges Bengaluru on D2C funding, but its brands and colleges are spread across Delhi, Gurugram and Noida. Bengaluru puts a near equal brand base and the country's largest college cluster in one city, which keeps sampling and stall logistics simple.

## 3. Baseline: what CampusFest 2025 shows (Sourced)

**Data handling.**
1. Duplicates were removed by stable id: interactions 953 to 950, qualification 434 to 433, opportunity history 230 to 228.
2. Every metric uses the latest version of each record as of end of day IST, so no future outcome leaks into an earlier date.
3. The app reproduces every number below; `npm run verify` checks 132 of them against a reference.

**Funnel as of 20 Apr 2025:**
1. 180 prospect brands, all of them contacted.
2. 109 brands responded.
3. 60 discovery conversations (meeting held).
4. 58 opportunities, of which 46 reached proposal.
5. 24 confirmed partnerships (24 brands), against a goal of 28 (revised plan, 15 Mar).

Confirmed value is ₹22,40,000: ₹20,00,000 cash across 20 deals and ₹2,40,000 in kind across 4. Qualified brands are 60 against a goal of 55, so the gap is conversion, not lead volume.

| Channel group | Contacted | Responded | Conversations | Opportunities | Proposals | Confirmed |
|---|---|---|---|---|---|---|
| Warm: SC02 Warm Partner Introductions, SC04 Partner Interest Form, SC05 Creator Network Referrals | 44 | 44 | 36 | 25 | 25 | 24 |
| Cold: SC01 Brand Discovery Email, SC03 Brand Leader LinkedIn, SC06 Past Conversation Revival | 141 | 70 | 24 | 33 | 21 | 0 |

Other findings:
1. **Cobalt Learning:** O006 came from a cold channel (SC03). It was confirmed on 25 Feb at ₹80,000 and withdrew on 20 Mar. Cold shows 0 confirmed only as of 20 Apr.
2. **Stale pipeline:** all 26 open opportunities at 20 Apr are cold, and all are stale (no update in more than 7 days). Their proposed value is ₹14,40,000. The longest untouched is O035 Cedar Wellness, at 89 days. Cold deals spent longer in every stage: median 3, 4, 5 and 6 days, versus 2, 3, 3 and 2 for warm deals. They were also smaller, with a median proposed value of ₹55,000 against ₹90,000 for warm.
3. **Speed and size:** confirmed deals took a median 10 days from opportunity to confirmation and 16 days from first touch. Confirmed values ranged from ₹35,000 to ₹2,00,000, with a median of ₹92,500. The average cash deal was ₹1,00,000.

**Conclusion:** the engine is warm relationships. Cold outreach produced conversations but no lasting deals, and the cold pipeline died of neglect rather than rejection: only 7 of its 33 opportunities were lost or withdrawn, and the other 26 are still open but stale.

## 4. Who we target, why they pay, how we pick

**Motivations by category (Assumption, from the 2025 sponsor mix):**
1. Food, beverage and consumer products: sampling and trial.
2. Personal care: sampling plus creator content.
3. Mobility: app installs and test rides.
4. Education and edtech: lead capture.
5. Media: content and subscriptions.

**Selection criteria.** A brand enters the pipeline only if it meets all of the first four:
1. Its product sells to 18 to 24 year olds.
2. It has a Bengaluru marketing budget or team.
3. A warm path in exists: an alumnus, a past partner or a creator. This is the strongest predictor in the 2025 data: 24 of 25 warm opportunities were won, against 0 of 33 cold by 20 Apr.
4. It can pay cash on our terms.

Category clashes with exclusive partners are excluded.

## 5. Slide 1 model

**Formula, per engine:** cash = prospects × meeting rate × proposal rate × signed rate × average deal × collection rate.

| Engine | Prospects base / stretch | Meeting rate | Proposal rate | Signed rate | Avg deal | Collection | Basis |
|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 / 24 | 90% / 95% | 85% / 90% | 65% / 75% | ₹95,000 / ₹1,20,000 | 92% / 96% | Pool = last year's 24 partners. Renewal overall about 50% base, 64% stretch (Assumption: no reliable public benchmark; validated in week 12 calls). Deal anchored on the 2025 average cash deal of ₹1,00,000 |
| B Warm intro engine | 50 / 70 | 80% / 82% | 65% / 70% | 50% / 65% | ₹90,000 / ₹95,000 | 92% / 96% | Meeting and proposal rates from 2025 warm channels (82%, 69%). Signed rate cut from the observed 96% to 50%, because referred leads close about 26% at the sales conversation stage (External) and 25 opportunities is a small sample. 44 warm brands in 2025, 50 to 70 planned |
| C Near miss reactivation | 26 / 40 | 50% / 60% | 70% / 75% | 25% / 40% | ₹55,000 / ₹60,000 | 92% / 96% | Pool = 26 stalled 2025 opportunities (stretch adds 14 engaged brands). Deal = cold median proposed ₹55,000 plus a ₹40,000 starter tier |
| D Anchor partner ABM | 12 / 15 | 40% / 50% | 60% / 70% | 30% / 40% | ₹3,50,000 / ₹4,00,000 | 70% / 85% | Large Bengaluru brands for presenting and category slots. Low collection because procurement can pay after the event (Assumption) |

**Base case:**

| Engine | Prospects | Meetings | Proposals | Signed | Avg deal | Signed value | Collect | Cash |
|---|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 | 21.6 | 18.4 | 11.9 | ₹95,000 | ₹11,33,730 | 92% | ₹10,43,032 |
| B Warm intro engine | 50 | 40.0 | 26.0 | 13.0 | ₹90,000 | ₹11,70,000 | 92% | ₹10,76,400 |
| C Near miss reactivation | 26 | 13.0 | 9.1 | 2.3 | ₹55,000 | ₹1,25,125 | 92% | ₹1,15,115 |
| D Anchor partner ABM | 12 | 4.8 | 2.9 | 0.9 | ₹3,50,000 | ₹3,02,400 | 70% | ₹2,11,680 |
| **Total** | **112** | **79.4** | **56.3** | **28.1** | ₹97,200 | **₹27,31,255** | 90% | **₹24,46,227** |

**Stretch case:**

| Engine | Prospects | Meetings | Proposals | Signed | Avg deal | Signed value | Collect | Cash |
|---|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 | 22.8 | 20.5 | 15.4 | ₹1,20,000 | ₹18,46,800 | 96% | ₹17,72,928 |
| B Warm intro engine | 70 | 57.4 | 40.2 | 26.1 | ₹95,000 | ₹24,81,115 | 96% | ₹23,81,870 |
| C Near miss reactivation | 40 | 24.0 | 18.0 | 7.2 | ₹60,000 | ₹4,32,000 | 96% | ₹4,14,720 |
| D Anchor partner ABM | 15 | 7.5 | 5.2 | 2.1 | ₹4,00,000 | ₹8,40,000 | 85% | ₹7,14,000 |
| **Total** | **149** | **111.7** | **84.0** | **50.8** | | **₹55,99,915** | | **₹52,83,518** |

**Constraints that cap the model:**
1. **Capacity:** the base case needs 79 conversations, which is 4 owners at last year's pace of about 20 each (60 conversations across 3 opportunity owners). The stretch case needs 112 conversations, so about 5 owners at 25 each.
2. **Inventory:** the rate card below has 63 slots worth ₹62,50,000. The stretch case sells about 90% of it by value.

   | Tier | Slots | Price | Value |
   |---|---|---|---|
   | Presenting partner | 1 | ₹6,00,000 | ₹6,00,000 |
   | Category exclusive partner | 4 | ₹3,00,000 | ₹12,00,000 |
   | Zone partner | 8 | ₹1,50,000 | ₹12,00,000 |
   | Experience partner (stall, activation, digital) | 25 | ₹90,000 | ₹22,50,000 |
   | Sampling partner | 25 | ₹40,000 | ₹10,00,000 |
   | **Total** | **63** | | **₹62,50,000** |

3. **Timeline:** 12 weeks. Contracts take 50% at signing and the balance 3 weeks before the festival. Anyone signing inside those 3 weeks pays 100% upfront. This mirrors standard event sponsorship contracts (External: SPE, ASCE). With a 16 day median from first touch to confirmation, the last warm intro must arrive about 5 weeks out.
4. **Collection:** 92% with cash first terms versus 80% without (Assumption). The source has no bank receipts, so this is tracked weekly in the app.

**Downside sensitivity (base case):**

| Scenario | Cash collected |
|---|---|
| Base | ₹24,46,227 |
| Signed rates 10 points lower for engines A and B | ₹20,70,480 |
| No anchor partner signs | ₹22,34,547 |
| No cash first terms (80% and 60% collection) | ₹21,24,524 |
| All three at once | ₹16,16,348 |

## 6. Slide 2: prioritisation

**Framework:** a cash version of RICE. Score = expected base case cash × confidence ÷ person weeks.

To avoid double counting, bets 1, 3, 4 and 5 are valued at the 80% collection rate we would get without new terms. Bet 2 (cash first terms) carries the extra cash those terms collect. The five contributions then add up exactly to the totals.

| Rank | Bet | Base cash | Stretch cash | Confidence | Person weeks | Score | Call |
|---|---|---|---|---|---|---|---|
| 1 | Renewal and upsell desk | ₹9,06,984 | ₹14,77,440 | 0.8 | 4 | 1.81 | Double down |
| 2 | Cash first contracting and collections | ₹3,21,703 | ₹9,71,586 | 0.7 | 3 | 0.75 | Guardrail |
| 3 | Warm intro engine | ₹9,36,000 | ₹19,84,892 | 0.6 | 20 | 0.28 | Double down |
| 4 | Near miss reactivation, ₹40,000 starter tier | ₹1,00,100 | ₹3,45,600 | 0.5 | 3 | 0.17 | Small bet |
| 5 | Anchor partner ABM | ₹1,81,440 | ₹5,04,000 | 0.3 | 8 | 0.07 | Option, decide by week 6 |
| | **Total** | **₹24,46,227** | **₹52,83,518** | | **38 of 60** | | |

**Resources.** The team is 5 people × 12 weeks = 60 person weeks. The five bets use 38; the other 22 go to delivery (activations, reporting). Budgets total ₹95,000:

| Bet | Budget | What it pays for |
|---|---|---|
| Renewals | ₹15,000 | Recap reports |
| Cash first | ₹5,000 | Payment links |
| Warm intros | ₹40,000 | Connector thank yous and creator referral fees |
| Reactivation | ₹5,000 | Outreach |
| Anchors | ₹30,000 | Custom pitches |

**Dependencies and overlap:**
1. Renewed partners become connectors for the warm intro engine.
2. Anchors must lock by week 6, before category slots are sold to competitors.
3. Each brand has one owner, so reactivation and intros never count the same brand twice.

**Rejected:**
1. **Scaling cold email or LinkedIn:** in 2025 these channels contacted 141 brands and produced 33 opportunities, with 0 confirmed by 20 Apr.
2. **Counting in kind deals as revenue:** ₹2,40,000 of value, ₹0 of cash.
3. **Discounting to close:** it cuts cash, so we use a starter tier instead.
4. **Bought lead lists:** they are cold outreach by another name.

## 7. Slide 3: signals and thresholds

| Bet | Critical variable and biggest risk | Early signal | Scale if | Change if | Stop if |
|---|---|---|---|---|---|
| Renewals | Renewal intent; partners saw no ROI proof | Share of 24 partners booked by week 10 | 60% or more intent by week 9: sell upgrades | 35% to 60%: ROI recap plus early pay bonus | Under 35%: owner moves to warm intros |
| Cash first | Advance paid within 7 days; procurement pays net 60 | First 5 contracts | 80% or more on time: keep terms for all | 60% to 80%: reminders, escalate at day 10 | Under 60%: hold stall and logo until paid |
| Warm intros | Intros per connector; weak or slow intros | Intros received in week 11 | 1.5 or more per connector: recruit more | Under 1 per connector: target list plus reward | A connector group with 0 meetings in 2 weeks |
| Reactivation | Reply within 5 days; budget already spent | Replies from the first 10 | 25% or more: add the 28 engaged brands | 10% to 25%: lead with the ₹40,000 starter tier | Under 10% after 2 touches |
| Anchors | Decision maker access; cash lands after the fest | Meetings by week 9 | 2 or more proposals by week 8: add a slot | Meetings but no proposal: offer category exclusive | No signature by week 6: resell the slots |

**Portfolio rule, reviewed weekly:** if projected cash stays under 85% of plan for two weeks running, move person weeks from bets 4 and 5 into bets 1 and 3.

**How the Growth Center supports these calls:**
1. **Measure:** the funnel, targets versus actuals and projected cash on any date, plus a stale alert after 7 days without an update.
2. **Decide:** every campaign gets a badge from fixed rules, checked in this order (meeting rate = conversations ÷ contacted; win rate = confirmed ÷ closed):
   1. **Watch:** under 5 opportunities and under 3 closed.
   2. **Scale:** 3 or more closed, win rate of 50% or more, and meeting rate of 40% or more.
   3. **Stop:** 0 confirmed from 8 or more opportunities, with a meeting rate under 25%.
   4. **Change:** anything else.

   On the 2025 data at 20 Apr, the warm channels show Scale, Brand Discovery Email shows Stop, and LinkedIn and Past Conversation Revival show Change.
3. **Act:** the AI copilot answers from the live database with the as of date. It labels simulated figures, says when the data cannot answer, and turns recommendations into tasks or campaign changes only after the user confirms.

## 8. Limitations of the strategy

1. The 2025 data is fictional and small (58 opportunities), so its rates are directional. The warm win rate of 96% is implausibly high, which is why it is cut to 50%.
2. Renewal and collection rates are assumptions with no reliable public benchmark. Both have early checks in the first two weeks.
3. The rate card is my design, anchored to the 2025 deal range of ₹35,000 to ₹2,00,000. Pricing is not tied to footfall, because the sponsor data has no audience per sponsor.
4. Payments, budgets and spend in the app are simulated, because the source has none.

## 9. Sources

- **CampusFest 2025 sponsor dataset** (provided with the assignment): `data/Sponsor Dataset.xlsx` and the CSV export in `data/source_csv/`.
- **AISHE 2023 to 24 district college counts:**
  - https://www.freepressjournal.in/analysis/the-aishe-report-institutional-network-of-higher-education
  - https://zeenews.india.com/education/50-districts-30-of-indias-colleges-the-hidden-geography-of-higher-education-3060810.html
- **Inc42 D2C 3.0 Report 2026, city hubs:** https://inc42.com/buzz/delhi-ncr-emerges-as-indias-top-d2c-hub/
- **Inc42, Bengaluru 2025 startup funding:** https://inc42.com/lists/list-of-ecommerce-d2c-startups-in-bengaluru/
- **Referral versus cold close rates (SalesGravy):** https://salesgravy.com/reduce-cold-calls-shorten-sales-cycle-referrals/
- **Sponsorship payment terms:**
  - SPE sponsorship contract: https://www.spe.org/binaries/content/assets/spe-events/2021/symposium/21twid/21twid_20aca1-sponsorship_contract_fillablefinal.pdf
  - ASCE terms: https://www.asce.org/advertise-or-sponsor/asce-sales-terms-conditions
- **Model and reference calculations:** `scripts_reference/growth_model.py`, `docs/growth_model.json`, `scripts_reference/reference_engine.py`, `reference_metrics.json`.
