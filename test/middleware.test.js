'use strict'

const mockHasAccess = jest.fn()

jest.mock('@ecarrizo2/wardenauthz-js', () => ({
  WardenAuthClient: jest.fn(() => ({
    access: { hasAccess: mockHasAccess },
  })),
}))

const { accessControl, AccessControlExpressError } = require('../index')
const { WardenAuthClient } = require('@ecarrizo2/wardenauthz-js')

describe('accessControl middleware', () => {
  let middleware
  let req
  let res
  let next

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/api/users',
      headers: {},
      user: null,
    }
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
    }
    next = jest.fn()

    mockHasAccess.mockReset()
    WardenAuthClient.mockClear()
  })

  describe('module exports', () => {
    it('should export accessControl function', () => {
      expect(typeof accessControl).toBe('function')
    })

    it('should export AccessControlExpressError class', () => {
      expect(typeof AccessControlExpressError).toBe('function')
      const err = new AccessControlExpressError(401, 'test error')
      expect(err).toBeInstanceOf(Error)
      expect(err.status).toBe(401)
      expect(err.message).toBe('test error')
    })
  })

  describe('initialization', () => {
    it('should return an async middleware function', () => {
      const fn = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
      expect(typeof fn).toBe('function')
      expect(fn.constructor.name).toBe('AsyncFunction')
    })

    it('should create WardenAuthClient with provided options', () => {
      accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'sk_test_123' })
      expect(WardenAuthClient).toHaveBeenCalledWith({
        apiUrl: 'http://localhost:3001',
        apiKey: 'sk_test_123',
      })
    })
  })

  describe('default extractors', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
    })

    it('should extract scope ID from x-scope-id header', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ scopeId: 'scope_abc' })
      )
    })

    it('should extract subject from req.user.sub', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = { sub: 'user-sub-123' }

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'user-sub-123' })
      )
    })

    it('should extract subject from req.user.id when sub is not present', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = { id: 'user-id-456' }

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'user-id-456' })
      )
    })

    it('should default subject to anonymous when no user object', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = null

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'anonymous' })
      )
    })

    it('should default subject to anonymous when user has no sub or id', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = { name: 'test' }

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'anonymous' })
      )
    })

    it('should derive resource from method and path (default)', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.headers['x-scope-id'] = 'scope_abc'
      req.method = 'POST'
      req.path = '/api/users'

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'post:/api/users' })
      )
    })
  })

  describe('mapMethodToAction', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
      req.headers['x-scope-id'] = 'scope_abc'
    })

    it('should map GET to read', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'GET'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }))
    })

    it('should map POST to create', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'POST'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }))
    })

    it('should map PUT to update', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'PUT'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'update' }))
    })

    it('should map PATCH to update', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'PATCH'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'update' }))
    })

    it('should map DELETE to delete', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'DELETE'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete' }))
    })

    it('should default unknown methods to read', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'OPTIONS'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }))
    })

    it('should be case-insensitive for method mapping', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      req.method = 'post'
      await middleware(req, res, next)
      expect(mockHasAccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }))
    })
  })

  describe('successful access check', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = { sub: 'user-123' }
    })

    it('should call next() when access is allowed', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })

      await middleware(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should pass correct payload to hasAccess', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith({
        subjectId: 'user-123',
        scopeId: 'scope_abc',
        resource: 'get:/api/users',
        action: 'read',
        context: undefined,
      })
    })
  })

  describe('forbidden access', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
      req.headers['x-scope-id'] = 'scope_abc'
    })

    it('should return 403 when access is denied', async () => {
      mockHasAccess.mockResolvedValue({ allowed: false, reasoning: 'No matching permission' })

      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        resource: 'get:/api/users',
        action: 'read',
        reasoning: 'No matching permission',
      })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('missing scope ID', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
    })

    it('should return 403 when no scope ID is found', async () => {
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        error: 'No scope identifier found in request',
      })
      expect(next).not.toHaveBeenCalled()
      expect(mockHasAccess).not.toHaveBeenCalled()
    })

    it('should return 403 when scope extractor returns empty string', async () => {
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: () => '',
      })

      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        error: 'No scope identifier found in request',
      })
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      middleware = accessControl({ apiUrl: 'http://localhost:3001', apiKey: 'test-key' })
      req.headers['x-scope-id'] = 'scope_abc'
    })

    it('should return 500 on generic errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mockHasAccess.mockRejectedValue(new Error('Network failure'))

      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization service unavailable',
      })
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('should return the custom status/message for AccessControlExpressError', async () => {
      mockHasAccess.mockImplementation(() => {
        throw new AccessControlExpressError(429, 'Rate limit exceeded')
      })

      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate limit exceeded',
      })
    })
  })

  describe('custom extractors', () => {
    it('should use custom scopeExtractor', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: (r) => r.query.scope,
      })
      req.query = { scope: 'custom-scope' }

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ scopeId: 'custom-scope' })
      )
    })

    it('should use custom subjectExtractor', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: () => 'scope_abc',
        subjectExtractor: (r) => r.headers['x-custom-user'],
      })
      req.headers['x-custom-user'] = 'custom-user-789'

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'custom-user-789' })
      )
    })

    it('should use custom resourceExtractor', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: () => 'scope_abc',
        resourceExtractor: (r) => r.path,
      })
      req.path = '/custom/resource'

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ resource: '/custom/resource' })
      )
    })

    it('should use custom actionExtractor', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: () => 'scope_abc',
        actionExtractor: (r) => r.query.action,
      })
      req.query = { action: 'manage' }

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'manage' })
      )
    })

    it('should use custom contextExtractor', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        scopeExtractor: () => 'scope_abc',
        contextExtractor: (r) => ({ ip: r.ip, region: 'us-east-1' }),
      })
      req.ip = '127.0.0.1'

      await middleware(req, res, next)

      expect(mockHasAccess).toHaveBeenCalledWith(
        expect.objectContaining({ context: { ip: '127.0.0.1', region: 'us-east-1' } })
      )
    })
  })

  describe('enrichRequest option', () => {
    beforeEach(() => {
      req.headers['x-scope-id'] = 'scope_abc'
      req.user = { sub: 'user-123' }
    })

    it('should set req.accessControl when enrichRequest is true', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true, reasoning: 'matched wildcard' })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
        enrichRequest: true,
      })

      await middleware(req, res, next)

      expect(req.accessControl).toBeDefined()
      expect(req.accessControl.scopeId).toBe('scope_abc')
      expect(req.accessControl.subjectId).toBe('user-123')
      expect(req.accessControl.result).toEqual({
        allowed: true,
        reasoning: 'matched wildcard',
      })
      expect(next).toHaveBeenCalled()
    })

    it('should NOT set req.accessControl when enrichRequest is false (default)', async () => {
      mockHasAccess.mockResolvedValue({ allowed: true })
      middleware = accessControl({
        apiUrl: 'http://localhost:3001',
        apiKey: 'test-key',
      })

      await middleware(req, res, next)

      expect(req.accessControl).toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })
})
