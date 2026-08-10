'use strict'
const { WardenAuthClient } = require('@ecarrizo2/wardenauthz-js')

class AccessControlExpressError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function accessControl(options) {
  const client = new WardenAuthClient({ apiUrl: options.apiUrl, apiKey: options.apiKey })
  const scopeExtractor = options.scopeExtractor || ((req) => req.headers['x-scope-id'])
  const subjectExtractor = options.subjectExtractor || ((req) => req.user?.sub || req.user?.id || 'anonymous')

  return async function accessControlMiddleware(req, res, next) {
    try {
      const scopeId = scopeExtractor(req)
      const subjectId = subjectExtractor(req)

      if (!scopeId) {
        return res.status(403).json({ error: 'No scope identifier found in request' })
      }

      const resource = options.resourceExtractor
        ? options.resourceExtractor(req)
        : `${req.method}:${req.path}`.toLowerCase()

      const action = options.actionExtractor ? options.actionExtractor(req) : mapMethodToAction(req.method)

      const result = await client.access.hasAccess({
        subjectId,
        scopeId,
        resource,
        action,
        context: options.contextExtractor ? options.contextExtractor(req) : undefined,
      })

      if (!result.allowed) {
        return res.status(403).json({
          error: 'Forbidden',
          resource,
          action,
          reasoning: result.reasoning,
        })
      }

      if (options.enrichRequest) {
        req.accessControl = { result, scopeId, subjectId }
      }

      next()
    } catch (err) {
      if (err instanceof AccessControlExpressError) {
        return res.status(err.status).json({ error: err.message })
      }
      console.error('Access Control middleware error:', err)
      res.status(500).json({ error: 'Authorization service unavailable' })
    }
  }
}

function mapMethodToAction(method) {
  const actions = { GET: 'read', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }
  return actions[method.toUpperCase()] || 'read'
}

module.exports = { accessControl, AccessControlExpressError }
