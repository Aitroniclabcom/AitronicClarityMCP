# Delivery contract — 2026-11-03

The user authorized a new public GitHub repository and deployment on base.aitroniclab.com, under Aitroniclab, with clarity-mcp.aitroniclab.com already in DNS. The referenced conversation selects one self-hosted remote MCP with multiple project credentials, caching and historical storage. The user confirmed entering Clarity tokens themselves after deployment.

Initial projects: rockmole.lv, aitroniclab.com, stepintoplan.com, krezs.lv, ztc.lv, ztcprefab.co.uk, nordicrafter.com, cncexperts.lv.

Implementation choices: Node 24, official MCP TypeScript SDK 1.x, Express, SQLite on a persistent volume, AES-256-GCM credential encryption, SDK OAuth router with persistent DCR, PKCE, project consent, token rotation/revocation; stateless Streamable HTTP. A single instance reduces infrastructure and permits atomic local quota tracking. Separate services per project would make credential management and client connections cumbersome. A hosted third-party connector would change the requested hosting arrangement.

Delivery sequence:
- [x] Confirm empty workspace, referenced conversation and target Coolify project.
- [x] Add failing storage/quota tests; implement storage, fixed-origin Clarity adapter and snapshot cache.
- [x] Add management forms, secure sessions, OAuth consent and read-only MCP tools.
- [x] Verify full OAuth flow, wrong PKCE, CSRF, project isolation, refresh reuse and revocation over real HTTP.
- [ ] Publish source without credentials; deploy Dockerfile in Aitroniclab/clarity with persistent volume and runtime-only secrets.
- [ ] Verify public TLS, OAuth discovery, admin login and MCP initialize/list/call; record live checks.

Highest risks: exposed credentials, unapproved project access, exhausted upstream quota, lost SQLite persistence and mistaken aggregation of overlapping rolling windows. Tests cover the first three; deployment checks cover persistence wiring and restart. Documentation explicitly distinguishes saved windows from calendar totals and withholds any claim about real analytics until the user adds tokens.
