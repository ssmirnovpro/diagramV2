/**
 * @swagger
 * /api/v1/generate:
 *   post:
 *     tags: [Generation]
 *     summary: Generate UML diagram (Legacy API)
 *     description: |
 *       Generate a UML diagram from PlantUML code. This is the legacy v1 API endpoint.
 *       For new applications, use `/api/v2/generate` which supports additional formats and features.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uml]
 *             properties:
 *               uml:
 *                 type: string
 *                 description: PlantUML code
 *                 example: "@startuml\\nAlice -> Bob: Hello\\nBob -> Alice: Hi\\n@enduml"
 *           examples:
 *             sequence_diagram:
 *               summary: Simple sequence diagram
 *               value:
 *                 uml: "@startuml\\nAlice -> Bob: Hello\\nBob -> Alice: Hi\\n@enduml"
 *             class_diagram:
 *               summary: Class diagram
 *               value:
 *                 uml: "@startuml\\nclass User {\\n  +name: String\\n  +email: String\\n  +login()\\n}\\n@enduml"
 *     responses:
 *       200:
 *         $ref: '#/components/responses/DiagramImage'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/v2/generate:
 *   post:
 *     tags: [Generation]
 *     summary: Generate UML diagram with advanced features
 *     description: |
 *       Generate a UML diagram with support for multiple formats, quality settings, and caching.
 *       This endpoint supports PlantUML, Mermaid, Graphviz, and other diagram types.
 *       
 *       **Performance Features:**
 *       - Intelligent caching with Redis
 *       - Format-specific optimizations
 *       - Compression support
 *       - Response time optimization
 *       
 *       **Security Features:**
 *       - Advanced content validation
 *       - Security pattern scanning
 *       - Input sanitization
 *       - Rate limiting
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DiagramRequest'
 *           examples:
 *             plantuml_sequence:
 *               summary: PlantUML sequence diagram
 *               value:
 *                 uml: "@startuml\\nparticipant User\\nparticipant System\\nUser -> System: Request\\nSystem -> User: Response\\n@enduml"
 *                 format: "png"
 *                 diagramType: "plantuml"
 *                 quality: "balanced"
 *             mermaid_flowchart:
 *               summary: Mermaid flowchart
 *               value:
 *                 uml: "flowchart TD\\n    A[Start] --> B{Decision}\\n    B -->|Yes| C[Process]\\n    B -->|No| D[End]\\n    C --> D"
 *                 format: "svg"
 *                 diagramType: "mermaid"
 *                 quality: "high"
 *             high_quality_pdf:
 *               summary: High quality PDF output
 *               value:
 *                 uml: "@startuml\\nclass Order {\\n  +id: UUID\\n  +amount: Money\\n  +status: Status\\n}\\n@enduml"
 *                 format: "pdf"
 *                 quality: "high"
 *                 compress: false
 *     responses:
 *       200:
 *         $ref: '#/components/responses/DiagramImage'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */

/**
 * @swagger
 * /api/v2/generate/batch:
 *   post:
 *     tags: [Generation]
 *     summary: Generate multiple diagrams in batch
 *     description: |
 *       Generate multiple diagrams in a single request. This endpoint supports up to 10 diagrams
 *       per batch and can generate different formats for each diagram.
 *       
 *       **Features:**
 *       - Process up to 10 diagrams per request
 *       - Different formats per diagram
 *       - Parallel processing for performance
 *       - Detailed success/error reporting
 *       - Automatic caching of successful results
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchRequest'
 *           examples:
 *             mixed_diagrams:
 *               summary: Mixed diagram types and formats
 *               value:
 *                 requests:
 *                   - uml: "@startuml\\nAlice -> Bob\\n@enduml"
 *                     format: "png"
 *                     diagramType: "plantuml"
 *                   - uml: "flowchart LR\\n    A --> B --> C"
 *                     format: "svg"
 *                     diagramType: "mermaid"
 *                   - uml: "digraph G { A -> B }"
 *                     format: "pdf"
 *                     diagramType: "graphviz"
 *     responses:
 *       200:
 *         description: Batch processing results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     successful: { type: integer }
 *                     failed: { type: integer }
 *                     duration: { type: integer }
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index: { type: integer }
 *                       success: { type: boolean }
 *                       results:
 *                         type: object
 *                         description: "Format-specific results with metadata"
 *                       errors:
 *                         type: object
 *                         description: "Format-specific errors"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */

/**
 * @swagger
 * /api/async/generate:
 *   post:
 *     tags: [Async]
 *     summary: Queue diagram generation for async processing
 *     description: |
 *       Submit a diagram generation request for asynchronous processing. Use this endpoint
 *       for complex diagrams or when you need to process many diagrams without blocking.
 *       
 *       **Benefits:**
 *       - Non-blocking operation
 *       - Job tracking with progress updates
 *       - Webhook notifications
 *       - Priority queue support
 *       - Automatic retry on failure
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AsyncDiagramRequest'
 *           examples:
 *             async_with_webhook:
 *               summary: Async request with webhook notification
 *               value:
 *                 uml: "@startuml\\nparticipant User\\nparticipant API\\nUser -> API: Request\\n@enduml"
 *                 format: "png"
 *                 priority: 5
 *                 webhookUrl: "https://myapp.com/webhook/diagram-complete"
 *                 callbackData:
 *                   userId: "12345"
 *                   requestType: "sequence_diagram"
 *     responses:
 *       202:
 *         description: Job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 requestId: { type: string }
 *                 jobId: { type: string }
 *                 status: { type: string, enum: ["queued"] }
 *                 estimatedProcessingTime: { type: string }
 *                 statusUrl: { type: string }
 *                 resultUrl: { type: string }
 *                 submittedAt: { type: string, format: date-time }
 *                 queuePosition: { type: integer }
 */

