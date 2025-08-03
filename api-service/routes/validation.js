const express = require('express');
const { body, validationResult } = require('express-validator');
const { generateRateLimit, handleValidationErrors } = require('../middleware/security');
const { logger } = require('../utils/logger');
const { advancedValidator } = require('../utils/advancedValidator');

const router = express.Router();

// Validation endpoint
router.post('/validate',
  generateRateLimit,
  [
    body('uml')
      .isString()
      .isLength({ min: 1, max: 200000 })
      .withMessage('UML content must be between 1 and 200,000 characters'),
    body('diagramType')
      .optional()
      .isIn(['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'])
      .withMessage('Invalid diagram type'),
    body('securityScan')
      .optional()
      .isBoolean()
      .withMessage('Security scan must be boolean'),
    body('useCache')
      .optional()
      .isBoolean()
      .withMessage('Use cache must be boolean')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    const startTime = Date.now();
    
    try {
      const {
        uml,
        diagramType = 'plantuml',
        securityScan = true,
        useCache = true
      } = req.body;

      logger.info('Validation request received', {
        ip: req.ip,
        diagramType,
        securityScan,
        contentLength: uml.length,
        userAgent: req.get('User-Agent')
      });

      // Perform comprehensive validation
      const validationResult = await advancedValidator.validateDiagramContent(uml, diagramType, {
        securityScan,
        useCache
      });

      const duration = Date.now() - startTime;

      // Add request metadata to result
      validationResult.metadata = {
        ...validationResult.metadata,
        requestDuration: duration,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        validationStats: advancedValidator.getValidationStats()
      };

      // Set appropriate status code based on validation result
      let statusCode = 200;
      if (!validationResult.isValid) {
        statusCode = 400;
      } else if (validationResult.securityIssues.some(issue => issue.severity === 'high')) {
        statusCode = 422; // Unprocessable Entity
      }

      logger.info('Validation completed', {
        ip: req.ip,
        diagramType,
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        securityIssueCount: validationResult.securityIssues.length,
        duration
      });

      res.status(statusCode).json(validationResult);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Validation error', {
        error: error.message,
        ip: req.ip,
        diagramType: req.body.diagramType,
        duration,
        stack: error.stack
      });

      next({
        status: 500,
        type: 'VALIDATION_ERROR',
        message: 'Internal validation error occurred'
      });
    }
  }
);

// Validation statistics endpoint
router.get('/validate/stats', (req, res) => {
  try {
    const stats = advancedValidator.getValidationStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      validation: stats,
      summary: {
        totalValidations: stats.validationsPerformed,
        securityThreatsBlocked: stats.securityThreatsBlocked,
        suspiciousPatterns: stats.suspiciousPatternDetections,
        cacheEfficiency: `${Math.round(stats.cacheHitRatio * 100)}%`
      }
    });
  } catch (error) {
    logger.error('Validation stats error', { error: error.message });
    res.status(500).json({ error: 'Failed to get validation statistics' });
  }
});

module.exports = router;