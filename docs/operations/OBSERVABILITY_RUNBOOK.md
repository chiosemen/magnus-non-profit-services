# Magnus Accord Observability Runbook

## Overview

Magnus Accord uses a unified observability pattern across all services. Errors and telemetry events are formatted as structured JSON, compatible with:

- **Sentry** (via structured console logging)
- **OTEL Collectors** (JSON format matches OTEL semantic conventions)
- **Log aggregators** (Logtail, Datadog, CloudWatch)

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | No | When set, enables Sentry-compatible error formatting |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTEL collector endpoint |
| `OTEL_SERVICE_NAME` | No | Service name for OTEL |
| `LOGTAIL_TOKEN` | No | Logtail ingestion token |

### Quick Start

```bash
# Enable Sentry error reporting
export SENTRY_DSN=https://xxx@sentry.io/xxx

# Enable OTEL (optional)
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
export OTEL_SERVICE_NAME=magnus-web
```

## Event Format

All telemetry events use this JSON structure:

```json
{
  "level": "error",
  "type": "magnus_web_error",
  "service": "web",
  "message": "Database connection failed",
  "timestamp": "2026-04-13T10:30:00.000Z",
  "stack": "Error: Database connection failed\n    at ...",
  "context": {
    "operation": "getUser",
    "userId": "u-123",
    "route": "/api/users/123"
  }
}
```

### Severity Levels

| Level | When to Use |
|-------|-------------|
| `debug` | Development diagnostics |
| `info` | Normal operations |
| `warn` | Recoverable issues |
| `error` | Operation failures |
| `fatal` | Unrecoverable failures |

## Service Integration

### Using @magnus/observability

```typescript
import { initObservability, reportError, reportRequestError } from '@magnus/observability';

// Initialize at service startup
initObservability('mcp-connector');

// Report errors
reportError('mcp-connector', error, {
  operation: 'executeToolCall',
  toolName: 'get-revenue-breakdown',
  userId: 'u-123'
});

// Report request errors (HTTP services)
reportRequestError('web', error, req, { route: '/api/auth/login' });
```

### Current Service Coverage

| Service | Status | Notes |
|---------|--------|-------|
| `apps/web` | Integrated | Next.js instrumentation |
| `apps/mcp-connector` | Integrated | Tool execution errors |
| `apps/agents` | Integrated | Agent execution, scheduler |
| `apps/org-dashboard-api` | Integrated | API request errors |
| `apps/claude-partner` | Integrated | LLM call errors |

## Security Considerations

### Automatic Redaction

The observability module automatically redacts sensitive fields:
- `password`, `secret`, `token`, `key`
- `auth`, `credential`, `jwt`, `bearer`
- `ssn`, `plaidAccessToken`, `apiKey`

### What NOT to Log

Never include in error context:
- Raw API keys or secrets
- User passwords or SSNs
- Full request/response bodies with PII
- JWT tokens or session IDs

## Monitoring Recommendations

### Critical Alerts

Set up alerts for:
1. `level: fatal` events (service crashes)
2. `type: *_auth_*` errors (authentication failures)
3. High error rate on MCP tool execution
4. Database connection failures

### Dashboards

Recommended panels:
- Error rate by service
- Error rate by type
- P95 latency by route (when OTEL enabled)
- Fatal event count (should be near zero)

## Troubleshooting

### No Events in Sentry

1. Verify `SENTRY_DSN` is set
2. Check service logs for JSON-formatted errors
3. Confirm Sentry project accepts the DSN

### Missing Context in Errors

1. Ensure `reportError` is called with context object
2. Check that sensitive fields aren't being redacted when needed
3. Verify error is an Error instance (not just a string)

### High Error Volume

1. Check for retry loops causing error spam
2. Verify database/external service connectivity
3. Review recent deployments for regressions
