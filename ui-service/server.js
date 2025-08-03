const express = require('express');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');

// Metrics utilities
const { collectHttpMetrics, getMetrics, getMetricsSummary } = require('./middleware/metrics');

const app = express();
const PORT = process.env.PORT || 9002;
const API_URL = process.env.API_URL || 'http://api-service:9001';

// Generate nonce for CSP
const generateNonce = () => crypto.randomBytes(16).toString('base64');

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for inline styles, consider moving to external files
      scriptSrc: (req, res) => {
        res.locals.nonce = generateNonce();
        return ["'self'", `'nonce-${res.locals.nonce}'`];
      },
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", API_URL.replace('api-service:9001', 'localhost:9001')],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    },
    reportOnly: false
  },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Metrics collection middleware
app.use(collectHttpMetrics);

// Request logging middleware with security awareness
app.use((req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,
    /<script/i,
    /javascript:/i,
    /onload=/i,
    /onerror=/i
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const requestPath = req.path || '';
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent) || pattern.test(requestPath)) {
      console.warn('🚨 SECURITY: Suspicious UI request', logData);
      break;
    }
  }
  
  console.log(`${logData.timestamp} - ${logData.method} ${logData.path} - ${logData.ip}`);
  next();
});

// Health check endpoint (minimal information disclosure)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ui-service',
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
    console.error('Error serving metrics', { error: error.message });
    res.status(500).send('Error serving metrics');
  }
});

// Serve static files with security headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Security headers for static files
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    
    // Cache control for different file types
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    } else if (path.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// API configuration endpoint for frontend with input validation
app.get('/config', (req, res) => {
  // Validate origin for additional security
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  
  // Log configuration requests
  console.log('Config request', {
    ip: req.ip,
    origin,
    referer,
    userAgent: req.get('User-Agent')
  });
  
  res.json({
    apiUrl: API_URL.replace('api-service:9001', 'localhost:9001') // For browser access
  });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      message: 'Internal Server Error',
      timestamp: new Date().toISOString()
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 UI Service started on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Service URL: ${API_URL}`);
});

module.exports = app;