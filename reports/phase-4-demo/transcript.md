# Demo rehearsal (SPEC §6.5), 2026-11-27T04:27:35.519Z

App on the Neon test branch (freshly reset, simulation date 2025-04-20), live model, driven by Playwright at 1440 x 900.

## Step 1. Overview at 20 Apr

Confirmed partnerships 24 vs goal 28. Badges: SC01 STOP, SC02 SCALE, SC03 CHANGE, SC04 SCALE, SC05 SCALE, SC06 CHANGE.

Screenshot: `step-1-overview.png`

## Step 2. Why are we behind?

**User:** Why are we behind on partnerships?

**Copilot** (20.4 s):

**Short answer:** As of 20 Apr 2025 we have 24 confirmed partnerships against a goal of 28 (the revised plan, effective 15 Mar 2025). That is 4 short. All 24 came from warm channels. The cold channels have confirmed none, and their open deals have not been touched for weeks.

**Evidence (sourced unless noted)**
- **Qualified brands:** 60 against a goal of 55, so we are ahead on this goal. The shortfall is in closing, not in finding brands.
- **Warm channels (SC02, SC04, SC05):** 44 brands contacted and 44 responded. They produced 25 opportunities and 24 confirmations, a 96% proposal-to-confirmed rate.
- **Cold channels (SC01, SC03, SC06):** 141 brands contacted and 70 responded, which is a 49.6% response rate against 100% for warm. They produced 33 opportunities and 21 proposals. 0 are confirmed as of 20 Apr 2025.
  - O006 Cobalt Learning festival partnership (SC03 Brand Leader LinkedIn) was confirmed on 25 Feb 2025 and withdrawn on 20 Mar 2025, so a cold deal did hold a confirmation for a time.
- **Stale open deals (stale setting is 7 days, an assumption):** All 26 open opportunities are stale. They are all cold and worth ₹14,40,000 in proposed value. Days since last update range from 21 to 89.
  - 8 are in negotiating, worth ₹7,20,000.
  - 6 are in proposal sent, worth ₹3,30,000.
  - The oldest is O035 Cedar Wellness, last updated 21 Jan 2025.
- **Campaign badges:**
  - SC01 Brand Discovery Email is STOP. It has 0 confirmed from 11 opportunities and a 7.7% meeting rate.
  - SC03 Brand Leader LinkedIn and SC06 Past Conversation Revival are CHANGE. Both have a 100% stale share and 0% win rate.
  - SC02 Warm Partner Introductions, SC04 Partner Interest Form and SC05 Creator Network Referrals are SCALE.
- **Spend (simulated):** The three cold campaigns have ₹59,100 of spend to date (₹30,000 + ₹25,100 + ₹4,000), with ₹0 cash collected.

**Likely explanation (inference)**
- We put most of our outreach (141 of 180 brands) into cold channels that convert poorly.
- Their open deals, including 8 in negotiation, stalled with no follow-up. Reviving them looks like the quickest way to close the 4-deal gap. Only 26 open deals remain, so the pipeline is thin.
- Warm channels had no open deals left, so there is nothing more to close there.

**What the data cannot show**
- It has no loss or withdrawal reasons. The history of O006 Cobalt Learning festival partnership has no reason field, so I can't say why it was withdrawn or why other cold deals stalled.
- It does not show whether follow-ups happened outside the logged updates.

The festival has already happened (12–13 Apr 2025), so these gaps matter for planning the next edition. If you like, I can propose follow-up tasks for the 8 stale negotiating deals, or a status change for SC01 Brand Discovery Email.

Data used:

- get_overview: no arguments as of 2025-04-20
- get_funnel: group_by=channel_group as of 2025-04-20
- list_opportunities: 26 of 26 opportunities as of 2025-04-20, 4 tie group(s)
- get_campaign_decisions: no arguments as of 2025-04-20
- calculate: 30000+25100+4000 = 59100
- get_opportunity_history: opportunity_id=O006 as of 2025-04-20

Screenshot: `step-2-why-behind.png`

## Step 3. Follow up: stuck deals by value

**User:** Which stuck deals are worth the most?

**Copilot** (9.7 s):

As of 20 Apr 2025, all 26 open deals are stale (7-day setting, an assumption). The 8 most valuable are all in negotiating. Values are proposed cash (sourced), and all 8 are cold deals. This list is the top 8 of 26, so it is truncated.

