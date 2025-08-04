const express = require('express');
const { body, query, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { generateRateLimit, handleValidationErrors } = require('../middleware/security');
const { logger } = require('../utils/logger');
const { queueManager } = require('../utils/queueManager');

const router = express.Router();

// Validation middleware for async requests
const asyncValidation = [
  body('uml')
    .isString()
    .isLength({ min: 1, max: 100000 })
    .withMessage('UML code must be between 1 and 100,000 characters'),
  body('format')
    .optional()
    .isIn(['png', 'svg', 'pdf', 'jpeg', 'webp'])
    .withMessage('Format must be one of: png, svg, pdf, jpeg, webp'),
  body('diagramType')
    .optional()
    .isIn(['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'])
    .withMessage('Invalid diagram type'),
  body('priority')
    .optional()
    .isInt({ min: -10, max: 10 })
    .withMessage('Priority must be between -10 and 10'),
  body('webhookUrl')
    .optional()
    .isURL()
    .withMessage('Webhook URL must be valid'),
  body('callbackData')
    .optional()
    .isObject()
    .withMessage('Callback data must be an object')
];

const batchValidation = [
  body('requests')
    .isArray({ min: 1, max: 50 })
    .withMessage('Requests must be an array with 1-50 items'),
  body('requests.*.uml')
    .isString()
    .isLength({ min: 1, max: 50000 })
    .withMessage('Each UML code must be between 1 and 50,000 characters'),
  body('requests.*.format')
    .optional()
    .isIn(['png', 'svg', 'pdf', 'jpeg', 'webp'])
    .withMessage('Format must be valid'),
  body('requests.*.diagramType')
    .optional()
    .isString()
    .withMessage('DiagramType must be a string'),
  body('priority')
    .optional()
    .isInt({ min: -10, max: 10 })
    .withMessage('Priority must be between -10 and 10'),
  body('webhookUrl')
    .optional()
    .isURL()
    .withMessage('Webhook URL must be valid'),
  body('callbackData')
    .optional()
    .isObject()
    .withMessage('Callback data must be an object')
];

// POST /api/async/generate - Asynchronous diagram generation
router.post('/generate',
  generateRateLimit,
  asyncValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const {
        uml,
        format = 'png',
        diagramType = 'plantuml',
        quality = 'balanced',
        priority = 0,
        webhookUrl,
        callbackData
      } = req.body;

      const requestId = uuidv4();

      logger.info('Async diagram generation requested', {
        requestId,
        ip: req.ip,
        format,
        diagramType,
        priority,
        hasWebhook: !!webhookUrl,
        umlLength: uml.length
      });

      // Prepare job data
      const jobData = {
        uml,
        format,
        diagramType,
        options: { quality },
        requestId,
        webhookUrl,
        callbackData,
        submittedAt: new Date().toISOString(),
        submittedBy: req.ip
      };

      // Queue the job
      const job = await queueManager.queueDiagramGeneration(jobData, {
        priority,
        delay: 0
      });

      // Respond with job information
      res.status(202).json({
        success: true,
        requestId,
        jobId: job.id,
        status: 'queued',
        estimatedProcessingTime: '30-60 seconds',
        statusUrl: `/api/async/status/${job.id}`,
        resultUrl: `/api/async/result/${job.id}`,
        submittedAt: jobData.submittedAt,
        queuePosition: await job.getPosition() + 1
      });

    } catch (error) {
      logger.error('Async generation request failed', {
        error: error.message,
        ip: req.ip,
        stack: error.stack
      });

      next({
        status: 500,
        type: 'ASYNC_QUEUE_ERROR',
        message: 'Failed to queue diagram generation request'
      });
    }
  }
);

// POST /api/async/batch - Asynchronous batch processing
router.post('/batch',
  generateRateLimit,
  batchValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const {
        requests,
        priority = 0,
        webhookUrl,
        callbackData
      } = req.body;

      const batchId = uuidv4();

      logger.info('Async batch processing requested', {
        batchId,
        ip: req.ip,
        batchSize: requests.length,
        priority,
        hasWebhook: !!webhookUrl
      });

      // Prepare batch job data
      const jobData = {
        batchId,
        requests,
        webhookUrl,
        callbackData,
        submittedAt: new Date().toISOString(),
        submittedBy: req.ip
      };

      // Queue the batch job
      const job = await queueManager.queueBatchProcessing(jobData, {
        priority,
        delay: 0
      });

      // Respond with batch information
      res.status(202).json({
        success: true,
        batchId,
        jobId: job.id,
        status: 'queued',
        batchSize: requests.length,
        estimatedProcessingTime: `${Math.ceil(requests.length / 5)} minutes`,
        statusUrl: `/api/async/status/${job.id}`,
        resultUrl: `/api/async/result/${job.id}`,
        submittedAt: jobData.submittedAt,
        queuePosition: await job.getPosition() + 1
      });

    } catch (error) {
      logger.error('Async batch request failed', {
        error: error.message,
        ip: req.ip,
        stack: error.stack
      });

      next({
        status: 500,
        type: 'ASYNC_BATCH_ERROR',
        message: 'Failed to queue batch processing request'
      });
    }
  }
);

