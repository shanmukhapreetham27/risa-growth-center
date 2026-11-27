# Demo rehearsal (SPEC §6.5), 2026-11-27T03:06:14.630Z

App on the Neon test branch (freshly reset, simulation date 2025-04-20), live model, driven by Playwright at 1440 x 900.

## Step 1. Overview at 20 Apr

Confirmed partnerships 24 vs goal 28. Badges: SC01 STOP, SC02 SCALE, SC03 CHANGE, SC04 SCALE, SC05 SCALE, SC06 CHANGE.

Screenshot: `step-1-overview.png`

## Step 2. Why are we behind?

**User:** Why are we behind on partnerships?

**Copilot** (11.3 s):

**Short answer:** As of 20 Apr 2025 we have 24 confirmed partnerships against a goal of 28 (revised plan), so we are 4 short (sourced). The shortfall is in the cold channels. Warm channels are converting well.

**Evidence**
- **Warm channels (SC02, SC04, SC05):** 44 brands contacted and 44 responded. They produced 25 opportunities and 24 confirmed, which is 96% of proposals.
- **Cold channels (SC01, SC03, SC06):** 141 brands contacted and 70 responded (50%). 24 had conversations, 33 became opportunities and 21 reached proposal. None are confirmed as of 20 Apr 2025. Cobalt Learning, a cold deal, was confirmed from 25 Feb to 20 Mar and then withdrawn.
- **Open deals are all cold and all stale:** All 26 open opportunities are in cold campaigns and all 26 have had no update for more than 7 days. They are worth ₹14,40,000 proposed. The stale-day threshold is an assumption.
  - 8 are in negotiating, worth ₹7,20,000.
  - The oldest, Evergreen Threads, was last updated 79 days ago. The 8 negotiating deals were last updated 21 to 73 days ago.
  - Cedar Pantry (₹1,10,000, negotiating, last updated 18 Mar 2025) is the largest.
- **Campaign badges:**

| Campaign | Badge | Meeting rate | Confirmed |
|---|---|---|---|
| SC01 Brand Discovery Email | STOP | 7.7% | 0 |
| SC03 Brand Leader LinkedIn | CHANGE | 27% | 0 |
| SC06 Past Conversation Revival | CHANGE | 35% | 0 |
| SC02, SC04, SC05 (warm) | SCALE | 76% to 100% | 8, 7 and 9 |

- **Volume vs. results:** SC01 contacted 91 brands and got 7 conversations. Warm campaigns touched far fewer brands but closed almost everything they opened.

**Likely explanation (inference)**
- Cold outreach is low-yield at the meeting stage. The open cold deals also appear to have had no follow-up since March, so they stalled before closing.
- The four missing partnerships would most plausibly come from the 8 stale negotiating deals, but nothing in the data shows they are still live.

**What the data can't show:** There are no loss or withdrawal reasons, no record of follow-up activity on the stale deals, and no brand-fit data. I can't say why the cold deals stalled.

**Possible next steps:** I can propose follow-up tasks for the 8 stale negotiating deals, split by owner (Riya, Nisha and Meera). I can also propose pausing SC01, which carries the STOP badge.

Data used:

- get_overview: no arguments as of 2025-04-20
- get_funnel: group_by=channel_group as of 2025-04-20
- list_opportunities: 20 of 26 opportunities as of 2025-04-20, 3 tie group(s)
- get_campaign_decisions: no arguments as of 2025-04-20

Screenshot: `step-2-why-behind.png`

## Step 3. Follow up: stuck deals by value

**User:** Which stuck deals are worth the most?

**Copilot** (10.3 s):

The most valuable stuck deals as of 20 Apr 2025 are the 8 deals in negotiating. All are cash and cold, and all are stale (no update in more than 7 days, which is an assumption). Values are proposed values (sourced).

