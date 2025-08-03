const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { body, validationResult } = require('express-validator');

// Enhanced Rate Limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    error: {
      message,
      type: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message,
        type: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString(),
        retryAfter: Math.round(windowMs / 1000)
      }
    });
  }
});

// Rate limiting configurations
const globalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later'
);

const generateRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  10, // limit generation requests to 10 per minute
  'Too many diagram generation requests, please slow down'
);

// Progressive delay for rapid requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 5, // allow 5 requests per windowMs without delay
  delayMs: 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // maximum delay of 20 seconds
});

// PlantUML Input Validation and Sanitization
const plantUMLValidator = [
  body('uml')
    .trim()
    .isLength({ min: 1, max: 50000 })
    .withMessage('UML code must be between 1 and 50,000 characters')
    .custom((value) => {
      // Security checks for dangerous PlantUML patterns
      const dangerousPatterns = [
        // File system access
        /!include\s+[\/\\]/i,
        /!includeurl\s+file:/i,
        /!include\s+\.\.+/i,
        
        // Network access (except HTTPS URLs)
        /!includeurl\s+(?!https:\/\/)/i,
        /!include\s+http:/i,
        
        // Preprocessing commands that could be dangerous
        /!define\s+.*\$\{.*\}/i,
        /!function\s+.*system/i,
        /!procedure\s+.*system/i,
        
        // Potential code execution
        /java\.lang/i,
        /runtime\.getruntime/i,
        /processbuilder/i,
        /system\.exit/i,
        
        // Script injection
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        
        // Path traversal
        /\.\.+[\/\\]/,
        /[\/\\]\.\.+/,
        
        // Excessive recursion patterns
        /(@start\w+[\s\S]*){10,}/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error(`Potentially dangerous PlantUML pattern detected: ${pattern.source}`);
        }
      }

      // Check for excessive nested structures
      const nestingLevel = (value.match(/{/g) || []).length;
      if (nestingLevel > 50) {
        throw new Error('Excessive nesting detected in UML code');
      }

      // Check for suspicious character sequences
      if (value.includes('\x00') || value.includes('\uFEFF')) {
        throw new Error('Invalid characters detected in UML code');
      }

      return true;
    })
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Invalid input data',
        type: 'VALIDATION_ERROR',
        details: errors.array(),
        timestamp: new Date().toISOString()
      }
    });
  }
  next();
};

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // In production, specify exact domains
    const allowedOrigins = [
      'http://localhost:9002',
      'https://localhost:9002',
      'http://127.0.0.1:9002',
      // Add your production domains here
    ];
    
    if (process.env.NODE_ENV === 'development') {
      // More permissive in development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
};

// Security headers configuration
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
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
};

// Request sanitization
const sanitizeRequest = (req, res, next) => {
  // Remove any potential NoSQL injection
  mongoSanitize()(req, res, () => {
    // Remove HTTP Parameter Pollution
    hpp()(req, res, next);
  });
};

// Security logging
const securityLogger = (req, res, next) => {
  // Log potentially suspicious requests
  const suspiciousPatterns = [
    /\.\./,
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
  ];

  const userAgent = req.get('User-Agent') || '';
  const referer = req.get('Referer') || '';
  const requestBody = JSON.stringify(req.body || {});

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent) || pattern.test(referer) || pattern.test(requestBody)) {
      console.warn('🚨 SECURITY: Suspicious request detected', {
        ip: req.ip,
        userAgent,
        referer,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
      });
      break;
    }
  }

  next();
};

module.exports = {
  globalRateLimit,
  generateRateLimit,
  speedLimiter,
  plantUMLValidator,
  handleValidationErrors,
  corsOptions,
  helmetConfig,
  sanitizeRequest,
  securityLogger
};