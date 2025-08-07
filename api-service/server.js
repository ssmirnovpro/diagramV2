const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// const axios = require('axios'); // Unused import
const fs = require('fs');
const path = require('path');

// Security middleware
const {
  globalRateLimit,
  // generateRateLimit, // Unused import
  speedLimiter,
  corsOptions,
  helmetConfig,
  sanitizeRequest,
  securityLogger
} = require('./middleware/security');

// Logging utilities
const { logger, requestLogger, errorLogger } = require('./utils/logger');

// Metrics utilities
const { collectHttpMetrics, getMetrics, getMetricsSummary } = require('./middleware/metrics');

const app = express();
const PORT = process.env.PORT || 9001;
const KROKI_URL = process.env.KROKI_URL || 'http://kroki-service:8001';

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware stack
app.use(helmet(helmetConfig));
app.use(cors(corsOptions));
app.use(globalRateLimit);
app.use(speedLimiter);
app.use(sanitizeRequest);
app.use(securityLogger);

// Metrics collection middleware
app.use(collectHttpMetrics);

// Body parsing with security limits
const maxRequestSize = process.env.MAX_REQUEST_SIZE || '1mb';
app.use(express.json({
  limit: maxRequestSize,
  strict: true
}));
app.use(express.urlencoded({
  extended: false,
  limit: maxRequestSize
}));

// Request logging
app.use(requestLogger);

// Health check endpoint (limited information disclosure)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api-service',
    timestamp: new Date().toISOString(),
    metrics: getMetricsSummary()
    // Removed sensitive information like ports and URLs
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain');
    const metrics = await getMetrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error serving metrics', { error: error.message });
    res.status(500).send('Error serving metrics');
  }
});

// Detailed status endpoint
app.get('/api/v1/status', async (req, res) => {
  const metrics = getMetricsSummary();
  
  // Check Kroki health
  let krokiStatus = 'unknown';
  try {
    const axios = require('axios');
    const krokiHealthResponse = await axios.get(`${KROKI_URL}/health`, { timeout: 2000 });
    if (krokiHealthResponse.status === 200 && krokiHealthResponse.data?.status === 'pass') {
      krokiStatus = 'healthy';
    } else {
      krokiStatus = 'unhealthy';
    }
  } catch (error) {
    krokiStatus = 'unhealthy';
    logger.warn('Kroki health check failed', { error: error.message });
  }
  
  res.json({
    service: 'uml-api-service',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'operational',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    metrics: {
      activeConnections: metrics.activeConnections,
      totalRequests: metrics.totalRequests,
      queueSize: metrics.queueSize
    },
    dependencies: {
      kroki: {
        url: KROKI_URL,
        status: krokiStatus
      }
    },
    kroki_service: krokiStatus // Add field that UI expects
  });
});

// API v1 routes
app.use('/api/v1', require('./routes/generate'));

// Error handling middleware with security logging
app.use(errorLogger);
app.use((err, req, res, _next) => {
  // Security: Don't expose sensitive error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log security-relevant errors
  if (err.message && err.message.includes('CORS')) {
    logger.warn('CORS violation attempt', {
      ip: req.ip,
      origin: req.get('Origin'),
      userAgent: req.get('User-Agent')
    });
  }

  const errorResponse = {
    error: {
      message: isDevelopment ? err.message : 'An error occurred',
      type: err.type || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  };

  // Only include stack trace in development
  if (isDevelopment && err.stack) {
    errorResponse.error.stack = err.stack;
  }

  res.status(err.status || 500).json(errorResponse);
});

// 404 handler with security logging
app.use('*', (req, res) => {
  logger.info('404_NOT_FOUND', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      type: 'NOT_FOUND',
      timestamp: new Date().toISOString()
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('API Service started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    securityFeatures: [
      'Rate limiting',
      'Input validation',
      'CORS protection',
      'Security headers',
      'Request sanitization'
    ]
  });
});

module.exports = app;