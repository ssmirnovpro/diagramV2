const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { generateRateLimit, handleValidationErrors } = require('../middleware/security');
const { logger } = require('../utils/logger');
const { webhookManager } = require('../utils/webhookManager');

const router = express.Router();

// Test webhook endpoint
router.post('/test',
  generateRateLimit,
  [
    body('url')
      .isURL()
      .withMessage('Valid URL is required')
      .custom((url) => {
        if (!webhookManager.isValidWebhookUrl(url)) {
          throw new Error('Invalid webhook URL - must be HTTP/HTTPS and not point to private addresses in production');
        }
        return true;
      }),
    body('timeout')
      .optional()
      .isInt({ min: 1000, max: 30000 })
      .withMessage('Timeout must be between 1000 and 30000 milliseconds')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { url, timeout = 10000 } = req.body;

      logger.info('Testing webhook endpoint', {
        url,
        timeout,
        ip: req.ip
      });

      const result = await webhookManager.testWebhook(url, timeout);

      if (result.success) {
        res.json({
          success: true,
          message: 'Webhook test successful',
          requestId: result.requestId,
          status: result.status,
          url
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Webhook test failed',
          requestId: result.requestId,
          error: result.error,
          statusCode: result.statusCode,
          url
        });
      }

    } catch (error) {
      logger.error('Webhook test error', {
        error: error.message,
        ip: req.ip,
        url: req.body.url
      });

      next({
        status: 500,
        type: 'WEBHOOK_TEST_ERROR',
        message: 'Failed to test webhook endpoint'
      });
    }
  }
);

// Validate webhook URL
router.post('/validate',
  generateRateLimit,
  [
    body('url')
      .isURL()
      .withMessage('Valid URL is required')
  ],
  handleValidationErrors,
  (req, res) => {
    try {
      const { url } = req.body;
      const isValid = webhookManager.isValidWebhookUrl(url);

      res.json({
        url,
        isValid,
        reasons: isValid ? [] : [
          'URL must use HTTP or HTTPS protocol',
          'URL must not point to localhost or private IP addresses in production',
          'URL must be properly formatted'
        ]
      });

    } catch (error) {
      logger.error('Webhook validation error', {
        error: error.message,
        ip: req.ip,
        url: req.body.url
      });

      res.status(500).json({
        error: 'Failed to validate webhook URL'
      });
    }
  }
);

// Get webhook delivery statistics
router.get('/stats',
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO 8601 date'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Default to last 24 hours if no dates provided
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const stats = await webhookManager.getWebhookStats(start, end);

      res.json({
        period: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        stats,
        summary: {
          totalDeliveries: stats.sent,
          successRate: `${((stats.successful / (stats.sent || 1)) * 100).toFixed(2)}%`,
          retryRate: `${((stats.retried / (stats.sent || 1)) * 100).toFixed(2)}%`,
          currentStats: webhookManager.getStats()
        }
      });

    } catch (error) {
      logger.error('Webhook stats error', {
        error: error.message,
        ip: req.ip
      });

      next({
        status: 500,
        type: 'WEBHOOK_STATS_ERROR',
        message: 'Failed to get webhook statistics'
      });
    }
  }
);

// Webhook signature verification example endpoint
router.post('/verify-signature',
  generateRateLimit,
  [
    body('payload')
      .isObject()
      .withMessage('Payload must be an object'),
    body('signature')
      .isString()
      .withMessage('Signature is required'),
    body('secret')
      .optional()
      .isString()
      .withMessage('Secret must be a string')
  ],
  handleValidationErrors,
  (req, res) => {
    try {
      const { payload, signature, secret } = req.body;

      const isValid = webhookManager.verifySignature(payload, signature, secret);
      const expectedSignature = webhookManager.generateSignature(payload, secret);

      res.json({
        isValid,
        providedSignature: signature,
        expectedSignature,
        message: isValid ? 'Signature is valid' : 'Signature verification failed'
      });

    } catch (error) {
      logger.error('Signature verification error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Failed to verify signature'
      });
    }
  }
);

// Generate webhook signature for testing
router.post('/generate-signature',
  generateRateLimit,
  [
    body('payload')
      .isObject()
      .withMessage('Payload must be an object'),
    body('secret')
      .optional()
      .isString()
      .withMessage('Secret must be a string')
  ],
  handleValidationErrors,
  (req, res) => {
    try {
      const { payload, secret } = req.body;
      const signature = webhookManager.generateSignature(payload, secret);

      res.json({
        payload,
        signature,
        instructions: {
          verification: 'Include this signature in X-Webhook-Signature header',
          format: 'sha256=<hex_digest>',
          algorithm: 'HMAC-SHA256'
        }
      });

    } catch (error) {
      logger.error('Signature generation error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Failed to generate signature'
      });
    }
  }
);

// Webhook events documentation
router.get('/events', (req, res) => {
  res.json({
    events: {
      'diagram.completed': {
        description: 'Sent when a diagram generation job completes',
        payload: {
          jobId: 'string',
          jobType: 'diagram_generation',
          status: 'completed | failed',
          diagram: {
            format: 'string',
            diagramType: 'string',
            size: 'number | null'
          },
          result: {
            size: 'number',
            duration: 'number',
            cached: 'boolean'
          },
          error: 'string | null',
          callbackData: 'object | null'
        }
      },
      'batch.completed': {
        description: 'Sent when a batch processing job completes',
        payload: {
          batchId: 'string',
          jobType: 'batch_processing',
          status: 'completed | partial',
          summary: {
            total: 'number',
            successful: 'number',
            failed: 'number'
          },
          results: 'array',
          callbackData: 'object | null'
        }
      },
      'validation.completed': {
        description: 'Sent when content validation completes',
        payload: {
          validationId: 'string',
          diagramType: 'string',
          isValid: 'boolean',
          errors: 'array',
          warnings: 'array',
          securityIssues: 'array',
          metadata: 'object',
          callbackData: 'object | null'
        }
      },
      'system.alert': {
        description: 'Sent for system alerts and critical events',
        payload: {
          alertType: 'string',
          severity: 'low | medium | high | critical',
          message: 'string',
          timestamp: 'string',
          service: 'uml-images-service',
          metadata: 'object'
        }
      },
      'webhook.test': {
        description: 'Test event for webhook endpoint verification',
        payload: {
          message: 'This is a test webhook from UML Images Service'
        }
      }
    },
    headers: {
      'X-Webhook-Signature': 'HMAC-SHA256 signature for payload verification',
      'X-Webhook-Timestamp': 'ISO 8601 timestamp when webhook was sent',
      'X-Webhook-Event': 'Event type (e.g., diagram.completed)',
      'X-Webhook-Request-ID': 'Unique request identifier for tracking',
      'Content-Type': 'application/json',
      'User-Agent': 'UML-Images-Service-Webhook/2.0'
    },
    verification: {
      algorithm: 'HMAC-SHA256',
      format: 'sha256=<hex_digest>',
      description: 'Verify webhook authenticity using the provided signature'
    },
    retryPolicy: {
      maxRetries: 3,
      delays: [1000, 5000, 15000],
      retryableStatusCodes: [408, 429, '5xx'],
      retryableErrors: ['ECONNREFUSED', 'ENOTFOUND', 'ECONNABORTED', 'ETIMEDOUT']
    },
    security: {
      httpsRecommended: true,
      signatureVerification: 'Required for production use',
      ipWhitelisting: 'Recommended for enhanced security',
      rateLimiting: 'Apply rate limits to webhook endpoints'
    }
  });
});

module.exports = router;