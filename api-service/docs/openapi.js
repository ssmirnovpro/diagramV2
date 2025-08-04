const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UML Images Service API',
      version: '2.0.0',
      description: `
        A comprehensive, high-performance API service for generating UML diagrams with advanced features including:

        - **Multiple Format Support**: PNG, SVG, PDF, JPEG, WebP outputs
        - **Batch Processing**: Generate multiple diagrams asynchronously
        - **Caching**: Redis-based intelligent caching for optimal performance
        - **Security**: Advanced validation and security scanning
        - **Queue Management**: Asynchronous processing with job tracking
        - **Analytics**: Comprehensive usage analytics and monitoring

        ## Authentication

        API key authentication is supported for enhanced rate limits and analytics.
        Include your API key in the \`X-API-Key\` header.

        ## Rate Limiting

        - **Without API Key**: 10 requests per minute
        - **With API Key**: 100 requests per minute (customizable)
        - **Batch Operations**: Lower limits apply

        ## Caching

        Responses are automatically cached for improved performance. Cache headers indicate hit/miss status.
        Use \`cache=false\` in request body to bypass caching.

        ## Error Handling

        All errors follow a consistent format with detailed error types and messages.
        HTTP status codes indicate the category of error.
      `,
      contact: {
        name: 'API Support',
        email: 'support@uml-service.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:9001',
        description: 'Development server'
      },
      {
        url: 'https://api.uml-service.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication and enhanced rate limits'
        }
      },
      schemas: {
        DiagramRequest: {
          type: 'object',
          required: ['uml'],
          properties: {
            uml: {
              type: 'string',
              description: 'UML code to generate diagram from',
              example: '@startuml\\nAlice -> Bob: Hello\\n@enduml',
              minLength: 1,
              maxLength: 100000
            },
            format: {
              type: 'string',
              enum: ['png', 'svg', 'pdf', 'jpeg', 'webp'],
              default: 'png',
              description: 'Output format for the diagram'
            },
            diagramType: {
              type: 'string',
              enum: ['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'],
              default: 'plantuml',
              description: 'Type of diagram to generate'
            },
            quality: {
              type: 'string',
              enum: ['high', 'balanced', 'fast'],
              default: 'balanced',
              description: 'Quality vs speed tradeoff'
            },
            compress: {
              type: 'boolean',
              default: true,
              description: 'Apply compression to reduce file size'
            },
            cache: {
              type: 'boolean',
              default: true,
              description: 'Use caching for faster subsequent requests'
            }
          }
        },

        BatchRequest: {
          type: 'object',
          required: ['requests'],
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                required: ['uml'],
                properties: {
                  uml: {
                    type: 'string',
                    description: 'UML code for this diagram',
                    minLength: 1,
                    maxLength: 50000
                  },
                  format: {
                    type: 'string',
                    enum: ['png', 'svg', 'pdf', 'jpeg', 'webp'],
                    default: 'png'
                  },
                  diagramType: {
                    type: 'string',
                    enum: ['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'],
                    default: 'plantuml'
                  },
                  options: {
                    type: 'object',
                    properties: {
                      quality: { type: 'string', enum: ['high', 'balanced', 'fast'] }
                    }
                  }
                }
              },
              minItems: 1,
              maxItems: 10,
              description: 'Array of diagram requests to process'
            },
            webhookUrl: {
              type: 'string',
              format: 'uri',
              description: 'Optional webhook URL for completion notification'
            },
            callbackData: {
              type: 'object',
              description: 'Optional data to include in webhook payload'
            }
          }
        },

        AsyncDiagramRequest: {
          type: 'object',
          required: ['uml'],
          properties: {
            uml: {
              type: 'string',
              description: 'UML code to generate diagram from',
              minLength: 1,
              maxLength: 100000
            },
            format: {
              type: 'string',
              enum: ['png', 'svg', 'pdf', 'jpeg', 'webp'],
              default: 'png'
            },
            diagramType: {
              type: 'string',
              enum: ['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'],
              default: 'plantuml'
            },
            quality: {
              type: 'string',
              enum: ['high', 'balanced', 'fast'],
              default: 'balanced'
            },
            priority: {
              type: 'integer',
              minimum: -10,
              maximum: 10,
              default: 0,
              description: 'Job priority (-10 = lowest, 10 = highest)'
            },
            webhookUrl: {
              type: 'string',
              format: 'uri',
              description: 'Optional webhook URL for completion notification'
            },
            callbackData: {
              type: 'object',
              description: 'Optional data to include in webhook payload'
            }
          }
        },

        JobStatus: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'Unique job identifier'
            },
            queueType: {
              type: 'string',
              enum: ['diagram', 'batch'],
              description: 'Type of queue processing this job'
            },
            status: {
              type: 'string',
              enum: ['queued', 'processing', 'completed', 'failed'],
              description: 'Current job status'
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Completion percentage'
            },
            submittedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the job was submitted'
            },
            processedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When processing started'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When processing completed'
            },
            resultUrl: {
              type: 'string',
              description: 'URL to retrieve the result (if completed)'
            },
            error: {
              type: 'string',
              description: 'Error message (if failed)'
            },
            metadata: {
              type: 'object',
              description: 'Additional job metadata'
            }
          }
        },

        FormatInfo: {
          type: 'object',
          properties: {
            diagramType: {
              type: 'string',
              description: 'Diagram type being queried'
            },
            supported: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of supported formats for this diagram type'
            },
            recommendations: {
              type: 'object',
              properties: {
                web: { type: 'string', description: 'Best format for web display' },
                print: { type: 'string', description: 'Best format for printing' },
                documentation: { type: 'string', description: 'Best format for documentation' },
                mobile: { type: 'string', description: 'Best format for mobile devices' }
              }
            },
            formatDetails: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  mimeType: { type: 'string' },
                  maxSize: { type: 'integer' },
                  compression: { type: 'boolean' },
                  supported: { type: 'boolean' }
                }
              }
            }
          }
        },

        ValidationResult: {
          type: 'object',
          properties: {
            isValid: {
              type: 'boolean',
              description: 'Whether the content passed validation'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  message: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  line: { type: 'integer' },
                  position: { type: 'integer' }
                }
              },
              description: 'Validation errors that prevent processing'
            },
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  message: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] }
                }
              },
              description: 'Warnings that don\'t prevent processing'
            },
            securityIssues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  message: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  pattern: { type: 'string' }
                }
              },
              description: 'Security issues detected in the content'
            },
            metadata: {
              type: 'object',
              properties: {
                validatedAt: { type: 'string', format: 'date-time' },
                diagramType: { type: 'string' },
                contentLength: { type: 'integer' },
                securityScanEnabled: { type: 'boolean' }
              }
            }
          }
        },

        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'operational', 'degraded', 'unhealthy'],
              description: 'Overall service health status'
            },
            service: {
              type: 'string',
              description: 'Service name'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp'
            },
            metrics: {
              type: 'object',
              properties: {
                activeConnections: { type: 'integer' },
                totalRequests: { type: 'integer' },
                queueSize: { type: 'integer' },
                memoryUsage: {
                  type: 'object',
                  properties: {
                    rss: { type: 'integer' },
                    heapUsed: { type: 'integer' }
                  }
                },
                uptime: { type: 'number' }
              }
            },
            dependencies: {
              type: 'object',
              properties: {
                kroki: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'unhealthy'] },
                    url: { type: 'string' }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['connected', 'disconnected'] }
                  }
                },
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['connected', 'disconnected'] },
                    connections: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        idle: { type: 'integer' },
                        waiting: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          }
        },

        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Error type identifier'
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message'
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'When the error occurred'
                },
                requestId: {
                  type: 'string',
                  description: 'Unique request identifier for debugging'
                }
              },
              required: ['type', 'message', 'timestamp']
            }
          }
        }
      },

      responses: {
        DiagramImage: {
          description: 'Generated diagram image',
          content: {
            'image/png': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            },
            'image/svg+xml': {
              schema: {
                type: 'string'
              }
            },
            'application/pdf': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            },
            'image/jpeg': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            },
            'image/webp': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            }
          },
          headers: {
            'Content-Type': {
              description: 'MIME type of the generated image',
              schema: { type: 'string' }
            },
            'Content-Length': {
              description: 'Size of the generated image in bytes',
              schema: { type: 'integer' }
            },
            'Cache-Control': {
              description: 'Caching directives',
              schema: { type: 'string' }
            },
            'X-Cache': {
              description: 'Cache hit/miss status',
              schema: { type: 'string', enum: ['HIT', 'MISS'] }
            },
            'X-Generation-Time': {
              description: 'Time taken to generate the diagram',
              schema: { type: 'string' }
            },
            'X-Diagram-Type': {
              description: 'Type of diagram generated',
              schema: { type: 'string' }
            },
            'X-Format': {
              description: 'Output format used',
              schema: { type: 'string' }
            }
          }
        },

        ValidationError: {
          description: 'Validation error response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },

        RateLimitExceeded: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          },
          headers: {
            'X-RateLimit-Limit': {
              description: 'Rate limit ceiling for this endpoint',
              schema: { type: 'integer' }
            },
            'X-RateLimit-Remaining': {
              description: 'Number of requests remaining in current window',
              schema: { type: 'integer' }
            },
            'X-RateLimit-Reset': {
              description: 'When the rate limit window resets',
              schema: { type: 'integer' }
            }
          }
        }
      },

      parameters: {
        JobId: {
          name: 'jobId',
          in: 'path',
          required: true,
          description: 'Unique job identifier',
          schema: { type: 'string' }
        },

        DiagramType: {
          name: 'diagramType',
          in: 'query',
          description: 'Type of diagram',
          schema: {
            type: 'string',
            enum: ['plantuml', 'mermaid', 'graphviz', 'ditaa', 'blockdiag', 'bpmn', 'c4plantuml'],
            default: 'plantuml'
          }
        },

        Format: {
          name: 'format',
          in: 'query',
          description: 'Output format',
          schema: {
            type: 'string',
            enum: ['png', 'svg', 'pdf', 'jpeg', 'webp']
          }
        },

        UseCase: {
          name: 'useCase',
          in: 'query',
          description: 'Use case for optimization recommendations',
          schema: {
            type: 'string',
            enum: ['web', 'print', 'email', 'mobile', 'documentation', 'presentation']
          }
        }
      }
    },

    tags: [
      {
        name: 'Generation',
        description: 'Synchronous diagram generation endpoints'
      },
      {
        name: 'Async',
        description: 'Asynchronous processing endpoints'
      },
      {
        name: 'Formats',
        description: 'Format information and optimization'
      },
      {
        name: 'Validation',
        description: 'Content validation and security scanning'
      },
      {
        name: 'Health',
        description: 'Service health and monitoring'
      },
      {
        name: 'Analytics',
        description: 'Usage analytics and statistics'
      }
    ]
  },
  apis: [
    './routes/*.js',
    './docs/paths/*.yaml'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;