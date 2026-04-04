# Error Handling and Logging

This document describes the error handling and logging implementation for the LaterOn API.

## Error Response Format

All API errors return a consistent JSON format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": null | { ... }
  }
}
```

## Error Types

### Validation Errors (400)
- Invalid input data (negative amounts, empty addresses)
- Expired quotes
- Tier limit violations
- Example: `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid quote request", "details": {...} } }`

### Not Found Errors (404)
- Plan ID not found
- Quote ID not found
- Example: `{ "error": { "code": "NOT_FOUND", "message": "Plan not found", "details": null } }`

### Unauthorized Errors (401)
- Missing wallet connection
- Invalid session token
- Example: `{ "error": { "code": "UNAUTHORIZED", "message": "Unauthorized", "details": null } }`

### Forbidden Errors (403)
- Wallet token mismatch
- Insufficient permissions
- Example: `{ "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": null } }`

### Rate Limit Errors (429)
- Too many requests from same IP
- Example: `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests", "details": null } }`

### Blockchain Errors (502)
- Transaction submission failed
- Contract call rejected
- Network timeout
- Example: `{ "error": { "code": "BLOCKCHAIN_ERROR", "message": "Transaction failed", "details": {...} } }`

### Internal Errors (500)
- Database connection failed
- Unexpected exceptions
- Insufficient liquidity (hidden from users)
- Example: `{ "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred", "details": null } }`

## Structured Logging

The API uses Winston for structured logging with three log levels:

### Log Levels
- **info**: Normal operations, successful transactions
- **warn**: Recoverable issues, deprecated features
- **error**: Errors, failures, exceptions

### Log Format
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Blockchain transaction submitted",
  "operation": "create_plan",
  "txId": "ABC123...",
  "sender": "ALGORAND_ADDRESS",
  "amount": 100.5
}
```

### Blockchain Transaction Logging

All blockchain transaction submissions are automatically logged with:
- Operation type (create_plan, repay_installment, pool_deposit, etc.)
- Transaction ID
- Sender address
- Amount (if applicable)
- App ID (if applicable)

Example:
```typescript
logBlockchainTransaction({
  operation: "create_plan",
  txId: "ABC123...",
  sender: "ALGORAND_ADDRESS",
  amount: 100.5
});
```

## Graceful Shutdown

The API implements graceful shutdown handling for SIGTERM and SIGINT signals:

1. Receives shutdown signal
2. Stops accepting new requests
3. Waits for in-flight requests to complete
4. Closes database connections
5. Exits with appropriate code

## Environment Variables

### Required Variables
- `ALGOD_ADDRESS`: Algorand node address
- `BNPL_APP_ID`: BNPL contract app ID
- `POOL_APP_ID`: Pool contract app ID

The API validates these on startup and fails fast with clear error messages if any are missing.

### Optional Variables
- `LOG_LEVEL`: Logging level (default: "info")
- `DATABASE_URL`: PostgreSQL connection string
- `API_PORT`: Server port (default: 4000)

## Health Check Endpoint

`GET /health`

Returns server health status:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Status values:
- `ok`: All systems operational
- `degraded`: Some systems unavailable

Database values:
- `connected`: Database connection healthy
- `disconnected`: Database connection failed
- `not_configured`: Database not configured

## Usage Examples

### Handling Errors in Frontend

```typescript
try {
  const response = await fetch('/api/checkout/commit', {
    method: 'POST',
    body: JSON.stringify({ quoteId })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error:', errorData.error.code, errorData.error.message);
    // Display error to user
  }
} catch (error) {
  console.error('Network error:', error);
}
```

### Viewing Logs

Logs are written to stdout in JSON format. In production, use a log aggregation service like:
- CloudWatch Logs (AWS)
- Stackdriver (GCP)
- Papertrail
- Datadog

Example log query:
```bash
# Filter by operation
grep "create_plan" logs.json

# Filter by error level
grep "\"level\":\"error\"" logs.json

# Filter by transaction ID
grep "ABC123" logs.json
```

## Implementation Files

- `apps/api/src/lib/logger.ts` - Winston logger configuration
- `apps/api/src/errors.ts` - Error class definitions
- `apps/api/src/server.ts` - Error handler middleware
- `apps/api/src/index.ts` - Graceful shutdown handler
- `apps/api/src/services/contract-gateway.ts` - Transaction logging

## Testing

To test error handling:

```bash
# Test validation error
curl -X POST http://localhost:4000/api/checkout/quote \
  -H "Content-Type: application/json" \
  -d '{"orderAmountInr": -100}'

# Test not found error
curl http://localhost:4000/api/plans?walletAddress=INVALID

# Test health check
curl http://localhost:4000/health
```

## Future Improvements

- Add request ID tracking for distributed tracing
- Implement error rate monitoring and alerting
- Add performance metrics logging
- Implement log sampling for high-traffic endpoints
- Add correlation IDs across service boundaries
