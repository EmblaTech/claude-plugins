# PRD: `office:brand-posts`

Status: draft, 2026-11-03. Owner: Ilya Ashikhmin. Implementer: Anjali Perera.

## Contents

- [Problem](#problem)
- [Goal](#goal)
- [Users](#users)
- [Scope](#scope)
- [Project structure](#project-structure)
- [Flows](#flows)
- [Setup](#setup)
- [Run](#run)
- [Approval](#approval)
- [Schedule and storage](#schedule-and-storage)
- [Rules for every flow](#rules-for-every-flow)
- [Dashboard](#dashboard)
- [Later](#later)
- [Tickets](#tickets)

## Problem

HR and marketing teams send the same kinds of branded messages again and again: birthday cards, work anniversaries, holiday greetings, event announcements. Today a person makes each one by hand.

A first version of the skill exists (PR #35, from the `ai-designer-demo` project). It works only for one case: staff greeting cards with an email draft. Its config, templates and steps are fixed for that case.

The 2026-11-03 meeting decided that this Claude Code skill replaces the C# background worker. The product must be easy to install for other teams and other companies, including small companies without servers.

## Goal

One skill that makes **any recurring branded content** for a team. The user describes what they need in plain words. Setup builds the project for that need. Scheduled runs then make the content without more work from the user.

## Users

- **Setup user**: an HR or marketing person, or an admin. Not a developer. Runs setup once, and again to add a flow.
- **Approver**: the person who checks content before it goes out.
- **Recipients**: staff, customers or followers who get the content.

## Scope

In scope: any recurring branded content, for example greetings, anniversaries, holiday cards, event announcements, weekly posts.

Out of scope: one-off design work, and content that needs no brand.

## Project structure

Setup creates this structure in the user's project. These files belong to the project, not to the skill.

```
<project>/
  brand/brand.md            colours, fonts, tone, company name, output formats (e.g. 1080x1080, A4)
  brand/assets/             logo, fonts, frames
  flows/<flow>/flow.md      the flow's config: the single source of truth for that flow
  flows/<flow>/templates/   card.html, email.html, or other templates the flow needs
  out/<date>/<flow>/        output of a run
  out/journal.csv           record of what was made and sent
```

- `brand/` is shared by all flows.
- Setup creates only the flows the user asks for. Example flows: `birthday`, `anniversary`, `events`.
- The root config `ai-designer.md` from the first version is replaced by `brand/brand.md` plus one `flow.md` per flow.

## Flows

Each `flow.md` sets:

| Field | Values |
|---|---|
| Trigger | `date-in-data` (a date field in a people list, e.g. birthday, join date), `event-list` (a CSV or a calendar, e.g. holidays, company events), `cadence` (e.g. every Monday, the 1st of each month), or other |
| Data source | where the people or event data comes from |
| Audience and channel | who gets it, and how: email, Teams, Slack, or other |
| Personalization | `template` (name, photo, standard text) or `personal` (text from available data, e.g. years of work, projects) |
| Variants | 1 to 3 versions of each item |
| Approval | `none`, `draft` or `dashboard` (see [Approval](#approval)) |
| Schedule | how often the flow runs, e.g. daily, or weekly for the next 7 days |
| Language | English, Norwegian, Sinhala, Tamil, or other |
| Weekend rule | when an occasion falls on a weekend: the Friday before, the Monday after, or the same day |

## Setup

`/office:brand-posts setup`. It runs again to add or change a flow.

- **Goal-driven, not step-driven.** SETUP.md states what each flow needs and when setup is done. It does not list fixed steps. Claude decides how to get there.
- **Questions with options.** Every question uses `AskUserQuestion` with suggested options. The user can always choose "Other".
- **Data sources.** Setup finds the people list, photos, brand notes and event lists. If a source needs an MCP connector (SharePoint, Google Drive, Outlook), Claude finds and helps connect it. The skill holds no MCP setup instructions.
- **Brand.** Setup fills `brand/brand.md` and `brand/assets/` from the user's files or answers.
- **Templates.** Setup writes the templates for each flow, in the brand.
- **Tools.** PNG export needs a headless browser (installed Edge or Chrome, or Playwright). Setup checks that one is present and helps install one if not.
- **Schedule.** Setup offers to create a scheduled task for each flow (see [Schedule and storage](#schedule-and-storage)).
- **Done** when every flow has a data source, a template, a channel, an approval mode and a schedule (or an explicit "none"), and the user has seen the config.

## Run

`/office:brand-posts [flow] [date]`. With no flow, all flows run. With no date, today.

1. Find the items for the date (or the period, for a weekly run).
2. Skip items in the journal and people on the opt-out list.
3. Make the content: cards (HTML, plus PNG for chat channels) and message text, in the flow's language and personalization level, with the number of variants the flow sets.
4. Act on the approval mode (see below).
5. Write each item to `out/journal.csv`.
6. Report what was made.

**Dry-run**: `--dry-run` makes the content for any date and sends nothing. Use it to test a flow.

## Approval

| Mode | What happens |
|---|---|
| `none` | The run sends the content. For simple template flows only. |
| `draft` | The run makes a draft in Outlook, Teams or Slack. A person reviews and sends. **Default.** |
| `dashboard` | The run puts the variants on the dashboard. A person picks one. A later run sends it. |

## Schedule and storage

- **Local scheduled task (default).** Runs on the user's computer in Claude Code Desktop. It sees local files and local MCP connectors. It runs only while the computer is on. Missed runs fire once when the computer is back.
- **Cloud routine (option).** Runs when the computer is off, but sees only cloud connectors and cloud storage. The project then must live in cloud storage: Google Drive, SharePoint or a Git repo. Setup offers the options and the user decides. With Git, each run commits its output; setup must make sure that two writers do not conflict.
- One scheduled task per flow. The flow sets how often.

## Rules for every flow

- **Personal data (GDPR).** Birthdays and photos are personal data. Each project has an opt-out list: people on it get no content. Check the design with the `grc-gdpr` plugin.
- **No duplicates.** `out/journal.csv` records date, flow, person or event, and status. A run skips items that are already in it. This also covers daily and weekly runs that overlap.
- **Human sends by default.** Without approval mode `none`, nothing goes out until a person approves it.
- **AI marker.** Every message ends with an AI marker line, set in `brand/brand.md`.

## Dashboard

A separate ticket. One dashboard per project, for all flows, grouped by date. It is a claude.ai artifact, like the `meeting-dashboard` skill in embla-docs.

- The run publishes the variants for each item to the dashboard.
- The approver picks one variant. The page writes the choice to the artifact database. The page cannot send anything itself: it has no access to mail or chat.
- A frequent scheduled run (every 15 to 30 minutes) reads new choices, sends the content, and writes the result back.
- The approval is the human step, so the run sends without a draft.

## Later

No ticket yet.

- **AI-generated backgrounds.** In v1 Claude draws backgrounds as SVG or CSS. Raster images need an outside image service through MCP or an API, with keys and cost.
- **Company-wide brand.** One shared `brand/` for all Claude users in a company (templates, colours, fonts), so each user does not set up the brand again.

## Tickets

1. **Make `brand-posts` universal**: everything in this PRD except [Dashboard](#dashboard) and [Later](#later).
2. **Dashboard approval**: the `dashboard` approval mode and the dashboard.

🤖 Crafted by Claude AI
