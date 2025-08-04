// global-setup.js
const { chromium } = require('@playwright/test');

async function globalSetup() {
  console.log('🔧 Global E2E Test Setup');
  
  // Wait for services to be ready if running in CI
  if (process.env.CI) {
    console.log('⏳ Waiting for services to be ready...');
    
    const maxWaitTime = 120000; // 2 minutes
    const checkInterval = 2000; // 2 seconds
    const startTime = Date.now();
    
    const apiUrl = process.env.API_URL || 'http://localhost:9001';
    const uiUrl = process.env.UI_URL || 'http://localhost:9002';
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if services are responding
        const responses = await Promise.all([
          fetch(`${apiUrl}/health`).then(r => r.ok),
          fetch(`${uiUrl}/health`).then(r => r.ok)
        ]);
        
        if (responses.every(ok => ok)) {
          console.log('✅ All services are ready');
          break;
        }
      } catch (error) {
        // Services not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    if (Date.now() - startTime >= maxWaitTime) {
      throw new Error('Services did not become ready within the timeout period');
    }
  }
  
  // Optional: Launch a browser for shared context
  const browser = await chromium.launch();
  
  // Store browser instance for cleanup
  global.__BROWSER__ = browser;
  
  console.log('✅ Global setup completed');
}

module.exports = globalSetup;