| Rank | Deal | Campaign | Owner | Value | Days since update |
|---|---|---|---|---|---|
| 1 | O028 Cedar Pantry | SC03 Brand Leader LinkedIn | Riya Kapoor | ₹1,10,000 | 33 |
| 2 | O053 Evergreen Living | SC06 Past Conversation Revival | Nisha Rao | ₹90,000 | 73 |
| 3 | O038 Daybreak Pantry | SC06 Past Conversation Revival | Nisha Rao | ₹90,000 | 56 |
| 4 | O048 Evergreen Pantry | SC01 Brand Discovery Email | Riya Kapoor | ₹90,000 | 47 |
| 5 | O058 Fable Pantry | SC03 Brand Leader LinkedIn | Meera Iyer | ₹90,000 | 38 |
| 6 | O033 Cedar Living | SC01 Brand Discovery Email | Riya Kapoor | ₹90,000 | 30 |
| 7 | O043 Daybreak Living | SC03 Brand Leader LinkedIn | Meera Iyer | ₹90,000 | 21 |
| 8 | O027 Bramble Works | SC01 Brand Discovery Email | Riya Kapoor | ₹70,000 | 41 |

**Ties:** Six deals tie at ₹90,000 (ranks 2 to 7). I ordered them by the tie-break rule: value descending, then oldest last update first, then id. O028 Cedar Pantry is the single largest at ₹1,10,000 with no tie. O027 Bramble Works at ₹70,000 follows the tied group.

O053 Evergreen Living has gone longest without an update among the top group, at 73 days.

I can propose follow-up tasks for these deals. I would need to know whether you want one task per deal or one per owner.

Data used:

- list_opportunities: 8 of 26 opportunities as of 2025-04-20, 1 tie group(s)

Screenshot: `step-3-stuck-deals.png`

## Step 4. Two actions, confirmed by the user

**User:** Pause Brand Discovery Email and create a task for Riya to follow up the top negotiating deals by 25 April

**Copilot** (17.9 s):

I've prepared two proposals. Nothing changes until you click Confirm on each card.

1. **Pause SC01 Brand Discovery Email (P-1).** It is currently active. As of 20 Apr 2025 it has a STOP badge, with 0 confirmed from 11 opportunities and a 7.7% meeting rate.
2. **Task for Riya Kapoor, due 25 Apr 2025 (P-2).** The task is to follow up her negotiating deals: O028 Cedar Pantry, O048 Evergreen Pantry, O033 Cedar Living and O027 Bramble Works. All four are stale, with 30 to 47 days since the last update. Together they are worth ₹3,60,000 in proposed value.

**How I read "top negotiating deals":** I took all four negotiating deals Riya owns. Among those four, O028 Cedar Pantry is the largest at ₹1,10,000. The alternative is the top deals across the whole team, which would add O053 Evergreen Living, O038 Daybreak Pantry, O058 Fable Pantry and O043 Daybreak Living, owned by Nisha Rao and Meera Iyer. If you want that version, use the Edit button or ask me.

Pausing SC01 Brand Discovery Email won't remove its open deals. Three of Riya's negotiating deals (O048 Evergreen Pantry, O033 Cedar Living and O027 Bramble Works) belong to that campaign, so the task still covers them.

Data used:

- propose_campaign_status: error: Proposal not created: its text failed the grounding check. (1) counts not taken from a tool result or calculate call made for this answer: "All 9". Recompute wi
- propose_task: error: Proposal not created: its text failed the grounding check. (1) counts not taken from a tool result or calculate call made for this answer: "4 negotiating deals"
- list_opportunities: 4 of 4 opportunities as of 2025-04-20, 1 tie group(s)
- list_opportunities: 4 of 4 opportunities as of 2025-04-20, 1 tie group(s)
- propose_campaign_status: proposal P-1 pending (awaits Confirm)
- propose_task: proposal P-2 pending (awaits Confirm)

Proposal cards:

- Proposed campaign status change P-1 AWAITING YOUR CONFIRMATION Campaign Brand Discovery Email (SC01) Status active → paused Reason SC01 Brand Discovery Email has a STOP badge as of 20 Apr 2025: 0 confirmed from 11 opportunities and a 7.7% meeting rate. Confirm Edit Cancel
- Proposed task P-2 AWAITING YOUR CONFIRMATION Title Follow up Riya's negotiating deals: O028 Cedar Pantry, O048 Evergreen Pantry, O033 Cedar Living, O027 Bramble Works Owner Riya Kapoor Due 2025-04-25 Opportunities O028, O048, O033, O027 Notes These are all 4 of Riya Kapoor's negotiating deals as of 20 Apr 2025, worth ₹3,60,000 in proposed value. All are stale, with 30 to 47 days since the last update. O028 Cedar Pantry is ₹1,10,000, O048 Evergreen Pantry and O033 Cedar Living are ₹90,000 each, and O027 Bramble Works is ₹70,000. Confirm Edit Cancel

