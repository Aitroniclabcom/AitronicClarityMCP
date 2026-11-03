# Delivery contract — 2026-11-03

The user authorized a new public GitHub repository and deployment on base.aitroniclab.com, under Aitroniclab, with clarity-mcp.aitroniclab.com already in DNS. The referenced conversation selects one self-hosted remote MCP with multiple project credentials, caching and historical storage. The user confirmed entering Clarity tokens themselves after deployment.

Initial projects: rockmole.lv, aitroniclab.com, stepintoplan.com, krezs.lv, ztc.lv, ztcprefab.co.uk, nordicrafter.com, cncexperts.lv.

Implementation choices: Node 24, official MCP TypeScript SDK 1.x, Express, SQLite on a persistent volume, AES-256-GCM credential encryption, SDK OAuth router with persistent DCR, PKCE, project consent, token rotation/revocation; stateless Streamable HTTP. A single instance reduces infrastructure and permits atomic local quota tracking. Separate services per project would make credential management and client connections cumbersome. A hosted third-party connector would change the requested hosting arrangement.

Delivery sequence:
- [x] Confirm empty workspace, referenced conversation and target Coolify project.
- [x] Add failing storage/quota tests; implement storage, fixed-origin Clarity adapter and snapshot cache.
- [x] Add management forms, secure sessions, OAuth consent and read-only MCP tools.
- [x] Verify full OAuth flow, wrong PKCE, CSRF, project isolation, refresh reuse and revocation over real HTTP.
- [x] Publish source without credentials; deploy Dockerfile in Aitroniclab/clarity with persistent volume and runtime-only secrets.
- [x] Verify public TLS, OAuth discovery, admin login and MCP initialize/list/call; record live checks.

Highest risks: exposed credentials, unapproved project access, exhausted upstream quota, lost SQLite persistence and mistaken aggregation of overlapping rolling windows. Tests cover the first three; deployment checks cover persistence wiring and restart. Documentation explicitly distinguishes saved windows from calendar totals and withholds any claim about real analytics until the user adds tokens.

## Delivery evidence

- Repository: https://github.com/Aitroniclabcom/AitronicClarityMCP (public).
- Coolify project `jfm4tef8k911ddegmniszczt`, environment `clarity` / `rvcvehtdok3ioll6ddtb7lgz`, application `clarity-mcp` / `telqdqrn6cqri4ccoo3urgon`.
- Persistent volume `eewbkjhoek3fmfzl5sdzcmqv`, mount `/data`; internal port 3000; health check host 127.0.0.1.
- Runtime commit `71d2a74c5de606026f9bef39c7357aebc0bec8e1`, deployment `f6c5vjck4hyqywvyhpx7hq0f`: finished, healthy, 2026-11-03 11:11 UTC.
- `npm test`: 3 passing integration/storage tests, 0 failures. `npm audit`: 0 known vulnerabilities. GitHub CI builds and starts the Linux Docker image.
- `node scripts/smoke-live.mjs`: trusted public TLS; health; OAuth discovery; dynamic client registration; admin login; project consent; PKCE; MCP initialize; all 4 tools; all 8 projects; correct missing-token response; no Clarity quota used.
- OAuth client, consent grant and refresh token created before redeployment remained valid after replacement of the container. `smoke-live.mjs finish` refreshed access, confirmed 8 projects and revoked the temporary test grant.
- Real Chrome browser: admin login and saving the existing Rockmole project succeeded. Fixed a reproduced interaction between Helmet's default `no-referrer` policy and strict Origin checking; `same-origin` retains local form Origin and suppresses cross-origin referrer disclosure.
- User explicitly approved saving the newly generated admin/encryption secrets in this exact Coolify application after automatic approval review requested that confirmation. Secrets remain outside Git.
- Pending user setup: enter each Clarity Data Export token; add the MCP URL to ChatGPT and Claude with OAuth/DCR, sign in and choose projects. Those account-level connections and real Microsoft API responses are not represented as verified.
