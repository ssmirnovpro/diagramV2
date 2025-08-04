const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('./logger');
const { databaseManager } = require('./database');

class WebhookManager {
  constructor() {
    this.webhookStats = {
      sent: 0,
      successful: 0,
      failed: 0,
      retried: 0
    };

    this.defaultTimeout = parseInt(process.env.WEBHOOK_TIMEOUT || '30000');
    this.maxRetries = parseInt(process.env.WEBHOOK_MAX_RETRIES || '3');
    this.retryDelays = [1000, 5000, 15000]; // Progressive delays
    this.signingSecret = process.env.WEBHOOK_SIGNING_SECRET || this.generateSigningSecret();
  }

  generateSigningSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate webhook signature for payload verification
  generateSignature(payload, secret = this.signingSecret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  // Verify webhook signature
  verifySignature(payload, signature, secret = this.signingSecret) {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Send webhook with retry logic
  async sendWebhook(webhookData, _options = {}) {
    const {
      url,
      payload,
      headers = {},
      timeout = this.defaultTimeout,
      retries = this.maxRetries,
      eventType = 'unknown',
      metadata = {}
    } = webhookData;

    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Prepare webhook payload with metadata
    const webhookPayload = {
      event: eventType,
      timestamp,
      requestId,
      data: payload,
      metadata
    };

    // Generate signature
    const signature = this.generateSignature(webhookPayload);

    // Prepare headers
    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'UML-Images-Service-Webhook/2.0',
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': timestamp,
      'X-Webhook-Event': eventType,
      'X-Webhook-Request-ID': requestId,
      ...headers
    };

    let lastError = null;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        this.webhookStats.sent++;

        logger.info('Sending webhook', {
          url,
          eventType,
          requestId,
          attempt: attempt + 1,
          maxAttempts: retries + 1
        });

        const response = await axios.post(url, webhookPayload, {
          headers: requestHeaders,
          timeout,
          validateStatus: (status) => status >= 200 && status < 300,
          maxRedirects: 3
        });

        this.webhookStats.successful++;

        logger.info('Webhook delivered successfully', {
          url,
          eventType,
          requestId,
          status: response.status,
          attempt: attempt + 1,
          responseTime: response.headers['x-response-time'] || 'unknown'
        });

        // Log successful delivery to database
        await this.logWebhookDelivery({
          url,
          eventType,
          requestId,
          payload: webhookPayload,
          status: 'delivered',
          statusCode: response.status,
          attempts: attempt + 1,
          metadata
        });

        return {
          success: true,
          requestId,
          status: response.status,
          attempts: attempt + 1
        };

      } catch (error) {
        lastError = error;
        this.webhookStats.failed++;

        const isRetryable = this.isRetryableError(error);
        const hasMoreRetries = attempt < retries;

        logger.warn('Webhook delivery failed', {
          url,
          eventType,
          requestId,
          attempt: attempt + 1,
          error: error.message,
          isRetryable,
          hasMoreRetries,
          statusCode: error.response?.status
        });

        if (isRetryable && hasMoreRetries) {
          this.webhookStats.retried++;
          attempt++;

          // Progressive delay
          const delay = this.retryDelays[Math.min(attempt - 1, this.retryDelays.length - 1)];
          logger.info('Retrying webhook delivery', {
            url,
            requestId,
            nextAttempt: attempt + 1,
            delayMs: delay
          });

          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    // All retries failed
    logger.error('Webhook delivery failed permanently', {
      url,
      eventType,
      requestId,
      totalAttempts: attempt + 1,
      lastError: lastError.message,
      statusCode: lastError.response?.status
    });

    // Log failed delivery to database
    await this.logWebhookDelivery({
      url,
      eventType,
      requestId,
      payload: webhookPayload,
      status: 'failed',
      statusCode: lastError.response?.status || 0,
      attempts: attempt + 1,
      error: lastError.message,
      metadata
    });

    return {
      success: false,
      requestId,
      error: lastError.message,
      attempts: attempt + 1,
      statusCode: lastError.response?.status
    };
  }

  // Check if error is retryable
  isRetryableError(error) {
    // Network errors are retryable
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP status codes that are retryable
    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 429 || status === 408;
    }

    return false;
  }

  // Send diagram completion webhook
  async sendDiagramCompletionWebhook(jobData, result) {
    if (!jobData.webhookUrl) {
      return null;
    }

    const payload = {
      jobId: jobData.requestId,
      jobType: 'diagram_generation',
      status: result.success ? 'completed' : 'failed',
      diagram: {
        format: jobData.format,
        diagramType: jobData.diagramType,
        size: result.success ? result.metadata?.size : null
      },
      result: result.success ? {
        size: result.metadata?.size,
        duration: result.duration,
        cached: result.metadata?.cached || false
      } : null,
      error: result.success ? null : result.error,
      callbackData: jobData.callbackData
    };

    return await this.sendWebhook({
      url: jobData.webhookUrl,
      payload,
      eventType: 'diagram.completed',
      metadata: {
        jobType: 'diagram',
        diagramType: jobData.diagramType,
        format: jobData.format
      }
    });
  }

  // Send batch completion webhook
  async sendBatchCompletionWebhook(batchData, results) {
    if (!batchData.webhookUrl) {
      return null;
    }

    const summary = results.summary || {
      total: batchData.requests?.length || 0,
      successful: 0,
      failed: 0
    };

    const payload = {
      batchId: batchData.batchId,
      jobType: 'batch_processing',
      status: summary.failed === 0 ? 'completed' : 'partial',
      summary,
      results: results.results ? results.results.map(r => ({
        index: r.index,
        success: r.success,
        error: r.error || null,
        metadata: r.success ? {
          size: r.metadata?.size,
          format: r.metadata?.format
        } : null
      })) : [],
      callbackData: batchData.callbackData
    };

    return await this.sendWebhook({
      url: batchData.webhookUrl,
      payload,
      eventType: 'batch.completed',
      metadata: {
        jobType: 'batch',
        batchSize: summary.total
      }
    });
  }

  // Send validation webhook
  async sendValidationWebhook(validationData, result) {
    if (!validationData.webhookUrl) {
      return null;
    }

    const payload = {
      validationId: validationData.validationId,
      diagramType: validationData.diagramType,
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      securityIssues: result.securityIssues,
      metadata: result.metadata,
      callbackData: validationData.callbackData
    };

    return await this.sendWebhook({
      url: validationData.webhookUrl,
      payload,
      eventType: 'validation.completed',
      metadata: {
        diagramType: validationData.diagramType,
        contentLength: validationData.contentLength
      }
    });
  }

  // Send system alert webhook
  async sendSystemAlert(alertData) {
    const webhookUrls = this.getSystemAlertWebhooks();
    if (webhookUrls.length === 0) {
      return [];
    }

    const payload = {
      alertType: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      timestamp: new Date().toISOString(),
      service: 'uml-images-service',
      metadata: alertData.metadata || {}
    };

    const results = await Promise.allSettled(
      webhookUrls.map(url => this.sendWebhook({
        url,
        payload,
        eventType: 'system.alert',
        metadata: {
          alertType: alertData.type,
          severity: alertData.severity
        }
      }))
    );

    return results.map((result, index) => ({
      url: webhookUrls[index],
      success: result.status === 'fulfilled' && result.value.success,
      error: result.status === 'rejected' ? result.reason.message :
        (result.value.success ? null : result.value.error)
    }));
  }

  // Get system alert webhook URLs from configuration
  getSystemAlertWebhooks() {
    const webhookUrls = process.env.SYSTEM_ALERT_WEBHOOKS;
    if (!webhookUrls) {
      return [];
    }

    return webhookUrls.split(',').map(url => url.trim()).filter(url => url);
  }

  // Log webhook delivery to database
  async logWebhookDelivery(deliveryData) {
    if (!databaseManager.isConnected) {
      return;
    }

    try {
      const query = `
        INSERT INTO webhook_deliveries (
          url, event_type, request_id, payload, status, status_code,
          attempts, error_message, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await databaseManager.pool.query(query, [
        deliveryData.url,
        deliveryData.eventType,
        deliveryData.requestId,
        JSON.stringify(deliveryData.payload),
        deliveryData.status,
        deliveryData.statusCode,
        deliveryData.attempts,
        deliveryData.error || null,
        JSON.stringify(deliveryData.metadata),
        new Date()
      ]);
    } catch (error) {
      logger.error('Failed to log webhook delivery', {
        error: error.message,
        requestId: deliveryData.requestId
      });
    }
  }

  // Get webhook delivery statistics
  async getWebhookStats(startDate, endDate) {
    if (!databaseManager.isConnected) {
      return this.webhookStats;
    }

    try {
      const query = `
        SELECT
          status,
          COUNT(*) as count,
          AVG(attempts) as avg_attempts,
          COUNT(CASE WHEN attempts > 1 THEN 1 END) as retried_count
        FROM webhook_deliveries
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY status
      `;

      const result = await databaseManager.pool.query(query, [startDate, endDate]);

      const stats = {
        ...this.webhookStats,
        database: result.rows.reduce((acc, row) => {
          acc[row.status] = {
            count: parseInt(row.count),
            avgAttempts: parseFloat(row.avg_attempts),
            retriedCount: parseInt(row.retried_count)
          };
          return acc;
        }, {})
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get webhook stats', { error: error.message });
      return this.webhookStats;
    }
  }

  // Validate webhook URL
  isValidWebhookUrl(url) {
    try {
      const parsed = new URL(url);

      // Must be HTTP or HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      // Reject localhost and private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = parsed.hostname;

        // Reject localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return false;
        }

        // Reject private IP ranges
        const privateRanges = [
          /^10\./,
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
          /^192\.168\./,
          /^169\.254\./
        ];

        if (privateRanges.some(range => range.test(hostname))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Test webhook endpoint
  async testWebhook(url, timeout = 10000) {
    if (!this.isValidWebhookUrl(url)) {
      throw new Error('Invalid webhook URL');
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      data: {
        message: 'This is a test webhook from UML Images Service'
      }
    };

    return await this.sendWebhook({
      url,
      payload: testPayload,
      eventType: 'webhook.test',
      timeout,
      retries: 0
    });
  }

  // Helper function for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Reset statistics
  resetStats() {
    this.webhookStats = {
      sent: 0,
      successful: 0,
      failed: 0,
      retried: 0
    };
  }

  // Get current statistics
  getStats() {
    const total = this.webhookStats.sent;
    return {
      ...this.webhookStats,
      successRate: total > 0 ? (this.webhookStats.successful / total) * 100 : 0,
      retryRate: total > 0 ? (this.webhookStats.retried / total) * 100 : 0
    };
  }
}

// Singleton instance
const webhookManager = new WebhookManager();

module.exports = {
  WebhookManager,
  webhookManager
};