// GET /api/async/status/:jobId - Get job status
router.get('/status/:jobId',
  param('jobId').isString().withMessage('Job ID must be a string'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;

      // Try diagram queue first, then batch queue
      let jobStatus = await queueManager.getJobStatus('diagram', jobId);
      let queueType = 'diagram';

      if (!jobStatus) {
        jobStatus = await queueManager.getJobStatus('batch', jobId);
        queueType = 'batch';
      }

      if (!jobStatus) {
        return res.status(404).json({
          error: {
            type: 'JOB_NOT_FOUND',
            message: 'Job not found'
          }
        });
      }

      // Determine job status
      let status = 'queued';
      let progress = 0;
      let result = null;
      let error = null;

      if (jobStatus.processedOn && !jobStatus.finishedOn) {
        status = 'processing';
        progress = jobStatus.progress || 0;
      } else if (jobStatus.finishedOn) {
        if (jobStatus.failedReason) {
          status = 'failed';
          error = jobStatus.failedReason;
        } else {
          status = 'completed';
          progress = 100;
          result = jobStatus.returnvalue;
        }
      }

      const response = {
        jobId,
        queueType,
        status,
        progress,
        submittedAt: new Date(jobStatus.data.submittedAt).toISOString(),
        processedAt: jobStatus.processedOn ? new Date(jobStatus.processedOn).toISOString() : null,
        completedAt: jobStatus.finishedOn ? new Date(jobStatus.finishedOn).toISOString() : null
      };

      if (error) {
        response.error = error;
      }

      if (result) {
        response.resultUrl = `/api/async/result/${jobId}`;
        if (queueType === 'batch') {
          response.summary = result.summary;
        } else {
          response.metadata = result.metadata;
        }
      }

      res.json(response);

    } catch (error) {
      logger.error('Status check failed', {
        jobId: req.params.jobId,
        error: error.message
      });

      next({
        status: 500,
        type: 'STATUS_CHECK_ERROR',
        message: 'Failed to get job status'
      });
    }
  }
);

// GET /api/async/result/:jobId - Get job result
router.get('/result/:jobId',
  param('jobId').isString().withMessage('Job ID must be a string'),
  query('download').optional().isBoolean().withMessage('Download must be boolean'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const { download = false } = req.query;

      // Try diagram queue first, then batch queue
      let jobStatus = await queueManager.getJobStatus('diagram', jobId);
      let queueType = 'diagram';

      if (!jobStatus) {
        jobStatus = await queueManager.getJobStatus('batch', jobId);
        queueType = 'batch';
      }

      if (!jobStatus) {
        return res.status(404).json({
          error: {
            type: 'JOB_NOT_FOUND',
            message: 'Job not found'
          }
        });
      }

      if (!jobStatus.finishedOn || jobStatus.failedReason) {
        return res.status(400).json({
          error: {
            type: 'JOB_NOT_COMPLETED',
            message: 'Job has not completed successfully'
          }
        });
      }

      const result = jobStatus.returnvalue;

      if (queueType === 'diagram') {
        // Return single diagram
        const diagramData = Buffer.from(result.data, 'base64');

        const headers = {
          'Content-Type': result.mimeType,
          'Content-Length': diagramData.length,
          'X-Job-ID': jobId,
          'X-Generated-At': result.metadata.generatedAt,
          'X-Generation-Duration': `${result.duration}ms`
        };

        if (download) {
          const format = result.metadata.format || 'png';
          headers['Content-Disposition'] = `attachment; filename="diagram-${jobId}.${format}"`;
        }

        res.set(headers);
        res.send(diagramData);

      } else {
        // Return batch results
        if (download) {
          // For batch downloads, return a JSON file with all results
          res.set({
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="batch-results-${jobId}.json"`
          });

          // Include base64 data in the download
          res.json(result);
        } else {
          // For API response, exclude base64 data to reduce size
          const responseResult = {
            ...result,
            results: result.results.map(r => ({
              ...r,
              data: r.data ? `<base64-data-${r.data.length}-bytes>` : undefined
            }))
          };

          res.json(responseResult);
        }
      }

    } catch (error) {
      logger.error('Result retrieval failed', {
        jobId: req.params.jobId,
        error: error.message
      });

      next({
        status: 500,
        type: 'RESULT_RETRIEVAL_ERROR',
        message: 'Failed to get job result'
      });
    }
  }
);

// GET /api/async/queue/stats - Get queue statistics
router.get('/queue/stats', async (req, res, next) => {
  try {
    const stats = await queueManager.getQueueStats();

    res.json({
      timestamp: new Date().toISOString(),
      queues: stats
    });

  } catch (error) {
    logger.error('Queue stats failed', { error: error.message });

    next({
      status: 500,
      type: 'QUEUE_STATS_ERROR',
      message: 'Failed to get queue statistics'
    });
  }
});

// DELETE /api/async/job/:jobId - Cancel a job
router.delete('/job/:jobId',
  param('jobId').isString().withMessage('Job ID must be a string'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;

      // Try to cancel from both queues
      let cancelled = false;

      for (const queueType of ['diagram', 'batch']) {
        const jobStatus = await queueManager.getJobStatus(queueType, jobId);
        if (jobStatus && !jobStatus.finishedOn) {
          const queue = queueManager.queues[queueType];
          const job = await queue.getJob(jobId);

          if (job) {
            await job.remove();
            cancelled = true;

            logger.info('Job cancelled', {
              jobId,
              queueType,
              ip: req.ip
            });
            break;
          }
        }
      }

      if (cancelled) {
        res.json({
          success: true,
          message: 'Job cancelled successfully'
        });
      } else {
        res.status(404).json({
          error: {
            type: 'JOB_NOT_FOUND_OR_COMPLETED',
            message: 'Job not found or already completed'
          }
        });
      }

    } catch (error) {
      logger.error('Job cancellation failed', {
        jobId: req.params.jobId,
        error: error.message
      });

      next({
        status: 500,
        type: 'JOB_CANCELLATION_ERROR',
        message: 'Failed to cancel job'
      });
    }
  }
);

module.exports = router;