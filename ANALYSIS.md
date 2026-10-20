# Focus: analysis and v2

## What v1 was
A solo founder's personal tool: four hard-coded projects (Noblesoft, FLASH, Sprachly, Zyvro), German/IT routines, a 3-task cap, and a separate "client work" module bolted on later.

## Gaps against the four problems
| Problem | v1 | Why it fails agencies |
|---|---|---|
| Focus | Cap of 3 tasks | Nothing helps you *choose* the 3; no "do this now"; distractions have no home |
| Priority | Manual; active project vs parked | Ignores deadlines, client risk, repeated slipping |
| Deadlines | Date lists | No view of whether the work left fits the time left |
| Accountability | Self-written check-in | No record of promised vs delivered; no owners; no team view |
| Structure | Two task systems (milestones vs client tasks); backup validator rejects anything but the 4 seed projects; free-text tasks duplicated | Can't be used by anyone else |
| Sync | Whole-workspace blob, last upload wins | Not collaboration |

## nobleleads
A lead-generation engine (50 USA/UK leads/day, day-3/day-7 follow-ups, Google Sheets). It produces recurring work, not a productivity tool. In v2 that work is a recurring task. A real integration (follow-ups due → Focus tasks) needs a Focus backend first.

## What v2 changes
1. One model: projects (client or internal), tasks with owner, due, importance, estimate, repeat.
2. Ranking with visible reasons (deadline, importance, client, project risk, slips). Explainable, not magic.
3. Deadline risk: remaining estimate of the busiest person vs working days left → On track / Tight / At risk / Late.
4. Commitment ledger: commit ≤3 a day, close the day, kept vs slipped recorded. Skipped closes auto-record as slipped. 3 slips forces a reshape/delegate/drop decision.
5. Inbox triage, waiting-on with chase dates, overdue-invoice follow-ups, recurring tasks.
6. Team view and copyable standup; per-person keep rate and on-time rate.
7. v1 import (browser data or backup file). German/IT become daily recurring tasks.

## Not done (be honest with customers)
- Members are names, not logins. Real multi-user needs auth + per-record sync (Supabase tables with RLS) — recommended next step. v1 manual cloud sync still works but replaces the whole workspace.
- No notifications, invoicing, payment collection or client portal.
- Risk uses your estimates; garbage in, garbage out.
- Landing page (index.html) copy still describes v1 and should be updated before marketing.
