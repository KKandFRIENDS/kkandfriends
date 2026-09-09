# Vercel OIDC setup

Research Lab uses Vercel AI Gateway with short-lived OIDC credentials by default.
No Anthropic, OpenAI, or Google provider key is required.

## Local read-only dry-run

From the linked Vercel project directory:

```powershell
vercel link
vercel env pull
```

This downloads a temporary `VERCEL_OIDC_TOKEN` to the project `.env.local` file.
Research Lab reads that file without printing the token.

Then set only the model chain, or copy `.env.example` to Research Lab's `.env.local`:

```env
RESEARCH_PROVIDER=vercel-oidc
RESEARCH_MODELS=anthropic/claude-opus-4.8,openai/gpt-5.4
```

Run:

```powershell
node .\research-lab\bin\live-dry-run.js
```

The command reads official feeds and prints the editorial package to stdout. It does not write
to the website, database, Telegram, GitHub, or Vercel production settings.

## Future Vercel function integration

Vercel Functions receive the short-lived credential in the `x-vercel-oidc-token` request header.
Pass the incoming `Request` to `createVercelAiGatewayInvoker({ request })`; do not copy the token
into logs or persistent storage.

The static `AI_GATEWAY_API_KEY` path remains available only as an emergency fallback through
`RESEARCH_PROVIDER=gateway-key`.
