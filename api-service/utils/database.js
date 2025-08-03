const { Pool } = require('pg');
const { logger } = require('./logger');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.connectionConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'uml_service',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  }

  async initialize() {
    try {
      this.pool = new Pool(this.connectionConfig);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      
      // Setup event listeners
      this.pool.on('connect', (client) => {
        logger.debug('Database client connected');
      });

      this.pool.on('error', (err, client) => {
        logger.error('Database pool error', { error: err.message });
      });

      // Initialize database schema
      await this.initializeSchema();

      logger.info('Database manager initialized successfully', {
        host: this.connectionConfig.host,
        database: this.connectionConfig.database,
        poolSize: this.connectionConfig.max
      });

    } catch (error) {
      logger.error('Failed to initialize database', { error: error.message });
      throw error;
    }
  }

  async initializeSchema() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Users table for basic user management
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          api_key VARCHAR(255) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          rate_limit_override INTEGER,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Diagrams table for storing diagram metadata and history
      await client.query(`
        CREATE TABLE IF NOT EXISTS diagrams (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          diagram_hash VARCHAR(64) UNIQUE NOT NULL,
          uml_content TEXT NOT NULL,
          diagram_type VARCHAR(50) NOT NULL DEFAULT 'plantuml',
          format VARCHAR(10) NOT NULL DEFAULT 'png',
          size_bytes INTEGER,
          generation_time_ms INTEGER,
          cache_key VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          access_count INTEGER DEFAULT 1,
          metadata JSONB DEFAULT '{}',
          ip_address INET,
          user_agent TEXT
        )
      `);

      // API requests table for analytics and monitoring
      await client.query(`
        CREATE TABLE IF NOT EXISTS api_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          diagram_id INTEGER REFERENCES diagrams(id),
          endpoint VARCHAR(255) NOT NULL,
          method VARCHAR(10) NOT NULL,
          status_code INTEGER NOT NULL,
          response_time_ms INTEGER,
          ip_address INET,
          user_agent TEXT,
          request_size_bytes INTEGER,
          response_size_bytes INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Queue jobs table for tracking async operations
      await client.query(`
        CREATE TABLE IF NOT EXISTS queue_jobs (
          id SERIAL PRIMARY KEY,
          job_id VARCHAR(255) UNIQUE NOT NULL,
          queue_name VARCHAR(100) NOT NULL,
          user_id INTEGER REFERENCES users(id),
          job_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'queued',
          priority INTEGER DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          payload JSONB NOT NULL,
          result JSONB,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Analytics table for aggregated metrics
      await client.query(`
        CREATE TABLE IF NOT EXISTS analytics (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          hour INTEGER NOT NULL,
          metric_name VARCHAR(100) NOT NULL,
          metric_value NUMERIC NOT NULL,
          dimensions JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, hour, metric_name, dimensions)
        )
      `);

      // Rate limiting table
      await client.query(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          id SERIAL PRIMARY KEY,
          identifier VARCHAR(255) NOT NULL,
          limit_type VARCHAR(50) NOT NULL,
          requests_count INTEGER DEFAULT 1,
          window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          metadata JSONB DEFAULT '{}',
          UNIQUE(identifier, limit_type, window_start)
        )
      `);

      // Webhook deliveries table
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id SERIAL PRIMARY KEY,
          url VARCHAR(2048) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          request_id VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(20) NOT NULL,
          status_code INTEGER,
          attempts INTEGER DEFAULT 1,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_diagrams_hash ON diagrams(diagram_hash);
        CREATE INDEX IF NOT EXISTS idx_diagrams_user_id ON diagrams(user_id);
        CREATE INDEX IF NOT EXISTS idx_diagrams_created_at ON diagrams(created_at);
        CREATE INDEX IF NOT EXISTS idx_diagrams_type_format ON diagrams(diagram_type, format);
        
        CREATE INDEX IF NOT EXISTS idx_api_requests_user_id ON api_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_requests_created_at ON api_requests(created_at);
        CREATE INDEX IF NOT EXISTS idx_api_requests_endpoint ON api_requests(endpoint);
        CREATE INDEX IF NOT EXISTS idx_api_requests_status ON api_requests(status_code);
        
        CREATE INDEX IF NOT EXISTS idx_queue_jobs_job_id ON queue_jobs(job_id);
        CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_queue_jobs_queue_name ON queue_jobs(queue_name);
        CREATE INDEX IF NOT EXISTS idx_queue_jobs_created_at ON queue_jobs(created_at);
        
        CREATE INDEX IF NOT EXISTS idx_analytics_date_hour ON analytics(date, hour);
        CREATE INDEX IF NOT EXISTS idx_analytics_metric_name ON analytics(metric_name);
        
        CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
        CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON rate_limits(expires_at);
        
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_url ON webhook_deliveries(url);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
      `);

      // Create updated_at trigger function
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      // Apply updated_at trigger to users table
      await client.query(`
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query('COMMIT');
      logger.info('Database schema initialized successfully');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to initialize database schema', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  // User management methods
  async createUser(userData) {
    const { username, email, apiKey } = userData;
    const query = `
      INSERT INTO users (username, email, api_key)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, created_at
    `;
    
    try {
      const result = await this.pool.query(query, [username, email, apiKey]);
      logger.info('User created', { userId: result.rows[0].id, username });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create user', { error: error.message, username });
      throw error;
    }
  }

  async getUserByApiKey(apiKey) {
    const query = `
      SELECT id, username, email, is_active, rate_limit_override, metadata
      FROM users
      WHERE api_key = $1 AND is_active = true
    `;
    
    try {
      const result = await this.pool.query(query, [apiKey]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by API key', { error: error.message });
      throw error;
    }
  }

  async getUserById(userId) {
    const query = `
      SELECT id, username, email, is_active, created_at, updated_at, metadata
      FROM users
      WHERE id = $1
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by ID', { error: error.message, userId });
      throw error;
    }
  }

  // Diagram persistence methods
  async storeDiagram(diagramData) {
    const {
      userId,
      diagramHash,
      umlContent,
      diagramType,
      format,
      sizeBytes,
      generationTimeMs,
      cacheKey,
      metadata,
      ipAddress,
      userAgent
    } = diagramData;

    const query = `
      INSERT INTO diagrams (
        user_id, diagram_hash, uml_content, diagram_type, format,
        size_bytes, generation_time_ms, cache_key, metadata,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (diagram_hash) DO UPDATE SET
        last_accessed = CURRENT_TIMESTAMP,
        access_count = diagrams.access_count + 1
      RETURNING id, created_at, access_count
    `;

    try {
      const result = await this.pool.query(query, [
        userId, diagramHash, umlContent, diagramType, format,
        sizeBytes, generationTimeMs, cacheKey, JSON.stringify(metadata),
        ipAddress, userAgent
      ]);
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to store diagram', { error: error.message, diagramHash });
      throw error;
    }
  }

  async getDiagramByHash(diagramHash) {
    const query = `
      SELECT * FROM diagrams
      WHERE diagram_hash = $1
    `;
    
    try {
      const result = await this.pool.query(query, [diagramHash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get diagram by hash', { error: error.message, diagramHash });
      throw error;
    }
  }

  async getUserDiagrams(userId, limit = 50, offset = 0) {
    const query = `
      SELECT id, diagram_hash, diagram_type, format, size_bytes,
             generation_time_ms, created_at, last_accessed, access_count
      FROM diagrams
      WHERE user_id = $1
      ORDER BY last_accessed DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(query, [userId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user diagrams', { error: error.message, userId });
      throw error;
    }
  }

  // API request logging
  async logApiRequest(requestData) {
    const {
      userId,
      diagramId,
      endpoint,
      method,
      statusCode,
      responseTimeMs,
      ipAddress,
      userAgent,
      requestSizeBytes,
      responseSizeBytes,
      metadata
    } = requestData;

    const query = `
      INSERT INTO api_requests (
        user_id, diagram_id, endpoint, method, status_code,
        response_time_ms, ip_address, user_agent,
        request_size_bytes, response_size_bytes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [
        userId, diagramId, endpoint, method, statusCode,
        responseTimeMs, ipAddress, userAgent,
        requestSizeBytes, responseSizeBytes, JSON.stringify(metadata)
      ]);
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to log API request', { error: error.message });
      // Don't throw error for logging failures
      return null;
    }
  }

  // Queue job tracking
  async createQueueJob(jobData) {
    const {
      jobId,
      queueName,
      userId,
      jobType,
      priority,
      payload,
      metadata
    } = jobData;

    const query = `
      INSERT INTO queue_jobs (
        job_id, queue_name, user_id, job_type, priority, payload, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [
        jobId, queueName, userId, jobType, priority,
        JSON.stringify(payload), JSON.stringify(metadata)
      ]);
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to create queue job', { error: error.message, jobId });
      throw error;
    }
  }

  async updateQueueJob(jobId, updates) {
    const allowedFields = ['status', 'attempts', 'result', 'error_message', 'started_at', 'completed_at'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        fields.push(`${field} = $${paramCount}`);
        values.push(field === 'result' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return false;
    }

    const query = `
      UPDATE queue_jobs
      SET ${fields.join(', ')}
      WHERE job_id = $${paramCount}
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [...values, jobId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to update queue job', { error: error.message, jobId });
      throw error;
    }
  }

  // Analytics methods
  async recordMetric(metricName, value, dimensions = {}) {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const hour = now.getHours();

    const query = `
      INSERT INTO analytics (date, hour, metric_name, metric_value, dimensions)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date, hour, metric_name, dimensions)
      DO UPDATE SET metric_value = analytics.metric_value + $4
    `;

    try {
      await this.pool.query(query, [date, hour, metricName, value, JSON.stringify(dimensions)]);
    } catch (error) {
      logger.error('Failed to record metric', { error: error.message, metricName });
      // Don't throw error for analytics failures
    }
  }

  async getAnalytics(metricName, startDate, endDate, dimensions = {}) {
    const query = `
      SELECT date, hour, SUM(metric_value) as total_value
      FROM analytics
      WHERE metric_name = $1
        AND date >= $2
        AND date <= $3
        AND dimensions @> $4
      GROUP BY date, hour
      ORDER BY date, hour
    `;

    try {
      const result = await this.pool.query(query, [
        metricName, startDate, endDate, JSON.stringify(dimensions)
      ]);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get analytics', { error: error.message, metricName });
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.pool.query('SELECT 1 as healthy');
      return {
        healthy: true,
        connections: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  // Cleanup old records
  async cleanup() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Clean old API requests (older than 30 days)
      await client.query(`
        DELETE FROM api_requests
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);

      // Clean old analytics (older than 90 days)
      await client.query(`
        DELETE FROM analytics
        WHERE date < CURRENT_DATE - INTERVAL '90 days'
      `);

      // Clean old queue jobs (completed/failed older than 7 days)
      await client.query(`
        DELETE FROM queue_jobs
        WHERE status IN ('completed', 'failed')
          AND completed_at < NOW() - INTERVAL '7 days'
      `);

      // Clean expired rate limits
      await client.query(`
        DELETE FROM rate_limits
        WHERE expires_at < NOW()
      `);

      await client.query('COMMIT');
      logger.info('Database cleanup completed');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database cleanup failed', { error: error.message });
    } finally {
      client.release();
    }
  }

  // Graceful shutdown
  async shutdown() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection pool closed');
    }
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

module.exports = {
  DatabaseManager,
  databaseManager
};