| # | Deal | Brand | Proposed value | Owner | Campaign | Last update (days ago) |
|---|---|---|---|---|---|---|
| 1 | O028 | Cedar Pantry | ₹1,10,000 | Riya Kapoor | SC03 | 18 Mar 2025 (33) |
| 2 | O053 | Evergreen Living | ₹90,000 | Nisha Rao | SC06 | 6 Feb 2025 (73) |
| 3 | O038 | Daybreak Pantry | ₹90,000 | Nisha Rao | SC06 | 23 Feb 2025 (56) |
| 4 | O048 | Evergreen Pantry | ₹90,000 | Riya Kapoor | SC01 | 4 Mar 2025 (47) |
| 5 | O058 | Fable Pantry | ₹90,000 | Meera Iyer | SC03 | 13 Mar 2025 (38) |
| 6 | O033 | Cedar Living | ₹90,000 | Riya Kapoor | SC01 | 21 Mar 2025 (30) |
| 7 | O043 | Daybreak Living | ₹90,000 | Meera Iyer | SC03 | 30 Mar 2025 (21) |
| 8 | O027 | Bramble Works | ₹70,000 | Riya Kapoor | SC01 | 10 Mar 2025 (41) |

**Tie:** Ranks 2 to 7 are tied at ₹90,000: O053, O038, O048, O058, O033 and O043. I ordered them by the tie-break rule (value descending, then oldest last update first, then id). If you prefer a different order, such as by owner, tell me.

**Why the rank matters:** O053 has been untouched the longest (73 days). So it is both a top-value deal and the one most likely to have gone cold.

I can propose follow-up tasks for these deals, one per owner or one per deal.

Data used:

- list_opportunities: 8 of 26 opportunities as of 2025-04-20, 1 tie group(s)

Screenshot: `step-3-stuck-deals.png`

## Step 4. Two actions, confirmed by the user

**User:** Pause Brand Discovery Email and create a task for Riya to follow up the top negotiating deals by 25 April

**Copilot** (10.9 s):

I've prepared two proposal cards. Nothing changes until you click Confirm on each.

1. **Pause SC01 Brand Discovery Email.** It is active now. The reason on the card is the STOP badge as of 20 Apr 2025: 0 confirmed, a 7.7% meeting rate, and 9 stale open deals.
2. **Task for Riya Kapoor, due 25 Apr 2025.** It covers her four negotiating deals: O028 Cedar Pantry (₹1,10,000), O048 Evergreen Pantry (₹90,000), O033 Cedar Living (₹90,000) and O027 Bramble Works (₹70,000).

**Reading I used for "top negotiating deals":** Riya's own negotiating deals. She owns 4 of the 8 negotiating deals. The alternative is the overall top deals, which include Nisha's and Meera's, so some of them aren't Riya's to follow up. Use Edit if you'd like a different set, or I can propose separate tasks for Nisha and Meera.

Pausing SC01 won't stop work on its 9 open deals. Two of them (O048 and O033) are in Riya's task.

Data used:

- propose_campaign_status: proposal P-1 pending (awaits Confirm)
- propose_task: proposal P-2 pending (awaits Confirm)

Proposal cards:

- Proposed campaign status change P-1 AWAITING YOUR CONFIRMATION Campaign Brand Discovery Email (SC01) Status active → paused Reason SC01 Brand Discovery Email has a STOP badge as of 20 Apr 2025: 0 confirmed, 11 opportunities, meeting rate 7.7% (below 25%), and all 9 open deals are stale. Confirm Edit Cancel
- Proposed task P-2 AWAITING YOUR CONFIRMATION Title Follow up Riya's top negotiating deals (Cedar Pantry, Evergreen Pantry, Cedar Living, Bramble Works) Owner Riya Kapoor Due 2025-04-25 Opportunities O028, O048, O033, O027 Notes All four are stale negotiating deals, last updated 30 to 41 days ago except Cedar Pantry (33). Proposed values: O028 ₹1,10,000; O048 ₹90,000; O033 ₹90,000; O027 ₹70,000. Confirm whether each is still live and log the outcome. Confirm Edit Cancel

Screenshot: `step-4a-proposals.png`

After Confirm:

- Brand Discovery Email is now paused. See the Campaigns page and Recent changes.
- Created task APP-TSK-1 for Riya Kapoor, due 2025-04-25. It is on the Tasks page and in Recent changes.

Screenshot: `step-4b-confirmed.png`

## Step 5. The writes show on the pages

Campaigns: SC01 Brand Discovery Email is paused.

