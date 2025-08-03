import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const diagramGenerations = new Counter('diagram_generations');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
    error_rate: ['rate<0.1'],          // Custom error rate below 10%
  },
};

// Environment variables
const API_URL = __ENV.API_URL || 'http://localhost:9001';
const UI_URL = __ENV.UI_URL || 'http://localhost:9002';

// Test data - various UML diagrams
const testDiagrams = [
  {
    name: 'Simple Sequence',
    uml: '@startuml\nAlice -> Bob: Hello\nBob -> Alice: Hi\n@enduml'
  },
  {
    name: 'Class Diagram',
    uml: '@startuml\nclass Car {\n  +start()\n  +stop()\n}\nclass Engine\nCar --> Engine\n@enduml'
  },
  {
    name: 'Activity Diagram',
    uml: '@startuml\nstart\n:Read input;\n:Process data;\nif (valid?) then (yes)\n  :Save result;\nelse (no)\n  :Show error;\nendif\nstop\n@enduml'
  },
  {
    name: 'Use Case',
    uml: '@startuml\nactor User\nrectangle System {\n  User --> (Login)\n  User --> (Generate Diagram)\n}\n@enduml'
  },
  {
    name: 'Component Diagram',
    uml: '@startuml\npackage "Web Layer" {\n  [UI Service]\n}\npackage "API Layer" {\n  [API Service]\n}\n[UI Service] --> [API Service]\n@enduml'
  }
];

export function setup() {
  // Setup phase - verify services are running
  console.log('Starting load test setup...');
  
  // Check API health
  const apiHealth = http.get(`${API_URL}/health`);
  check(apiHealth, {
    'API service is healthy': (r) => r.status === 200,
  });
  
  // Check UI health
  const uiHealth = http.get(`${UI_URL}/health`);
  check(uiHealth, {
    'UI service is healthy': (r) => r.status === 200,
  });
  
  console.log('Setup complete. Starting load test...');
  return { apiUrl: API_URL, uiUrl: UI_URL };
}

export default function(data) {
  // Test scenario: Mix of UI and API requests
  const scenario = Math.random();
  
  if (scenario < 0.7) {
    // 70% - Direct API requests (diagram generation)
    testDiagramGeneration(data.apiUrl);
  } else {
    // 30% - UI requests (static assets, config)
    testUIRequests(data.uiUrl);
  }
  
  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}

function testDiagramGeneration(apiUrl) {
  const diagram = testDiagrams[Math.floor(Math.random() * testDiagrams.length)];
  
  const payload = JSON.stringify({
    uml: diagram.uml,
    format: 'png'
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
    },
    timeout: '30s',
  };
  
  const startTime = Date.now();
  const response = http.post(`${apiUrl}/api/v1/generate`, payload, params);
  const endTime = Date.now();
  
  const success = check(response, {
    'diagram generation status is 200': (r) => r.status === 200,
    'response time < 10s': (r) => r.timings.duration < 10000,
    'response has content': (r) => r.body && r.body.length > 0,
    'content type is image': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('image'),
  });
  
  // Record custom metrics
  errorRate.add(!success);
  responseTime.add(endTime - startTime);
  diagramGenerations.add(1);
  
  if (!success) {
    console.log(`Diagram generation failed: ${diagram.name}, Status: ${response.status}`);
  }
}

function testUIRequests(uiUrl) {
  const requests = [
    { name: 'UI Home', url: `${uiUrl}/` },
    { name: 'UI Config', url: `${uiUrl}/config` },
    { name: 'UI Health', url: `${uiUrl}/health` },
  ];
  
  const request = requests[Math.floor(Math.random() * requests.length)];
  
  const response = http.get(request.url, {
    headers: {
      'User-Agent': 'k6-load-test/1.0',
    },
    timeout: '10s',
  });
  
  const success = check(response, {
    [`${request.name} status is 200`]: (r) => r.status === 200,
    [`${request.name} response time < 2s`]: (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success);
  
  if (!success) {
    console.log(`UI request failed: ${request.name}, Status: ${response.status}`);
  }
}

export function teardown(data) {
  console.log('Load test completed.');
  
  // Optional: Send test results to monitoring system
  const results = {
    timestamp: new Date().toISOString(),
    apiUrl: data.apiUrl,
    uiUrl: data.uiUrl,
    totalDiagramGenerations: diagramGenerations.count,
  };
  
  console.log('Test Results:', JSON.stringify(results, null, 2));
}