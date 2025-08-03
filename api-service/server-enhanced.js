const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./docs/openapi');
const { logger, requestLogger, errorLogger } = require('./utils/logger');

// Enhanced utilities
const { cacheManager } = require('./utils/cache');
const { queueManager } = require('./utils/queueManager');
const { databaseManager } = require('./utils/database');
const { httpOptimizer } = require('./utils/httpOptimizations');
const { webhookManager } = require('./utils/webhookManager');
const { advancedMonitoring } = require('./utils/advancedMonitoring');

// Security middleware
const {
  globalRateLimit,
  generateRateLimit,
  speedLimiter,
  corsOptions,
  helmetConfig,
  sanitizeRequest,
  securityLogger
} = require('./middleware/security');

// Metrics utilities
const { collectHttpMetrics, getMetrics, getMetricsSummary, updateDbConnectionPool } = require('./middleware/metrics');

const app = express();
const PORT = process.env.PORT || 9001;
const KROKI_URL = process.env.KROKI_URL || 'http://kroki-service:8001';

// Initialize enhanced components
async function initializeServices() {
  try {
    logger.info('Initializing enhanced UML service...');

    // Initialize HTTP optimizations first
    httpOptimizer.initialize();
    
    // Configure Express with optimizations
    httpOptimizer.configureExpressServer(app);

    // Initialize caching
    if (process.env.REDIS_URL || process.env.ENABLE_CACHE !== 'false') {
      await cacheManager.initialize();
      logger.info('Cache manager initialized');
    }

    // Initialize database
    if (process.env.DB_HOST || process.env.ENABLE_DATABASE !== 'false') {
      await databaseManager.initialize();
      logger.info('Database manager initialized');
      
      // Update database connection metrics
      setInterval(async () => {
        const health = await databaseManager.healthCheck();
        if (health.connections) {
          updateDbConnectionPool('main', health.connections.total);
        }
      }, 30000);
    }

    // Initialize queue manager
    if (process.env.REDIS_URL || process.env.ENABLE_QUEUE !== 'false') {
      await queueManager.initialize();
      logger.info('Queue manager initialized');
    }

    // Initialize advanced monitoring
    advancedMonitoring.initialize();
    logger.info('Advanced monitoring initialized');

    logger.info('All enhanced services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error: error.message });
    throw error;
  }
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware stack
app.use(require('helmet')(helmetConfig));
app.use(require('cors')(corsOptions));
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

// API Documentation with Swagger UI
app.use('/docs', swaggerUi.serve);
app.get('/docs', swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
    tryItOutEnabled: true,
    persistAuthorization: true
  },
  customfavIcon: '/favicon.ico',
  customSiteTitle: 'UML Images Service API Documentation',
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .info .description { max-width: none; }
  `
}));

// Alternative documentation formats
app.get('/docs/openapi.json', (req, res) => {
  res.json(swaggerSpecs);
});

app.get('/docs/openapi.yaml', (req, res) => {
  const yaml = require('js-yaml');
  res.type('text/yaml');
  res.send(yaml.dump(swaggerSpecs));
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      service: 'uml-api-service-enhanced',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      metrics: getMetricsSummary()
    };

    // Check critical dependencies
    const dependencies = {};
    
    // Cache health
    if (cacheManager.isConnected) {
      dependencies.cache = { status: 'connected', stats: cacheManager.getCacheStats() };
    } else {
      dependencies.cache = { status: 'disconnected' };
      health.status = 'degraded';
    }

    // Database health
    if (databaseManager.isConnected) {
      const dbHealth = await databaseManager.healthCheck();
      dependencies.database = { status: dbHealth.healthy ? 'connected' : 'disconnected', ...dbHealth };
      if (!dbHealth.healthy) health.status = 'degraded';
    }

    // Queue health
    if (queueManager.isInitialized) {
      const queueStats = await queueManager.getQueueStats();
      dependencies.queues = { status: 'operational', ...queueStats };
    }

    // HTTP optimization stats
    dependencies.http = httpOptimizer.getConnectionStats();

    health.dependencies = dependencies;
    
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      service: 'uml-api-service-enhanced',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
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
  try {
    const metrics = getMetricsSummary();
    
    // Check Kroki service health
    let krokiStatus = 'unknown';
    try {
      const axios = require('axios');
      const response = await axios.get(`${KROKI_URL}/health`, { 
        timeout: 3000,
        httpAgent: httpOptimizer.getHttpAgent(),
        httpsAgent: httpOptimizer.getHttpsAgent()
      });
      krokiStatus = response.status === 200 ? 'healthy' : 'unhealthy';
    } catch (error) {
      krokiStatus = 'unhealthy';
    }

    const status = {
      service: 'uml-api-service-enhanced',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      metrics: {
        activeConnections: metrics.activeConnections,
        totalRequests: metrics.totalRequests,
        queueSize: metrics.queueSize,
        httpConnections: httpOptimizer.getConnectionStats()
      },
      dependencies: {
        kroki: {
          url: KROKI_URL,
          status: krokiStatus
        }
      },
      features: {
        caching: cacheManager.isConnected,
        database: databaseManager.isConnected,
        queueProcessing: queueManager.isInitialized,
        httpOptimizations: true,
        advancedValidation: true,
        multipleFormats: true,
        batchProcessing: queueManager.isInitialized
      }
    };

    // Add cache statistics if available
    if (cacheManager.isConnected) {
      status.dependencies.cache = {
        status: 'connected',
        stats: cacheManager.getCacheStats()
      };
    }

    // Add database statistics if available
    if (databaseManager.isConnected) {
      const dbHealth = await databaseManager.healthCheck();
      status.dependencies.database = {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        connections: dbHealth.connections
      };
    }

    // Add queue statistics if available
    if (queueManager.isInitialized) {
      const queueStats = await queueManager.getQueueStats();
      status.dependencies.queues = {
        status: 'operational',
        summary: queueStats.summary
      };
    }

    res.json(status);
  } catch (error) {
    logger.error('Status endpoint error', { error: error.message });
    res.status(500).json({
      error: {
        type: 'STATUS_ERROR',
        message: 'Failed to get service status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// API Routes
app.use('/api/v1', require('./routes/generate')); // Legacy API
app.use('/api/v2', require('./routes/generateV2')); // Enhanced API
app.use('/api/async', require('./routes/async')); // Async processing
app.use('/api', require('./routes/validation')); // Validation
app.use('/api/webhooks', require('./routes/webhooks')); // Webhooks
app.use('/api/monitoring', require('./routes/monitoring')); // Monitoring

// Load documentation routes
require('./routes/docs');

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({
    service: 'UML Images Service Enhanced',
    version: '2.0.0',
    description: 'High-performance UML diagram generation service with advanced features',
    features: [
      'Multiple output formats (PNG, SVG, PDF, JPEG, WebP)',
      'Asynchronous processing with job queues',
      'Redis caching for optimal performance',
      'Advanced security validation',
      'Batch processing capabilities',
      'Comprehensive monitoring and analytics',
      'PostgreSQL persistence and user management',
      'HTTP/2 and connection optimization'
    ],
    endpoints: {
      documentation: '/docs',
      health: '/health',
      metrics: '/metrics',
      status: '/api/v1/status',
      legacy_api: '/api/v1/generate',
      enhanced_api: '/api/v2/generate',
      batch_api: '/api/v2/generate/batch',
      async_api: '/api/async/generate',
      validation: '/api/validate',
      webhooks: '/api/webhooks',
      monitoring: '/api/monitoring/dashboard'
    },
    links: {
      documentation: `${req.protocol}://${req.get('Host')}/docs`,
      openapi_spec: `${req.protocol}://${req.get('Host')}/docs/openapi.json`
    }
  });
});

