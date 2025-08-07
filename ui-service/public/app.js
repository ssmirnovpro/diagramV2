// UML Images Service - Modern Frontend Application v2.0
// Features: PWA, Accessibility, Templates, Advanced Editor, Performance Optimization

class UMLImageService {
  constructor() {
    this.apiUrl = null;
    this.currentImageBlob = null;
    this.currentImageUrl = null;
    this.diagramHistory = [];
    this.templates = [];
    this.isDarkMode = false;
    this.isOffline = false;
    this.zoomLevel = 1;
    this.editorStats = { lines: 0, characters: 0 };

    // Performance monitoring
    this.performanceMetrics = {
      loadTime: 0,
      renderTime: 0,
      apiResponseTime: 0
    };

    // Accessibility features
    this.keyboardNavigation = new KeyboardNavigationManager();
    this.screenReaderAnnouncements = new ScreenReaderManager();

    // Initialize the application
    this.init();
  }

  async init() {
    const startTime = performance.now();

    try {
      // Show loading screen
      this.showLoadingScreen();

      // Initialize core services
      await Promise.all([
        this.loadConfig(),
        this.loadTemplates(),
        this.initializeTheme(),
        this.setupOfflineDetection(),
        this.initializeServiceWorker()
      ]);

      // Setup UI and event listeners
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      this.setupAccessibilityFeatures();
      this.setupTouchGestures();

      // Initialize editor features
      this.initializeEditor();
      
      // Disable image controls initially (no image yet)
      this.disableImageControls();

      // Load saved state
      await this.loadSavedState();

      // Check service status
      this.checkServiceStatus();
      setInterval(() => this.checkServiceStatus(), 30000);

      // Performance metrics
      this.performanceMetrics.loadTime = performance.now() - startTime;

      // Hide loading screen
      this.hideLoadingScreen();

      // Announce to screen readers
      this.announceToScreenReader('UML Images Service loaded successfully. Ready to create diagrams.');

      console.log('🚀 UML Images Service v2.0 initialized in', Math.round(this.performanceMetrics.loadTime), 'ms');

      // Show welcome toast for first-time users
      if (!localStorage.getItem('uml-service-welcomed')) {
        this.showToast('Welcome to UML Images Service! 🎉', 'Try our templates or start with an example.', 'success');
        localStorage.setItem('uml-service-welcomed', 'true');
      }

    } catch (error) {
      console.error('Failed to initialize UML Images Service:', error);
      this.showToast('Initialization Error', 'Failed to load the application. Please refresh the page.', 'error');
      this.hideLoadingScreen();
    }
  }

  async loadConfig() {
    try {
      const response = await fetch('/config');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const config = await response.json();
      this.apiUrl = config.apiUrl;

      console.log('📝 Configuration loaded:', config);
      return config;
    } catch (error) {
      console.warn('⚠️ Failed to load configuration:', error);
      this.apiUrl = window.location.hostname === 'localhost' ? 'http://localhost:9001' : '/api';

      this.showToast('Configuration Warning', 'Using fallback API configuration.', 'warning');
      return { apiUrl: this.apiUrl };
    }
  }

  async loadTemplates() {
    try {
      // Define built-in templates
      this.templates = [
        {
          id: 'sequence-basic',
          name: 'Basic Sequence Diagram',
          description: 'Simple sequence diagram with two actors',
          category: 'sequence',
          code: `@startuml
!theme plain
title Basic Sequence Diagram

actor User
participant System
database Database

User -> System: Request
activate System
System -> Database: Query
activate Database
Database --> System: Data
deactivate Database
System --> User: Response
deactivate System
@enduml`
        },
        {
          id: 'class-basic',
          name: 'Basic Class Diagram',
          description: 'Simple class diagram showing inheritance',
          category: 'class',
          code: `@startuml
!theme plain
title Basic Class Diagram

class Animal {
  -name: String
  -age: Integer
  +getName(): String
  +setName(name: String): void
}

class Dog extends Animal {
  -breed: String
  +bark(): void
}

class Cat extends Animal {
  -indoor: Boolean
  +meow(): void
}

Animal <|-- Dog
Animal <|-- Cat
@enduml`
        },
        {
          id: 'activity-basic',
          name: 'Basic Activity Diagram',
          description: 'Simple workflow activity diagram',
          category: 'activity',
          code: `@startuml
!theme plain
title Basic Activity Diagram

start
:Initialize;
if (Check condition?) then (yes)
  :Process A;
else (no)
  :Process B;
endif
:Finalize;
stop
@enduml`
        },
        {
          id: 'usecase-basic',
          name: 'Basic Use Case Diagram',
          description: 'Simple use case diagram',
          category: 'usecase',
          code: `@startuml
!theme plain
title Basic Use Case Diagram

left to right direction
actor User
actor Admin

rectangle System {
  User --> (Login)
  User --> (View Profile)
  User --> (Update Profile)
  Admin --> (Manage Users)
  Admin --> (View Reports)
  (Manage Users) .> (Login) : includes
}
@enduml`
        }
      ];

      console.log('📋 Templates loaded:', this.templates.length);
    } catch (error) {
      console.error('Failed to load templates:', error);
      this.templates = [];
    }
  }

