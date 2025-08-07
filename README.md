# Multi-Diagram Generation Service

Web service for generating multiple diagram types with microservice architecture. Supports PlantUML, D2, Graphviz, and more.

![UI screenshot](docs/UI-screenshot.png)

## Architecture

The system consists of 3 microservices:

1. **API Service** (port 9001) - REST API for multi-format diagram generation
2. **UI Service** (port 9002) - web interface with diagram type selector
3. **Kroki Service** (port 8001) - multi-diagram rendering engine

## Supported Diagram Types

✅ **PlantUML** - Sequence, class, activity diagrams  
✅ **Graphviz (DOT)** - Graph layouts and flowcharts

## Technologies

- Node.js & Express
- Docker & Docker Compose
- Vanilla JavaScript (no frameworks)
- Multi-diagram support via Kroki

## Running

### Development mode

```bash
# Start all services
npm run dev

# Stop services
npm run stop

# View logs
npm run logs

# Complete cleanup (containers, images, volumes)
npm run clean
```

### Service Access

- **UI Service**: http://localhost:9002
- **API Service**: http://localhost:9001
- **Kroki Service**: http://localhost:8001

### Health Check URLs

- API Service: http://localhost:9001/health
- UI Service: http://localhost:9002/health
- Kroki Service: http://localhost:8001/health

## API Endpoints

### POST /api/v1/generate

Generate diagram from any supported diagram type.

**Request:**
```json
{
  "uml": "diagram_code_here",
  "diagram_type": "plantuml|d2|graphviz|mermaid|blockdiag",
  "output_format": "png|svg"
}
```

**Response:**
- Success: Image (PNG/SVG binary)
- Error: JSON with error description

**Format Compatibility:**
- PlantUML: PNG, SVG
- D2, Graphviz, Mermaid: SVG only
- BlockDiag: PNG, SVG

## Code Examples

See the [examples folder](examples/) for working examples:

### PlantUML
```plantuml
participant "Web Browser" as browser
participant "Web Server" as server
browser -> server: HTTP Request
server --> browser: HTTP Response
```

### D2
```d2
Client: Client Apps {
  web: Web App
  mobile: Mobile App
}
Gateway: API Gateway
Client.web -> Gateway: HTTPS
```

### Graphviz
```dot
digraph {
  Start -> Process -> End;
  Process -> Error [color=red];
}
```

## 🛡️ Security

The service includes comprehensive security measures:

### Key Security Features
- ✅ **RCE Protection**: Kroki runs in secure mode
- ✅ **Input Validation**: Blocks dangerous PlantUML patterns  
- ✅ **Rate limiting**: Request limiting by IP
- ✅ **CORS Protection**: Configured origin policy
- ✅ **Container Security**: Non-privileged users
- ✅ **Security headers**: CSP, HSTS, X-Frame-Options, etc.
- ✅ **Security Monitoring**: Suspicious activity logging

### Secure Launch (Production)

```bash
# Deploy with production security settings
./scripts/secure-deploy.sh --environment production

# Security testing
./scripts/security-test.sh

# Security monitoring
./scripts/security-monitor.sh --continuous
```

### Security Documentation
Detailed information about security measures: [SECURITY.md](SECURITY.md)

## Project Structure

```
uml-images-service/
├── api-service/              # API microservice
│   ├── middleware/           # Security middleware
│   ├── utils/               # Logging utilities
│   └── logs/                # Security logs
├── ui-service/              # UI microservice
├── scripts/                 # Security scripts
│   ├── secure-deploy.sh     # Secure deployment
│   ├── security-test.sh     # Security testing
│   └── security-monitor.sh  # Security monitoring
├── docker-compose.yml       # Base configuration
├── docker-compose.prod.yml  # Production configuration
├── SECURITY.md             # Security documentation
└── README.md               # Documentation
```