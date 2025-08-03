const express = require('express');
const { body, query, validationResult } = require('express-validator');
const compression = require('compression');
const { generateRateLimit, plantUMLValidator, handleValidationErrors } = require('../middleware/security');
const { logger } = require('../utils/logger');
const { cacheManager } = require('../utils/cache');
const FormatManager = require('../utils/formatManager');
const { recordDiagramGeneration, businessMetrics } = require('../middleware/metrics');

const router = express.Router();
const KROKI_URL = process.env.KROKI_URL || 'http://kroki-service:8000';
const formatManager = new FormatManager(KROKI_URL);

// Apply compression to all routes
router.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Compress text-based formats
    return compression.filter(req, res);
  }
}));

// Enhanced UML validation
const enhancedUmlValidator = [
  body('uml')
    .isString()
    .isLength({ min: 1, max: 100000 })
    .withMessage('UML code must be between 1 and 100,000 characters')
    .custom((value) => {
      // Security: Check for potentially malicious patterns
      const dangerousPatterns = [
        /!include\s+http/i,
        /!includeurl/i,
        /!define.*system/i,
        /<script/i,
        /javascript:/i
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error('UML code contains potentially dangerous patterns');
        }
      }
      return true;
    }),
  body('format')
    .optional()
    .isIn(['png', 'svg', 'pdf', 'jpeg', 'webp'])
    .withMessage('Format must be one of: png, svg, pdf, jpeg, webp'),
  body('diagramType')
    .optional()
    .isIn(['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'])
    .withMessage('Invalid diagram type'),
  body('quality')
    .optional()
    .isIn(['high', 'balanced', 'fast'])
    .withMessage('Quality must be one of: high, balanced, fast'),
  body('compress')
    .optional()
    .isBoolean()
    .withMessage('Compress must be a boolean'),
  body('cache')
    .optional()
    .isBoolean()
    .withMessage('Cache must be a boolean')
];

// Format validation middleware
const validateFormat = (req, res, next) => {
  const { diagramType = 'plantuml', format = 'png' } = req.body;
  
  if (!formatManager.isFormatSupported(diagramType, format)) {
    return res.status(400).json({
      error: {
        type: 'UNSUPPORTED_FORMAT',
        message: `Format ${format} is not supported for diagram type ${diagramType}`,
        supportedFormats: formatManager.getFormatRecommendations(diagramType)
      }
    });
  }
  
  next();
};

// Clean UML code for processing
function prepareUmlForKroki(umlCode, diagramType = 'plantuml') {
  let cleanCode = umlCode.trim();
  
  // Remove diagram wrapper tags if present (Kroki adds them automatically)
  if (diagramType === 'plantuml') {
    cleanCode = cleanCode
      .replace(/^\s*@startuml.*$/gm, '')
      .replace(/^\s*@enduml.*$/gm, '')
      .trim();
  } else if (diagramType === 'mermaid') {
    // Mermaid doesn't need wrapper removal typically
  }
  
  // Additional security cleaning
  cleanCode = cleanCode
    .replace(/!define\s+[^\n]*/gi, '') // Remove !define statements
    .replace(/!include\s+[^\n]*/gi, '') // Remove !include statements
    .replace(/!includeurl\s+[^\n]*/gi, '') // Remove !includeurl statements
    .trim();
  
  return cleanCode;
}