  setupEventListeners() {
    // Primary action buttons
    this.bindEvent('generateBtn', 'click', () => this.generateDiagram());
    this.bindEvent('exampleBtn', 'click', () => this.loadExample());
    this.bindEvent('clearBtn', 'click', () => this.clearCode());
    this.bindEvent('templateBtn', 'click', () => this.showTemplateModal());
    
    // Diagram type selector
    const diagramType = document.getElementById('diagramType');
    if (diagramType) {
      diagramType.addEventListener('change', (e) => {
        this.updatePlaceholderForDiagramType(e.target.value);
      });
    }

    // Download buttons
    this.bindEvent('downloadPngBtn', 'click', () => this.downloadImage('png'));
    this.bindEvent('downloadSvgBtn', 'click', () => this.downloadImage('svg'));
    this.bindEvent('copyLinkBtn', 'click', () => this.copyShareLink());

    // View controls
    this.bindEvent('fullscreenBtn', 'click', () => this.openFullscreen());
    this.bindEvent('closeFullscreen', 'click', () => this.closeFullscreen());
    this.bindEvent('downloadFullscreenBtn', 'click', () => this.downloadImage('png'));

    // Zoom controls
    this.bindEvent('zoomInBtn', 'click', () => this.zoomIn());
    this.bindEvent('zoomOutBtn', 'click', () => this.zoomOut());
    this.bindEvent('resetZoomBtn', 'click', () => this.resetZoom());

    // Theme toggle
    this.bindEvent('themeToggle', 'click', () => this.toggleTheme());

    // Template modal
    this.bindEvent('closeTemplate', 'click', () => this.hideTemplateModal());

    // Editor events
    const umlCode = document.getElementById('umlCode');
    if (umlCode) {
      umlCode.addEventListener('input', this.debounce((e) => this.updateEditorStats(), 100));
      umlCode.addEventListener('paste', () => {
        setTimeout(() => this.updateEditorStats(), 10);
      });
    }

    // Modal events
    this.setupModalEvents();

    // Window events
    window.addEventListener('beforeunload', () => this.saveState());
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Visibility change for performance
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveState();
      }
    });
  }

  bindEvent(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener(event, handler);
    } else {
      console.warn(`Element not found: ${elementId}`);
    }
  }

  setupModalEvents() {
    // Fullscreen modal
    const fullscreenModal = document.getElementById('fullscreenModal');
    if (fullscreenModal) {
      fullscreenModal.addEventListener('click', (e) => {
        if (e.target === fullscreenModal) {
          this.closeFullscreen();
        }
      });
    }

    // Template modal
    const templateModal = document.getElementById('templateModal');
    if (templateModal) {
      templateModal.addEventListener('click', (e) => {
        if (e.target === templateModal) {
          this.hideTemplateModal();
        }
      });
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Prevent shortcuts when typing in input fields (except specific ones)
      if (e.target.tagName === 'INPUT' && e.target.type !== 'text') {
        return;
      }
      if (e.target.tagName === 'SELECT') {
        return;
      }

      const isModifierPressed = e.ctrlKey || e.metaKey;
      const isShiftPressed = e.shiftKey;

      // Editor shortcuts
      if (e.target.id === 'umlCode') {
        switch (e.key) {
        case 'Enter':
          if (isModifierPressed) {
            e.preventDefault();
            this.generateDiagram();
            this.announceToScreenReader('Generating diagram');
          }
          break;
        case 'Tab':
          e.preventDefault();
          this.insertTextAtCursor('  '); // 2-space indentation
          break;
        }
        return;
      }

      // Global shortcuts
      switch (e.key) {
      case 'Escape':
        this.closeAllModals();
        break;
      case 'F11':
        if (this.currentImageBlob) {
          e.preventDefault();
          this.openFullscreen();
        }
        break;
      case 'g':
        if (isModifierPressed) {
          e.preventDefault();
          this.generateDiagram();
        }
        break;
      case 'n':
        if (isModifierPressed) {
          e.preventDefault();
          this.clearCode();
          this.announceToScreenReader('Editor cleared');
        }
        break;
      case 't':
        if (isModifierPressed) {
          e.preventDefault();
          this.showTemplateModal();
        }
        break;
      case 'd':
        if (isModifierPressed && this.currentImageBlob) {
          e.preventDefault();
          this.downloadImage('png');
        }
        break;
      case 's':
        if (isModifierPressed) {
          e.preventDefault();
          this.saveState();
          this.showToast('Saved', 'Current work saved locally', 'success');
        }
        break;
      case '+':
      case '=':
        if (isModifierPressed && this.currentImageBlob) {
          e.preventDefault();
          this.zoomIn();
        }
        break;
      case '-':
        if (isModifierPressed && this.currentImageBlob) {
          e.preventDefault();
          this.zoomOut();
        }
        break;
      case '0':
        if (isModifierPressed && this.currentImageBlob) {
          e.preventDefault();
          this.resetZoom();
        }
        break;
      case '/':
        if (isModifierPressed) {
          e.preventDefault();
          this.showKeyboardShortcuts();
        }
        break;
      }
    });
  }

  setupAccessibilityFeatures() {
    // Focus management for modals
    this.setupFocusTrapping();

    // High contrast mode detection
    if (window.matchMedia('(prefers-contrast: high)').matches) {
      document.body.classList.add('high-contrast');
    }

    // Reduced motion detection
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
    }

    // Color scheme detection
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', (e) => {
      if (!localStorage.getItem('theme-preference')) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  setupFocusTrapping() {
    // Focus trapping for fullscreen modal
    const fullscreenModal = document.getElementById('fullscreenModal');
    if (fullscreenModal) {
      fullscreenModal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          this.trapFocus(e, fullscreenModal);
        }
      });
    }

    // Focus trapping for template modal
    const templateModal = document.getElementById('templateModal');
    if (templateModal) {
      templateModal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          this.trapFocus(e, templateModal);
        }
      });
    }
  }

  trapFocus(event, container) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  setupTouchGestures() {
    const imageContainer = document.getElementById('imageContainer');
    if (!imageContainer) {
      return;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartDistance = 0;
    let initialZoom = 1;

    imageContainer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        touchStartDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
        initialZoom = this.zoomLevel;
      }
    }, { passive: true });

    imageContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.currentImageBlob) {
        e.preventDefault();
        const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
        const zoomRatio = currentDistance / touchStartDistance;
        this.setZoom(initialZoom * zoomRatio);
      }
    });

    imageContainer.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Detect tap (small movement)
        if (distance < 10 && this.currentImageBlob) {
          this.openFullscreen();
        }
      }
    }, { passive: true });
  }

  getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  initializeEditor() {
    const umlCode = document.getElementById('umlCode');
    if (!umlCode) {
      return;
    }

    // Auto-resize textarea
    umlCode.addEventListener('input', () => {
      umlCode.style.height = 'auto';
      umlCode.style.height = umlCode.scrollHeight + 'px';
    });

    // Update stats on load
    this.updateEditorStats();
  }

  updateEditorStats() {
    const umlCode = document.getElementById('umlCode');
    const lineCountEl = document.getElementById('lineCount');
    const charCountEl = document.getElementById('charCount');

    if (!umlCode || !lineCountEl || !charCountEl) {
      return;
    }

    const content = umlCode.value;
    const lines = content.split('\n').length;
    const characters = content.length;

    this.editorStats = { lines, characters };

    lineCountEl.textContent = `Lines: ${lines}`;
    charCountEl.textContent = `Characters: ${characters}`;

    // Update aria-live region for screen readers
    const statsContainer = document.getElementById('editorStats');
    if (statsContainer) {
      statsContainer.setAttribute('aria-label', `Editor statistics: ${lines} lines, ${characters} characters`);
    }
  }

  async generateDiagram() {
    console.log('🚀 GENERATE DIAGRAM CALLED - NEW VERSION!');
    
    const umlCode = document.getElementById('umlCode').value.trim();
    const generateBtn = document.getElementById('generateBtn');
    const status = document.getElementById('status');
    const imageContainer = document.getElementById('imageContainer');

    if (!umlCode) {
      this.showStatus('Please enter PlantUML code', 'error');
      this.announceToScreenReader('Please enter PlantUML code before generating');
      return;
    }

    try {
      // Update UI state
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span class="loading-spinner"></span><span class="btn-text">Generating...</span>';
      generateBtn.classList.add('btn-loading');
      this.showStatus('Generating diagram...', 'loading');

      // Clear previous image
      this.clearImage();

      console.log('📡 Sending request to API...');

      const startTime = performance.now();
      
      // Get diagram type and format
      const diagramType = document.getElementById('diagramType')?.value || 'plantuml';
      const outputFormat = ['graphviz'].includes(diagramType) ? 'svg' : 'png';
      
      // Debug logging
      console.log('🔍 Request details:', {
        diagramType,
        outputFormat,
        codeLength: umlCode.length,
        codePreview: umlCode.substring(0, 100)
      });

      const requestBody = { 
        uml: umlCode,
        diagram_type: diagramType,
        output_format: outputFormat
      };
      
      console.log('📤 Sending to API:', {
        url: `${this.apiUrl}/api/v1/generate`,
        body: requestBody
      });

      // Send request to API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${this.apiUrl}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      this.performanceMetrics.apiResponseTime = performance.now() - startTime;

      if (!response.ok) {
        // Handle error response
        const errorData = await response.json().catch(() => null);
        let errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        
        // Provide better error messages for common D2 issues
        if (diagramType === 'd2' && errorMessage.includes('status 400')) {
          console.error('🚨 D2 Error Debug:', {
            originalError: errorMessage,
            codeLength: umlCode.length,
            codePreview: umlCode.substring(0, 200),
            diagramType,
            outputFormat
          });
          errorMessage = 'Invalid D2 syntax. Check console for details. D2 uses format: BoxA -> BoxB';
        }
        
        throw new Error(errorMessage);
      }

      // Get image blob
      const imageBlob = await response.blob();
      this.currentImageBlob = imageBlob;
      
      console.log('📸 Image received:', {
        size: imageBlob.size,
        type: imageBlob.type,
        format: outputFormat
      });

      // Revoke previous URL to prevent memory leaks
      if (this.currentImageUrl) {
        URL.revokeObjectURL(this.currentImageUrl);
      }

      // Create image URL and display
      const imageUrl = URL.createObjectURL(imageBlob);
      this.currentImageUrl = imageUrl;
      
      // For SVG, we need to set the correct MIME type
      if (outputFormat === 'svg' && !imageBlob.type.includes('svg')) {
        // Create a new blob with correct MIME type
        const svgBlob = new Blob([imageBlob], { type: 'image/svg+xml' });
        this.currentImageBlob = svgBlob;
        if (this.currentImageUrl) {
          URL.revokeObjectURL(this.currentImageUrl);
        }
        const svgUrl = URL.createObjectURL(svgBlob);
        this.currentImageUrl = svgUrl;
        this.displayImage(svgUrl);
      } else {
        this.displayImage(imageUrl);
      }

      // Cache diagram for offline use
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_DIAGRAM',
          payload: {
            id: Date.now().toString(),
            blob: imageBlob
          }
        });
      }

      // Add to history
      this.addToHistory(umlCode, imageUrl);

      // Update UI state
      this.showStatus('✅ Diagram generated successfully', 'success');
      this.enableImageControls();

      // Announce to screen readers
      this.announceToScreenReader('Diagram generated successfully. Image is now available for download or fullscreen viewing.');

      console.log('✅ Diagram generated successfully in', Math.round(this.performanceMetrics.apiResponseTime), 'ms');

    } catch (error) {
      console.error('❌ Generation failed:', error);

      let errorMessage = error.message;
      let userMessage = 'Generation failed';

      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout';
        userMessage = 'Request took too long. Please try again.';
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error';
        userMessage = 'Network connection failed. Check your internet connection.';

        // Store failed request for background sync
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
          this.storeFailedRequest({
            url: `${this.apiUrl}/api/v1/generate`,
            method: 'POST',
            body: JSON.stringify({ 
          uml: umlCode,
          diagram_type: document.getElementById('diagramType')?.value || 'plantuml',
          output_format: ['d2', 'mermaid', 'graphviz'].includes(document.getElementById('diagramType')?.value) ? 'svg' : 'png'
        }),
            timestamp: Date.now()
          });
        }
      }

      this.showStatus(`❌ ${userMessage}`, 'error');
      this.displayError(errorMessage);
      
      // Clear any previous image and disable download buttons
      this.clearImage();
      this.disableImageControls();
      this.currentImageBlob = null;
      if (this.currentImageUrl) {
        URL.revokeObjectURL(this.currentImageUrl);
        this.currentImageUrl = null;
      }

      // Show toast with more details
      this.showToast('Generation Failed', userMessage, 'error');

      // Announce to screen readers
      this.announceToScreenReader(`Error: ${userMessage}`);

    } finally {
      // Reset button state
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<span aria-hidden="true">🚀</span>Generate Diagram';
      generateBtn.classList.remove('btn-loading');
    }
  }

  displayImage(imageUrl) {
    const renderStart = performance.now();
    const imageContainer = document.getElementById('imageContainer');
    const diagramType = document.getElementById('diagramType')?.value || 'plantuml';

    // Check if this is an SVG
    const isSvg = ['graphviz'].includes(diagramType);
    
    if (isSvg) {
      // For SVG, fetch and embed directly for better compatibility
      fetch(imageUrl)
        .then(response => response.text())
        .then(svgText => {
          imageContainer.innerHTML = svgText;
          const svgElement = imageContainer.querySelector('svg');
          if (svgElement) {
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.transform = `scale(${this.zoomLevel})`;
            svgElement.style.transition = 'transform 0.2s ease';
          }
          
          this.performanceMetrics.renderTime = performance.now() - renderStart;
          console.log('🖼️ SVG rendered in', Math.round(this.performanceMetrics.renderTime), 'ms');
          
          // Update description for screen readers
          const description = document.getElementById('diagram-description');
          if (description) {
            description.textContent = `${diagramType.toUpperCase()} diagram generated successfully`;
          }
        })
        .catch(error => {
          console.error('Failed to load SVG:', error);
          this.displayError('Failed to load generated SVG image');
        });
    } else {
      // For PNG/other formats, use img element
      const img = new Image();
      img.onload = () => {
        this.performanceMetrics.renderTime = performance.now() - renderStart;
        console.log('🖼️ Image rendered in', Math.round(this.performanceMetrics.renderTime), 'ms');

        // Update description for screen readers
        const description = document.getElementById('diagram-description');
        if (description) {
          description.textContent = `${diagramType.toUpperCase()} diagram generated successfully`;
        }
      };

      img.onerror = () => {
        this.displayError('Failed to load generated image');
      };

      img.src = imageUrl;
      img.alt = 'Generated Diagram';
      img.style.transform = `scale(${this.zoomLevel})`;
      img.style.transition = 'transform 0.2s ease';

      imageContainer.innerHTML = '';
      imageContainer.appendChild(img);
    }

    // Reset zoom level
    this.zoomLevel = 1;
    this.updateZoomControls();
  }

  displayError(message) {
    const imageContainer = document.getElementById('imageContainer');
    imageContainer.innerHTML = `
            <div class="placeholder placeholder-error">
                <span class="placeholder-icon" aria-hidden="true">⚠️</span>
                <h3>Generation Error</h3>
                <p id="diagram-description">${this.escapeHtml(message)}</p>
                <p class="placeholder-hint">Please check your PlantUML syntax and try again</p>
            </div>
        `;

    // Update image container role
    imageContainer.setAttribute('role', 'alert');
    imageContainer.setAttribute('aria-live', 'polite');
  }

  clearImage() {
    const imageContainer = document.getElementById('imageContainer');
    imageContainer.innerHTML = `
            <div class="placeholder">
                <span class="placeholder-icon" aria-hidden="true">📊</span>
                <h3>Ready to Generate</h3>
                <p id="diagram-description">Your UML diagram will appear here</p>
                <p class="placeholder-hint">Enter PlantUML code and click "Generate Diagram"</p>
            </div>
        `;

    // Clean up
    this.disableImageControls();
    if (this.currentImageUrl) {
      URL.revokeObjectURL(this.currentImageUrl);
      this.currentImageUrl = null;
    }
    this.currentImageBlob = null;
    this.zoomLevel = 1;

    // Reset container attributes
    imageContainer.setAttribute('role', 'img');
    imageContainer.setAttribute('aria-live', 'polite');
  }

  enableImageControls() {
    const controls = [
      'downloadPngBtn', 'downloadSvgBtn', 'copyLinkBtn', 'fullscreenBtn',
      'zoomInBtn', 'zoomOutBtn', 'resetZoomBtn'
    ];

    controls.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.disabled = false;
        element.setAttribute('aria-disabled', 'false');
      }
    });
  }

  disableImageControls() {
    const controls = [
      'downloadPngBtn', 'downloadSvgBtn', 'copyLinkBtn', 'fullscreenBtn',
      'zoomInBtn', 'zoomOutBtn', 'resetZoomBtn'
    ];

    controls.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.disabled = true;
        element.setAttribute('aria-disabled', 'true');
      }
    });
  }

  showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (!status) {
      return;
    }

    status.textContent = message;
    status.className = `status status-${type}`;

    // Clear success messages after delay
    if (type === 'success') {
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 3000);
    }

    // Announce important status changes
    if (type === 'error' || type === 'success') {
      this.announceToScreenReader(message);
    }
  }

  loadExample() {
    const diagramType = document.getElementById('diagramType')?.value || 'plantuml';
    
    const examples = {
      'plantuml': `@startuml
!theme plain
title UML Images Service - Example Sequence Diagram

actor User
participant "UI Service" as ui
participant "API Service" as api
participant "Kroki Service" as kroki

User -> ui: Opens web interface
activate ui
ui -> User: Shows editor form

User -> ui: Enters PlantUML code
User -> ui: Clicks "Generate"

ui -> api: POST /api/v1/generate
activate api
api -> kroki: Render request
activate kroki
kroki -> api: Returns PNG image
deactivate kroki
api -> ui: Returns image
deactivate api
ui -> User: Displays diagram
deactivate ui

note right of User: Modern, accessible\\nUML diagram service

@enduml`,
      'graphviz': `digraph SystemFlow {
  rankdir=LR;
  node [shape=box, style="rounded,filled", fillcolor=lightblue];
  
  Start [fillcolor="#90EE90"];
  Process [fillcolor="#87CEEB"];
  Decision [shape=diamond, fillcolor="#FFE4B5"];
  Success [fillcolor="#98FB98"];
  Retry [fillcolor="#FFA07A"];
  End [fillcolor="#DDA0DD"];
  
  Start -> Process;
  Process -> Decision [label="Check"];
  Decision -> Success [label="Yes"];
  Decision -> Retry [label="No"];
  Retry -> Process;
  Success -> End;
}`
    };

    const umlCodeElement = document.getElementById('umlCode');
    if (umlCodeElement) {
      umlCodeElement.value = examples[diagramType] || examples['plantuml'];
      umlCodeElement.focus();
      this.updateEditorStats();
    }

    this.showStatus(`${diagramType.toUpperCase()} example loaded. Click "Generate Diagram" to create.`, 'success');
    this.announceToScreenReader(`${diagramType} example code loaded into editor`);
  }

  clearCode() {
    const umlCodeElement = document.getElementById('umlCode');
    if (umlCodeElement) {
      umlCodeElement.value = '';
      umlCodeElement.focus();
      this.updateEditorStats();
    }

    this.clearImage();
    this.showStatus('Editor cleared', 'success');
    this.announceToScreenReader('Editor cleared');
  }
  
  updatePlaceholderForDiagramType(type) {
    const textarea = document.getElementById('umlCode');
    const placeholders = {
      'plantuml': 'Enter your PlantUML code here...\n\nExample:\n@startuml\nAlice -> Bob: Hello\nBob -> Alice: Hi there\n@enduml',
      'graphviz': 'Enter your Graphviz DOT code here...\n\nExample:\ndigraph G {\n  A -> B;\n  B -> C;\n  C -> A;\n}'
    };
    
    if (textarea && placeholders[type]) {
      textarea.placeholder = placeholders[type];
    }
    
    // Update status message
    this.showStatus(`Switched to ${type.toUpperCase()} mode`, 'info');
  }

  downloadImage(format = 'png') {
    if (!this.currentImageBlob) {
      this.showStatus('No image available for download', 'error');
      this.showToast('Download Failed', 'No diagram available to download', 'error');
      return;
    }

    try {
      const diagramType = document.getElementById('diagramType')?.value || 'plantuml';
      
      // Determine actual format based on diagram type
      let actualFormat = format;
      if (['graphviz'].includes(diagramType)) {
        actualFormat = 'svg'; // These types only support SVG
      }
      
      // Ensure blob has correct MIME type
      let downloadBlob = this.currentImageBlob;
      if (actualFormat === 'svg' && !this.currentImageBlob.type.includes('svg')) {
        downloadBlob = new Blob([this.currentImageBlob], { type: 'image/svg+xml' });
      }
      
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

      a.href = url;
      a.download = `${diagramType}-diagram-${timestamp}.${actualFormat}`;
      a.style.display = 'none';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 100);

      this.showStatus(`Diagram downloaded as ${actualFormat.toUpperCase()}`, 'success');
      this.showToast('Download Complete', `${diagramType.toUpperCase()} diagram saved as ${actualFormat.toUpperCase()}`, 'success');
      this.announceToScreenReader(`Diagram downloaded as ${actualFormat} file`);

    } catch (error) {
      console.error('Download failed:', error);
      this.showStatus('Download failed', 'error');
      this.showToast('Download Failed', 'Failed to download the diagram', 'error');
    }
  }

  openFullscreen() {
    const img = document.querySelector('#imageContainer img');
    const modal = document.getElementById('fullscreenModal');
    const fullscreenImg = document.getElementById('fullscreenImage');

    if (!img || !modal || !fullscreenImg) {
      return;
    }

    // Set up fullscreen image
    fullscreenImg.src = img.src;
    fullscreenImg.alt = img.alt;

    // Show modal with accessibility support
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus the close button for keyboard users
    const closeBtn = document.getElementById('closeFullscreen');
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 100);
    }

    // Announce to screen readers
    this.announceToScreenReader('Diagram opened in fullscreen view. Press Escape to close.');

    console.log('🔍 Fullscreen mode activated');
  }

  closeFullscreen() {
    const modal = document.getElementById('fullscreenModal');
    if (!modal) {
      return;
    }

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Return focus to the fullscreen button
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.focus();
    }

    console.log('❌ Fullscreen mode deactivated');
  }

  async checkServiceStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const apiResponse = await fetch(`${this.apiUrl}/api/v1/status`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const apiStatus = document.getElementById('apiStatus');
      const krokiStatus = document.getElementById('krokiStatus');
      const apiStatusText = document.getElementById('apiStatusText');
      const krokiStatusText = document.getElementById('krokiStatusText');

      if (apiResponse.ok) {
        const statusData = await apiResponse.json();

        // Update API status
        const apiDot = apiStatus?.querySelector('.status-dot');
        if (apiDot) {
          apiDot.className = 'status-dot healthy';
          if (apiStatusText) {
            apiStatusText.textContent = 'API service is healthy';
          }
        }

        // Update Kroki status
        const krokiDot = krokiStatus?.querySelector('.status-dot');
        if (krokiDot) {
          if (statusData.kroki_service === 'healthy') {
            krokiDot.className = 'status-dot healthy';
            if (krokiStatusText) {
              krokiStatusText.textContent = 'Kroki service is healthy';
            }
          } else {
            krokiDot.className = 'status-dot unhealthy';
            if (krokiStatusText) {
              krokiStatusText.textContent = 'Kroki service is unavailable';
            }
          }
        }

        // Update online status
        if (this.isOffline) {
          this.handleOnline();
        }

      } else {
        throw new Error(`API service unavailable (${apiResponse.status})`);
      }

    } catch (error) {
      console.warn('Service status check failed:', error);

      // Mark services as unhealthy
      document.querySelectorAll('.status-dot').forEach(dot => {
        dot.className = 'status-dot unhealthy';
      });

      // Update screen reader text
      const apiStatusText = document.getElementById('apiStatusText');
      const krokiStatusText = document.getElementById('krokiStatusText');
      if (apiStatusText) {
        apiStatusText.textContent = 'API service is unavailable';
      }
      if (krokiStatusText) {
        krokiStatusText.textContent = 'Kroki service is unavailable';
      }

      // Handle potential offline state
      if (error.name === 'AbortError' || error.message.includes('NetworkError')) {
        this.handleOffline();
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility methods
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  insertTextAtCursor(text) {
    const textarea = document.getElementById('umlCode');
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();

    this.updateEditorStats();
  }

  closeAllModals() {
    this.closeFullscreen();
    this.hideTemplateModal();
  }

  // ===============================================
  // New Advanced Features
  // ===============================================

  // Theme Management
  async initializeTheme() {
    const savedTheme = localStorage.getItem('theme-preference');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    this.isDarkMode = savedTheme ? savedTheme === 'dark' : systemDark;
    this.setTheme(this.isDarkMode ? 'dark' : 'light');
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.setTheme(this.isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme-preference', this.isDarkMode ? 'dark' : 'light');

    this.announceToScreenReader(`Switched to ${this.isDarkMode ? 'dark' : 'light'} theme`);
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    }
  }

  // Service Worker Integration
  async initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('SW registered:', registration);

        // Listen for SW messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          this.handleServiceWorkerMessage(event.data);
        });

        // Check for updates
        registration.addEventListener('updatefound', () => {
          this.handleServiceWorkerUpdate(registration);
        });

      } catch (error) {
        console.warn('SW registration failed:', error);
      }
    }
  }

  handleServiceWorkerMessage(data) {
    const { type, payload } = data;

    switch (type) {
    case 'diagram-synced':
      if (payload.success) {
        this.showToast('Sync Complete', 'Offline diagram has been processed', 'success');
      }
      break;
    }
  }

  handleServiceWorkerUpdate(registration) {
    const newWorker = registration.installing;
    if (newWorker) {
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.showToast(
            'Update Available',
            'A new version is ready. Refresh to update.',
            'info'
          );
        }
      });
    }
  }

  // Offline Detection
  setupOfflineDetection() {
    this.isOffline = !navigator.onLine;
    if (this.isOffline) {
      this.handleOffline();
    }
  }

  handleOnline() {
    if (this.isOffline) {
      this.isOffline = false;
      this.showToast('Back Online', 'Internet connection restored', 'success');
      this.announceToScreenReader('Internet connection restored');

      // Remove offline indicator
      document.body.classList.remove('offline-mode');
    }
  }

  handleOffline() {
    if (!this.isOffline) {
      this.isOffline = true;
      this.showToast('Offline Mode', 'Limited functionality available', 'warning');
      this.announceToScreenReader('Application is now in offline mode. Limited functionality available.');

      // Add offline indicator
      document.body.classList.add('offline-mode');
    }
  }

  // Template System
  showTemplateModal() {
    const modal = document.getElementById('templateModal');
    const grid = document.getElementById('templateGrid');

    if (!modal || !grid) {
      return;
    }

    // Populate template grid
    grid.innerHTML = this.templates.map(template => `
            <div class="template-item" tabindex="0" data-template-id="${template.id}" role="button" aria-label="Select ${template.name} template">
                <div class="template-preview">
                    <span>${this.getTemplateIcon(template.category)}</span>
                </div>
                <div class="template-name">${template.name}</div>
                <div class="template-description">${template.description}</div>
            </div>
        `).join('');

    // Add event listeners
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.template-item');
      if (item) {
        this.selectTemplate(item.dataset.templateId);
      }
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('.template-item');
        if (item) {
          e.preventDefault();
          this.selectTemplate(item.dataset.templateId);
        }
      }
    });

    // Show modal
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first template
    const firstTemplate = grid.querySelector('.template-item');
    if (firstTemplate) {
      setTimeout(() => firstTemplate.focus(), 100);
    }

    this.announceToScreenReader('Template chooser opened. Use arrow keys to navigate templates.');
  }

  hideTemplateModal() {
    const modal = document.getElementById('templateModal');
    if (!modal) {
      return;
    }

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Return focus to template button
    const templateBtn = document.getElementById('templateBtn');
    if (templateBtn) {
      templateBtn.focus();
    }
  }

  selectTemplate(templateId) {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) {
      return;
    }

    const umlCode = document.getElementById('umlCode');
    if (umlCode) {
      umlCode.value = template.code;
      this.updateEditorStats();
    }

    this.hideTemplateModal();
    this.showStatus(`Template "${template.name}" loaded`, 'success');
    this.announceToScreenReader(`${template.name} template loaded`);

    // Focus the editor
    setTimeout(() => {
      if (umlCode) {
        umlCode.focus();
      }
    }, 100);
  }

  getTemplateIcon(category) {
    const icons = {
      sequence: '🔄',
      class: '📋',
      activity: '⚡',
      usecase: '👤',
      component: '🧩',
      deployment: '🌐'
    };
    return icons[category] || '📊';
  }

  // Zoom Controls
  zoomIn() {
    this.setZoom(Math.min(this.zoomLevel * 1.25, 3));
  }

  zoomOut() {
    this.setZoom(Math.max(this.zoomLevel / 1.25, 0.25));
  }

  resetZoom() {
    this.setZoom(1);
  }

  setZoom(level) {
    this.zoomLevel = level;
    const img = document.querySelector('#imageContainer img');
    if (img) {
      img.style.transform = `scale(${level})`;
    }

    this.updateZoomControls();
    this.announceToScreenReader(`Zoom level: ${Math.round(level * 100)}%`);
  }

  updateZoomControls() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');

    if (zoomInBtn) {
      zoomInBtn.disabled = this.zoomLevel >= 3;
    }
    if (zoomOutBtn) {
      zoomOutBtn.disabled = this.zoomLevel <= 0.25;
    }
    if (resetZoomBtn) {
      resetZoomBtn.disabled = this.zoomLevel === 1;
    }
  }

  // History Management
  addToHistory(code, imageUrl) {
    const historyItem = {
      id: Date.now(),
      code,
      imageUrl,
      timestamp: new Date().toISOString(),
      stats: { ...this.editorStats }
    };

    this.diagramHistory.unshift(historyItem);

    // Keep only last 10 items
    if (this.diagramHistory.length > 10) {
      this.diagramHistory = this.diagramHistory.slice(0, 10);
    }

    this.saveState();
  }

  // State Persistence
  async loadSavedState() {
    try {
      const savedState = localStorage.getItem('uml-service-state');
      if (savedState) {
        const state = JSON.parse(savedState);

        if (state.code) {
          const umlCode = document.getElementById('umlCode');
          if (umlCode) {
            umlCode.value = state.code;
            this.updateEditorStats();
          }
        }

        if (state.history) {
          this.diagramHistory = state.history;
        }
      }
    } catch (error) {
      console.warn('Failed to load saved state:', error);
    }
  }

  saveState() {
    try {
      const umlCode = document.getElementById('umlCode');
      const state = {
        code: umlCode?.value || '',
        history: this.diagramHistory,
        timestamp: Date.now()
      };

      localStorage.setItem('uml-service-state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save state:', error);
    }
  }

  // Share Functionality
  async copyShareLink() {
    if (!this.currentImageBlob) {
      this.showToast('Share Failed', 'No diagram available to share', 'error');
      return;
    }

    try {
      const umlCode = document.getElementById('umlCode')?.value || '';
      const encodedCode = btoa(encodeURIComponent(umlCode));
      const shareUrl = `${window.location.origin}${window.location.pathname}?code=${encodedCode}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        this.showToast('Link Copied', 'Share link copied to clipboard', 'success');
        this.announceToScreenReader('Share link copied to clipboard');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        this.showToast('Link Copied', 'Share link copied to clipboard', 'success');
      }
    } catch (error) {
      console.error('Failed to copy share link:', error);
      this.showToast('Share Failed', 'Failed to copy share link', 'error');
    }
  }

  // Toast Notifications
  showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      return;
    }

    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `
            <div class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${this.escapeHtml(title)}</div>
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close notification">
                <span aria-hidden="true">×</span>
            </button>
        `;

    // Add close functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.removeToast(toastId));

    // Auto-remove after delay
    const delay = type === 'error' ? 8000 : 4000;
    setTimeout(() => this.removeToast(toastId), delay);

    container.appendChild(toast);
  }

  removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }
  }

  // Screen Reader Announcements
  announceToScreenReader(message, priority = 'polite') {
    if (this.screenReaderAnnouncements) {
      this.screenReaderAnnouncements.announce(message, priority);
    }
  }

  // Loading Screen Management
  showLoadingScreen() {
    const loading = document.getElementById('appLoading');
    if (loading) {
      loading.classList.remove('hidden');
    }
  }

  hideLoadingScreen() {
    const loading = document.getElementById('appLoading');
    if (loading) {
      loading.classList.add('hidden');
      // Remove from DOM after animation
      setTimeout(() => {
        if (loading.parentNode) {
          loading.parentNode.removeChild(loading);
        }
      }, 300);
    }
  }

  // Keyboard Shortcuts Help
  showKeyboardShortcuts() {
    const shortcuts = [
      { keys: 'Ctrl/Cmd + Enter', action: 'Generate diagram' },
      { keys: 'Ctrl/Cmd + N', action: 'Clear editor' },
      { keys: 'Ctrl/Cmd + T', action: 'Open templates' },
      { keys: 'Ctrl/Cmd + D', action: 'Download diagram' },
      { keys: 'Ctrl/Cmd + S', action: 'Save current work' },
      { keys: 'F11', action: 'Open fullscreen' },
      { keys: 'Ctrl/Cmd + Plus', action: 'Zoom in' },
      { keys: 'Ctrl/Cmd + Minus', action: 'Zoom out' },
      { keys: 'Ctrl/Cmd + 0', action: 'Reset zoom' },
      { keys: 'Escape', action: 'Close modals' }
    ];

    const shortcutsList = shortcuts.map(s => `• ${s.keys}: ${s.action}`).join('\n');

    this.showToast(
      'Keyboard Shortcuts',
      shortcutsList,
      'info'
    );
  }

  // Failed Request Storage (for offline sync)
  storeFailedRequest(request) {
    try {
      const failedRequests = JSON.parse(localStorage.getItem('failed-requests') || '[]');
      failedRequests.push({
        ...request,
        id: Date.now().toString()
      });

      // Keep only last 10 failed requests
      if (failedRequests.length > 10) {
        failedRequests.splice(0, failedRequests.length - 10);
      }

      localStorage.setItem('failed-requests', JSON.stringify(failedRequests));

      // Register background sync if available
      if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready.then(registration => {
          return registration.sync.register('background-diagram-sync');
        }).catch(error => {
          console.warn('Background sync registration failed:', error);
        });
      }
    } catch (error) {
      console.warn('Failed to store failed request:', error);
    }
  }
}

// Helper Classes
class KeyboardNavigationManager {
  constructor() {
    this.focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  }

  getFocusableElements(container = document) {
    return Array.from(container.querySelectorAll(this.focusableElements))
      .filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
  }

  moveFocus(direction, container = document) {
    const focusableElements = this.getFocusableElements(container);
    const currentIndex = focusableElements.indexOf(document.activeElement);

    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % focusableElements.length;
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = focusableElements.length - 1;
      }
    }

    focusableElements[nextIndex]?.focus();
  }
}

class ScreenReaderManager {
  constructor() {
    this.createAnnouncementRegion();
  }

  createAnnouncementRegion() {
    if (!document.getElementById('sr-announcements')) {
      const div = document.createElement('div');
      div.id = 'sr-announcements';
      div.className = 'sr-only';
      div.setAttribute('aria-live', 'polite');
      div.setAttribute('aria-atomic', 'true');
      document.body.appendChild(div);
    }
  }

  announce(message, priority = 'polite') {
    const region = document.getElementById('sr-announcements');
    if (region) {
      region.setAttribute('aria-live', priority);
      region.textContent = message;

      // Clear after a delay to allow for re-announcements
      setTimeout(() => {
        region.textContent = '';
      }, 1000);
    }
  }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.umlService = new UMLImageService();
});

// Handle page visibility for performance
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.umlService) {
    // Page became visible, check service status
    window.umlService.checkServiceStatus();
  }
});

// Handle page unload
window.addEventListener('beforeunload', (e) => {
  if (window.umlService) {
    window.umlService.saveState();
  }
});

// Performance monitoring
if ('performance' in window && 'observer' in window.PerformanceObserver.prototype) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        console.log('Page load time:', Math.round(entry.loadEventEnd - entry.loadEventStart), 'ms');
      }
    }
  });

  observer.observe({ entryTypes: ['navigation'] });
}

// Error handling
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  if (window.umlService) {
    window.umlService.showToast('Application Error', 'An unexpected error occurred', 'error');
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  if (window.umlService) {
    window.umlService.showToast('Application Error', 'An unexpected error occurred', 'error');
  }
});