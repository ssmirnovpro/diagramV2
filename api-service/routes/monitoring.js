const express = require('express');
const { query, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { advancedMonitoring } = require('../utils/advancedMonitoring');
const { databaseManager } = require('../utils/database');
const { cacheManager } = require('../utils/cache');
const { queueManager } = require('../utils/queueManager');
const { webhookManager } = require('../utils/webhookManager');

const router = express.Router();

// Dashboard data endpoint
router.get('/dashboard', async (req, res, next) => {
  try {
    const dashboardData = advancedMonitoring.getDashboardData();
    
    // Add real-time component data
    dashboardData.cache = cacheManager.isConnected ? cacheManager.getCacheStats() : null;
    dashboardData.queue = queueManager.isInitialized ? await queueManager.getQueueStats() : null;
    dashboardData.webhooks = webhookManager.getStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      ...dashboardData
    });

  } catch (error) {
    logger.error('Dashboard data error', { error: error.message });
    next({
      status: 500,
      type: 'DASHBOARD_ERROR',
      message: 'Failed to get dashboard data'
    });
  }
});

// Performance metrics endpoint
router.get('/performance',
  [
    query('period')
      .optional()
      .isIn(['1h', '6h', '24h', '7d', '30d'])
      .withMessage('Period must be one of: 1h, 6h, 24h, 7d, 30d'),
    query('metric')
      .optional()
      .isIn(['response_time', 'throughput', 'error_rate', 'memory', 'cpu'])
      .withMessage('Invalid metric type')
  ],
  async (req, res, next) => {
    try {
      const { period = '24h', metric } = req.query;
      
      const performanceData = await getPerformanceMetrics(period, metric);
      
      res.json({
        period,
        metric,
        timestamp: new Date().toISOString(),
        data: performanceData
      });

    } catch (error) {
      logger.error('Performance metrics error', { error: error.message });
      next({
        status: 500,
        type: 'PERFORMANCE_METRICS_ERROR',
        message: 'Failed to get performance metrics'
      });
    }
  }
);

// Business analytics endpoint
router.get('/analytics',
  [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be valid ISO 8601 date'),
    query('groupBy')
      .optional()
      .isIn(['hour', 'day', 'week'])
      .withMessage('Group by must be hour, day, or week')
  ],
  async (req, res, next) => {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      
      // Default to last 7 days if no dates provided
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      const analytics = await getBusinessAnalytics(start, end, groupBy);
      
      res.json({
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          groupBy
        },
        analytics
      });

    } catch (error) {
      logger.error('Business analytics error', { error: error.message });
      next({
        status: 500,
        type: 'ANALYTICS_ERROR',
        message: 'Failed to get business analytics'
      });
    }
  }
);

// System health detailed endpoint
router.get('/health/detailed', async (req, res, next) => {
  try {
    const healthData = {
      overall: {
        score: 0,
        status: 'unknown',
        timestamp: new Date().toISOString()
      },
      components: {},
      dependencies: {},
      metrics: {},
      alerts: []
    };

    // Get overall system health score
    const dashboardData = advancedMonitoring.getDashboardData();
    healthData.overall.score = dashboardData.systemHealth.score;
    healthData.overall.status = getHealthStatus(dashboardData.systemHealth.score);

    // Component health
    healthData.components = {
      api: {
        status: 'healthy',
        responseTime: dashboardData.performance.averageResponseTime,
        errorRate: dashboardData.performance.errorRate,
        throughput: dashboardData.performance.throughput
      },
      cache: cacheManager.isConnected ? {
        status: 'healthy',
        hitRatio: cacheManager.getCacheStats().hitRatio,
        stats: cacheManager.getCacheStats()
      } : { status: 'disconnected' },
      database: databaseManager.isConnected ? {
        status: 'healthy',
        connections: (await databaseManager.healthCheck()).connections
      } : { status: 'disconnected' },
      queue: queueManager.isInitialized ? {
        status: 'healthy',
        stats: await queueManager.getQueueStats()
      } : { status: 'disabled' }
    };

    // Dependency health from dashboard
    healthData.dependencies = dashboardData.systemHealth.dependencies.reduce((acc, dep) => {
      acc[dep.name] = {
        healthy: dep.healthy,
        lastCheck: dep.lastCheck,
        consecutiveFailures: dep.consecutiveFailures
      };
      return acc;
    }, {});

    // Recent alerts
    healthData.alerts = dashboardData.alerts.recent;

    // Performance metrics
    healthData.metrics = {
      memory: dashboardData.performance.memoryUsage,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    };

    res.json(healthData);

  } catch (error) {
    logger.error('Detailed health check error', { error: error.message });
    next({
      status: 500,
      type: 'HEALTH_CHECK_ERROR',
      message: 'Failed to get detailed health information'
    });
  }
});

