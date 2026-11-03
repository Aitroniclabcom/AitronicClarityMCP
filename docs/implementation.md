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

## ChatGPT authorization follow-up — 2026-11-03

The user reported repeated failures while adding the ChatGPT connector. The real failed tab was `/consent`, and safe route/source diagnostics reproduced the failure at `AuthProvider.pending`. The prior implementation returned a generic HTTP 500 for missing, expired or browser-mismatched consent intents.

Regression tests first reproduced HTTP 500 when a valid authorization intent was opened from another authenticated browser. The fix restarts the full SDK authorization validation and requires fresh consent in the receiving browser. Expired GET/POST intents return HTTP 410 with a recovery page, never an authorization code. Validated request intent is retained for one hour only to offer a restart link; its consent validity remains ten minutes. Already-used or missing intents instruct the user to start from the ChatGPT/Claude connector again.

Production deployment `fhr1bwmczpbgnsi8w7sqfurm`, runtime commit `4f7a2cb16f7ccb6d2ce32cf8218ceef261604307`, finished healthy at 11:38 UTC. All 4 tests pass. Public `smoke-live.mjs handoff` verified separate initiating/approval sessions, recovery, DCR, PKCE, token exchange, all 4 MCP tools and the user's current **9 authorized projects**. `smoke-live.mjs finish` verified refresh and revoked the temporary test grant. No Clarity API requests were made. The user's original failed browser tab now shows the actionable recovery page instead of HTTP 500. An actual final connection in the user's ChatGPT account remains a user sign-in/consent step.

## Browser callback root cause — 2026-11-03

The user clarified that the first approval click did nothing and the second showed the missing-request page. The previous recovery fix addressed that second-click symptom; HTTP tests did not execute Chromium's document navigation policy.

An isolated Chrome fixture reproduced the exact first-click behavior. A newly added real Chromium CI test on unchanged production code (commit `394cecf`, run `41632545019`) failed with an explicit CSP `form-action 'self'` violation. Chromium applies that directive to cross-origin redirects after the consent POST. The server had already issued a code and consumed the consent intent, explaining the second-click error.

The fix adds only the active request's validated, registered callback origin to `form-action`, only on consent GET/POST responses. Login/admin remain restricted to self; no wildcard or global callback allowlist is introduced. HTTP regression checks verify both the consent policy and isolation from login pages. Manual Chrome retest with the fix navigated on the first approval, completed PKCE token exchange and successfully called `list_projects` with exactly one allowed fixture project. `e2e/oauth-callback.spec.js` now exercises that complete path in CI.

## Actual ChatGPT connection confirmed — 2026-11-03

After the user's explicit approval to complete the ChatGPT grant, the real `ClarityAitronic` workspace plugin (`plugin_asdk_app_6ae9cc01feb88191a00cafd17e9acb66`) completed OAuth in Chrome. The consent page identified ChatGPT, displayed its registered `chatgpt.com/connector/oauth/` callback and all nine projects. All nine were selected and approved once. The browser returned through ChatGPT's OAuth callback to the plugin page, which displayed **Primary is now connected**.

Opening the app details showed **Read 4**, with `get_capabilities`, `get_history`, `get_insights` and `list_projects`, confirming ChatGPT could enumerate the authenticated MCP tools. No Clarity analytics API request was needed for this connection verification. The connected plugin tab was left open. A local ignored proof screenshot is stored at `.private/chatgpt-connected.jpg`; it contains no credentials.
