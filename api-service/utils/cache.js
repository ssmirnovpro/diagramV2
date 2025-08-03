const redis = require('redis');
const crypto = require('crypto');
const { logger } = require('./logger');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  async initialize() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis max reconnection attempts reached');
              return false;
            }
            return Math.min(retries * 100, 3000);
          }
        },
        database: parseInt(process.env.REDIS_DB || '0'),
        password: process.env.REDIS_PASSWORD
      });

      this.client.on('error', (error) => {
        logger.error('Redis connection error', { error: error.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.info('Redis connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      logger.info('Redis cache manager initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Redis cache', { error: error.message });
      this.isConnected = false;
    }
  }

  // Generate cache key from UML content and format
  generateCacheKey(umlContent, format = 'png', options = {}) {
    const content = JSON.stringify({
      uml: umlContent.trim(),
      format,
      options
    });
    return `diagram:${crypto.createHash('sha256').update(content).digest('hex')}`;
  }

  // Cache diagram with metadata
  async cacheDiagram(key, diagramData, metadata = {}, ttl = 3600) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set');
      return false;
    }

    try {
      const cacheEntry = {
        data: diagramData.toString('base64'),
        metadata: {
          ...metadata,
          cachedAt: new Date().toISOString(),
          size: diagramData.length,
          format: metadata.format || 'png'
        }
      };

      await this.client.setEx(key, ttl, JSON.stringify(cacheEntry));
      this.cacheStats.sets++;
      
      logger.debug('Diagram cached successfully', {
        key: key.substring(0, 16) + '...',
        size: diagramData.length,
        ttl
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to cache diagram', { 
        error: error.message,
        key: key.substring(0, 16) + '...'
      });
      return false;
    }
  }

  // Retrieve cached diagram
  async getCachedDiagram(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, cache miss');
      this.cacheStats.misses++;
      return null;
    }

    try {
      const cached = await this.client.get(key);
      if (!cached) {
        this.cacheStats.misses++;
        return null;
      }

      const cacheEntry = JSON.parse(cached);
      const diagramData = Buffer.from(cacheEntry.data, 'base64');
      
      this.cacheStats.hits++;
      
      logger.debug('Cache hit', {
        key: key.substring(0, 16) + '...',
        size: diagramData.length,
        cachedAt: cacheEntry.metadata.cachedAt
      });

      return {
        data: diagramData,
        metadata: cacheEntry.metadata
      };
    } catch (error) {
      logger.error('Failed to retrieve cached diagram', { 
        error: error.message,
        key: key.substring(0, 16) + '...'
      });
      this.cacheStats.misses++;
      return null;
    }
  }

  // Cache UML validation results
  async cacheValidation(umlHash, validationResult, ttl = 1800) {
    if (!this.isConnected) return false;

    try {
      const key = `validation:${umlHash}`;
      await this.client.setEx(key, ttl, JSON.stringify(validationResult));
      logger.debug('UML validation cached', { hash: umlHash.substring(0, 8) });
      return true;
    } catch (error) {
      logger.error('Failed to cache validation result', { error: error.message });
      return false;
    }
  }

  // Get cached validation result
  async getCachedValidation(umlHash) {
    if (!this.isConnected) return null;

    try {
      const key = `validation:${umlHash}`;
      const cached = await this.client.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Failed to retrieve cached validation', { error: error.message });
      return null;
    }
  }

  // Cache API response metadata
  async cacheApiResponse(key, response, ttl = 300) {
    if (!this.isConnected) return false;

    try {
      await this.client.setEx(`api:${key}`, ttl, JSON.stringify(response));
      return true;
    } catch (error) {
      logger.error('Failed to cache API response', { error: error.message });
      return false;
    }
  }

  // Get cached API response
  async getCachedApiResponse(key) {
    if (!this.isConnected) return null;

    try {
      const cached = await this.client.get(`api:${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Failed to retrieve cached API response', { error: error.message });
      return null;
    }
  }

  // Batch operations for multiple diagrams
  async batchCacheDiagrams(diagrams) {
    if (!this.isConnected) return false;

    try {
      const pipeline = this.client.multi();
      
      for (const { key, data, metadata, ttl } of diagrams) {
        const cacheEntry = {
          data: data.toString('base64'),
          metadata: {
            ...metadata,
            cachedAt: new Date().toISOString(),
            size: data.length
          }
        };
        pipeline.setEx(key, ttl || 3600, JSON.stringify(cacheEntry));
      }

      await pipeline.exec();
      this.cacheStats.sets += diagrams.length;
      
      logger.info('Batch cached diagrams', { count: diagrams.length });
      return true;
    } catch (error) {
      logger.error('Failed to batch cache diagrams', { error: error.message });
      return false;
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern) {
    if (!this.isConnected) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        this.cacheStats.deletes += keys.length;
        logger.info('Cache invalidated', { pattern, count: keys.length });
      }
      return true;
    } catch (error) {
      logger.error('Failed to invalidate cache pattern', { error: error.message });
      return false;
    }
  }

  // Cache statistics and health
  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRatio = total > 0 ? (this.cacheStats.hits / total) : 0;
    
    return {
      ...this.cacheStats,
      hitRatio: Math.round(hitRatio * 10000) / 100, // percentage with 2 decimals
      isConnected: this.isConnected,
      total
    };
  }

  // Reset cache statistics
  resetStats() {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  // Cache warming for popular diagrams
  async warmCache(popularDiagrams) {
    logger.info('Starting cache warming', { count: popularDiagrams.length });
    
    for (const diagram of popularDiagrams) {
      try {
        // Pre-generate and cache popular diagram types
        const key = this.generateCacheKey(diagram.uml, diagram.format);
        const exists = await this.client.exists(key);
        
        if (!exists) {
          logger.debug('Pre-warming cache for popular diagram', { 
            type: diagram.type,
            format: diagram.format 
          });
          // This would integrate with your diagram generation logic
        }
      } catch (error) {
        logger.error('Cache warming failed for diagram', { 
          error: error.message,
          type: diagram.type 
        });
      }
    }
  }

  // Cleanup expired entries and optimize memory
  async cleanup() {
    if (!this.isConnected) return;

    try {
      // Redis handles TTL automatically, but we can run maintenance
      const info = await this.client.info('memory');
      logger.info('Cache cleanup completed', { 
        memoryInfo: info.split('\r\n').filter(line => 
          line.includes('used_memory') || line.includes('expired_keys')
        ).join(', ')
      });
    } catch (error) {
      logger.error('Cache cleanup failed', { error: error.message });
    }
  }

  // Graceful shutdown
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
        logger.info('Redis cache manager disconnected');
      } catch (error) {
        logger.error('Error disconnecting Redis', { error: error.message });
      }
    }
  }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = {
  CacheManager,
  cacheManager
};