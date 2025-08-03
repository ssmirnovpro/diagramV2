const promClient = require('prom-client');
const { logger } = require('../utils/logger');

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'uml-api-service',
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
});

// Enable collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for UML service
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10, 30]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections_total',
  help: 'Total number of active connections'
});

const diagramGenerationDuration = new promClient.Histogram({
  name: 'uml_diagram_generation_duration_seconds',
  help: 'Duration of UML diagram generation in seconds',
  labelNames: ['diagram_type', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

const diagramGenerationTotal = new promClient.Counter({
  name: 'uml_diagram_generation_total',
  help: 'Total number of diagram generation requests',
  labelNames: ['diagram_type', 'status']
});

const diagramGenerationErrors = new promClient.Counter({
  name: 'uml_diagram_generation_errors_total',
  help: 'Total number of diagram generation errors',
  labelNames: ['error_type', 'diagram_type']
});

const requestQueueSize = new promClient.Gauge({
  name: 'uml_request_queue_size',
  help: 'Current size of the request queue'
});

const memoryUsage = new promClient.Gauge({
  name: 'nodejs_memory_usage_bytes',
  help: 'Node.js memory usage in bytes',
  labelNames: ['type']
});

const authFailures = new promClient.Counter({
  name: 'uml_auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['failure_type']
});

const suspiciousRequests = new promClient.Counter({
  name: 'uml_suspicious_requests_total',
  help: 'Total number of suspicious requests detected',
  labelNames: ['threat_type']
});

const cacheHitRatio = new promClient.Gauge({
  name: 'uml_cache_hit_ratio',
  help: 'Cache hit ratio for diagram generation'
});

const databaseConnectionPool = new promClient.Gauge({
  name: 'uml_db_connection_pool_active',
  help: 'Number of active database connections',
  labelNames: ['pool_name']
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(diagramGenerationDuration);
register.registerMetric(diagramGenerationTotal);
register.registerMetric(diagramGenerationErrors);
register.registerMetric(requestQueueSize);
register.registerMetric(memoryUsage);
register.registerMetric(authFailures);
register.registerMetric(suspiciousRequests);
register.registerMetric(cacheHitRatio);
register.registerMetric(databaseConnectionPool);

// Middleware to collect HTTP metrics
const collectHttpMetrics = (req, res, next) => {
  const start = Date.now();
  
  // Track active connections
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const status = res.statusCode.toString();
    
    // Record metrics
    httpRequestDuration
      .labels(method, route, status)
      .observe(duration);
    
    httpRequestsTotal
      .labels(method, route, status)
      .inc();
    
    // Decrease active connections
    activeConnections.dec();
    
    // Log slow requests
    if (duration > 1) {
      logger.warn('Slow request detected', {
        method,
        route,
        duration,
        status,
        ip: req.ip
      });
    }
    
    // Track authentication failures
    if (status === '401' || status === '403') {
      authFailures.labels('unauthorized').inc();
    }
    
    // Track suspicious activity
    if (status === '429') {
      suspiciousRequests.labels('rate_limit_exceeded').inc();
    }
  });
  
  next();
};

// Diagram generation metrics
const recordDiagramGeneration = (diagramType, status, duration, errorType = null) => {
  diagramGenerationDuration
    .labels(diagramType, status)
    .observe(duration);
  
  diagramGenerationTotal
    .labels(diagramType, status)
    .inc();
  
  if (errorType) {
    diagramGenerationErrors
      .labels(errorType, diagramType)
      .inc();
  }
};

// Memory monitoring
const updateMemoryMetrics = () => {
  const usage = process.memoryUsage();
  memoryUsage.labels('rss').set(usage.rss);
  memoryUsage.labels('heapTotal').set(usage.heapTotal);
  memoryUsage.labels('heapUsed').set(usage.heapUsed);
  memoryUsage.labels('external').set(usage.external);
  memoryUsage.labels('arrayBuffers').set(usage.arrayBuffers);
};

// Update memory metrics every 10 seconds
setInterval(updateMemoryMetrics, 10000);

// Queue monitoring
const updateQueueSize = (size) => {
  requestQueueSize.set(size);
};

// Cache monitoring
const updateCacheHitRatio = (hits, total) => {
  if (total > 0) {
    cacheHitRatio.set(hits / total);
  }
};

// Database connection pool monitoring
const updateDbConnectionPool = (poolName, activeConnections) => {
  databaseConnectionPool.labels(poolName).set(activeConnections);
};

// Custom business metrics
const businessMetrics = {
  // Track successful diagram generations by type
  trackSuccessfulGeneration: (diagramType) => {
    diagramGenerationTotal.labels(diagramType, 'success').inc();
  },
  
  // Track failed diagram generations
  trackFailedGeneration: (diagramType, errorType) => {
    diagramGenerationTotal.labels(diagramType, 'error').inc();
    diagramGenerationErrors.labels(errorType, diagramType).inc();
  },
  
  // Track cache performance
  trackCacheHit: () => {
    // Implementation depends on your caching strategy
  },
  
  // Track security events
  trackSecurityEvent: (eventType) => {
    suspiciousRequests.labels(eventType).inc();
    logger.warn('Security event detected', { eventType });
  }
};

// Health check metrics endpoint
const getMetrics = async () => {
  return register.metrics();
};

// Metrics summary for health checks
const getMetricsSummary = () => {
  return {
    activeConnections: activeConnections.get(),
    totalRequests: httpRequestsTotal.get(),
    queueSize: requestQueueSize.get(),
    memoryUsage: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed
    },
    uptime: process.uptime()
  };
};

// Graceful shutdown cleanup
const cleanup = () => {
  logger.info('Cleaning up metrics...');
  register.clear();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = {
  register,
  collectHttpMetrics,
  recordDiagramGeneration,
  updateQueueSize,
  updateCacheHitRatio,
  updateDbConnectionPool,
  businessMetrics,
  getMetrics,
  getMetricsSummary,
  cleanup
};