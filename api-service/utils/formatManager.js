const axios = require('axios');
const sharp = require('sharp');
const { logger } = require('./logger');

class FormatManager {
  constructor(krokiUrl) {
    this.krokiUrl = krokiUrl;
    this.supportedFormats = {
      png: {
        mimeType: 'image/png',
        endpoint: 'png',
        maxSize: 10 * 1024 * 1024, // 10MB
        compression: true,
        validate: this.validatePNG.bind(this)
      },
      svg: {
        mimeType: 'image/svg+xml',
        endpoint: 'svg',
        maxSize: 5 * 1024 * 1024, // 5MB
        compression: false,
        validate: this.validateSVG.bind(this)
      },
      pdf: {
        mimeType: 'application/pdf',
        endpoint: 'pdf',
        maxSize: 20 * 1024 * 1024, // 20MB
        compression: false,
        validate: this.validatePDF.bind(this)
      },
      jpeg: {
        mimeType: 'image/jpeg',
        endpoint: 'png', // Generate PNG then convert
        maxSize: 8 * 1024 * 1024, // 8MB
        compression: true,
        validate: this.validateJPEG.bind(this),
        postProcess: this.convertToJPEG.bind(this)
      },
      webp: {
        mimeType: 'image/webp',
        endpoint: 'png', // Generate PNG then convert
        maxSize: 6 * 1024 * 1024, // 6MB
        compression: true,
        validate: this.validateWebP.bind(this),
        postProcess: this.convertToWebP.bind(this)
      }
    };

    this.diagramTypes = {
      plantuml: ['png', 'svg', 'pdf'],
      mermaid: ['png', 'svg', 'pdf'],
      graphviz: ['png', 'svg', 'pdf'],
      ditaa: ['png', 'svg'],
      blockdiag: ['png', 'svg'],
      bpmn: ['png', 'svg'],
      bytefield: ['png', 'svg'],
      seqdiag: ['png', 'svg'],
      actdiag: ['png', 'svg'],
      nwdiag: ['png', 'svg'],
      packetdiag: ['png', 'svg'],
      rackdiag: ['png', 'svg'],
      c4plantuml: ['png', 'svg', 'pdf']
    };
  }

  // Check if format is supported for diagram type
  isFormatSupported(diagramType, format) {
    const supportedFormats = this.diagramTypes[diagramType.toLowerCase()];
    return supportedFormats && supportedFormats.includes(format.toLowerCase());
  }

  // Get format configuration
  getFormatConfig(format) {
    return this.supportedFormats[format.toLowerCase()];
  }

  // Generate diagram in specified format
  async generateDiagram(umlCode, diagramType = 'plantuml', format = 'png', options = {}) {
    const formatLower = format.toLowerCase();
    const formatConfig = this.getFormatConfig(formatLower);
    
    if (!formatConfig) {
      throw new Error(`Unsupported format: ${format}`);
    }

    if (!this.isFormatSupported(diagramType, formatLower)) {
      throw new Error(`Format ${format} not supported for diagram type ${diagramType}`);
    }

    try {
      const startTime = Date.now();
      
      // Generate base format (PNG for conversions, direct for others)
      const endpoint = formatConfig.endpoint;
      const krokiUrl = `${this.krokiUrl}/${diagramType}/${endpoint}`;
      
      logger.info('Generating diagram', {
        diagramType,
        format: formatLower,
        endpoint,
        umlLength: umlCode.length
      });

      const response = await axios.post(krokiUrl, umlCode, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: formatConfig.maxSize,
        maxBodyLength: formatConfig.maxSize,
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'UML-Images-Service/2.0',
          'Accept': formatConfig.mimeType
        },
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`Kroki service returned status ${response.status}`);
      }

      let diagramData = response.data;
      let actualMimeType = formatConfig.mimeType;

      // Validate the response
      if (!formatConfig.validate(diagramData)) {
        throw new Error(`Invalid ${format.toUpperCase()} response from diagram service`);
      }

      // Post-process if needed (e.g., PNG to JPEG conversion)
      if (formatConfig.postProcess) {
        const processResult = await formatConfig.postProcess(diagramData, options);
        diagramData = processResult.data;
        actualMimeType = processResult.mimeType || actualMimeType;
      }

