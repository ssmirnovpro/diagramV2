const http = require('http');
const https = require('https');
const compression = require('compression');
const { logger } = require('./logger');

class HttpOptimizer {
  constructor() {
    this.keepAliveAgent = null;
    this.httpsKeepAliveAgent = null;
    this.compressionMiddleware = null;
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      createdSockets: 0,
      destroyedSockets: 0
    };
  }

  initialize() {
    // Configure HTTP Keep-Alive agents
    this.setupKeepAliveAgents();
    
    // Configure compression middleware
    this.setupCompression();
    
    // Setup connection monitoring
    this.setupConnectionMonitoring();
    
    logger.info('HTTP optimizations initialized', {
      keepAlive: true,
      compression: true,
      monitoring: true
    });
  }

  setupKeepAliveAgents() {
    // HTTP Keep-Alive agent configuration
    const httpAgentOptions = {
      keepAlive: true,
      keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
      maxSockets: parseInt(process.env.HTTP_MAX_SOCKETS || '50'),
      maxFreeSockets: parseInt(process.env.HTTP_MAX_FREE_SOCKETS || '10'),
      timeout: parseInt(process.env.HTTP_SOCKET_TIMEOUT || '60000'),
      freeSocketTimeout: parseInt(process.env.HTTP_FREE_SOCKET_TIMEOUT || '15000')
    };

    // HTTPS Keep-Alive agent configuration
    const httpsAgentOptions = {
      ...httpAgentOptions,
      secureProtocol: 'TLSv1_2_method',
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    };

    this.keepAliveAgent = new http.Agent(httpAgentOptions);
    this.httpsKeepAliveAgent = new https.Agent(httpsAgentOptions);

    // Monitor agent events
    this.setupAgentMonitoring(this.keepAliveAgent, 'HTTP');
    this.setupAgentMonitoring(this.httpsKeepAliveAgent, 'HTTPS');

    // Set global default agents
    http.globalAgent = this.keepAliveAgent;
    https.globalAgent = this.httpsKeepAliveAgent;
  }

  setupAgentMonitoring(agent, protocol) {
    // Track socket creation and destruction
    const originalCreateConnection = agent.createConnection;
    agent.createConnection = (...args) => {
      this.connectionStats.createdSockets++;
      this.connectionStats.activeConnections++;
      
      const socket = originalCreateConnection.apply(agent, args);
      
      socket.on('close', () => {
        this.connectionStats.destroyedSockets++;
        this.connectionStats.activeConnections--;
      });

      socket.on('free', () => {
        this.connectionStats.idleConnections++;
      });

      socket.on('agentRemove', () => {
        this.connectionStats.idleConnections--;
      });

      return socket;
    };

    logger.debug(`${protocol} agent monitoring enabled`, {
      maxSockets: agent.maxSockets,
      maxFreeSockets: agent.maxFreeSockets
    });
  }

  setupCompression() {
    this.compressionMiddleware = compression({
      level: parseInt(process.env.COMPRESSION_LEVEL || '6'), // Default compression level
      threshold: parseInt(process.env.COMPRESSION_THRESHOLD || '1024'), // Only compress if > 1KB
      memLevel: parseInt(process.env.COMPRESSION_MEM_LEVEL || '8'), // Memory usage level
      chunkSize: parseInt(process.env.COMPRESSION_CHUNK_SIZE || '16384'), // 16KB chunks
      
      // Compression filter function
      filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
          return false;
        }

        // Don't compress if response is already compressed
        if (res.getHeader('Content-Encoding')) {
          return false;
        }

        // Don't compress binary formats that are already compressed
        const contentType = res.getHeader('Content-Type');
        if (contentType) {
          const binaryTypes = [
            'image/png',
            'image/jpeg',
            'image/webp',
            'application/pdf',
            'application/zip',
            'application/gzip'
          ];
          
          if (binaryTypes.some(type => contentType.includes(type))) {
            return false;
          }
        }

        // Use default compression filter for other content
        return compression.filter(req, res);
      }
    });
  }

  setupConnectionMonitoring() {
    // Monitor connection pool stats every 30 seconds
    setInterval(() => {
      this.logConnectionStats();
    }, 30000);

    // Monitor for connection leaks
    setInterval(() => {
      this.checkForConnectionLeaks();
    }, 60000);
  }

  logConnectionStats() {
    const httpSockets = this.keepAliveAgent.freeSockets;
    const httpRequests = this.keepAliveAgent.requests;
    const httpsSockets = this.httpsKeepAliveAgent.freeSockets;
    const httpsRequests = this.httpsKeepAliveAgent.requests;

    const stats = {
      ...this.connectionStats,
      http: {
        freeSockets: Object.keys(httpSockets).reduce((total, key) => total + httpSockets[key].length, 0),
        requests: Object.keys(httpRequests).reduce((total, key) => total + httpRequests[key].length, 0)
      },
      https: {
        freeSockets: Object.keys(httpsSockets).reduce((total, key) => total + httpsSockets[key].length, 0),
        requests: Object.keys(httpsRequests).reduce((total, key) => total + httpsRequests[key].length, 0)
      }
    };

    logger.debug('Connection pool stats', stats);
  }

  checkForConnectionLeaks() {
    const maxConnections = parseInt(process.env.HTTP_MAX_SOCKETS || '50') * 2; // HTTP + HTTPS
    
    if (this.connectionStats.activeConnections > maxConnections) {
      logger.warn('Potential connection leak detected', {
        activeConnections: this.connectionStats.activeConnections,
        maxConnections,
        createdSockets: this.connectionStats.createdSockets,
        destroyedSockets: this.connectionStats.destroyedSockets
      });
    }
  }

  // Get optimized HTTP/HTTPS agents for external requests
  getHttpAgent() {
    return this.keepAliveAgent;
  }

  getHttpsAgent() {
    return this.httpsKeepAliveAgent;
  }

  // Get compression middleware
  getCompressionMiddleware() {
    return this.compressionMiddleware;
  }

  // Configure Express server for optimal performance
  configureExpressServer(app) {
    // Enable trust proxy for load balancers
    app.set('trust proxy', 1);

    // Disable X-Powered-By header for security
    app.disable('x-powered-by');

    // Set appropriate timeout values
    app.use((req, res, next) => {
      // Set response timeout
      res.timeout(parseInt(process.env.RESPONSE_TIMEOUT || '30000'));
      
      // Set keep-alive timeout
      res.setHeader('Keep-Alive', `timeout=${parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5')}, max=100`);
      
      next();
    });

    // Apply compression middleware globally
    app.use(this.compressionMiddleware);

    // Add performance headers
    app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
      });

      next();
    });

    return app;
  }

  // Configure HTTP server for optimal performance
  configureHttpServer(server) {
    // Set server timeout values
    server.timeout = parseInt(process.env.SERVER_TIMEOUT || '30000'); // 30 seconds
    server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5000'); // 5 seconds
    server.headersTimeout = parseInt(process.env.HEADERS_TIMEOUT || '6000'); // 6 seconds (must be > keepAliveTimeout)

    // Set max connections
    server.maxConnections = parseInt(process.env.MAX_CONNECTIONS || '1000');

    // Configure socket behavior
    server.on('connection', (socket) => {
      this.connectionStats.totalConnections++;
      
      // Set socket timeout
      socket.setTimeout(parseInt(process.env.SOCKET_TIMEOUT || '60000'));
      
      // Set TCP keep-alive
      socket.setKeepAlive(true, parseInt(process.env.TCP_KEEP_ALIVE || '30000'));
      
      // Set no delay for better performance
      socket.setNoDelay(true);

      socket.on('timeout', () => {
        logger.warn('Socket timeout', { 
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort 
        });
        socket.destroy();
      });

      socket.on('error', (error) => {
        logger.error('Socket error', { 
          error: error.message,
          remoteAddress: socket.remoteAddress 
        });
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', { error: error.message });
    });

    // Handle client errors
    server.on('clientError', (error, socket) => {
      logger.warn('Client error', { 
        error: error.message,
        remoteAddress: socket.remoteAddress 
      });
      
      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });

    return server;
  }

  // Get connection statistics
  getConnectionStats() {
    const httpAgent = this.keepAliveAgent;
    const httpsAgent = this.httpsKeepAliveAgent;

    return {
      ...this.connectionStats,
      pools: {
        http: {
          freeSockets: Object.keys(httpAgent.freeSockets).length,
          sockets: Object.keys(httpAgent.sockets).length,
          requests: Object.keys(httpAgent.requests).length
        },
        https: {
          freeSockets: Object.keys(httpsAgent.freeSockets).length,
          sockets: Object.keys(httpsAgent.sockets).length,
          requests: Object.keys(httpsAgent.requests).length
        }
      }
    };
  }

  // Cleanup connections on shutdown
  cleanup() {
    try {
      // Destroy all connections
      this.keepAliveAgent.destroy();
      this.httpsKeepAliveAgent.destroy();
      
      logger.info('HTTP connections cleaned up');
    } catch (error) {
      logger.error('Error cleaning up HTTP connections', { error: error.message });
    }
  }
}

// Singleton instance
const httpOptimizer = new HttpOptimizer();

module.exports = {
  HttpOptimizer,
  httpOptimizer
};