Screenshot: `step-4a-proposals.png`

After Confirm:

- Brand Discovery Email is now paused. See the Campaigns page and Recent changes.
- Created task APP-TSK-1 for Riya Kapoor, due 2025-04-25. It is on the Tasks page and in Recent changes.

Screenshot: `step-4b-confirmed.png`

## Step 5. The writes show on the pages

Campaigns: SC01 Brand Discovery Email is paused.

Screenshot: `step-5a-campaigns.png`

Tasks: Follow up Riya's negotiating deals: O028 Cedar Pantry, O048 Evergreen Pantry, O033 Cedar Living, O027 Bramble Works APP-TSK-1 · These are all 4 of Riya Kapoor's negotiating deals as of 20 Apr 2025, worth ₹3,60,000 in proposed value. All are stale, with 30 to 47 days since the last update. O028 Cedar Pantry is ₹1,10,000, O048 Evergreen Pantry and O033 Cedar Living are ₹90,000 each, and O027 Bramble Works is ₹70,000. Riya Kapoor 25 Apr 2025 Open Opportunities: O028, O048, O033, O027 Copilot Edit Delete

Screenshot: `step-5b-tasks.png`

Recent changes (audit_log):

- 27 Nov 2026, 09:58 Copilot task.create tasks APP-TSK-1
- 27 Nov 2026, 09:58 Copilot campaign.status sponsor_campaigns SC01

Screenshot: `step-5c-recent-changes.png`

## Step 6. A question the data cannot answer

**User:** Why did Cobalt Learning withdraw?

**Copilot** (8.4 s):

Both changes are in. SC01 Brand Discovery Email is now paused, and task APP-TSK-1 is created for Riya Kapoor, due 25 Apr 2025.

**The data can't say why O006 Cobalt Learning festival partnership was withdrawn.** Its history has no reason field for lost or withdrawn deals. It shows only the stage changes (sourced, as of 20 Apr 2025):

- 15 Feb 2025: prospecting.
- 17 Feb 2025: contacted.
- 20 Feb 2025: proposal sent.
- 23 Feb 2025: negotiating.
- 25 Feb 2025: partner confirmed, with ₹80,000 confirmed value.
- 20 Mar 2025: withdrawn, and the confirmed value went to ₹0.

The brand (Cobalt Learning) was qualified on 10 Feb 2025 ("Audience and partnership fit confirmed through the conversation"). The deal stayed confirmed for about three and a half weeks before it was withdrawn. The data has no later qualification change and no note explaining the withdrawal. I won't guess at a cause.

I can propose a task for Riya Kapoor, who owned O006 Cobalt Learning festival partnership, to ask the brand and record the reason. Do you want that, and with what due date?

Screenshot: `step-6-cobalt.png`

## Step 7. An edit on Pipeline shows on Overview and in the copilot

Pipeline: O028 moved to partner_confirmed (APP-OH-1); 2 installment(s) created

Overview: confirmed partnerships 25.

Screenshot: `step-7a-overview-25.png`

**User:** How many confirmed partnerships do we have now?

**Copilot** (8.2 s):

**We have 25 confirmed partnerships as of 20 Apr 2025.** That is 3 short of the 28 goal (revised plan, effective 15 Mar 2025). The sourced count was 24 before.

**What changed:** An edit made in the app moved O028 Cedar Pantry (SC03 Brand Leader LinkedIn) to partner confirmed on 20 Apr 2025, at ₹1,10,000. It is the first cold deal confirmed since O006 Cobalt Learning festival partnership was withdrawn on 20 Mar 2025. This also changes some figures from my earlier answers:

| Metric (20 Apr 2025, sourced) | Now | Earlier |
|---|---|---|
| Confirmed partnerships | 25 | 24 |
| Confirmed value, total | ₹23,50,000 | ₹22,40,000 |
| Confirmed value, cash | ₹21,10,000 | ₹20,00,000 |
| Confirmed value, in kind | ₹2,40,000 | ₹2,40,000 |
| Open opportunities | 25 | 26 |
| Open pipeline, proposed | ₹13,30,000 | ₹14,40,000 |

All 25 open deals are still stale (7-day setting, an assumption). The confirmed count is by opportunity, and there are 25 confirmed brands.

The cash figures are simulated, so I can't treat them as received money. Outstanding confirmed cash is now ₹2,67,500, up from ₹1,57,500. Cash collected is unchanged at ₹18,42,500.

Data used:

- get_overview: no arguments as of 2025-04-20

Screenshot: `step-7b-copilot-25.png`
