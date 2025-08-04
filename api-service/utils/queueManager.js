const Queue = require('bull');
const { logger } = require('./logger');
const { cacheManager } = require('./cache');
const FormatManager = require('./formatManager');
const { recordDiagramGeneration, businessMetrics, updateQueueSize } = require('../middleware/metrics');

class QueueManager {
  constructor() {
    this.queues = {};
    this.processors = {};
    this.isInitialized = false;
    this.queueStats = {
      processed: 0,
      failed: 0,
      active: 0,
      waiting: 0,
      delayed: 0,
      completed: 0
    };

    // Queue configurations
    this.queueConfigs = {
      diagram: {
        name: 'diagram-generation',
        concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      },
      batch: {
        name: 'batch-processing',
        concurrency: parseInt(process.env.BATCH_CONCURRENCY || '2'),
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 50,
        removeOnFail: 25
      },
      webhook: {
        name: 'webhook-delivery',
        concurrency: parseInt(process.env.WEBHOOK_CONCURRENCY || '3'),
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: 200,
        removeOnFail: 100
      }
    };
  }

  async initialize() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const krokiUrl = process.env.KROKI_URL || 'http://kroki-service:8000';

      this.formatManager = new FormatManager(krokiUrl);

      // Initialize queues
      for (const [queueType, config] of Object.entries(this.queueConfigs)) {
        this.queues[queueType] = new Queue(config.name, redisUrl, {
          defaultJobOptions: {
            attempts: config.attempts,
            backoff: config.backoff,
            removeOnComplete: config.removeOnComplete,
            removeOnFail: config.removeOnFail
          },
          settings: {
            stalledInterval: 30 * 1000,
            retryDelayOnCloseConnection: 100
          }
        });

        // Setup event listeners
        this.setupQueueEventListeners(this.queues[queueType], queueType);

        // Setup processors
        await this.setupProcessor(queueType, config.concurrency);
      }

      // Start queue monitoring
      this.startQueueMonitoring();