// Error handling middleware with security logging
app.use(errorLogger);
app.use((err, req, res, next) => {
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
      timestamp: new Date().toISOString(),
      requestId: req.id || 'unknown'
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
      timestamp: new Date().toISOString(),
      availableEndpoints: [
        'GET /',
        'GET /docs',
        'GET /health',
        'POST /api/v1/generate',
        'POST /api/v2/generate',
        'POST /api/async/generate',
        'POST /api/validate'
      ]
    }
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Cleanup services
    await Promise.all([
      queueManager.shutdown(),
      databaseManager.shutdown(),
      cacheManager.disconnect()
    ]);
    
    httpOptimizer.cleanup();
    advancedMonitoring.cleanup();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with initialization
const startServer = async () => {
  try {
    // Initialize all services
    await initializeServices();
    
    // Create and configure HTTP server
    const server = require('http').createServer(app);
    httpOptimizer.configureHttpServer(server);
    
    // Start listening
    server.listen(PORT, '0.0.0.0', () => {
      logger.info('Enhanced UML API Service started', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        version: '2.0.0',
        features: {
          caching: cacheManager.isConnected,
          database: databaseManager.isConnected,
          queueProcessing: queueManager.isInitialized,
          httpOptimizations: true,
          documentation: true
        },
        endpoints: {
          docs: `http://localhost:${PORT}/docs`,
          health: `http://localhost:${PORT}/health`,
          api: `http://localhost:${PORT}/api/v2/generate`
        }
      });
    });

    // Make server available for graceful shutdown
    global.server = server;

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;