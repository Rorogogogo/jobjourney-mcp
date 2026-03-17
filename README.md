# 🚀 JobJourney Claude Plugin

> A production-ready MCP server for JobJourney with AI job-search tools, local job discovery, and scheduled scraping from Claude.

[![npm version](https://img.shields.io/npm/v/jobjourney-claude-plugin)](https://www.npmjs.com/package/jobjourney-claude-plugin)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Protocol](https://img.shields.io/badge/protocol-MCP-7c3aed)
[![GitHub stars](https://img.shields.io/github/stars/Rorogogogo/jobjourney-claude-plugin?style=social)](https://github.com/Rorogogogo/jobjourney-claude-plugin)

---

## ✨ What It Does

- 🤖 **AI job-search workflows** for resume fit scoring, cover letters, CV generation, interview prep, and career chat
- 🗂️ **Application tracking** with saved jobs, notes, status changes, starring, search, and dashboard analytics
- 🔍 **Local job discovery** with a canonical discovery engine that stores results in local SQLite
- 🌐 **Mixed scraping strategy**: LinkedIn uses direct HTTP guest scraping, while blocked sites like SEEK use Playwright
- 🏢 **ATS expansion** for supported providers like Greenhouse and Lever after discovery
- ⏰ **Scheduled discovery** through the background agent and MCP tools
- 💾 **Local storage** for jobs, runs, schedules, and discovery reports in `~/.jobjourney/jobs.db`

---

## 📸 Demo

Use it naturally from Claude:

> "Use `discover_jobs` with keyword `full stack`, location `Sydney`, sources `linkedin` and `seek`, pages `1`."

> "Use `search_jobs` and show me the latest LinkedIn roles in Sydney."

> "Use `schedule_discovery` to run every day at 9am for backend jobs in Melbourne."

> "Evaluate how well my resume matches this job and draft a cover letter."

If you want product screenshots or GIFs later, this is the right place to add them.

---

## 🧭 Remote Vs Local

This project has two distinct usage modes.

| Mode | Best for | Includes |
|---|---|---|
| **Remote MCP** | Fastest setup, cloud-backed JobJourney tools | Job tracking, AI tools, documents, networking, profile, analytics |
| **Local plugin / stdio** | Full local scraping and scheduled discovery | Everything above, plus `discover_jobs`, `search_jobs`, `schedule_discovery`, `login_jobsite`, local SQLite |

Important:

- **Local scraping requires the local plugin**, not just the hosted MCP endpoint.
- **LinkedIn discovery** uses direct HTTP guest scraping.
- **SEEK discovery** uses Playwright and local browser session support.

---

## 📦 Installation

### Option A: Remote MCP

Use this if you want the hosted JobJourney tools with the least setup.

```bash
claude mcp add jobjourney -t url -h "X-API-Key: jj_your_api_key_here" https://server.jobjourney.me/mcp
```

Or add it manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "jobjourney": {
      "type": "url",
      "url": "https://server.jobjourney.me/mcp",
      "headers": {
        "X-API-Key": "jj_your_api_key_here"
      }
    }
  }
}
```

### Option B: Local stdio plugin

Use this if you want local discovery, Playwright-backed scraping, scheduling, and SQLite storage.

```bash
claude mcp add jobjourney \
  -e JOBJOURNEY_API_URL=https://server.jobjourney.me \
  -e JOBJOURNEY_API_KEY=jj_your_api_key_here \
  -e TRANSPORT=stdio \
  -- npx -y jobjourney-claude-plugin
```

If you prefer Claude Desktop config:

```json
{
  "mcpServers": {
    "jobjourney": {
      "command": "npx",
      "args": ["-y", "jobjourney-claude-plugin"],
      "env": {
        "JOBJOURNEY_API_URL": "https://server.jobjourney.me",
        "JOBJOURNEY_API_KEY": "jj_your_api_key_here",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

### Playwright prerequisite

For local browser-backed sources like SEEK, install a browser once:

```bash
npx playwright install chromium
```

---

## 🚀 Quick Start

### 1. Connect the plugin

```bash
claude mcp add jobjourney \
  -e JOBJOURNEY_API_URL=https://server.jobjourney.me \
  -e JOBJOURNEY_API_KEY=jj_your_api_key_here \
  -e TRANSPORT=stdio \
  -- npx -y jobjourney-claude-plugin
```

### 2. Log in to browser-backed sites when needed

From Claude:

```text
Use login_jobsite with site "seek"
```

### 3. Run discovery

From Claude:

```text
Use discover_jobs with keyword "full stack", location "Sydney", sources ["linkedin", "seek"], pages 1
```

### 4. Query the stored results

```text
Use search_jobs with source "linkedin" and limit 5
```

### 5. Schedule it

```text
Use schedule_discovery with keyword "full stack", location "Sydney", time "09:00", sources ["linkedin", "seek"]
```

---

## 🔍 Source Support

| Source | Status | Transport | Notes |
|---|---|---|---|
| `linkedin` | Active | HTTP guest scraping | Primary supported LinkedIn path |
| `seek` | Active | Playwright | Local browser session support |
| `indeed` | Planned | Playwright | Not implemented yet |
| `jora` | Planned | Playwright | Not implemented yet |

| ATS | Support |
|---|---|
| `greenhouse` | Detect + expand |
| `lever` | Detect + expand |
| `workday` | Detect only |
| `smartrecruiters` | Detect only |
| `ashby` | Detect only |

---

## 🧠 How Local Discovery Works

The local discovery engine lives under `src/discovery` and uses one canonical job model across all sources.

### LinkedIn

1. Fetch guest search results
2. Fetch guest job detail HTML for each posting
3. Extract description, metadata, and external apply URL
4. Detect ATS from the external URL
5. Expand supported ATS companies

### SEEK

1. Launch Playwright
2. Use the browser-backed source flow
3. Normalize results into the same canonical job schema

### Storage

Local runs are stored in:

- jobs DB: `~/.jobjourney/jobs.db`
- agent heartbeat: `~/.jobjourney/agent-heartbeat.json`

The database stores:

- discovered jobs
- scrape/discovery runs
- schedules

---

## 🛠 Key Tools

This MCP exposes a broad JobJourney toolset. For local discovery, these are the most important ones:

| Tool | What it does |
|---|---|
| `discover_jobs` | Run the canonical multi-source discovery engine and store results locally |
| `search_jobs` | Query jobs already stored in local SQLite |
| `schedule_discovery` | Schedule recurring local discovery runs |
| `get_latest_discovery_report` | Show the latest discovery batch summary |
| `scrape_jobs` | Legacy one-off local scrape path |
| `login_jobsite` | Save browser login state for supported sites |
| `check_login_status` | Confirm browser login state |

And the broader platform also includes:

- job tracking
- AI fit evaluation
- cover letter and CV generation
- mock interviews
- dashboard analytics
- coffee chat networking
- profile and document management

---

## 🏗 Architecture

```text
src/
  index.ts                # FastMCP server entrypoint
  tools/                  # MCP tool registration
  discovery/              # Canonical local discovery engine
    core/                 # orchestration and job types
    sources/              # linkedin guest, seek browser, planned sources
    ats/                  # ATS detection and supported crawlers
    analysis/             # salary, tech stack, PR, experience enrichment
    fallback/             # optional company career-page probing
    storage/              # discovery persistence adapters
    parity/               # TS vs Python parity harness
  scraper/                # legacy browser scraper layer, being phased down
  storage/sqlite/         # SQLite repos and migrations
  agent/                  # background scheduling agent
  config/                 # path and runtime config
```

Built with FastMCP, TypeScript, Zod, Playwright, and SQLite.

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|---|---|---|
| `JOBJOURNEY_API_URL` | JobJourney backend base URL | `https://server.jobjourney.me` |
| `JOBJOURNEY_API_KEY` | API key for backend-authenticated features | - |
| `TRANSPORT` | MCP transport: `stdio` or `httpStream` | `stdio` |
| `PORT` | HTTP port when `TRANSPORT=httpStream` | `8080` |

---

## 🧪 Development

```bash
git clone https://github.com/Rorogogogo/jobjourney-claude-plugin.git
cd jobjourney-claude-plugin
npm install
npx playwright install chromium
npm run build
npm test
npm run typecheck
```

Useful local commands:

```bash
npm run start
npm run agent
npm run parity:discovery
npm run parity:live-smoke
```

---

## 🤝 Contributing

Contributions are welcome. Useful contribution areas right now:

- tightening the canonical `src/discovery` architecture
- implementing `indeed` and `jora`
- improving live parity coverage
- reducing remaining legacy surface in `src/scraper`

Standard flow:

```bash
git checkout -b feature/my-change
npm test
npm run typecheck
git commit -m "feat: my change"
```

---

## 🔗 Links

- [Website](https://jobjourney.me)
- [npm package](https://www.npmjs.com/package/jobjourney-claude-plugin)
- [GitHub repository](https://github.com/Rorogogogo/jobjourney-claude-plugin)
- [Issues](https://github.com/Rorogogogo/jobjourney-claude-plugin/issues)

---

## 📄 License

[MIT](LICENSE) © JobJourney
