# Aitronic Clarity MCP

Self-hosted Microsoft Clarity dashboard analytics for multiple projects, with a secure management page and OAuth 2.1 / PKCE for ChatGPT and Claude. Runs on Node.js 24 and Coolify.

Production MCP URL: `https://clarity-mcp.aitroniclab.com/mcp`

Management: `https://clarity-mcp.aitroniclab.com/admin`

## First use

1. Open the management page and sign in using the administrator password in the Coolify application's **ADMIN_PASSWORD** runtime variable. The initial operator also receives a local ignored `.private/access.txt` file. Keep it in a password manager.
2. Expand each project. In Microsoft Clarity, open **Settings → Data Export → Generate new API token**, then paste that project's token into the management form. A Clarity project ID is optional; the API token selects the project.
3. Click **Pārbaudīt tokenu un iegūt datus** to validate the connection. This uses one Clarity API request unless a cached response exists.
4. Add new projects through **Pievienot projektu**. Leave a saved token field empty to retain the existing credential. Replace it to rotate. Disable a project to prevent MCP reads and scheduled collection.

## ChatGPT

Create a custom remote MCP plugin/app using the MCP URL above and select **OAuth**. Use **dynamic client registration (DCR)**; no static client ID or client secret is needed. If developer mode is required in your workspace, enable it under the available app/plugin developer settings. Finish the server's login and consent page, selecting the permitted projects. Install/enable the resulting plugin for the conversation.

Official instructions: [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server), [OAuth authentication](https://developers.openai.com/plugins/build/auth).

## Claude

Open **Customize → Connectors → Add custom connector** (labels can vary by account). Enter the MCP URL. Choose **Sign in now** and **Register automatically** for the OAuth client; this server supports DCR rather than client metadata documents. Complete the server's login and project consent. Enable the connector in a conversation.

[Official Claude connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Ask either assistant: “List my Clarity projects, then analyze Rockmole traffic and UX problems over the last 24 hours.”

## Tools

| Tool | Purpose |
| --- | --- |
| `list_projects` | Authorized projects, token configuration state, local request count |
| `get_insights` | Dashboard metrics for 1, 2 or 3 days and up to 3 dimensions |
| `get_history` | Up to 30 saved snapshots, without making a new API request |
| `get_capabilities` | Supported dimensions, quota and data limitations |

Only read tools are exposed over MCP. Project credentials and administration remain in the browser UI. A consent grant covers the explicitly selected project IDs; adding a project later requires reconnecting to grant access. Revoke a connector from the management page immediately if it is no longer needed.

If an OAuth client opens the approval link in another browser session, the server starts a fresh authorization request in that browser and asks for project consent again. Approval links remain active for 10 minutes; their validated intent is kept for one hour solely to offer a restart link. An expired or already-used link never grants access. For an old link with no recoverable intent, return to the ChatGPT/Claude connector and start connecting again.

## Data limits and collection

The [Microsoft Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api) permits **10 requests/project/day**, only the last **24, 48 or 72 hours**, up to **3 dimensions**, and **1000 rows without pagination**. It does not provide heatmap images or session recording video. Any other caller using the same project also consumes Microsoft's quota.

Identical successful queries are cached for **6 hours**. Concurrent identical requests are deduplicated. The server limits itself to 10 requests per rolling 24 hours, counts failed attempts, times out after 30 seconds, and does not automatically retry failures.

A collector starts 30 seconds after boot and repeats every **12 hours** for configured, enabled projects, requesting a 24-hour summary. Snapshots are retained for **400 days**. These are overlapping rolling windows, **not calendar-day buckets**: never sum them as daily/monthly totals. Existing historical months cannot be backfilled through this API. Token rotation invalidates the cache while preserving previously saved history. Scheduled failures are recorded without secrets in the database audit table.

## Local development

```powershell
npm ci --cache .npm-cache
# Set PUBLIC_URL, ADMIN_PASSWORD and ENCRYPTION_KEY from .env.example in your environment.
# Node does not automatically load .env; alternatively run node --env-file=.env src/index.js.
npm test
npm start
```

Generate `ENCRYPTION_KEY` as 32 random bytes in hexadecimal (64 characters), and `ADMIN_PASSWORD` as at least 24 random characters. Never commit either. The server fails startup if required secrets are absent. Dependencies are locked; `npm audit` should report no known vulnerabilities.

## Coolify

- Project: **Aitroniclab**; environment: **clarity**.
- Dockerfile build; expose internal port **3000** without a public host-port mapping.
- HTTPS domain: `https://clarity-mcp.aitroniclab.com`.
- Runtime-only env: `PUBLIC_URL`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`, `DATA_DIR=/data`, `PORT=3000`.
- Persistent volume mounted at **/data**, containing SQLite, encrypted Clarity credentials, OAuth registrations and history. Run one replica; SQLite and in-process request deduplication are designed for a single instance.
- Health check: `GET /health`. OAuth discovery under `/.well-known/`, MCP under `/mcp`.
- One trusted reverse proxy hop is assumed. Do not expose the container directly to the public internet; the Coolify proxy must sanitize forwarded client IP headers.
- Administrator sessions expire after 8 hours. Access tokens expire after 1 hour, rotating refresh tokens after 30 days, consent grants after 90 days. Reconnect after grant expiry.
- Encryption keys must remain stable across deploys. Back up `/data` together with the encryption key stored separately. For consistent live SQLite backups, use SQLite's backup API or stop the app before copying the volume; copying only `clarity.sqlite` while WAL writes are active is unsafe.
- Changing `ADMIN_PASSWORD` requires redeployment and should be paired with clearing admin sessions if compromise is suspected. Revoke affected MCP grants from the UI. An environment secret change alone does not revoke existing sessions or grants.

## Verification

`npm test` covers OAuth discovery, DCR, PKCE rejection/success, one-use codes, project-scoped tool access, refresh rotation, revocation, CSRF rejection, encrypted storage, caching, concurrent deduplication and request budgets.

`npm run test:browser` runs a real Chromium browser against an isolated in-memory fixture. One approval must navigate to a different-origin callback, exchange its code with PKCE, then call the scoped MCP tool. CI installs Chromium with `npx playwright install --with-deps chromium` first. Consent responses allow only the current request's validated callback origin through CSP `form-action`; login/admin pages retain `form-action 'self'`.

Live Microsoft analytics can only be verified after real project tokens are supplied. Successful server tests do not imply a completed sign-in inside a user's ChatGPT or Claude account.
