const express = require('express');
const axios = require('axios');
const { generateRateLimit, plantUMLValidator, handleValidationErrors } = require('../middleware/security');
const { logger, securityLogger } = require('../utils/logger');
const router = express.Router();

const KROKI_URL = process.env.KROKI_URL || 'http://kroki-service:8000';

// Secure utility function to prepare diagram code for Kroki
function prepareUmlForKroki(umlCode, diagramType = 'plantuml') {
  if (diagramType === 'plantuml') {
    // Remove @startuml/@enduml if present, Kroki adds them automatically for PlantUML
    let cleanCode = umlCode
      .replace(/^\s*@startuml.*$/gm, '')
      .replace(/^\s*@enduml.*$/gm, '')
      .trim();

    // Additional security: Remove any potential dangerous preprocessing
    cleanCode = cleanCode
      .replace(/!define\s+[^\\n]*/gi, '') // Remove !define statements
      .replace(/!include\s+[^\\n]*/gi, '') // Remove !include statements
      .replace(/!includeurl\s+[^\\n]*/gi, '') // Remove !includeurl statements
      .trim();

    return cleanCode;
  } else {
    // For other diagram types, return as-is with basic sanitization
    return umlCode.trim();
  }
}

// Enhanced UML code validation (replaced by middleware, kept for backward compatibility)
function validateUmlCode(uml) {
  if (!uml || typeof uml !== 'string') {
    throw {
      status: 400,
      type: 'VALIDATION_ERROR',
      message: 'UML code is required and must be a string'
    };
  }

  if (uml.trim().length === 0) {
    throw {
      status: 400,
      type: 'VALIDATION_ERROR',
      message: 'UML code cannot be empty'
    };
  }

  if (uml.length > 50000) { // Reduced from 100KB for security
    throw {
      status: 400,
      type: 'VALIDATION_ERROR',
      message: 'UML code is too large (max 50KB)'
    };
  }

  return uml.trim();
}

// POST /api/v1/generate - Generate diagram from UML code with enhanced security
router.post('/generate',
  generateRateLimit,
  plantUMLValidator,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      logger.info('Generate request received', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });

      const { uml, diagram_type = 'plantuml', output_format = 'png' } = req.body;

      // Double validation (middleware + function for defense in depth)
      const validatedUml = validateUmlCode(uml);
      logger.info('UML code validated', { length: validatedUml.length });

      // Prepare UML for Kroki with security cleaning
      const preparedUml = prepareUmlForKroki(validatedUml, diagram_type);
      logger.info('UML code prepared for Kroki');

      // Generate diagram via Kroki POST endpoint with enhanced security
      const krokiUrl = `${KROKI_URL}/${diagram_type}/${output_format}`;
      logger.info('Requesting diagram from Kroki', { 
        krokiUrl, 
        diagramType: diagram_type,
        contentLength: preparedUml.length,
        contentPreview: preparedUml.substring(0, 100)
      });

      const response = await axios.post(krokiUrl, preparedUml, {
        responseType: 'arraybuffer',
        timeout: 15000, // Reduced timeout for security
        maxContentLength: 10 * 1024 * 1024, // 10MB max response
        maxBodyLength: 10 * 1024 * 1024,
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'UML-Images-Service/1.0',
          'Accept': output_format === 'svg' ? 'image/svg+xml' : `image/${output_format}`
        },
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      if (response.status === 200) {
        logger.info('Diagram generated successfully', {
          responseSize: response.data.length,
          ip: req.ip
        });

        // Validate response
        if (!response.data || response.data.length < 8) {
          throw {
            status: 502,
            type: 'INVALID_RESPONSE',
            message: 'Invalid response from diagram service'
          };
        }

        // Validate file format based on output_format
        if (output_format === 'png') {
          const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
          const responseHeader = response.data.slice(0, 8);
          if (!pngHeader.equals(responseHeader)) {
            throw {
              status: 502,
              type: 'INVALID_RESPONSE',
              message: 'Response is not a valid PNG image'
            };
          }
        } else if (output_format === 'svg') {
          const responseText = response.data.toString('utf8', 0, Math.min(500, response.data.length));
          if (!responseText.includes('<svg') && !responseText.includes('<?xml')) {
            throw {
              status: 502,
              type: 'INVALID_RESPONSE',
              message: 'Response is not a valid SVG image'
            };
          }
        }

        // Set secure headers for image
        res.set({
          'Content-Type': output_format === 'svg' ? 'image/svg+xml' : `image/${output_format}`,
          'Content-Length': response.data.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline; filename="diagram.png"'
        });

        // Send PNG data
        res.send(response.data);
      } else {
        throw {
          status: 502,
          type: 'KROKI_ERROR',
          message: `Diagram service returned status ${response.status}`
        };
      }

    } catch (error) {
      logger.error('Generation error', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        stack: error.stack
      });

      // Handle Axios errors with security logging
      if (error.response) {
        const status = error.response.status;
        let message = 'Failed to generate diagram';
        let type = 'KROKI_ERROR';

        if (status === 400) {
          message = 'Invalid UML syntax - please check your PlantUML code';
          type = 'INVALID_UML';
          securityLogger.logValidationFailure(req.ip, req.get('User-Agent'), [message]);
        } else if (status === 404) {
          message = 'Diagram service not available';
          type = 'SERVICE_UNAVAILABLE';
        } else if (status >= 500) {
          message = 'Diagram service internal error';
          type = 'KROKI_INTERNAL_ERROR';
        }

        return next({
          status: status === 400 ? 400 : 502,
          type,
          message
        });
      }

      // Handle timeout errors
      if (error.code === 'ECONNABORTED') {
        logger.warn('Request timeout', {
          ip: req.ip,
          timeout: '15000ms'
        });
        return next({
          status: 504,
          type: 'TIMEOUT_ERROR',
          message: 'Diagram generation timed out - please try with simpler UML code'
        });
      }

      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        logger.error('Service unavailable', {
          error: error.code,
          krokiUrl: KROKI_URL
        });
        return next({
          status: 503,
          type: 'SERVICE_UNAVAILABLE',
          message: 'Diagram service is not available'
        });
      }

      // Re-throw validation errors
      if (error.type) {
        return next(error);
      }

      // Unknown error
      logger.error('Unknown generation error', {
        error: error.message,
        stack: error.stack,
        ip: req.ip
      });
      next({
        status: 500,
        type: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during diagram generation'
      });
    }
  });

// GET /api/v1/status - Service status with minimal information disclosure
router.get('/status', async (req, res) => {
  try {
    // Check if Kroki service is available with timeout and validation
    const krokiHealthUrl = `${KROKI_URL}/health`;
    const krokiResponse = await axios.get(krokiHealthUrl, {
      timeout: 3000,
      validateStatus: (status) => status < 500
    });

    const isKrokiHealthy = krokiResponse.status === 200;

    logger.info('Status check', {
      ip: req.ip,
      krokiStatus: isKrokiHealthy ? 'healthy' : 'unhealthy'
    });

    res.json({
      status: isKrokiHealthy ? 'operational' : 'degraded',
      api_service: 'healthy',
      kroki_service: isKrokiHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString()
      // Removed error details for security
    });
  } catch (error) {
    logger.warn('Status check failed', {
      error: error.message,
      ip: req.ip
    });

    res.status(503).json({
      status: 'degraded',
      api_service: 'healthy',
      kroki_service: 'unhealthy',
      timestamp: new Date().toISOString()
      // Removed sensitive error information
    });
  }
});

module.exports = router;