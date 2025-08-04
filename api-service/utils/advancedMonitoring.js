const promClient = require('prom-client');
const { logger } = require('./logger');
const { databaseManager } = require('./database');
const { webhookManager } = require('./webhookManager');

class AdvancedMonitoring {
  constructor() {
    this.register = new promClient.Registry();
    this.isInitialized = false;
    this.alertThresholds = this.initializeAlertThresholds();
    this.customMetrics = this.initializeCustomMetrics();
    this.performanceBaseline = this.initializePerformanceBaseline();
    this.healthChecks = new Map();
    this.alertHistory = [];
  }

  initializeAlertThresholds() {
    return {
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD || '5'), // 5%
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD || '5000'), // 5 seconds
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE_THRESHOLD || '85'), // 85%
      cpuUsage: parseFloat(process.env.ALERT_CPU_USAGE_THRESHOLD || '80'), // 80%
      queueDepth: parseInt(process.env.ALERT_QUEUE_DEPTH_THRESHOLD || '100'), // 100 jobs
      cacheHitRate: parseFloat(process.env.ALERT_CACHE_HIT_RATE_THRESHOLD || '70'), // 70%
      diskUsage: parseFloat(process.env.ALERT_DISK_USAGE_THRESHOLD || '90'), // 90%
      connectionPoolUsage: parseFloat(process.env.ALERT_CONNECTION_POOL_THRESHOLD || '90'), // 90%
      webhookFailureRate: parseFloat(process.env.ALERT_WEBHOOK_FAILURE_RATE || '20') // 20%
    };
  }

  initializeCustomMetrics() {
    const metrics = {
      // Business metrics
      diagramGenerationRate: new promClient.Gauge({
        name: 'uml_diagram_generation_rate_per_minute',
        help: 'Number of diagrams generated per minute',
        registers: [this.register]
      }),

      userActiveCount: new promClient.Gauge({
        name: 'uml_active_users_count',
        help: 'Number of active users in the last hour',
        registers: [this.register]
      }),

      popularDiagramTypes: new promClient.Gauge({
        name: 'uml_popular_diagram_types',
        help: 'Most popular diagram types',
        labelNames: ['diagram_type'],
        registers: [this.register]
      }),

      // Performance metrics
      responseTimePercentiles: new promClient.Histogram({
        name: 'uml_response_time_percentiles',
        help: 'Response time percentiles',
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
        labelNames: ['endpoint', 'method'],
        registers: [this.register]
      }),

      throughput: new promClient.Gauge({
        name: 'uml_requests_per_second',
        help: 'Requests per second',
        registers: [this.register]
      }),

      // System health metrics
      systemHealth: new promClient.Gauge({
        name: 'uml_system_health_score',
        help: 'Overall system health score (0-100)',
        registers: [this.register]
      }),

      dependencyHealth: new promClient.Gauge({
        name: 'uml_dependency_health',
        help: 'Health status of dependencies',
        labelNames: ['dependency'],
        registers: [this.register]
      }),

      alertsSent: new promClient.Counter({
        name: 'uml_alerts_sent_total',
        help: 'Total number of alerts sent',
        labelNames: ['alert_type', 'severity'],
        registers: [this.register]
      }),

      // Advanced performance metrics
      memoryLeakDetection: new promClient.Gauge({
        name: 'uml_memory_leak_indicator',
        help: 'Memory leak detection indicator',
        registers: [this.register]
      }),

      gcPerformance: new promClient.Histogram({
        name: 'uml_gc_duration_seconds',
        help: 'Garbage collection duration',
        buckets: [0.001, 0.01, 0.1, 1],
        registers: [this.register]
      }),

      eventLoopLag: new promClient.Histogram({
        name: 'uml_event_loop_lag_seconds',
        help: 'Event loop lag',
        buckets: [0.001, 0.01, 0.1, 1],
        registers: [this.register]
      }),

      // Security metrics
      securityEvents: new promClient.Counter({
        name: 'uml_security_events_total',
        help: 'Total security events detected',
        labelNames: ['event_type', 'severity'],
        registers: [this.register]
      }),

      rateLimitHits: new promClient.Counter({
        name: 'uml_rate_limit_hits_total',
        help: 'Total rate limit hits',
        labelNames: ['ip_type'],
        registers: [this.register]
      }),

      // Cache efficiency metrics
      cacheEfficiency: new promClient.Gauge({
        name: 'uml_cache_efficiency_score',
        help: 'Cache efficiency score based on hit ratio and performance',
        registers: [this.register]
      }),

      cacheEvictions: new promClient.Counter({
        name: 'uml_cache_evictions_total',
        help: 'Total cache evictions',
        labelNames: ['reason'],
        registers: [this.register]
      }),

      // Queue performance metrics
      queueProcessingTime: new promClient.Histogram({
        name: 'uml_queue_processing_time_seconds',
        help: 'Queue job processing time',
        buckets: [1, 5, 10, 30, 60, 300],
        labelNames: ['queue_type'],
        registers: [this.register]
      }),

      queueThroughput: new promClient.Gauge({
        name: 'uml_queue_throughput_jobs_per_minute',
        help: 'Queue processing throughput',
        labelNames: ['queue_type'],
        registers: [this.register]
      })
    };

    // Register all metrics
    Object.values(metrics).forEach(metric => {
      if (!this.register.getSingleMetric(metric.name)) {
        this.register.registerMetric(metric);
      }
    });

    return metrics;
  }

  initializePerformanceBaseline() {
    return {
      averageResponseTime: 500, // ms
      averageThroughput: 10, // requests/second
      averageMemoryUsage: 50, // MB
      averageCpuUsage: 30, // %
      averageCacheHitRate: 80, // %
      baselineTimestamp: Date.now()
    };
  }

  initialize() {
    if (this.isInitialized) {
      return;
    }

    // Start monitoring intervals
    this.startMetricsCollection();
    this.startHealthChecks();
    this.startPerformanceAnalysis();
    this.startAlertMonitoring();

    this.isInitialized = true;
    logger.info('Advanced monitoring initialized', {
      alertThresholds: this.alertThresholds,
      metricsCount: Object.keys(this.customMetrics).length
    });
  }

  startMetricsCollection() {
    // Collect business metrics every minute
    setInterval(() => {
      this.collectBusinessMetrics();
    }, 60000);

    // Collect performance metrics every 10 seconds
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 10000);

    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
  }

  async collectBusinessMetrics() {
    try {
      if (!databaseManager.isConnected) {
        return;
      }

      // Get diagram generation rate
      const generationRate = await this.getDiagramGenerationRate();
      this.customMetrics.diagramGenerationRate.set(generationRate);

      // Get active users count
      const activeUsers = await this.getActiveUsersCount();
      this.customMetrics.userActiveCount.set(activeUsers);

      // Get popular diagram types
      const popularTypes = await this.getPopularDiagramTypes();
      for (const [type, count] of Object.entries(popularTypes)) {
        this.customMetrics.popularDiagramTypes.labels(type).set(count);
      }

      logger.debug('Business metrics collected', {
        generationRate,
        activeUsers,
        popularTypes
      });

    } catch (error) {
      logger.error('Failed to collect business metrics', { error: error.message });
    }
  }

  collectPerformanceMetrics() {
    try {
      // Measure event loop lag
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e9;
        this.customMetrics.eventLoopLag.observe(lag);
      });

      // Memory usage analysis
      const memUsage = process.memoryUsage();
      const memoryLeakIndicator = this.detectMemoryLeak(memUsage);
      this.customMetrics.memoryLeakDetection.set(memoryLeakIndicator);

      // Calculate throughput (requests per second)
      const currentTime = Date.now();
      const currentRequests = this.getCurrentRequestCount();
      if (this.lastThroughputMeasurement) {
        const timeDiff = (currentTime - this.lastThroughputMeasurement.time) / 1000;
        const requestDiff = currentRequests - this.lastThroughputMeasurement.requests;
        const throughput = requestDiff / timeDiff;
        this.customMetrics.throughput.set(throughput);
      }
      this.lastThroughputMeasurement = { time: currentTime, requests: currentRequests };

    } catch (error) {
      logger.error('Failed to collect performance metrics', { error: error.message });
    }
  }

  collectSystemMetrics() {
    try {
      // Calculate overall system health score
      const healthScore = this.calculateSystemHealthScore();
      this.customMetrics.systemHealth.set(healthScore);

      // Update dependency health metrics
      this.updateDependencyHealth();

      // Cache efficiency score
      const cacheScore = this.calculateCacheEfficiencyScore();
      this.customMetrics.cacheEfficiency.set(cacheScore);

    } catch (error) {
      logger.error('Failed to collect system metrics', { error: error.message });
    }
  }

  startHealthChecks() {
    // Register health checks for all components
    this.registerHealthCheck('database', () => databaseManager.healthCheck());
    this.registerHealthCheck('cache', () => this.checkCacheHealth());
    this.registerHealthCheck('queue', () => this.checkQueueHealth());
    this.registerHealthCheck('webhooks', () => this.checkWebhookHealth());
    this.registerHealthCheck('external_services', () => this.checkExternalServices());

    // Run health checks every 2 minutes
    setInterval(() => {
      this.runAllHealthChecks();
    }, 120000);
  }

  registerHealthCheck(name, checkFunction) {
    this.healthChecks.set(name, {
      name,
      check: checkFunction,
      lastResult: null,
      lastCheck: null,
      consecutiveFailures: 0
    });
  }

  async runAllHealthChecks() {
    for (const [name, healthCheck] of this.healthChecks) {
      try {
        const result = await healthCheck.check();
        const isHealthy = result.healthy !== false;

        healthCheck.lastResult = result;
        healthCheck.lastCheck = new Date();

        if (isHealthy) {
          healthCheck.consecutiveFailures = 0;
          this.customMetrics.dependencyHealth.labels(name).set(1);
        } else {
          healthCheck.consecutiveFailures++;
          this.customMetrics.dependencyHealth.labels(name).set(0);

          // Send alert after 3 consecutive failures
          if (healthCheck.consecutiveFailures >= 3) {
            await this.sendHealthAlert(name, result);
          }
        }

      } catch (error) {
        logger.error(`Health check failed for ${name}`, { error: error.message });
        this.customMetrics.dependencyHealth.labels(name).set(0);

        healthCheck.consecutiveFailures++;
        if (healthCheck.consecutiveFailures >= 3) {
          await this.sendHealthAlert(name, { error: error.message, healthy: false });
        }
      }
    }
  }

  startPerformanceAnalysis() {
    // Performance analysis every 5 minutes
    setInterval(() => {
      this.analyzePerformanceTrends();
    }, 300000);

    // Memory leak detection every hour
    setInterval(() => {
      this.analyzeMemoryTrends();
    }, 3600000);
  }

  startAlertMonitoring() {
    // Alert condition checking every minute
    setInterval(() => {
      this.checkAlertConditions();
    }, 60000);
  }

  async checkAlertConditions() {
    try {
      const conditions = [
        { name: 'high_error_rate', check: () => this.checkErrorRate() },
        { name: 'high_response_time', check: () => this.checkResponseTime() },
        { name: 'high_memory_usage', check: () => this.checkMemoryUsage() },
        { name: 'high_queue_depth', check: () => this.checkQueueDepth() },
        { name: 'low_cache_hit_rate', check: () => this.checkCacheHitRate() },
        { name: 'high_webhook_failure_rate', check: () => this.checkWebhookFailureRate() }
      ];

      for (const condition of conditions) {
        const alert = await condition.check();
        if (alert) {
          await this.sendAlert(alert);
        }
      }

    } catch (error) {
      logger.error('Alert condition check failed', { error: error.message });
    }
  }

  async sendAlert(alertData) {
    try {
      // Prevent duplicate alerts within 15 minutes
      const recentAlert = this.alertHistory.find(a =>
        a.type === alertData.type &&
        Date.now() - a.timestamp < 15 * 60 * 1000
      );

      if (recentAlert) {
        logger.debug('Suppressing duplicate alert', { type: alertData.type });
        return;
      }

      // Record alert
      this.alertHistory.push({
        ...alertData,
        timestamp: Date.now()
      });

      // Keep only last 100 alerts
      if (this.alertHistory.length > 100) {
        this.alertHistory = this.alertHistory.slice(-100);
      }

      // Update metrics
      this.customMetrics.alertsSent.labels(alertData.type, alertData.severity).inc();

      // Send webhook alert
      await webhookManager.sendSystemAlert(alertData);

      logger.warn('Alert sent', alertData);

    } catch (error) {
      logger.error('Failed to send alert', { error: error.message, alertData });
    }
  }

  // Utility methods for metrics collection
  async getDiagramGenerationRate() {
    if (!databaseManager.isConnected) {
      return 0;
    }

    try {
      const query = `
        SELECT COUNT(*) as count
        FROM diagrams
        WHERE created_at >= NOW() - INTERVAL '1 minute'
      `;

      const result = await databaseManager.pool.query(query);
      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      return 0;
    }
  }

  async getActiveUsersCount() {
    if (!databaseManager.isConnected) {
      return 0;
    }

    try {
      const query = `
        SELECT COUNT(DISTINCT ip_address) as count
        FROM api_requests
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const result = await databaseManager.pool.query(query);
      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      return 0;
    }
  }

  async getPopularDiagramTypes() {
    if (!databaseManager.isConnected) {
      return {};
    }

    try {
      const query = `
        SELECT diagram_type, COUNT(*) as count
        FROM diagrams
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY diagram_type
        ORDER BY count DESC
        LIMIT 10
      `;

      const result = await databaseManager.pool.query(query);
      return result.rows.reduce((acc, row) => {
        acc[row.diagram_type] = parseInt(row.count);
        return acc;
      }, {});
    } catch (error) {
      return {};
    }
  }

  getCurrentRequestCount() {
    // This would integrate with your existing metrics
    const httpRequestsMetric = this.register.getSingleMetric('http_requests_total');
    if (httpRequestsMetric) {
      const metrics = httpRequestsMetric.get();
      return metrics.values.reduce((sum, metric) => sum + metric.value, 0);
    }
    return 0;
  }

  detectMemoryLeak(memUsage) {
    // Simple memory leak detection based on heap growth
    if (!this.memoryHistory) {
      this.memoryHistory = [];
    }

    this.memoryHistory.push({
      heapUsed: memUsage.heapUsed,
      timestamp: Date.now()
    });

    // Keep only last hour of data
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.memoryHistory = this.memoryHistory.filter(m => m.timestamp > oneHourAgo);

    if (this.memoryHistory.length < 10) {
      return 0;
    }

    // Calculate trend
    const first = this.memoryHistory[0];
    const last = this.memoryHistory[this.memoryHistory.length - 1];
    const growthRate = (last.heapUsed - first.heapUsed) / first.heapUsed;

    // Return risk score (0-1)
    return Math.min(Math.max(growthRate * 10, 0), 1);
  }

  calculateSystemHealthScore() {
    let score = 100;
    const memUsage = process.memoryUsage();

    // Memory health (0-20 points)
    const memoryPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memoryPercent > 80) {
      score -= 20;
    } else if (memoryPercent > 60) {
      score -= 10;
    } else if (memoryPercent > 40) {
      score -= 5;
    }

    // Error rate health (0-30 points)
    const errorRate = this.getRecentErrorRate();
    if (errorRate > 10) {
      score -= 30;
    } else if (errorRate > 5) {
      score -= 20;
    } else if (errorRate > 2) {
      score -= 10;
    }

    // Response time health (0-20 points)
    const avgResponseTime = this.getAverageResponseTime();
    if (avgResponseTime > 5000) {
      score -= 20;
    } else if (avgResponseTime > 2000) {
      score -= 10;
    } else if (avgResponseTime > 1000) {
      score -= 5;
    }

    // Dependency health (0-20 points)
    const unhealthyDeps = Array.from(this.healthChecks.values())
      .filter(hc => hc.lastResult && !hc.lastResult.healthy).length;
    score -= unhealthyDeps * 5;

    // Queue health (0-10 points)
    const queueDepth = this.getCurrentQueueDepth();
    if (queueDepth > 100) {
      score -= 10;
    } else if (queueDepth > 50) {
      score -= 5;
    }

    return Math.max(score, 0);
  }

  calculateCacheEfficiencyScore() {
    // This would integrate with your cache manager
    const cacheStats = global.cacheManager?.getCacheStats();
    if (!cacheStats) {
      return 0;
    }

    const hitRatio = cacheStats.hitRatio || 0;
    const responseTimeImprovement = this.calculateCacheResponseTimeImprovement();

    // Combine hit ratio and performance improvement
    return (hitRatio * 0.7) + (responseTimeImprovement * 0.3);
  }

  // Alert condition methods
  checkErrorRate() {
    const errorRate = this.getRecentErrorRate();
    if (errorRate > this.alertThresholds.errorRate) {
      return {
        type: 'high_error_rate',
        severity: errorRate > this.alertThresholds.errorRate * 2 ? 'critical' : 'high',
        message: `Error rate is ${errorRate.toFixed(2)}%, threshold is ${this.alertThresholds.errorRate}%`,
        metadata: { errorRate, threshold: this.alertThresholds.errorRate }
      };
    }
    return null;
  }

  checkResponseTime() {
    const avgResponseTime = this.getAverageResponseTime();
    if (avgResponseTime > this.alertThresholds.responseTime) {
      return {
        type: 'high_response_time',
        severity: avgResponseTime > this.alertThresholds.responseTime * 2 ? 'critical' : 'high',
        message: `Average response time is ${avgResponseTime}ms, threshold is ${this.alertThresholds.responseTime}ms`,
        metadata: { responseTime: avgResponseTime, threshold: this.alertThresholds.responseTime }
      };
    }
    return null;
  }

  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const memoryPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (memoryPercent > this.alertThresholds.memoryUsage) {
      return {
        type: 'high_memory_usage',
        severity: memoryPercent > 95 ? 'critical' : 'high',
        message: `Memory usage is ${memoryPercent.toFixed(2)}%, threshold is ${this.alertThresholds.memoryUsage}%`,
        metadata: { memoryPercent, threshold: this.alertThresholds.memoryUsage, memUsage }
      };
    }
    return null;
  }

  // Additional utility methods
  getRecentErrorRate() {
    const httpRequestsMetric = this.register.getSingleMetric('http_requests_total');
    if (!httpRequestsMetric) {
      return 0;
    }

    const metrics = httpRequestsMetric.get();
    let totalRequests = 0;
    let errorRequests = 0;

    metrics.values.forEach(metric => {
      totalRequests += metric.value;
      const status = metric.labels.status;
      if (status && (status.startsWith('4') || status.startsWith('5'))) {
        errorRequests += metric.value;
      }
    });

    return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
  }

  getAverageResponseTime() {
    const responseTimeMetric = this.register.getSingleMetric('http_request_duration_seconds');
    if (!responseTimeMetric) {
      return 0;
    }

    // This is a simplified calculation - in practice you'd want to use histogram buckets
    const metrics = responseTimeMetric.get();
    if (metrics.values.length === 0) {
      return 0;
    }

    const totalTime = metrics.values.reduce((sum, metric) => sum + metric.value, 0);
    return (totalTime / metrics.values.length) * 1000; // Convert to ms
  }

  getCurrentQueueDepth() {
    const queueSizeMetric = this.register.getSingleMetric('uml_request_queue_size');
    return queueSizeMetric ? queueSizeMetric.get().values[0]?.value || 0 : 0;
  }

  // Get all metrics for Prometheus
  async getMetrics() {
    return this.register.metrics();
  }

  // Get monitoring dashboard data
  getDashboardData() {
    return {
      systemHealth: {
        score: this.customMetrics.systemHealth.get().values[0]?.value || 0,
        dependencies: Array.from(this.healthChecks.values()).map(hc => ({
          name: hc.name,
          healthy: hc.lastResult?.healthy || false,
          lastCheck: hc.lastCheck,
          consecutiveFailures: hc.consecutiveFailures
        }))
      },
      performance: {
        averageResponseTime: this.getAverageResponseTime(),
        throughput: this.customMetrics.throughput.get().values[0]?.value || 0,
        errorRate: this.getRecentErrorRate(),
        memoryUsage: process.memoryUsage()
      },
      alerts: {
        recent: this.alertHistory.slice(-10),
        thresholds: this.alertThresholds
      },
      business: {
        diagramsPerMinute: this.customMetrics.diagramGenerationRate.get().values[0]?.value || 0,
        activeUsers: this.customMetrics.userActiveCount.get().values[0]?.value || 0
      }
    };
  }

  // Cleanup
  cleanup() {
    this.register.clear();
    this.isInitialized = false;
    logger.info('Advanced monitoring cleaned up');
  }
}

// Singleton instance
const advancedMonitoring = new AdvancedMonitoring();

module.exports = {
  AdvancedMonitoring,
  advancedMonitoring
};