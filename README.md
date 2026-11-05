<div align="center">

# Vibe ✨

**Build apps and websites by chatting with AI.**

Describe what you want in plain English. Vibe's AI agent writes the code, runs it in a secure cloud sandbox, and shows you a live preview you can interact with.

[**Live Demo**](https://vibe-sjbg.vercel.app/) · [Report a Bug](https://github.com/Omkar-B-More/vibe/issues) · [Request a Feature](https://github.com/Omkar-B-More/vibe/issues)

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

</div>

---

## 📖 Overview

Vibe is a full-stack AI website builder. You type a prompt such as *"Build a Netflix clone"* and an AI agent:

1. Spins up an isolated **E2B cloud sandbox** with a ready-made Next.js template.
2. Uses **Google Gemini function calling** to run terminal commands, create and edit files, and read existing code, looping until the app works.
3. Saves the generated files and serves a **live preview** of the running app next to the chat.
4. Lets you keep chatting to refine the app, since the agent remembers the recent conversation.

Everything runs as a durable background job on **Inngest**, so long generations don't block the UI or time out your request.

## ✨ Features

- **Chat to build:** generate full Next.js apps and websites from natural-language prompts.
- **Live sandbox preview:** the generated app runs in an E2B sandbox and is embedded in the workspace.
- **Code explorer:** browse the generated file tree with syntax-highlighted code view.
- **Iterative refinement:** follow-up prompts update the existing project using recent chat history as context.
- **Resilient AI calls:** automatic retry with backoff and model fallback on rate limits, overloads and network timeouts.
- **Authentication:** sign-in and sign-up with Clerk; every query is scoped to the signed-in user.
- **Credit-based usage:** Free and Pro tiers with rolling 30-day credit windows (`rate-limiter-flexible` backed by Postgres).
- **Pricing page:** Clerk billing table for upgrading to Pro.
- **Starter templates:** one-click prompts (Netflix, YouTube, Airbnb and Spotify clones, kanban board, admin dashboard, file manager, store page).
- **Responsive UI:** resizable split panes, dark/light theme, built with shadcn/ui.

## 🏗️ Architecture

```
┌────────────┐   tRPC    ┌──────────────┐  event   ┌───────────────────────┐
│  Next.js   │──────────▶│  Prisma +    │─────────▶│  Inngest function     │
│  frontend  │◀──────────│  PostgreSQL  │          │  (code agent loop)    │
└────────────┘  results  └──────────────┘          └──────────┬────────────┘
       ▲                                                       │ function calls
       │ live preview URL                                      ▼
       │                                           ┌───────────────────────┐
       └───────────────────────────────────────────│  E2B sandbox          │
                                                   │  (Next.js template)   │
                                                   └───────────────────────┘
                                                   Gemini decides: terminal /
                                                   createOrUpdateFiles / readFiles
```

1. The user submits a prompt, and a tRPC mutation saves the message and checks credits.
2. A `code-agent/run` event triggers the Inngest function.
3. The function creates a sandbox, loads the last 5 messages, and runs a Gemini tool-calling loop (up to 15 iterations).
4. The result (summary, title, files, sandbox URL) is stored as a `Fragment` and rendered in the UI.

## 🧰 Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 (App Router, Turbopack), React 19, TypeScript |
| Styling / UI | Tailwind CSS 4, shadcn/ui, Radix UI, Lucide icons |
| API | tRPC 11, TanStack Query, Zod, SuperJSON |
| Database | PostgreSQL, Prisma ORM |
| AI | Google Gemini (`@google/genai`) with function calling |
| Background jobs | Inngest |
| Code execution | E2B Code Interpreter sandboxes |
| Auth and billing | Clerk |
| Rate limiting | rate-limiter-flexible (Prisma store) |
| Deployment | Vercel |

## 🗂️ Project Structure

```
src/
├── app/            # Routes: home, pricing, auth, projects/[projectId], API (tRPC, Inngest)
├── components/     # Shared UI (shadcn/ui, file explorer, code view)
├── inngest/        # Inngest client and the code-agent function
├── lib/            # Prisma client, usage/credit logic, utilities
├── modules/        # Feature modules: home, projects, messages, usage
├── trpc/           # tRPC init, routers, client/server helpers
└── prompt.ts       # System prompts for the agent
prisma/             # Schema and migrations
sandbox-templates/  # E2B Next.js sandbox template
```

## 🗄️ Data Model

- **Project:** a user's build session (`userId`, name).
- **Message:** a chat message (`USER` or `ASSISTANT`, `RESULT` or `ERROR`).
- **Fragment:** the generated output attached to an assistant message (`sandboxUrl`, `title`, `files` JSON).
- **Usage:** credit tracking per user for rate limiting.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (local or hosted, e.g. Neon or Supabase)
- Accounts and API keys for: [Clerk](https://clerk.com), [E2B](https://e2b.dev), [Inngest](https://www.inngest.com) and [Google AI Studio](https://aistudio.google.com) (Gemini)

### 1. Clone and install

```bash
git clone https://github.com/Omkar-B-More/vibe.git
cd vibe
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/vibe"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# AI
GEMINI_API_KEY="your_gemini_api_key"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."

# E2B
E2B_API_KEY="your_e2b_api_key"

# Inngest (local development)
INNGEST_DEV=1
```

### 3. Set up the database

```bash
npx prisma migrate dev
```

### 4. Build the E2B sandbox template

The agent runs inside a custom E2B template (see `sandbox-templates/nextjs`). Build it with the E2B CLI and update the template name in `src/inngest/functions.ts` to your own:

```bash
npm i -g @e2b/cli
e2b auth login
npx tsx sandbox-templates/nextjs/build.dev.ts
```

### 5. Run the app

In one terminal, start Next.js:

```bash
npm run dev
```

In a second terminal, start the Inngest dev server:

```bash
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000). The Inngest dashboard is at [http://localhost:8288](http://localhost:8288).

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server with Turbopack |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Lint the codebase |

## ☁️ Deployment

1. Push the repo to GitHub and import it into [Vercel](https://vercel.com).
2. Add all environment variables above (use `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from Inngest Cloud instead of `INNGEST_DEV`).
3. Sync your Vercel app with Inngest Cloud at `/api/inngest`.
4. Add your production domain in Clerk.

## 🗺️ Roadmap

- [ ] Download generated projects as a ZIP
- [ ] One-click deploy of generated apps
- [ ] Support for more frameworks and templates
- [ ] Streaming agent progress in the chat

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Fork the repo, create a feature branch, and open a pull request.

## 👤 Author

**Omkar More**

- GitHub: [@Omkar-B-More](https://github.com/Omkar-B-More)
- LinkedIn: [omkar-more](https://www.linkedin.com/in/omkar-more-4686043a1/)

## 🙏 Acknowledgements

Built while following the "Vibe" tutorial by [CodeWithAntonio](https://www.youtube.com/@codewithantonio), then extended with Google Gemini, model fallback and retry logic.

---

<div align="center">If you like this project, give it a ⭐</div>
