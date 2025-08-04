// const Joi = require('joi'); // Unused import (TODO: implement Joi validation)
const { logger } = require('./logger');
const { cacheManager } = require('./cache');
const crypto = require('crypto');

class AdvancedValidator {
  constructor() {
    this.securityPatterns = {
      // Malicious patterns to detect and block
      dangerous: [
        // Script injection attempts
        /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
        /onclick\s*=/gi,

        // PlantUML-specific dangerous patterns
        /!include\s+https?:\/\//gi,
        /!includeurl\s+/gi,
        /!define\s+.*system.*exec/gi,
        /!define\s+.*command/gi,
        /!pragma\s+.*teoz/gi,

        // File system access attempts
        /\.\.\/\.\.\//g,
        /\/etc\/passwd/gi,
        /\/proc\/self/gi,
        /C:\\Windows\\System32/gi,

        // Network access attempts
        /https?:\/\/[^/\s]+\/[^\s]*/gi,
        /ftp:\/\/[^/\s]+/gi,
        /file:\/\/[^/\s]+/gi,

        // Command injection patterns
        /`[^`]*`/g,
        /\$\([^)]*\)/g,
        /;\s*rm\s+/gi,
        /;\s*curl\s+/gi,
        /;\s*wget\s+/gi,

        // SQL injection patterns
        /union\s+select/gi,
        /drop\s+table/gi,
        /insert\s+into/gi,
        /delete\s+from/gi,

        // XXE attack patterns
        /<!ENTITY/gi,
        /<!DOCTYPE.*ENTITY/gi,

        // LDAP injection
        /\(\|\(/g,
        /\)\|\)/g
      ],

      // Suspicious patterns that warrant logging
      suspicious: [
        // Unusual encoding
        /%[0-9a-f]{2}/gi,
        /\\x[0-9a-f]{2}/gi,
        /\\u[0-9a-f]{4}/gi,

        // Excessive repetition
        /(.)\1{50,}/g,

        // Very long lines
        /.{1000,}/g,

        // Unusual characters (binary/control characters)
        // eslint-disable-next-line no-control-regex
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g,

        // Potential data exfiltration
        /password/gi,
        /secret/gi,
        /token/gi,
        /api[_-]?key/gi,
        /private[_-]?key/gi
      ]
    };

    this.diagramSchemas = this.initializeDiagramSchemas();
    this.validationCache = new Map();
    this.securityStats = {
      validationsPerformed: 0,
      securityThreatsBlocked: 0,
      suspiciousPatternDetections: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  initializeDiagramSchemas() {
    return {
      plantuml: {
        maxSize: 100000,
        allowedElements: [
          'actor', 'participant', 'boundary', 'control', 'entity', 'database',
          'collections', 'queue', 'rectangle', 'note', 'rnote', 'hnote',
          'class', 'interface', 'abstract', 'enum', 'annotation',
          'component', 'package', 'cloud', 'database', 'storage',
          'usecase', 'actor', 'boundary', 'control', 'entity'
        ],
        allowedKeywords: [
          '@startuml', '@enduml', 'title', 'header', 'footer', 'legend',
          'skinparam', 'hide', 'show', 'autonumber', 'activate', 'deactivate',
          'destroy', 'create', 'loop', 'alt', 'else', 'opt', 'break', 'par',
          'critical', 'group', 'ref', 'newpage', 'divider', 'delay'
        ],
        blockedPatterns: [
          /!include(?!sub)/gi,
          /!includeurl/gi,
          /!define.*exec/gi,
          /!pragma.*unsafe/gi
        ]
      },

      mermaid: {
        maxSize: 80000,
        allowedTypes: [
          'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
          'erDiagram', 'journey', 'gantt', 'pie', 'flowchart'
        ],
        blockedPatterns: [
          /onclick\s*:/gi,
          /href\s*:\s*javascript:/gi,
          /click\s+\w+\s+javascript:/gi
        ]
      },

      graphviz: {
        maxSize: 60000,
        allowedAttributes: [
          'label', 'color', 'style', 'shape', 'dir', 'arrowhead', 'arrowtail',
          'fontname', 'fontsize', 'fontcolor', 'bgcolor', 'rankdir'
        ],
        blockedPatterns: [
          /URL\s*=\s*["']javascript:/gi,
          /href\s*=\s*["']javascript:/gi,
          /tooltip\s*=\s*["'].*<script/gi
        ]
      }
    };
  }

  // Main validation entry point
  async validateDiagramContent(umlContent, diagramType = 'plantuml', options = {}) {
    const startTime = Date.now();
    this.securityStats.validationsPerformed++;

    try {
      // Generate validation cache key
      const contentHash = crypto.createHash('sha256').update(umlContent).digest('hex');
      const cacheKey = `validation:${diagramType}:${contentHash}`;

      // Check cache first
      if (options.useCache !== false) {
        const cachedResult = await this.getCachedValidation(cacheKey);
        if (cachedResult) {
          this.securityStats.cacheHits++;
          logger.debug('Validation cache hit', { contentHash: contentHash.substring(0, 8) });
          return cachedResult;
        }
      }

      this.securityStats.cacheMisses++;

      // Perform comprehensive validation
      const validationResult = await this.performValidation(umlContent, diagramType, options);

      // Cache successful validation results
      if (validationResult.isValid && options.useCache !== false) {
        await this.cacheValidationResult(cacheKey, validationResult);
      }

      const duration = Date.now() - startTime;
      logger.info('Diagram validation completed', {
        diagramType,
        contentLength: umlContent.length,
        isValid: validationResult.isValid,
        securityThreats: validationResult.securityIssues.length,
        duration
      });

      return validationResult;

    } catch (error) {
      logger.error('Validation error', {
        error: error.message,
        diagramType,
        contentLength: umlContent.length
      });

      return {
        isValid: false,
        errors: [{
          type: 'VALIDATION_ERROR',
          message: 'Internal validation error',
          severity: 'high'
        }],
        securityIssues: [],
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          duration: Date.now() - startTime
        }
      };
    }
  }

  async performValidation(umlContent, diagramType, options) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
      metadata: {
        validatedAt: new Date().toISOString(),
        diagramType,
        contentLength: umlContent.length,
        securityScanEnabled: options.securityScan !== false
      }
    };

    // 1. Basic content validation
    this.validateBasicContent(umlContent, result);

    // 2. Diagram type specific validation
    this.validateDiagramSpecific(umlContent, diagramType, result);

    // 3. Security scanning
    if (options.securityScan !== false) {
      this.performSecurityScan(umlContent, result);
    }

    // 4. Syntax validation (basic)
    this.validateSyntax(umlContent, diagramType, result);

    // 5. Performance impact assessment
    this.assessPerformanceImpact(umlContent, diagramType, result);

    // 6. Content quality checks
    this.performQualityChecks(umlContent, result);

    // Determine overall validity
    result.isValid = result.errors.length === 0 &&
                     result.securityIssues.filter(issue => issue.severity === 'high').length === 0;

    return result;
  }

  validateBasicContent(content, result) {
    // Check content size
    if (content.length === 0) {
      result.errors.push({
        type: 'EMPTY_CONTENT',
        message: 'Content cannot be empty',
        severity: 'high'
      });
      return;
    }

    if (content.length > 200000) {
      result.errors.push({
        type: 'CONTENT_TOO_LARGE',
        message: 'Content exceeds maximum allowed size (200KB)',
        severity: 'high'
      });
    } else if (content.length > 100000) {
      result.warnings.push({
        type: 'LARGE_CONTENT',
        message: 'Large content may impact performance',
        severity: 'medium'
      });
    }

    // Check for binary content
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content)) {
      result.errors.push({
        type: 'BINARY_CONTENT',
        message: 'Binary content detected',
        severity: 'high'
      });
    }

    // Check encoding
    try {
      const buffer = Buffer.from(content, 'utf8');
      if (buffer.toString('utf8') !== content) {
        result.warnings.push({
          type: 'ENCODING_ISSUE',
          message: 'Potential encoding issues detected',
          severity: 'low'
        });
      }
    } catch (error) {
      result.errors.push({
        type: 'INVALID_ENCODING',
        message: 'Invalid character encoding',
        severity: 'high'
      });
    }
  }

  validateDiagramSpecific(content, diagramType, result) {
    const schema = this.diagramSchemas[diagramType.toLowerCase()];
    if (!schema) {
      result.warnings.push({
        type: 'UNKNOWN_DIAGRAM_TYPE',
        message: `Unknown diagram type: ${diagramType}`,
        severity: 'medium'
      });
      return;
    }

    // Check size limits
    if (content.length > schema.maxSize) {
      result.errors.push({
        type: 'DIAGRAM_TOO_LARGE',
        message: `Content exceeds maximum size for ${diagramType} (${schema.maxSize} chars)`,
        severity: 'high'
      });
    }

    // Check blocked patterns
    if (schema.blockedPatterns) {
      for (const pattern of schema.blockedPatterns) {
        if (pattern.test(content)) {
          result.securityIssues.push({
            type: 'BLOCKED_PATTERN',
            message: `Blocked pattern detected: ${pattern.source}`,
            severity: 'high',
            pattern: pattern.source
          });
        }
      }
    }

    // PlantUML specific validation
    if (diagramType.toLowerCase() === 'plantuml') {
      this.validatePlantUMLSpecific(content, result);
    }

    // Mermaid specific validation
    if (diagramType.toLowerCase() === 'mermaid') {
      this.validateMermaidSpecific(content, result);
    }
  }

  validatePlantUMLSpecific(content, result) {
    // Check for proper start/end tags
    const hasStart = /@startuml/i.test(content);
    const hasEnd = /@enduml/i.test(content);

    if (hasStart && !hasEnd) {
      result.warnings.push({
        type: 'MISSING_END_TAG',
        message: '@startuml found but @enduml missing',
        severity: 'medium'
      });
    } else if (!hasStart && hasEnd) {
      result.warnings.push({
        type: 'MISSING_START_TAG',
        message: '@enduml found but @startuml missing',
        severity: 'medium'
      });
    }

    // Check for nested diagrams
    const startMatches = (content.match(/@startuml/gi) || []).length;
    const endMatches = (content.match(/@enduml/gi) || []).length;

    if (startMatches > 1 || endMatches > 1) {
      result.warnings.push({
        type: 'NESTED_DIAGRAMS',
        message: 'Multiple diagram definitions detected',
        severity: 'medium'
      });
    }

    // Check for dangerous preprocessor directives
    const dangerousDirectives = [
      /!include\s+(?!sub)/gi,
      /!includeurl/gi,
      /!define\s+.*exec/gi,
      /!system/gi
    ];

    for (const directive of dangerousDirectives) {
      if (directive.test(content)) {
        result.securityIssues.push({
          type: 'DANGEROUS_DIRECTIVE',
          message: `Potentially dangerous PlantUML directive: ${directive.source}`,
          severity: 'high'
        });
      }
    }
  }

  validateMermaidSpecific(content, result) {
    // Check for valid diagram type declaration
    const mermaidTypes = ['graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'flowchart'];
    const hasValidType = mermaidTypes.some(type => new RegExp(`^\\s*${type}`, 'im').test(content));

    if (!hasValidType) {
      result.warnings.push({
        type: 'NO_DIAGRAM_TYPE',
        message: 'No valid Mermaid diagram type declaration found',
        severity: 'medium'
      });
    }

    // Check for JavaScript injection in click events
    const clickPattern = /click\s+\w+\s+(?:javascript:|href\s*:\s*javascript:)/gi;
    if (clickPattern.test(content)) {
      result.securityIssues.push({
        type: 'JAVASCRIPT_INJECTION',
        message: 'JavaScript injection detected in click events',
        severity: 'high'
      });
    }
  }

  performSecurityScan(content, result) {
    // Scan for dangerous patterns
    for (const pattern of this.securityPatterns.dangerous) {
      const matches = content.match(pattern);
      if (matches) {
        this.securityStats.securityThreatsBlocked++;
        result.securityIssues.push({
          type: 'SECURITY_THREAT',
          message: `Dangerous pattern detected: ${pattern.source}`,
          severity: 'high',
          pattern: pattern.source,
          matches: matches.length
        });
      }
    }

    // Scan for suspicious patterns
    for (const pattern of this.securityPatterns.suspicious) {
      const matches = content.match(pattern);
      if (matches) {
        this.securityStats.suspiciousPatternDetections++;
        result.securityIssues.push({
          type: 'SUSPICIOUS_PATTERN',
          message: `Suspicious pattern detected: ${pattern.source}`,
          severity: 'medium',
          pattern: pattern.source,
          matches: matches.length
        });
      }
    }

    // Check for potential data exfiltration
    this.scanForDataExfiltration(content, result);

    // Check for resource exhaustion patterns
    this.scanForResourceExhaustion(content, result);
  }

  scanForDataExfiltration(content, result) {
    const sensitiveDataPatterns = [
      /(?:password|pwd)\s*[:=]\s*["']?[^\s"']+/gi,
      /(?:api[_-]?key|token)\s*[:=]\s*["']?[a-zA-Z0-9_-]{10,}/gi,
      /(?:secret|private[_-]?key)\s*[:=]\s*["']?[^\s"']+/gi,
      /\b(?:\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4})\b/g, // Credit card pattern
      /\b(?:\d{3}-\d{2}-\d{4})\b/g // SSN pattern
    ];

    for (const pattern of sensitiveDataPatterns) {
      if (pattern.test(content)) {
        result.securityIssues.push({
          type: 'SENSITIVE_DATA',
          message: 'Potential sensitive data detected',
          severity: 'high',
          recommendation: 'Remove sensitive information from diagram content'
        });
      }
    }
  }

  scanForResourceExhaustion(content, result) {
    // Check for excessive repetition
    const repetitionPattern = /(.{3,})\1{10,}/g;
    if (repetitionPattern.test(content)) {
      result.securityIssues.push({
        type: 'RESOURCE_EXHAUSTION',
        message: 'Excessive repetition detected - potential DoS attempt',
        severity: 'medium'
      });
    }

    // Check for extremely long lines
    const lines = content.split('\n');
    const maxLineLength = 5000;
    const longLines = lines.filter(line => line.length > maxLineLength);

    if (longLines.length > 0) {
      result.securityIssues.push({
        type: 'LONG_LINES',
        message: `Extremely long lines detected (${longLines.length} lines > ${maxLineLength} chars)`,
        severity: 'medium'
      });
    }

    // Check for excessive nesting
    const nestingLevel = this.calculateNestingLevel(content);
    if (nestingLevel > 20) {
      result.securityIssues.push({
        type: 'EXCESSIVE_NESTING',
        message: `Excessive nesting level detected: ${nestingLevel}`,
        severity: 'medium'
      });
    }
  }

  calculateNestingLevel(content) {
    let maxLevel = 0;
    let currentLevel = 0;

    for (const char of content) {
      if (char === '{' || char === '(' || char === '[') {
        currentLevel++;
        maxLevel = Math.max(maxLevel, currentLevel);
      } else if (char === '}' || char === ')' || char === ']') {
        currentLevel = Math.max(0, currentLevel - 1);
      }
    }

    return maxLevel;
  }

  validateSyntax(content, diagramType, result) {
    // Basic syntax validation (can be extended with proper parsers)
    const lines = content.split('\n');

    // Check for unmatched brackets/parentheses
    const brackets = { '(': ')', '[': ']', '{': '}', '<': '>' };
    const stack = [];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (brackets[char]) {
          stack.push({ char, line: lineNum + 1, pos: i + 1 });
        } else if (Object.values(brackets).includes(char)) {
          const lastOpening = stack.pop();
          if (!lastOpening || brackets[lastOpening.char] !== char) {
            result.warnings.push({
              type: 'UNMATCHED_BRACKET',
              message: `Unmatched bracket '${char}' at line ${lineNum + 1}, position ${i + 1}`,
              severity: 'low',
              line: lineNum + 1,
              position: i + 1
            });
          }
        }
      }
    }

    // Report unclosed brackets
    while (stack.length > 0) {
      const unclosed = stack.pop();
      result.warnings.push({
        type: 'UNCLOSED_BRACKET',
        message: `Unclosed bracket '${unclosed.char}' at line ${unclosed.line}, position ${unclosed.pos}`,
        severity: 'low',
        line: unclosed.line,
        position: unclosed.pos
      });
    }
  }

  assessPerformanceImpact(content, diagramType, result) {
    const complexity = this.calculateComplexity(content, diagramType);

    if (complexity.score > 1000) {
      result.warnings.push({
        type: 'HIGH_COMPLEXITY',
        message: `High complexity diagram (score: ${complexity.score}) may have slow rendering`,
        severity: 'medium',
        complexityScore: complexity.score,
        factors: complexity.factors
      });
    }

    // Check for performance-impacting elements
    const performancePatterns = [
      { pattern: /skinparam/gi, name: 'skinparam', impact: 'medium' },
      { pattern: /!include/gi, name: 'includes', impact: 'high' },
      { pattern: /note\s+over/gi, name: 'overlay_notes', impact: 'low' }
    ];

    for (const { pattern, name, impact } of performancePatterns) {
      const matches = (content.match(pattern) || []).length;
      if (matches > 10) {
        result.warnings.push({
          type: 'PERFORMANCE_IMPACT',
          message: `High number of ${name} (${matches}) may impact rendering performance`,
          severity: impact,
          count: matches
        });
      }
    }
  }

  calculateComplexity(content, _diagramType) {
    let score = 0;
    const factors = {};

    // Base complexity from content length
    score += Math.floor(content.length / 100);
    factors.contentLength = Math.floor(content.length / 100);

    // Line count
    const lines = content.split('\n').length;
    score += lines * 2;
    factors.lineCount = lines * 2;

    // Element count (arrows, connections, etc.)
    const arrows = (content.match(/-->|->|<--|<-/g) || []).length;
    score += arrows * 3;
    factors.arrows = arrows * 3;

    // Classes/participants
    const elements = (content.match(/class\s+\w+|participant\s+\w+|actor\s+\w+/gi) || []).length;
    score += elements * 5;
    factors.elements = elements * 5;

    // Nested structures
    const nestingLevel = this.calculateNestingLevel(content);
    score += nestingLevel * 10;
    factors.nesting = nestingLevel * 10;

    return { score, factors };
  }

  performQualityChecks(content, result) {
    // Check for common issues
    if (content.trim().length !== content.length) {
      result.warnings.push({
        type: 'WHITESPACE_ISSUES',
        message: 'Leading or trailing whitespace detected',
        severity: 'low'
      });
    }

    // Check for very short content (might be incomplete)
    if (content.trim().length < 10) {
      result.warnings.push({
        type: 'VERY_SHORT_CONTENT',
        message: 'Content appears to be very short - might be incomplete',
        severity: 'medium'
      });
    }

    // Check for missing labels or descriptions
    const hasLabels = /label|title|header|footer/.test(content);
    if (!hasLabels && content.length > 500) {
      result.warnings.push({
        type: 'NO_LABELS',
        message: 'Large diagram without labels - consider adding titles or descriptions',
        severity: 'low'
      });
    }
  }

  // Cache validation results
  async cacheValidationResult(cacheKey, result) {
    try {
      await cacheManager.cacheValidation(cacheKey, result, 1800); // 30 minutes
    } catch (error) {
      logger.error('Failed to cache validation result', { error: error.message });
    }
  }

  async getCachedValidation(cacheKey) {
    try {
      return await cacheManager.getCachedValidation(cacheKey);
    } catch (error) {
      logger.error('Failed to get cached validation', { error: error.message });
      return null;
    }
  }

  // Get validation statistics
  getValidationStats() {
    return {
      ...this.securityStats,
      cacheHitRatio: this.securityStats.cacheHits / (this.securityStats.cacheHits + this.securityStats.cacheMisses) || 0
    };
  }

  // Reset statistics
  resetStats() {
    this.securityStats = {
      validationsPerformed: 0,
      securityThreatsBlocked: 0,
      suspiciousPatternDetections: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }
}

// Singleton instance
const advancedValidator = new AdvancedValidator();

module.exports = {
  AdvancedValidator,
  advancedValidator
};