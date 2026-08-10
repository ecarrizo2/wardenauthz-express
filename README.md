# WardenAuthz Express Middleware

[![CI](https://github.com/ecarrizo2/wardenauthz-express/actions/workflows/ci.yml/badge.svg)](https://github.com/ecarrizo2/wardenauthz-express/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@ecarrizo2/wardenauthz-express)](https://www.npmjs.com/package/@ecarrizo2/wardenauthz-express) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Express middleware for [WardenAuthz](https://github.com/ecarrizo2/wardenauthz) — request-level authorization using the WardenAuthz Access Control API.

## Installation

```bash
npm install @ecarrizo2/wardenauthz-express @ecarrizo2/wardenauthz-js express
```

## Quick Start

```javascript
const express = require('express')
const { accessControl } = require('@ecarrizo2/wardenauthz-express')

const app = express()

app.use(
  accessControl({
    apiUrl: 'https://your-wardenauthz-api.com',
    apiKey: 'sk_your_api_key',
  })
)

app.get('/api/users', (req, res) => {
  res.json({ users: [] })
})

app.listen(3000)
```

The middleware reads the scope from the `x-scope-id` request header by default and derives the resource and action from the HTTP method and path.

**Request flow:**

```
Client request → Express Router → accessControl middleware → your handler
                                      │
                                      ├── Extract scope (x-scope-id header)
                                      ├── Extract subject (req.user.sub)
                                      ├── Map method→action (GET→read)
                                      ├── Call WardenAuthz API
                                      ├── Allowed? → next()
                                      └── Denied?   → 403 Forbidden
```

## How It Works

The middleware intercepts every request and performs an access check via the WardenAuthz API. It:

1. Extracts the **scope ID** from the request (default: `x-scope-id` header)
2. Extracts the **subject ID** from the authenticated user (default: `req.user.sub`)
3. Derives the **resource** from the HTTP method and path (e.g., `get:/api/users`)
4. Derives the **action** from the HTTP method (GET→read, POST→create, PUT/PATCH→update, DELETE→delete)
5. Calls `client.access.hasAccess()` with the extracted values
6. Returns 403 if access is denied, or calls `next()` to proceed

## Configuration Options

| Option              | Type                           | Required | Default                                     | Description                                                      |
| ------------------- | ------------------------------ | -------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `apiUrl`            | `string`                       | Yes      | —                                           | The WardenAuthz API base URL                                     |
| `apiKey`            | `string`                       | Yes      | —                                           | Your WardenAuthz API key                                         |
| `scopeExtractor`    | `(req: Request) => string`     | No       | `req.headers['x-scope-id']`                 | Custom function to extract the scope identifier                  |
| `subjectExtractor`  | `(req: Request) => string`     | No       | `req.user?.sub \|\| req.user?.id \|\| 'anonymous'` | Custom function to extract the subject identifier         |
| `resourceExtractor` | `(req: Request) => string`     | No       | `` `${req.method}:${req.path}`.toLowerCase() `` | Custom function to determine the resource                     |
| `actionExtractor`   | `(req: Request) => string`     | No       | Method→action mapping (see below)           | Custom function to determine the action                          |
| `contextExtractor`  | `(req: Request) => object`     | No       | `undefined`                                 | Custom function to provide additional context for access checks  |
| `enrichRequest`     | `boolean`                      | No       | `false`                                     | If `true`, adds `req.accessControl` with the check result        |

### Default Method-to-Action Mapping

| HTTP Method | Action   |
| ----------- | -------- |
| `GET`       | `read`   |
| `POST`      | `create` |
| `PUT`       | `update` |
| `PATCH`     | `update` |
| `DELETE`    | `delete` |
| Any other   | `read`   |

## Advanced Usage

### Custom Extractors

You can override any extractor to match your application's conventions:

```javascript
app.use(
  accessControl({
    apiUrl: 'https://api.wardenauthz.com',
    apiKey: 'sk_your_key',

    // Scope from a JWT claim or custom header
    scopeExtractor: (req) => req.auth?.workspaceId,

    // Subject from a custom decoded token
    subjectExtractor: (req) => req.decodedToken?.userId,

    // Resource from the route pattern
    resourceExtractor: (req) => req.route?.path || req.path,

    // Action from a query parameter or body
    actionExtractor: (req) => req.query.action || 'read',

    // Pass IP address and custom attributes as context
    contextExtractor: (req) => ({
      ip: req.ip,
      userAgent: req.get('user-agent'),
      plan: req.user?.plan,
    }),
  })
)
```

### Request Enrichment

When `enrichRequest: true`, the middleware attaches the full access check result to the request object:

```javascript
app.use(
  accessControl({
    apiUrl: 'https://api.wardenauthz.com',
    apiKey: 'sk_your_key',
    enrichRequest: true,
  })
)

app.get('/api/documents/:id', (req, res) => {
  // Access the authorization result in downstream handlers
  console.log(req.accessControl.result) // { allowed: true, reasoning: "..." }
  console.log(req.accessControl.scopeId) // "workspace_123"
  console.log(req.accessControl.subjectId) // "user_456"

  res.json({ documents: [] })
})
```

### Per-Route Middleware

Apply different configurations to different route groups:

```javascript
const publicMiddleware = accessControl({
  apiUrl: 'https://api.wardenauthz.com',
  apiKey: 'pk_public_key',
  subjectExtractor: () => 'anonymous',
})

const adminMiddleware = accessControl({
  apiUrl: 'https://api.wardenauthz.com',
  apiKey: 'sk_admin_key',
  scopeExtractor: (req) => req.params.workspaceId,
  actionExtractor: () => 'manage',
})

// Public routes
app.get('/api/public/health', publicMiddleware, (req, res) => {
  res.json({ status: 'ok' })
})

// Admin routes (different API key, different extractors)
app.delete('/api/workspaces/:workspaceId', adminMiddleware, (req, res) => {
  res.json({ deleted: true })
})
```

### Error Responses

| Status | Scenario                             | Response Body                                                      |
| ------ | ------------------------------------ | ------------------------------------------------------------------ |
| `403`  | Missing scope identifier             | `{ "error": "No scope identifier found in request" }`              |
| `403`  | Access denied                        | `{ "error": "Forbidden", "resource": "...", "action": "...", "reasoning": "..." }` |
| `500`  | API request failed or network error  | `{ "error": "Authorization service unavailable" }`                 |
| Custom | `AccessControlExpressError` thrown   | `{ "error": "<message>" }`                                         |

### Throwing Custom Errors in Extractors

Extractors can throw `AccessControlExpressError` with a custom HTTP status:

```javascript
const { accessControl, AccessControlExpressError } = require('@ecarrizo2/wardenauthz-express')

app.use(
  accessControl({
    apiUrl: 'https://api.wardenauthz.com',
    apiKey: 'sk_your_key',
    scopeExtractor: (req) => {
      if (!req.user?.workspaceId) {
        throw new AccessControlExpressError(401, 'Authentication required')
      }
      return req.user.workspaceId
    },
  })
)
```

## API Reference

### `accessControl(options: WardenAuthExpressOptions): RequestHandler`

Creates an Express middleware function that performs access control checks on every request.

#### `WardenAuthExpressOptions`

| Property            | Type                           | Default                                              | Description                                           |
| ------------------- | ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| `apiUrl`            | `string`                       | **Required**                                         | Base URL of the WardenAuthz API                       |
| `apiKey`            | `string`                       | **Required**                                         | API key for authentication with the WardenAuthz API   |
| `scopeExtractor`    | `(req: Request) => string`     | `req.headers['x-scope-id']`                          | Extracts the scope/workspace identifier               |
| `subjectExtractor`  | `(req: Request) => string`     | `req.user?.sub \|\| req.user?.id \|\| 'anonymous'`     | Extracts the subject/user identifier                  |
| `resourceExtractor` | `(req: Request) => string`     | `` `${req.method}:${req.path}`.toLowerCase() ``        | Extracts or builds the resource identifier            |
| `actionExtractor`   | `(req: Request) => string`     | Auto-mapped from HTTP method                         | Extracts or builds the action                         |
| `contextExtractor`  | `(req: Request) => object`     | `undefined`                                          | Provides additional context for access evaluation     |
| `enrichRequest`     | `boolean`                      | `false`                                              | Attaches `req.accessControl` with the check result    |

#### Request Enrichment Shape

When `enrichRequest` is `true`:

```typescript
interface RequestWithWardenAuth extends Request {
  accessControl?: {
    result: AccessCheckResult // { allowed: boolean, reasoning?: string }
    scopeId: string
    subjectId: string
  }
}
```

### `AccessControlExpressError`

```typescript
class AccessControlExpressError extends Error {
  status: number    // HTTP status code
  message: string   // Error message (returned in JSON response)
}
```

A custom error class for use in extractors. When thrown inside an extractor function, the middleware catches it and returns a JSON response with the specified status code.

## License

MIT
