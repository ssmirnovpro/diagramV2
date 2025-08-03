const promClient = require('prom-client');

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'uml-ui-service',
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development'
});

// Enable collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for UI service
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
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

const staticAssetRequests = new promClient.Counter({
  name: 'uml_static_asset_requests_total',
  help: 'Total number of static asset requests',
  labelNames: ['asset_type', 'status']
});

const pageViews = new promClient.Counter({
  name: 'uml_page_views_total',
  help: 'Total number of page views',
  labelNames: ['page', 'user_agent_family']
});

const clientErrors = new promClient.Counter({
  name: 'uml_client_errors_total',
  help: 'Total number of client-side errors',
  labelNames: ['error_type', 'page']
});

const userSessions = new promClient.Gauge({
  name: 'uml_active_user_sessions',
  help: 'Number of active user sessions'
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(staticAssetRequests);
register.registerMetric(pageViews);
register.registerMetric(clientErrors);
register.registerMetric(userSessions);

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
    
    // Track static asset requests
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
      const assetType = req.path.split('.').pop();
      staticAssetRequests.labels(assetType, status).inc();
    }
    
    // Track page views
    if (req.path === '/' || req.path.endsWith('.html')) {
      const userAgent = req.get('User-Agent') || 'unknown';
      const userAgentFamily = getUserAgentFamily(userAgent);
      pageViews.labels(req.path, userAgentFamily).inc();
    }
    
    // Decrease active connections
    activeConnections.dec();
  });
  
  next();
};

// Helper function to extract user agent family
const getUserAgentFamily = (userAgent) => {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Other';
};

// Client error tracking
const trackClientError = (errorType, page) => {
  clientErrors.labels(errorType, page).inc();
};

// Session tracking
const updateActiveUserSessions = (count) => {
  userSessions.set(count);
};

// Get metrics endpoint
const getMetrics = async () => {
  return register.metrics();
};

// Metrics summary for health checks
const getMetricsSummary = () => {
  return {
    activeConnections: activeConnections.get(),
    totalRequests: httpRequestsTotal.get(),
    activeSessions: userSessions.get(),
    memoryUsage: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed
    },
    uptime: process.uptime()
  };
};

// Graceful shutdown cleanup
const cleanup = () => {
  register.clear();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = {
  register,
  collectHttpMetrics,
  trackClientError,
  updateActiveUserSessions,
  getMetrics,
  getMetricsSummary,
  cleanup
};