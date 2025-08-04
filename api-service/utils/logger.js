const winston = require('winston');
const path = require('path');

// Custom format for security-focused logging
const securityFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Sanitize sensitive data from logs
    const sanitized = sanitizeLogData(meta);
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...sanitized,
      service: 'api-service'
    });
  })
);

// Sanitize sensitive information from logs
function sanitizeLogData(data) {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  const sanitized = { ...data };

  function recursiveSanitize(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        recursiveSanitize(value);
      }
    }
  }

  recursiveSanitize(sanitized);
  return sanitized;
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: securityFormat,
  defaultMeta: { service: 'uml-api-service' },
  transports: [
    // Write all logs to console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // Write all logs to file
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Security-specific logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'security.log'),
      level: 'warn',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Security event logger
const securityLogger = {
  logSuspiciousActivity: (type, details) => {
    logger.warn('SECURITY_EVENT', {
      type: 'SUSPICIOUS_ACTIVITY',
      subtype: type,
      details: sanitizeLogData(details),
      timestamp: new Date().toISOString()
    });
  },

  logValidationFailure: (ip, userAgent, errors) => {
    logger.warn('SECURITY_EVENT', {
      type: 'VALIDATION_FAILURE',
      ip,
      userAgent,
      errors,
      timestamp: new Date().toISOString()
    });
  },

  logRateLimitHit: (ip, endpoint, limit) => {
    logger.warn('SECURITY_EVENT', {
      type: 'RATE_LIMIT_EXCEEDED',
      ip,
      endpoint,
      limit,
      timestamp: new Date().toISOString()
    });
  },

  logDangerousPattern: (ip, pattern, input) => {
    logger.error('SECURITY_EVENT', {
      type: 'DANGEROUS_PATTERN_DETECTED',
      ip,
      pattern,
      input: input.substring(0, 200) + '...', // Truncate for logs
      timestamp: new Date().toISOString()
    });
  },

  logUnauthorizedAccess: (ip, userAgent, endpoint) => {
    logger.error('SECURITY_EVENT', {
      type: 'UNAUTHORIZED_ACCESS',
      ip,
      userAgent,
      endpoint,
      timestamp: new Date().toISOString()
    });
  }
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  logger.info('REQUEST_START', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('REQUEST_COMPLETE', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id
    });
  });

  next();
};

// Error logger middleware
const errorLogger = (err, req, _res, next) => {
  logger.error('ERROR', {
    error: {
      message: err.message,
      stack: err.stack,
      type: err.type || 'UNKNOWN_ERROR'
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    timestamp: new Date().toISOString()
  });

  next(err);
};

module.exports = {
  logger,
  securityLogger,
  requestLogger,
  errorLogger
};