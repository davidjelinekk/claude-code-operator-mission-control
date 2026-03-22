# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email **security@davidjelinek.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

This policy covers the Claude Code Operator — Mission Control codebase, including:

- API server (`apps/api/`)
- Web dashboard (`apps/web/`)
- Shared packages (`packages/`)
- Docker and infrastructure configuration

## Security Considerations

- **Operator Token** — The `OPERATOR_TOKEN` is used for API authentication. Keep it secret and rotate it periodically.
- **CORS** — The API restricts origins via `CORS_ORIGINS` env var (defaults to `http://localhost:5173`). Set this to your deployed frontend URL in production.
- **Path Traversal Protection** — Agent-files, skill-files, and script-files endpoints validate IDs against `SAFE_ID` regex to prevent directory traversal.
- **Input Validation** — All mutation endpoints use Zod schema validation via `zValidator`.
- **CLI Script Execution** — Scripts are sandboxed to `~/.claude/scripts/` with path containment, ID validation, and timeout enforcement. Review scripts before adding them.
- **Database Credentials** — Never commit `.env` files. The `.gitignore` excludes them by default. Docker Compose credentials are parameterized via environment variables.
- **Session Data** — Agent SDK sessions may contain sensitive context. Access is gated by authentication.
- **SSE Token** — The EventSource API does not support custom headers, so SSE endpoints accept tokens via query parameter. Ensure server access logs redact query strings in production.