      this.isInitialized = true;
      logger.info('Queue manager initialized successfully', {
        queues: Object.keys(this.queues),
        totalConcurrency: Object.values(this.queueConfigs).reduce((sum, c) => sum + c.concurrency, 0)
      });

    } catch (error) {
      logger.error('Failed to initialize queue manager', { error: error.message });
      throw error;
    }
  }

  setupQueueEventListeners(queue, queueType) {
    queue.on('completed', (job, _result) => {
      this.queueStats.completed++;
      logger.debug('Job completed', {
        queueType,
        jobId: job.id,
        duration: Date.now() - job.timestamp
      });
    });

    queue.on('failed', (job, err) => {
      this.queueStats.failed++;
      logger.error('Job failed', {
        queueType,
        jobId: job.id,
        error: err.message,
        attempts: job.attemptsMade,
        data: job.data
      });
    });

    queue.on('active', (job, _jobPromise) => {
      logger.debug('Job started', {
        queueType,
        jobId: job.id,
        priority: job.opts.priority
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        queueType,
        jobId: job.id,
        attempts: job.attemptsMade
      });
    });

    queue.on('error', (error) => {
      logger.error('Queue error', {
        queueType,
        error: error.message
      });
    });
  }

  async setupProcessor(queueType, concurrency) {
    const queue = this.queues[queueType];

    switch (queueType) {
    case 'diagram':
      await queue.process(concurrency, this.processDiagramJob.bind(this));
      break;
    case 'batch':
      await queue.process(concurrency, this.processBatchJob.bind(this));
      break;
    case 'webhook':
      await queue.process(concurrency, this.processWebhookJob.bind(this));
      break;
    default:
      throw new Error(`Unknown queue type: ${queueType}`);
    }
  }

  // Process individual diagram generation
  async processDiagramJob(job) {
    const startTime = Date.now();
    const { uml, format, diagramType, options, requestId } = job.data;

    try {
      logger.info('Processing diagram job', {
        jobId: job.id,
        requestId,
        format,
        diagramType,
        umlLength: uml.length
      });

      // Update job progress
      await job.progress(10);

      // Check cache first
      const cacheKey = cacheManager.generateCacheKey(uml, format, { diagramType, ...options });
      let result = await cacheManager.getCachedDiagram(cacheKey);

      await job.progress(30);

      if (!result) {
        // Generate diagram
        result = await this.formatManager.generateDiagram(uml, diagramType, format, options);

        await job.progress(80);

        // Cache the result
        await cacheManager.cacheDiagram(cacheKey, result.data, result.metadata);
      }

      await job.progress(100);

      const duration = Date.now() - startTime;

      // Update metrics
      businessMetrics.trackSuccessfulGeneration(diagramType);
      recordDiagramGeneration(diagramType, 'success', duration);

      logger.info('Diagram job completed', {
        jobId: job.id,
        requestId,
        duration,
        size: result.data.length
      });

      return {
        success: true,
        data: result.data.toString('base64'), // Base64 encode for queue storage
        metadata: result.metadata,
        mimeType: result.mimeType,
        requestId,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Diagram job failed', {
        jobId: job.id,
        requestId,
        error: error.message,
        duration
      });

      // Update error metrics
      businessMetrics.trackFailedGeneration(diagramType, 'QUEUE_PROCESSING_ERROR');
      recordDiagramGeneration(diagramType, 'error', duration, 'QUEUE_PROCESSING_ERROR');

      throw error;
    }
  }

  // Process batch of diagrams
  async processBatchJob(job) {
    const startTime = Date.now();
    const { requests, batchId, webhookUrl } = job.data;

    try {
      logger.info('Processing batch job', {
        jobId: job.id,
        batchId,
        batchSize: requests.length
      });

      const results = [];
      const total = requests.length;

      for (let i = 0; i < total; i++) {
        const request = requests[i];

        try {
          // Process each diagram in the batch
          const diagramResult = await this.formatManager.generateDiagram(
            request.uml,
            request.diagramType || 'plantuml',
            request.format || 'png',
            request.options || {}
          );

          results.push({
            index: i,
            success: true,
            data: diagramResult.data.toString('base64'),
            metadata: diagramResult.metadata,
            mimeType: diagramResult.mimeType
          });

          // Update progress
          await job.progress(Math.round(((i + 1) / total) * 90));

        } catch (error) {
          results.push({
            index: i,
            success: false,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      logger.info('Batch job completed', {
        jobId: job.id,
        batchId,
        total,
        successful: successCount,
        failed: total - successCount,
        duration
      });

      // Send webhook notification if configured
      if (webhookUrl) {
        await this.queueWebhookDelivery({
          url: webhookUrl,
          payload: {
            batchId,
            status: 'completed',
            summary: {
              total,
              successful: successCount,
              failed: total - successCount,
              duration
            },
            results
          }
        });
      }

      await job.progress(100);

      return {
        batchId,
        summary: {
          total,
          successful: successCount,
          failed: total - successCount,
          duration
        },
        results
      };

    } catch (error) {
      logger.error('Batch job failed', {
        jobId: job.id,
        batchId,
        error: error.message
      });

      // Send failure webhook if configured
      if (job.data.webhookUrl) {
        await this.queueWebhookDelivery({
          url: job.data.webhookUrl,
          payload: {
            batchId,
            status: 'failed',
            error: error.message
          }
        });
      }

      throw error;
    }
  }

  // Process webhook delivery
  async processWebhookJob(job) {
    const { url, payload, headers = {} } = job.data;

    try {
      const axios = require('axios');

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'UML-Images-Service-Webhook/2.0',
          ...headers
        },
        timeout: 30000,
        validateStatus: (status) => status < 500
      });

      logger.info('Webhook delivered successfully', {
        jobId: job.id,
        url,
        status: response.status
      });

      return { success: true, status: response.status };

    } catch (error) {
      logger.error('Webhook delivery failed', {
        jobId: job.id,
        url,
        error: error.message
      });
      throw error;
    }
  }

  // Queue a diagram generation job
  async queueDiagramGeneration(data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const jobOptions = {
      priority: options.priority || 0,
      delay: options.delay || 0,
      removeOnComplete: true,
      removeOnFail: false
    };

    const job = await this.queues.diagram.add(data, jobOptions);

    logger.debug('Diagram generation job queued', {
      jobId: job.id,
      priority: jobOptions.priority
    });

    return job;
  }

  // Queue a batch processing job
  async queueBatchProcessing(data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const jobOptions = {
      priority: options.priority || 0,
      delay: options.delay || 0,
      removeOnComplete: true,
      removeOnFail: false
    };

    const job = await this.queues.batch.add(data, jobOptions);

    logger.info('Batch processing job queued', {
      jobId: job.id,
      batchId: data.batchId,
      batchSize: data.requests.length
    });

    return job;
  }

  // Queue a webhook delivery
  async queueWebhookDelivery(data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const jobOptions = {
      priority: options.priority || 0,
      delay: options.delay || 0,
      removeOnComplete: true,
      removeOnFail: false
    };

    const job = await this.queues.webhook.add(data, jobOptions);

    logger.debug('Webhook delivery job queued', {
      jobId: job.id,
      url: data.url
    });

    return job;
  }

  // Get job status
  async getJobStatus(queueType, jobId) {
    const queue = this.queues[queueType];
    if (!queue) {
      throw new Error(`Unknown queue type: ${queueType}`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      progress: job.progress(),
      data: job.data,
      opts: job.opts,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue
    };
  }

  // Get queue statistics
  async getQueueStats() {
    const stats = {};

    for (const [queueType, queue] of Object.entries(this.queues)) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const delayed = await queue.getDelayed();

      stats[queueType] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
    }

    return {
      ...stats,
      summary: this.queueStats
    };
  }

  // Start monitoring queue metrics
  startQueueMonitoring() {
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats();

        // Update Prometheus metrics
        let totalWaiting = 0;
        for (const queueStats of Object.values(stats)) {
          if (queueStats.waiting !== undefined) {
            totalWaiting += queueStats.waiting;
          }
        }

        updateQueueSize(totalWaiting);

      } catch (error) {
        logger.error('Queue monitoring error', { error: error.message });
      }
    }, 10000); // Update every 10 seconds
  }

  // Pause/Resume queue operations
  async pauseQueue(queueType) {
    const queue = this.queues[queueType];
    if (queue) {
      await queue.pause();
      logger.info('Queue paused', { queueType });
    }
  }

  async resumeQueue(queueType) {
    const queue = this.queues[queueType];
    if (queue) {
      await queue.resume();
      logger.info('Queue resumed', { queueType });
    }
  }

  // Clean completed/failed jobs
  async cleanQueue(queueType, grace = 24 * 60 * 60 * 1000) { // 24 hours
    const queue = this.queues[queueType];
    if (queue) {
      await queue.clean(grace, 'completed');
      await queue.clean(grace, 'failed');
      logger.info('Queue cleaned', { queueType, grace });
    }
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('Shutting down queue manager...');

    for (const [queueType, queue] of Object.entries(this.queues)) {
      try {
        await queue.close();
        logger.info('Queue closed', { queueType });
      } catch (error) {
        logger.error('Error closing queue', { queueType, error: error.message });
      }
    }

    this.isInitialized = false;
    logger.info('Queue manager shutdown complete');
  }
}

// Singleton instance
const queueManager = new QueueManager();

module.exports = {
  QueueManager,
  queueManager
};