// UML Images Service - Frontend Application
class UMLImageService {
    constructor() {
        this.apiUrl = null;
        this.currentImageBlob = null;
        this.init();
    }

    async init() {
        // Load API configuration
        await this.loadConfig();
        
        // Initialize event listeners
        this.setupEventListeners();
        
        // Check service status
        this.checkServiceStatus();
        
        // Set up periodic status checks
        setInterval(() => this.checkServiceStatus(), 30000); // Every 30 seconds
        
        console.log('🚀 UML Images Service initialized');
    }

    async loadConfig() {
        try {
            const response = await fetch('/config');
            const config = await response.json();
            this.apiUrl = config.apiUrl;
            console.log('📝 Configuration loaded:', config);
        } catch (error) {
            console.error('❌ Failed to load configuration:', error);
            this.apiUrl = 'http://localhost:9001'; // Fallback
        }
    }

    setupEventListeners() {
        // Buttons
        document.getElementById('generateBtn').addEventListener('click', () => this.generateDiagram());
        document.getElementById('exampleBtn').addEventListener('click', () => this.loadExample());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearCode());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadImage());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.openFullscreen());
        document.getElementById('closeFullscreen').addEventListener('click', () => this.closeFullscreen());
        
        // Keyboard shortcuts
        document.getElementById('umlCode').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generateDiagram();
            }
        });
        
        // Fullscreen modal click outside to close
        document.getElementById('fullscreenModal').addEventListener('click', (e) => {
            if (e.target.id === 'fullscreenModal') {
                this.closeFullscreen();
            }
        });
        
        // Escape key to close fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeFullscreen();
            }
        });
    }

    async generateDiagram() {
        const umlCode = document.getElementById('umlCode').value.trim();
        const generateBtn = document.getElementById('generateBtn');
        const status = document.getElementById('status');
        const imageContainer = document.getElementById('imageContainer');
        
        if (!umlCode) {
            this.showStatus('Пожалуйста, введите PlantUML код', 'error');
            return;
        }

        try {
            // Update UI state
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<span class="loading-spinner"></span>Генерация...';
            this.showStatus('Генерация диаграммы...', 'loading');
            
            // Clear previous image
            this.clearImage();
            
            console.log('📡 Sending request to API...');
            
            // Send request to API
            const response = await fetch(`${this.apiUrl}/api/v1/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uml: umlCode })
            });
            
            if (!response.ok) {
                // Handle error response
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }
            
            // Get image blob
            const imageBlob = await response.blob();
            this.currentImageBlob = imageBlob;
            
            // Create image URL and display
            const imageUrl = URL.createObjectURL(imageBlob);
            this.displayImage(imageUrl);
            
            // Update UI state
            this.showStatus('✅ Диаграмма успешно сгенерирована', 'success');
            this.enableImageControls();
            
            console.log('✅ Diagram generated successfully');
            
        } catch (error) {
            console.error('❌ Generation failed:', error);
            this.showStatus(`❌ Ошибка: ${error.message}`, 'error');
            this.displayError(error.message);
        } finally {
            // Reset button state
            generateBtn.disabled = false;
            generateBtn.innerHTML = '🚀 Сгенерировать диаграмму';
        }
    }

    displayImage(imageUrl) {
        const imageContainer = document.getElementById('imageContainer');
        imageContainer.innerHTML = `<img src="${imageUrl}" alt="Generated UML Diagram" />`;
    }

    displayError(message) {
        const imageContainer = document.getElementById('imageContainer');
        imageContainer.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">⚠️</div>
                <p><strong>Ошибка генерации</strong></p>
                <p class="placeholder-hint">${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    clearImage() {
        const imageContainer = document.getElementById('imageContainer');
        imageContainer.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">📊</div>
                <p>Здесь появится ваша диаграмма</p>
                <p class="placeholder-hint">Введите PlantUML код и нажмите "Сгенерировать диаграмму"</p>
            </div>
        `;
        this.disableImageControls();
        this.currentImageBlob = null;
    }

    enableImageControls() {
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('fullscreenBtn').disabled = false;
    }

    disableImageControls() {
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('fullscreenBtn').disabled = true;
    }

    showStatus(message, type = 'info') {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        
        if (type === 'success') {
            setTimeout(() => {
                status.textContent = '';
                status.className = 'status';
            }, 3000);
        }
    }

    loadExample() {
        const exampleCode = `@startuml
!theme plain
title Пример UML диаграммы

actor Пользователь as user
participant "UI Service" as ui
participant "API Service" as api
participant "Kroki Service" as kroki

user -> ui: Открывает веб-интерфейс
ui -> user: Показывает форму

user -> ui: Вводит PlantUML код
user -> ui: Нажимает "Генерировать"

ui -> api: POST /api/v1/generate
api -> kroki: Запрос рендеринга
kroki -> api: Возвращает PNG
api -> ui: Возвращает изображение
ui -> user: Показывает диаграмму

@enduml`;
        
        document.getElementById('umlCode').value = exampleCode;
        this.showStatus('Пример загружен. Нажмите "Сгенерировать диаграмму"', 'success');
    }

    clearCode() {
        document.getElementById('umlCode').value = '';
        this.clearImage();
        this.showStatus('Код очищен', 'success');
    }

    downloadImage() {
        if (!this.currentImageBlob) {
            this.showStatus('Нет изображения для скачивания', 'error');
            return;
        }

        const url = URL.createObjectURL(this.currentImageBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `uml-diagram-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showStatus('Изображение загружено', 'success');
    }

    openFullscreen() {
        const img = document.querySelector('#imageContainer img');
        if (!img) return;
        
        const modal = document.getElementById('fullscreenModal');
        const fullscreenImg = document.getElementById('fullscreenImage');
        
        fullscreenImg.src = img.src;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeFullscreen() {
        const modal = document.getElementById('fullscreenModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    async checkServiceStatus() {
        try {
            // Check API service
            const apiResponse = await fetch(`${this.apiUrl}/api/v1/status`, {
                method: 'GET',
                timeout: 5000
            });
            
            const apiStatus = document.getElementById('apiStatus');
            const krokiStatus = document.getElementById('krokiStatus');
            
            if (apiResponse.ok) {
                const statusData = await apiResponse.json();
                
                // Update API status
                const apiDot = apiStatus.querySelector('.status-dot');
                apiDot.className = 'status-dot healthy';
                
                // Update Kroki status
                const krokiDot = krokiStatus.querySelector('.status-dot');
                if (statusData.kroki_service === 'healthy') {
                    krokiDot.className = 'status-dot healthy';
                } else {
                    krokiDot.className = 'status-dot unhealthy';
                }
            } else {
                throw new Error('API service unavailable');
            }
            
        } catch (error) {
            console.warn('Service status check failed:', error);
            
            // Mark services as unhealthy
            document.querySelectorAll('.status-dot').forEach(dot => {
                dot.className = 'status-dot unhealthy';
            });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.umlService = new UMLImageService();
});

// Handle service worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Service worker can be implemented later for offline capabilities
        console.log('Service Worker support detected');
    });
}