// POST /api/v2/generate - Enhanced diagram generation with multiple formats
router.post('/generate', 
  generateRateLimit,
  enhancedUmlValidator,
  validateFormat,
  handleValidationErrors,
  async (req, res, next) => {
    const startTime = Date.now();
    let cacheKey = null;
    
    try {
      const {
        uml,
        format = 'png',
        diagramType = 'plantuml',
        quality = 'balanced',
        compress = true,
        cache: useCache = true
      } = req.body;

      logger.info('Enhanced generate request received', {
        ip: req.ip,
        format,
        diagramType,
        quality,
        umlLength: uml.length,
        userAgent: req.get('User-Agent')
      });

      // Prepare UML code
      const preparedUml = prepareUmlForKroki(uml, diagramType);
      
      // Generate cache key
      cacheKey = cacheManager.generateCacheKey(preparedUml, format, {
        diagramType,
        quality,
        compress
      });

      // Try to get from cache first
      if (useCache) {
        const cachedResult = await cacheManager.getCachedDiagram(cacheKey);
        if (cachedResult) {
          logger.info('Cache hit for diagram generation', {
            key: cacheKey.substring(0, 16) + '...',
            format,
            size: cachedResult.data.length
          });

          // Update metrics
          businessMetrics.trackSuccessfulGeneration(diagramType);
          recordDiagramGeneration(diagramType, 'success', Date.now() - startTime);

          // Set response headers
          res.set({
            'Content-Type': formatManager.getFormatConfig(format).mimeType,
            'Content-Length': cachedResult.data.length,
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'HIT',
            'X-Generated-At': cachedResult.metadata.cachedAt,
            'X-Content-Type-Options': 'nosniff'
          });

          return res.send(cachedResult.data);
        }
      }

      // Generate diagram using FormatManager
      const result = await formatManager.generateDiagram(
        preparedUml,
        diagramType,
        format,
        { quality, compress }
      );

      // Cache the result if enabled
      if (useCache) {
        await cacheManager.cacheDiagram(cacheKey, result.data, result.metadata, 3600);
      }

      // Update metrics
      businessMetrics.trackSuccessfulGeneration(diagramType);
      recordDiagramGeneration(diagramType, 'success', result.metadata.duration);

      // Set response headers
      res.set({
        'Content-Type': result.mimeType,
        'Content-Length': result.data.length,
        'Cache-Control': useCache ? 'public, max-age=3600' : 'no-cache',
        'X-Cache': 'MISS',
        'X-Generation-Time': `${result.metadata.duration}ms`,
        'X-Diagram-Type': diagramType,
        'X-Format': format,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="diagram.${format}"`
      });

      // Send the diagram
      res.send(result.data);

      logger.info('Diagram generated and sent successfully', {
        format,
        diagramType,
        size: result.data.length,
        totalDuration: Date.now() - startTime,
        generationDuration: result.metadata.duration,
        cached: false
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Enhanced generation error', {
        error: error.message,
        ip: req.ip,
        format: req.body.format,
        diagramType: req.body.diagramType,
        duration,
        stack: error.stack
      });

      // Update error metrics
      businessMetrics.trackFailedGeneration(
        req.body.diagramType || 'unknown',
        error.type || 'GENERATION_ERROR'
      );
      recordDiagramGeneration(
        req.body.diagramType || 'unknown',
        'error',
        duration,
        error.type || 'GENERATION_ERROR'
      );

      // Handle specific error types
      if (error.message.includes('Unsupported format')) {
        return next({
          status: 400,
          type: 'UNSUPPORTED_FORMAT',
          message: error.message
        });
      }

      if (error.message.includes('not supported for diagram type')) {
        return next({
          status: 400,
          type: 'INVALID_FORMAT_COMBINATION',
          message: error.message
        });
      }

      // Generic error handling
      next({
        status: 500,
        type: 'GENERATION_ERROR',
        message: 'Failed to generate diagram'
      });
    }
  }
);

// POST /api/v2/generate/batch - Batch generation with multiple formats
router.post('/generate/batch',
  generateRateLimit,
  body('requests')
    .isArray({ min: 1, max: 10 })
    .withMessage('Requests must be an array with 1-10 items'),
  body('requests.*.uml')
    .isString()
    .isLength({ min: 1, max: 50000 })
    .withMessage('Each UML code must be between 1 and 50,000 characters'),
  body('requests.*.formats')
    .optional()
    .isArray()
    .withMessage('Formats must be an array'),
  body('requests.*.diagramType')
    .optional()
    .isString()
    .withMessage('DiagramType must be a string'),
  handleValidationErrors,
  async (req, res, next) => {
    const startTime = Date.now();
    
    try {
      const { requests } = req.body;
      const results = [];
      
      logger.info('Batch generation request received', {
        ip: req.ip,
        batchSize: requests.length,
        userAgent: req.get('User-Agent')
      });

      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        const {
          uml,
          formats = ['png'],
          diagramType = 'plantuml',
          quality = 'balanced'
        } = request;

        try {
          const preparedUml = prepareUmlForKroki(uml, diagramType);
          const batchResult = await formatManager.generateMultipleFormats(
            preparedUml,
            diagramType,
            formats,
            { quality }
          );

          // Cache successful results
          for (const [format, result] of Object.entries(batchResult.results)) {
            const cacheKey = cacheManager.generateCacheKey(preparedUml, format, {
              diagramType,
              quality
            });
            await cacheManager.cacheDiagram(cacheKey, result.data, result.metadata);
          }

          results.push({
            index: i,
            success: true,
            results: Object.keys(batchResult.results).reduce((acc, format) => {
              acc[format] = {
                size: batchResult.results[format].data.length,
                mimeType: batchResult.results[format].mimeType
              };
              return acc;
            }, {}),
            errors: batchResult.errors
          });

        } catch (error) {
          logger.error('Batch item generation failed', {
            index: i,
            error: error.message,
            diagramType,
            formats
          });

          results.push({
            index: i,
            success: false,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      logger.info('Batch generation completed', {
        totalRequests: requests.length,
        successful: successCount,
        failed: requests.length - successCount,
        duration
      });

      res.json({
        success: true,
        summary: {
          total: requests.length,
          successful: successCount,
          failed: requests.length - successCount,
          duration
        },
        results
      });

    } catch (error) {
      logger.error('Batch generation error', {
        error: error.message,
        ip: req.ip,
        stack: error.stack
      });

      next({
        status: 500,
        type: 'BATCH_GENERATION_ERROR',
        message: 'Failed to process batch generation request'
      });
    }
  }
);

// GET /api/v2/formats - Get supported formats and recommendations
router.get('/formats', (req, res) => {
  const { diagramType = 'plantuml' } = req.query;
  
  try {
    const recommendations = formatManager.getFormatRecommendations(diagramType);
    
    res.json({
      diagramType,
      ...recommendations,
      formatDetails: Object.keys(formatManager.supportedFormats).reduce((acc, format) => {
        const config = formatManager.supportedFormats[format];
        acc[format] = {
          mimeType: config.mimeType,
          maxSize: config.maxSize,
          compression: config.compression,
          supported: recommendations.supported.includes(format)
        };
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Format info error', { error: error.message });
    res.status(500).json({ error: 'Failed to get format information' });
  }
});

// GET /api/v2/optimize - Get optimization suggestions
router.get('/optimize',
  query('format').optional().isIn(['png', 'svg', 'pdf', 'jpeg', 'webp']),
  query('useCase').optional().isIn(['web', 'print', 'email', 'mobile', 'documentation', 'presentation']),
  query('diagramType').optional().isString(),
  (req, res) => {
    const { format, useCase, diagramType = 'plantuml' } = req.query;
    
    try {
      let suggestions = {};
      
      if (useCase) {
        suggestions.recommendedFormat = formatManager.getOptimalFormat(useCase, diagramType);
      }
      
      if (format) {
        suggestions.optimizationOptions = formatManager.getOptimizationOptions(format);
      }
      
      suggestions.formatRecommendations = formatManager.getFormatRecommendations(diagramType);
      
      res.json({
        diagramType,
        ...suggestions
      });
    } catch (error) {
      logger.error('Optimization info error', { error: error.message });
      res.status(500).json({ error: 'Failed to get optimization information' });
    }
  }
);

module.exports = router;