      // Apply compression if supported
      if (formatConfig.compression && options.compress !== false) {
        diagramData = await this.compressImage(diagramData, formatLower, options);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Diagram generated successfully', {
        diagramType,
        format: formatLower,
        size: diagramData.length,
        duration
      });

      return {
        data: diagramData,
        mimeType: actualMimeType,
        format: formatLower,
        metadata: {
          size: diagramData.length,
          duration,
          diagramType,
          generatedAt: new Date().toISOString(),
          ...options
        }
      };

    } catch (error) {
      logger.error('Diagram generation failed', {
        error: error.message,
        diagramType,
        format: formatLower,
        umlLength: umlCode.length
      });
      throw error;
    }
  }

  // Batch generate multiple formats
  async generateMultipleFormats(umlCode, diagramType, formats, options = {}) {
    const results = {};
    const errors = {};

    await Promise.allSettled(
      formats.map(async (format) => {
        try {
          results[format] = await this.generateDiagram(umlCode, diagramType, format, options);
        } catch (error) {
          errors[format] = error.message;
        }
      })
    );

    return { results, errors };
  }

  // PNG validation
  validatePNG(data) {
    if (!data || data.length < 8) return false;
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return pngHeader.equals(data.slice(0, 8));
  }

  // SVG validation
  validateSVG(data) {
    if (!data || data.length < 5) return false;
    const svgContent = data.toString('utf8');
    return svgContent.includes('<svg') && svgContent.includes('</svg>');
  }

  // PDF validation
  validatePDF(data) {
    if (!data || data.length < 4) return false;
    const pdfHeader = Buffer.from('%PDF');
    return pdfHeader.equals(data.slice(0, 4));
  }

  // JPEG validation
  validateJPEG(data) {
    if (!data || data.length < 3) return false;
    return data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF;
  }

  // WebP validation
  validateWebP(data) {
    if (!data || data.length < 12) return false;
    const riffHeader = data.slice(0, 4).toString('ascii');
    const webpHeader = data.slice(8, 12).toString('ascii');
    return riffHeader === 'RIFF' && webpHeader === 'WEBP';
  }

  // Convert PNG to JPEG
  async convertToJPEG(pngData, options = {}) {
    try {
      const quality = options.quality || 85;
      const progressive = options.progressive !== false;
      
      const jpegData = await sharp(pngData)
        .jpeg({ 
          quality,
          progressive,
          mozjpeg: true
        })
        .toBuffer();

      return {
        data: jpegData,
        mimeType: 'image/jpeg'
      };
    } catch (error) {
      logger.error('PNG to JPEG conversion failed', { error: error.message });
      throw new Error('Failed to convert PNG to JPEG');
    }
  }

  // Convert PNG to WebP
  async convertToWebP(pngData, options = {}) {
    try {
      const quality = options.quality || 80;
      const lossless = options.lossless || false;
      
      const webpData = await sharp(pngData)
        .webp({ 
          quality: lossless ? undefined : quality,
          lossless,
          effort: 6
        })
        .toBuffer();

      return {
        data: webpData,
        mimeType: 'image/webp'
      };
    } catch (error) {
      logger.error('PNG to WebP conversion failed', { error: error.message });
      throw new Error('Failed to convert PNG to WebP');
    }
  }

  // Image compression for supported formats
  async compressImage(imageData, format, options = {}) {
    if (!['png', 'jpeg', 'webp'].includes(format)) {
      return imageData; // No compression for unsupported formats
    }

    try {
      const pipeline = sharp(imageData);
      const compressionLevel = options.compressionLevel || 'balanced';
      
      switch (format) {
        case 'png':
          return await pipeline
            .png({ 
              compressionLevel: compressionLevel === 'high' ? 9 : 6,
              progressive: true
            })
            .toBuffer();
            
        case 'jpeg':
          return await pipeline
            .jpeg({ 
              quality: compressionLevel === 'high' ? 95 : 85,
              progressive: true,
              mozjpeg: true
            })
            .toBuffer();
            
        case 'webp':
          return await pipeline
            .webp({ 
              quality: compressionLevel === 'high' ? 90 : 80,
              effort: compressionLevel === 'high' ? 6 : 4
            })
            .toBuffer();
            
        default:
          return imageData;
      }
    } catch (error) {
      logger.warn('Image compression failed, using original', { 
        error: error.message,
        format 
      });
      return imageData;
    }
  }

  // Get optimal format based on use case
  getOptimalFormat(useCase, diagramType) {
    const useCases = {
      web: 'webp', // Best compression for web
      print: 'pdf',  // Vector format for printing
      email: 'png',  // Wide compatibility
      mobile: 'webp', // Small size for mobile
      documentation: 'svg', // Scalable for docs
      presentation: 'png', // Good quality/compatibility balance
      thumbnail: 'jpeg' // Small size for thumbnails
    };

    const suggested = useCases[useCase] || 'png';
    
    // Check if suggested format is supported for the diagram type
    if (this.isFormatSupported(diagramType, suggested)) {
      return suggested;
    }
    
    // Fallback to PNG if suggested format not supported
    return 'png';
  }

  // Get format recommendations
  getFormatRecommendations(diagramType) {
    const supported = this.diagramTypes[diagramType.toLowerCase()] || ['png'];
    
    return {
      supported,
      recommendations: {
        web: this.getOptimalFormat('web', diagramType),
        print: this.getOptimalFormat('print', diagramType),
        documentation: this.getOptimalFormat('documentation', diagramType),
        mobile: this.getOptimalFormat('mobile', diagramType)
      }
    };
  }

  // Format-specific optimization options
  getOptimizationOptions(format, quality = 'balanced') {
    const qualityLevels = {
      high: { quality: 95, compression: 9, effort: 6 },
      balanced: { quality: 85, compression: 6, effort: 4 },
      fast: { quality: 75, compression: 3, effort: 2 }
    };

    const level = qualityLevels[quality] || qualityLevels.balanced;

    switch (format.toLowerCase()) {
      case 'png':
        return {
          compressionLevel: level.compression,
          progressive: true
        };
      case 'jpeg':
        return {
          quality: level.quality,
          progressive: true,
          mozjpeg: true
        };
      case 'webp':
        return {
          quality: level.quality,
          effort: level.effort,
          lossless: quality === 'high'
        };
      default:
        return {};
    }
  }
}

module.exports = FormatManager;