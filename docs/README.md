# Notification Center — Feature Documentation

This folder is the **product spec** for Notification Center. Each numbered file is a self-contained feature plan with a final **Implementation Prompt** section ready to paste into Claude Code.

Start with **`00-product-roadmap.md`** — it lays out the vision, personas, phasing, and the table of contents.

## Reading order

| # | Title | Phase |
|---|---|---|
| 00 | [Product roadmap](./00-product-roadmap.md) | — |
| **Channel APIs** | | |
| 01 | [SMS via Iranian providers](./01-sms-iranian-providers.md) | 1 |
| 02 | [Bale Messenger](./02-bale-messenger.md) | 2 |
| 03 | [Email channel (Resend + SMTP)](./03-email-channel.md) | 1 |
| 04 | [Web Push](./04-web-push.md) | 2 |
| 05 | [Unified OTP service](./05-unified-otp-service.md) | 1 |
| 06 | [Unified notification API](./06-unified-notification-api.md) | 1 |
| 07 | [Templates engine](./07-templates-engine.md) | 2 |
| 08 | [Bulk send & scheduling](./08-bulk-and-scheduling.md) | 3 |
| 09 | [Outbound webhooks & events](./09-webhooks-and-events.md) | 2 |
| **Admin Panel** | | |
| 10 | [User management](./10-admin-user-management.md) | 2 |
| 11 | [Projects & environments](./11-admin-projects-and-environments.md) | 2 |
| 12 | [API keys, limits & quotas](./12-admin-api-keys-and-limits.md) | 1 |
| 13 | [Analytics dashboard](./13-admin-analytics-dashboard.md) | 3 |
| 14 | [Provider credentials vault](./14-admin-provider-credentials.md) | 2 |
| 15 | [Notification logs & audit trail](./15-admin-notification-logs-audit.md) | 2 |
| 16 | [RBAC, organizations & teams](./16-admin-rbac-and-teams.md) | 3 |
| 17 | [Developer portal & OpenAPI](./17-developer-portal-and-openapi.md) | 3 |

## Other docs

- [`bale-messenger-otp.md`](./bale-messenger-otp.md) — raw Bale Bot API reference (predates this folder; cited by Feature 02).

## Conventions used in each feature doc

```
1. Summary                        — elevator pitch
2. Problem & Motivation           — why it matters
3. Goals & Non-Goals              — explicit scope
4. User Stories                   — by persona
5. API / UI Specification         — request/response or screen list
6. Data Model                     — Prisma additions
7. Non-Functional Requirements    — perf, security, observability
8. Acceptance Criteria            — verifiable DoD
9. Open Questions                 — followups
10. Implementation Prompt          — ready-to-paste agent brief
```

## How to use an Implementation Prompt

Each prompt follows a fixed skeleton:

```
ROLE · CONTEXT · OBJECTIVE · INPUTS TO READ FIRST · CONSTRAINTS ·
DELIVERABLES · STEP PLAN · DEFINITION OF DONE · OUT OF SCOPE
```

Paste it into Claude Code with the working directory set to the repo root. The "Inputs to read first" list is mandatory — per `AGENTS.md`, every Next.js API used must be checked against `node_modules/next/dist/docs/` before writing code.
