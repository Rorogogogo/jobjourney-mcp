# JobJourney MCP

MCP (Model Context Protocol) server for [JobJourney](https://jobjourney.me) - track job applications and network with professionals using AI.

## Features

- **Job Management** - Save, search, update, delete, star jobs and add notes
- **Bulk Operations** - Delete, reject, or advance multiple jobs at once
- **AI Job Fit Evaluation** - Evaluate how well your resume matches a job
- **AI Cover Letters** - Generate tailored cover letters for specific jobs
- **AI Interview Prep** - Generate technical or behavioral interview questions
- **Dashboard Stats** - Get an overview of your entire job search progress
- **Coffee Chat Networking** - Find professionals, send requests, check status
- **Notifications** - Check and manage your notifications
- **Profile** - View your profile, skills, experience, and education

## Setup

### 1. Get Your API Key

1. Log into [JobJourney](https://jobjourney.me)
2. Go to **AI Lab** or **Profile → API Keys**
3. Click **Generate New Key**
4. Copy the key (shown only once)

---

### Option A: Claude Code (CLI)

Run this command in your terminal:

```bash
claude mcp add jobjourney \
  -e JOBJOURNEY_API_URL=https://server.jobjourney.me \
  -e JOBJOURNEY_API_KEY=jj_your_api_key_here \
  -- npx -y jobjourney-mcp
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "jobjourney": {
      "command": "npx",
      "args": ["-y", "jobjourney-mcp"],
      "env": {
        "JOBJOURNEY_API_URL": "https://server.jobjourney.me",
        "JOBJOURNEY_API_KEY": "jj_your_api_key_here"
      }
    }
  }
}
```

---

### Option B: Claude Desktop (App)

Edit your Claude Desktop config file:

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jobjourney": {
      "command": "npx",
      "args": ["-y", "jobjourney-mcp"],
      "env": {
        "JOBJOURNEY_API_URL": "https://server.jobjourney.me",
        "JOBJOURNEY_API_KEY": "jj_your_api_key_here"
      }
    }
  }
}
```

Then restart Claude Desktop.

---

## Usage Examples

Just talk naturally to Claude:

> "Save a Software Engineer job at Google in San Francisco"

> "Show me all the jobs I've applied to"

> "Update my Netflix application to interview stage"

> "How well does my resume match this job?" (paste description)

> "Write me a cover letter for this role"

> "Give me 10 technical interview questions for a React developer role"

> "How is my job search going?"

> "Find someone in tech I can have coffee with"

> "Send a coffee chat request to that person"

> "Do I have any notifications?"

> "Star my Google job"

> "Add a note to my Amazon application: interviewer was Sarah, follow up next week"

> "Delete all my expired jobs"

## Available Tools

### Job Management
| Tool | Description |
|------|-------------|
| `save_job` | Save a new job application |
| `get_jobs` | List jobs with optional filters |
| `get_job_details` | Get full details of a specific job |
| `update_job_status` | Update application status |
| `delete_job` | Delete a saved job |
| `star_job` | Star or unstar a job |
| `add_job_note` | Add a note to a job |
| `bulk_update_jobs` | Bulk delete, reject, or advance jobs |

### AI Tools
| Tool | Description |
|------|-------------|
| `evaluate_job_fit` | AI evaluation of resume vs job match |
| `generate_cover_letter` | AI-generated tailored cover letter |
| `generate_interview_questions` | AI-generated interview questions |

### Dashboard
| Tool | Description |
|------|-------------|
| `get_dashboard_stats` | Overview of job search progress |

### Networking
| Tool | Description |
|------|-------------|
| `find_coffee_contacts` | Find professionals for coffee chats |
| `send_coffee_chat_request` | Send a networking request |
| `get_coffee_chat_requests` | Check sent or received requests |

### Notifications & Profile
| Tool | Description |
|------|-------------|
| `get_notifications` | Get your notifications |
| `mark_notifications_read` | Mark all as read |
| `get_profile` | View your profile info |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JOBJOURNEY_API_URL` | API endpoint (default: https://server.jobjourney.me) |
| `JOBJOURNEY_API_KEY` | Your API key from JobJourney settings |

## Links

- [JobJourney Website](https://jobjourney.me)
- [Setup Guide](https://jobjourney.me/mcp-setup)
- [GitHub Repository](https://github.com/Rorogogogo/jobjourney-mcp)
- [Report Issues](https://github.com/Rorogogogo/jobjourney-mcp/issues)

## License

MIT