Screenshot: `step-5a-campaigns.png`

Tasks: Follow up Riya's top negotiating deals (Cedar Pantry, Evergreen Pantry, Cedar Living, Bramble Works) APP-TSK-1 · All four are stale negotiating deals, last updated 30 to 41 days ago except Cedar Pantry (33). Proposed values: O028 ₹1,10,000; O048 ₹90,000; O033 ₹90,000; O027 ₹70,000. Confirm whether each is still live and log the outcome. Riya Kapoor 25 Apr 2025 Open Opportunities: O028, O048, O033, O027 Copilot Edit Delete

Screenshot: `step-5b-tasks.png`

Recent changes (audit_log):

- 27 Nov 2026, 08:36 Copilot task.create tasks APP-TSK-1
- 27 Nov 2026, 08:36 Copilot campaign.status sponsor_campaigns SC01

Screenshot: `step-5c-recent-changes.png`

## Step 6. A question the data cannot answer

**User:** Why did Cobalt Learning withdraw?

**Copilot** (14.1 s):

The data doesn't say why Cobalt Learning withdrew. Withdrawal reasons aren't recorded: the opportunity history holds only the stage and values, with no reason field. I won't guess at one.

**What the record does show** (sourced, as of 20 Apr 2025), for opportunity O006:
- It came from SC03 Brand Leader LinkedIn, a cold campaign. It was a cash deal owned by Riya Kapoor, and the primary contact was Meera Bhat.
- The brand was qualified on 10 Feb 2025. The reason logged was "Audience and partnership fit confirmed through the conversation."
- The deal moved fast. It was created and set to prospecting on 15 Feb 2025 and reached proposal sent on 20 Feb. It went to negotiating on 23 Feb and was confirmed at ₹80,000 on 25 Feb.
- It was withdrawn on 20 Mar 2025, 23 days after confirmation (calculated). Its confirmed value went back to ₹0.
- There are no installments for it in the simulated payments, so I can't tell whether any money was collected.

**Effect:** The withdrawal removed one confirmed partnership and ₹80,000 of confirmed value. Without it, we would be at 25 (calculated) against the goal of 28, rather than 24.

**To find the reason:** I can propose a task for Riya, who owned the deal, to ask Meera Bhat and record the reason. Should I set that up, and with what due date?

Data used:

- get_opportunity_history: name=Cobalt Learning as of 2025-04-20
- data_dictionary: no arguments
- calculate: 24+1 = 25
- calculate: 20+31-25+20 = 46
- calculate: (28-25)+20 = 23

Screenshot: `step-6-cobalt.png`

## Step 7. An edit on Pipeline shows on Overview and in the copilot

Pipeline: O028 moved to partner_confirmed (APP-OH-1); 2 installment(s) created

Overview: confirmed partnerships 25.

Screenshot: `step-7a-overview-25.png`

**User:** How many confirmed partnerships do we have now?

**Copilot** (6.3 s):

We have **25 confirmed partnerships** as of 20 Apr 2025 (sourced). The revised-plan goal is 28, so we are 3 short. It was 24 earlier in this conversation.

**Why it changed:** An edit made in the app on 20 Apr 2025 moved O028 Cedar Pantry (Riya's ₹1,10,000 deal in SC03) from negotiating to partner_confirmed. So the 25 includes an app edit.

**Other figures after the edit:**
- Confirmed value is ₹23,50,000 in total, made up of ₹21,10,000 cash and ₹2,40,000 in kind.
- Open opportunities are down to 25, with ₹13,30,000 proposed. All 25 are still stale (assumption: more than 7 days without an update).
- Outstanding confirmed cash is ₹2,67,500 (simulated). Cash collected is unchanged at ₹18,42,500 (simulated).

**Two things to note:**
- This is also the first confirmed deal in a cold campaign since Cobalt Learning was withdrawn on 20 Mar 2025. SC03 now has 1 confirmed deal.
- Riya's task APP-TSK-1 still lists O028. It may need a quick edit, since that deal no longer needs a follow-up to close.

Data used:

- get_overview: no arguments as of 2025-04-20

Screenshot: `step-7b-copilot-25.png`