// Alerts endpoint
router.get('/alerts',
  [
    query('severity')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid severity level'),
    query('type')
      .optional()
      .isString()
      .withMessage('Alert type must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  (req, res) => {
    try {
      const { severity, type, limit = 50 } = req.query;
      
      const dashboardData = advancedMonitoring.getDashboardData();
      let alerts = dashboardData.alerts.recent;

      // Filter by severity
      if (severity) {
        alerts = alerts.filter(alert => alert.severity === severity);
      }

      // Filter by type
      if (type) {
        alerts = alerts.filter(alert => alert.type === type);
      }

      // Limit results
      alerts = alerts.slice(0, limit);

      res.json({
        alerts,
        count: alerts.length,
        filters: { severity, type, limit },
        thresholds: dashboardData.alerts.thresholds
      });

    } catch (error) {
      logger.error('Alerts endpoint error', { error: error.message });
      res.status(500).json({
        error: 'Failed to get alerts'
      });
    }
  }
);

// Custom metrics endpoint
router.get('/metrics/custom', async (req, res, next) => {
  try {
    const metrics = await advancedMonitoring.getMetrics();
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics);

  } catch (error) {
    logger.error('Custom metrics error', { error: error.message });
    next({
      status: 500,
      type: 'CUSTOM_METRICS_ERROR',
      message: 'Failed to get custom metrics'
    });
  }
});

// Real-time metrics (SSE endpoint)
router.get('/realtime', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const sendMetrics = () => {
    try {
      const dashboardData = advancedMonitoring.getDashboardData();
      const data = {
        timestamp: new Date().toISOString(),
        systemHealth: dashboardData.systemHealth.score,
        responseTime: dashboardData.performance.averageResponseTime,
        throughput: dashboardData.performance.throughput,
        errorRate: dashboardData.performance.errorRate,
        memoryUsage: dashboardData.performance.memoryUsage.heapUsed,
        activeUsers: dashboardData.business.activeUsers,
        diagramsPerMinute: dashboardData.business.diagramsPerMinute
      };

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error('Real-time metrics error', { error: error.message });
    }
  };

  // Send initial data
  sendMetrics();

  // Send updates every 5 seconds
  const interval = setInterval(sendMetrics, 5000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Utility functions
async function getPerformanceMetrics(period, metric) {
  if (!databaseManager.isConnected) {
    return { message: 'Database not connected' };
  }

  try {
    const hours = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168,
      '30d': 720
    }[period] || 24;

    let query;
    if (metric) {
      query = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          AVG(response_time_ms) as avg_response_time,
          COUNT(*) as request_count,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
        FROM api_requests
        WHERE created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour
      `;
    } else {
      query = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          AVG(response_time_ms) as avg_response_time,
          COUNT(*) as request_count,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT ip_address) as unique_users
        FROM api_requests
        WHERE created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour
      `;
    }

    const result = await databaseManager.pool.query(query);
    
    return result.rows.map(row => ({
      timestamp: row.hour,
      averageResponseTime: parseFloat(row.avg_response_time) || 0,
      requestCount: parseInt(row.request_count),
      errorCount: parseInt(row.error_count),
      errorRate: row.request_count > 0 ? (row.error_count / row.request_count) * 100 : 0,
      uniqueUsers: parseInt(row.unique_users) || 0
    }));

  } catch (error) {
    logger.error('Performance metrics query error', { error: error.message });
    return { error: error.message };
  }
}

async function getBusinessAnalytics(startDate, endDate, groupBy) {
  if (!databaseManager.isConnected) {
    return { message: 'Database not connected' };
  }

  try {
    const truncateFunc = {
      hour: 'hour',
      day: 'day',
      week: 'week'
    }[groupBy];

    const diagramsQuery = `
      SELECT 
        DATE_TRUNC('${truncateFunc}', created_at) as period,
        diagram_type,
        format,
        COUNT(*) as count,
        AVG(generation_time_ms) as avg_generation_time,
        SUM(size_bytes) as total_size
      FROM diagrams
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE_TRUNC('${truncateFunc}', created_at), diagram_type, format
      ORDER BY period, diagram_type, format
    `;

    const usageQuery = `
      SELECT 
        DATE_TRUNC('${truncateFunc}', created_at) as period,
        COUNT(*) as total_requests,
        COUNT(DISTINCT ip_address) as unique_users,
        AVG(response_time_ms) as avg_response_time
      FROM api_requests
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE_TRUNC('${truncateFunc}', created_at)
      ORDER BY period
    `;

    const [diagramsResult, usageResult] = await Promise.all([
      databaseManager.pool.query(diagramsQuery, [startDate, endDate]),
      databaseManager.pool.query(usageQuery, [startDate, endDate])
    ]);

    return {
      diagrams: diagramsResult.rows,
      usage: usageResult.rows,
      summary: {
        totalDiagrams: diagramsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
        totalRequests: usageResult.rows.reduce((sum, row) => sum + parseInt(row.total_requests), 0),
        uniqueUsers: Math.max(...usageResult.rows.map(row => parseInt(row.unique_users))),
        averageResponseTime: usageResult.rows.reduce((sum, row) => sum + parseFloat(row.avg_response_time), 0) / usageResult.rows.length
      }
    };

  } catch (error) {
    logger.error('Business analytics query error', { error: error.message });
    return { error: error.message };
  }
}

function getHealthStatus(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 25) return 'poor';
  return 'critical';
}

module.exports = router;