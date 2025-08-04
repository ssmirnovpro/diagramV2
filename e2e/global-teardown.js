// global-teardown.js

async function globalTeardown() {
  console.log('🧹 Global E2E Test Teardown');

  // Clean up global browser if it was created
  if (global.__BROWSER__) {
    await global.__BROWSER__.close();
    console.log('✅ Browser closed');
  }

  // Clean up any test artifacts
  try {
    const fs = require('fs');
    const path = require('path');

    // Clean up temporary test files
    const tempFiles = ['/tmp/test_diagram.png'];
    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`🗑️  Cleaned up: ${file}`);
      }
    }

    // Clean up playwright artifacts if they exist
    const artifactDirs = [
      path.join(__dirname, 'test-results'),
      path.join(__dirname, 'playwright-report')
    ];

    for (const dir of artifactDirs) {
      if (fs.existsSync(dir)) {
        console.log(`📁 Keeping artifacts in: ${dir}`);
      }
    }

  } catch (error) {
    console.warn('⚠️  Error during cleanup:', error.message);
  }

  console.log('✅ Global teardown completed');
}

module.exports = globalTeardown;