/**
 * @swagger
 * /api/async/batch:
 *   post:
 *     tags: [Async]
 *     summary: Queue batch processing for async operation
 *     description: |
 *       Submit a batch of diagrams for asynchronous processing. Ideal for processing
 *       large numbers of diagrams without blocking the client.
 *       
 *       **Features:**
 *       - Process up to 50 diagrams per batch
 *       - Webhook notification on completion
 *       - Individual success/failure tracking
 *       - Progress monitoring
 *       - Automatic retry on transient failures
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/BatchRequest'
 *               - type: object
 *                 properties:
 *                   priority:
 *                     type: integer
 *                     minimum: -10
 *                     maximum: 10
 *                     description: "Batch priority in queue"
 *     responses:
 *       202:
 *         description: Batch queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 batchId: { type: string }
 *                 jobId: { type: string }
 *                 status: { type: string }
 *                 batchSize: { type: integer }
 *                 estimatedProcessingTime: { type: string }
 *                 statusUrl: { type: string }
 *                 resultUrl: { type: string }
 */

/**
 * @swagger
 * /api/async/status/{jobId}:
 *   get:
 *     tags: [Async]
 *     summary: Get job status and progress
 *     description: |
 *       Retrieve the current status and progress of an asynchronous job.
 *       Use this endpoint to track job progress and determine when results are available.
 *     parameters:
 *       - $ref: '#/components/parameters/JobId'
 *     responses:
 *       200:
 *         description: Job status information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobStatus'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/async/result/{jobId}:
 *   get:
 *     tags: [Async]
 *     summary: Get job result
 *     description: |
 *       Retrieve the result of a completed asynchronous job.
 *       For single diagram jobs, returns the generated image.
 *       For batch jobs, returns a summary with individual results.
 *     parameters:
 *       - $ref: '#/components/parameters/JobId'
 *       - name: download
 *         in: query
 *         description: Force download instead of inline display
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Job result
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               description: Batch results or metadata
 *       400:
 *         description: Job not completed
 *       404:
 *         description: Job not found
 */

/**
 * @swagger
 * /api/v2/formats:
 *   get:
 *     tags: [Formats]
 *     summary: Get supported formats and recommendations
 *     description: |
 *       Get information about supported output formats for different diagram types,
 *       including format-specific capabilities and use case recommendations.
 *     parameters:
 *       - $ref: '#/components/parameters/DiagramType'
 *     responses:
 *       200:
 *         description: Format information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FormatInfo'
 *             examples:
 *               plantuml_formats:
 *                 summary: PlantUML supported formats
 *                 value:
 *                   diagramType: "plantuml"
 *                   supported: ["png", "svg", "pdf"]
 *                   recommendations:
 *                     web: "webp"
 *                     print: "pdf"
 *                     documentation: "svg"
 *                     mobile: "webp"
 */

/**
 * @swagger
 * /api/v2/optimize:
 *   get:
 *     tags: [Formats]
 *     summary: Get optimization recommendations
 *     description: |
 *       Get optimization recommendations for specific formats and use cases.
 *       This endpoint helps you choose the best format and settings for your specific needs.
 *     parameters:
 *       - $ref: '#/components/parameters/Format'
 *       - $ref: '#/components/parameters/UseCase'
 *       - $ref: '#/components/parameters/DiagramType'
 *     responses:
 *       200:
 *         description: Optimization recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 diagramType: { type: string }
 *                 recommendedFormat: { type: string }
 *                 optimizationOptions:
 *                   type: object
 *                   description: Format-specific optimization settings
 *                 formatRecommendations:
 *                   $ref: '#/components/schemas/FormatInfo'
 */

/**
 * @swagger
 * /api/validate:
 *   post:
 *     tags: [Validation]
 *     summary: Validate UML content
 *     description: |
 *       Validate UML content for syntax errors, security issues, and quality problems
 *       without generating a diagram. Use this endpoint to check content before submission.
 *       
 *       **Validation Features:**
 *       - Syntax validation
 *       - Security scanning
 *       - Performance impact assessment
 *       - Quality checks
 *       - Detailed error reporting
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uml]
 *             properties:
 *               uml:
 *                 type: string
 *                 description: UML content to validate
 *               diagramType:
 *                 type: string
 *                 enum: [plantuml, mermaid, graphviz]
 *                 default: plantuml
 *               securityScan:
 *                 type: boolean
 *                 default: true
 *                 description: Perform security scanning
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationResult'
 */

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     description: |
 *       Quick health check endpoint that returns basic service status and metrics.
 *       Use this for load balancer health checks and basic monitoring.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: ["healthy"] }
 *                 service: { type: string }
 *                 timestamp: { type: string, format: date-time }
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     activeConnections: { type: integer }
 *                     totalRequests: { type: integer }
 *                     queueSize: { type: integer }
 */

/**
 * @swagger
 * /api/v1/status:
 *   get:
 *     tags: [Health]
 *     summary: Detailed service status
 *     description: |
 *       Comprehensive service status including detailed metrics, dependency health,
 *       and system information. Use this for detailed monitoring and diagnostics.
 *     responses:
 *       200:
 *         description: Detailed service status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 */

/**
 * @swagger
 * /metrics:
 *   get:
 *     tags: [Analytics]
 *     summary: Prometheus metrics
 *     description: |
 *       Prometheus-compatible metrics endpoint for monitoring and alerting.
 *       Returns metrics in the standard Prometheus exposition format.
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: Prometheus metrics in exposition format
 */

module.exports = {};