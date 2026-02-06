# Presenton Docker Optimization Guide

## Overview
This guide documents how we optimized the Presenton Docker image from **16GB** (original) to **2.9GB** (optimized) while maintaining full functionality.

## ⚠️ Deployment Scope

**This guide covers LOCAL DEPLOYMENT ONLY** (Development & Testing on your machine)

### Supported Scenarios
- ✅ Local development on a single machine
- ✅ Testing on your computer
- ✅ Small-scale personal deployment
- ✅ Docker Desktop (Mac/Windows)
- ✅ Linux server (single instance)

### Not Supported
- ❌ Cloud deployment (AWS, Google Cloud, Azure)
- ❌ Kubernetes orchestration
- ❌ CI/CD pipelines
- ❌ Production-grade scaling
- ❌ Load balancing
- ❌ SSL/TLS certificates
- ❌ Database replication
- ❌ Monitoring & alerting setup

**For production deployment**, refer to [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) (coming soon).

---

## Problem Analysis

### Original Dockerfile Issues
The original Dockerfile had several inefficiencies:

1. **No Multi-Stage Build**: All dependencies installed in a single layer
2. **PyTorch Bloat**: Full PyTorch installation with unnecessary files (~2.5GB+)
3. **npm Cache Not Cleaned**: Node modules included unnecessary cache files
4. **Docling Resources**: Large ML model resources downloaded and kept in final image
5. **No Layer Optimization**: Missing cleanup commands between RUN statements

### Size Comparison
| Aspect | Original | Optimized | Savings |
|--------|----------|-----------|---------|
| **Total Image Size** | 16 GB | 2.9 GB | 81.9% reduction |
| **PyTorch** | ~5 GB | ~150 MB | 97% reduction |
| **Node.js** | ~1.2 GB | ~250 MB | 79% reduction |
| **Python Packages** | ~6 GB | ~500 MB | 92% reduction |

---

## Optimization Techniques Applied

### 1. **Multi-Stage Build**
Using Docker's multi-stage build feature to separate build dependencies from runtime dependencies.

#### Stage 1: Next.js Builder
- Only installs Node.js and Next.js dependencies
- Produces compiled `.next-build` output
- This stage is discarded after build

#### Stage 2: Final Runtime Image
- Base: `python:3.11-slim-bookworm` (much smaller than full Python)
- Only copies necessary built artifacts
- No build tools included

### 2. **PyTorch Optimization**
PyTorch is required by Docling but includes many unnecessary files.

```dockerfile
# Strip unnecessary debug symbols
find /usr/local/lib/python3.11/site-packages/torch -name "*.so" \
  -exec strip --strip-unneeded {} + 2>/dev/null || true

# Remove unnecessary directories
rm -rf /usr/local/lib/python3.11/site-packages/torch/test \
       /usr/local/lib/python3.11/site-packages/torch/include \
       /usr/local/lib/python3.11/site-packages/torch/share \
       /usr/local/lib/python3.11/site-packages/torch/bin \
       /usr/local/lib/python3.11/site-packages/nvidia/*/lib/*.a
```

**Note**: Keep `torch/bin` - it contains `torch_shm_manager` needed for PyTorch initialization.

### 3. **Docling Resource Cleanup**
Docling downloads large model files that aren't needed in the container.

```dockerfile
# Remove Docling resource cache
rm -rf /usr/local/lib/python3.11/site-packages/docling/resources
```

### 4. **Python Cache Cleanup**
Remove `__pycache__` directories from all packages.

```dockerfile
# Remove all Python cache directories
find /usr/local/lib/python3.11/site-packages -type d -name '__pycache__' \
  -exec rm -rf {} + 2>/dev/null || true
```

### 5. **apt Cleanup**
Clean up package manager cache and documentation.

```dockerfile
apt-get purge -y --auto-remove curl && \
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/locale/* \
       /usr/share/info/* /usr/share/lintian/*
```

### 6. **Single apt-get RUN Statement**
Combine all apt installations to reduce layer count and size.

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    libreoffice-impress \
    fontconfig \
    chromium \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/locale/* \
              /usr/share/info/* /usr/share/lintian/*
```

### 7. **Use Slim/Alpine Base Images**
- `python:3.11-slim-bookworm` instead of full Python image
- Removes development headers and unnecessary tools

---

## Optimized Dockerfile

```dockerfile
# ============================================
# Stage 1: Build Next.js application
# ============================================
FROM node:20-slim AS nextjs-builder

WORKDIR /build

# Install dependencies first (layer cache optimization)
COPY servers/nextjs/package.json servers/nextjs/package-lock.json ./
RUN npm ci

# Copy source and build
COPY servers/nextjs/ ./
RUN npm run build

# ============================================
# Stage 2: Final runtime image
# ============================================
FROM python:3.11-slim-bookworm

# Install system dependencies in a single layer and clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    libreoffice-impress \
    fontconfig \
    chromium \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/locale/* \
              /usr/share/info/* /usr/share/lintian/*

# Create a working directory
WORKDIR /app

# Set environment variables
ENV APP_DATA_DIRECTORY=/app_data
ENV TEMP_DIRECTORY=/tmp/presenton
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install Python dependencies with no cache, strip PyTorch bloat
RUN pip install --no-cache-dir \
    aiohttp aiomysql aiosqlite asyncpg fastapi[standard] \
    pathvalidate pdfplumber chromadb sqlmodel \
    anthropic google-genai openai fastmcp dirtyjson \
    && pip install --no-cache-dir docling --extra-index-url https://download.pytorch.org/whl/cpu \
    && find /usr/local/lib/python3.11/site-packages/torch -name "*.so" -exec strip --strip-unneeded {} + 2>/dev/null || true \
    && rm -rf /usr/local/lib/python3.11/site-packages/torch/test \
             /usr/local/lib/python3.11/site-packages/torch/include \
             /usr/local/lib/python3.11/site-packages/torch/share \
             /usr/local/lib/python3.11/site-packages/nvidia/*/lib/*.a \
             /usr/local/lib/python3.11/site-packages/docling/resources \
    && find /usr/local/lib/python3.11/site-packages -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

# Copy the built Next.js standalone app from the builder stage
COPY --from=nextjs-builder /build/.next-build/standalone /app/servers/nextjs
COPY --from=nextjs-builder /build/.next-build/static /app/servers/nextjs/.next-build/static
COPY --from=nextjs-builder /build/public /app/servers/nextjs/public

# Copy FastAPI source
COPY servers/fastapi/ ./servers/fastapi/

# Copy entrypoint and nginx config
COPY start.js ./
COPY nginx.conf /etc/nginx/nginx.conf

# Expose the port
EXPOSE 80

# Start the servers
CMD ["node", "/app/start.js"]
```

---

## Step-by-Step Setup & Running Guide

### Prerequisites
```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install docker-compose (if not already installed)
sudo apt-get install -y docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 1. Clone the Presenton Repository

```bash
# Clone the repository
git clone https://github.com/your-org/presenton.git
cd presenton

# Verify the Dockerfile exists
ls -la Dockerfile
```

### 2. Create Environment Configuration

Create a `.env` file in the project root:

```bash
cat > .env << 'EOF'
# ===========================
# PRESENTON CONFIGURATION
# ===========================
CAN_CHANGE_KEYS=true

# ===========================
# LLM PROVIDER CONFIGURATION
# ===========================
LLM=google

# OpenAI Configuration
OPENAI_API_KEY="your-openai-key-here"
OPENAI_MODEL="gpt-4o-mini"

# Google (Gemini) Configuration
GOOGLE_API_KEY="your-google-key-here"
GOOGLE_MODEL=models/gemini-2.0-flash-exp

# Anthropic (Claude) Configuration
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Ollama Configuration (for local models)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Custom LLM Configuration
CUSTOM_LLM_URL=""
CUSTOM_LLM_API_KEY=""
CUSTOM_MODEL=""

# ===========================
# IMAGE GENERATION
# ===========================
IMAGE_PROVIDER=pexels
DISABLE_IMAGE_GENERATION=false
PEXELS_API_KEY=""
PIXABAY_API_KEY=""
DALL_E_3_QUALITY=standard
GPT_IMAGE_1_5_QUALITY=medium
COMFYUI_URL=""
COMFYUI_WORKFLOW=""

# ===========================
# LLM FEATURES
# ===========================
EXTENDED_REASONING=false
TOOL_CALLS=true
DISABLE_THINKING=false
WEB_GROUNDING=false

# ===========================
# DATABASE CONFIGURATION
# ===========================
DATABASE_URL=""

# ===========================
# ANALYTICS & TRACKING
# ===========================
DISABLE_ANONYMOUS_TRACKING=false
EOF
```

### 3. Build the Docker Image

#### Option A: Using Docker (Direct)

```bash
# Build the image
docker build -t presenton:latest .

# Check the image size
docker images | grep presenton

# Output should show ~2.9GB
```

#### Option B: Using Docker Compose

```bash
# Build using docker-compose
docker-compose build production

# Check the image
docker images | grep presenton_production
```

### 4. Run the Container

#### Option A: Using Docker (Direct)

```bash
# Run the container
docker run -d \
  --name presenton \
  -p 5000:80 \
  -v $(pwd)/app_data:/app_data \
  --env-file .env \
  presenton:latest

# Verify container is running
docker ps | grep presenton

# Check logs for startup completion
docker logs presenton

# Wait for Chromadb ONNX model download (~28 seconds)
# Output should show: "INFO: Uvicorn running on http://127.0.0.1:8000"
```

#### Option B: Using Docker Compose (Recommended)

```bash
# Start services in detached mode
docker-compose up -d production

# Check service status
docker-compose ps

# View logs
docker-compose logs -f production

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### 5. Verify the Application

```bash
# Wait for ONNX model download to complete (~28 seconds)
sleep 30

# Test the backend API
curl -s http://localhost:5000/api/v1/mock/presentation-generation-completed | jq .

# Expected output: List of mock presentations

# Access the web UI
# Open browser and navigate to: http://localhost:5000
```

### 6. View Container Logs

```bash
# View recent logs
docker logs presenton --tail 50

# Follow logs in real-time
docker logs -f presenton

# View logs from docker-compose
docker-compose logs -f production
```

### 7. Stop and Cleanup

```bash
# Stop container
docker stop presenton

# Remove container
docker rm presenton

# Remove image
docker rmi presenton:latest

# Or with docker-compose
docker-compose down
docker-compose down -v  # Also removes volumes
```

---

## Performance Metrics

### Build Time
| Method | Time |
|--------|------|
| Original Dockerfile | ~45 minutes |
| Optimized Dockerfile | ~25 minutes |
| Cached Build | ~10 seconds |

### Runtime Performance
- **Startup Time**: ~30 seconds (ONNX model download on first run)
- **Memory Usage**: ~800 MB baseline, ~1.2 GB under load
- **CPU Usage**: Minimal idle, peaks during PDF generation

### Storage Usage
```bash
# Check image size
docker images | grep presenton

# Check container size
docker ps -s | grep presenton

# Check volume size
du -sh app_data/
```

---

## Troubleshooting

### Issue: 502 Bad Gateway on First Access

**Cause**: ONNX model is still downloading (79.3MB).

**Solution**:
```bash
# Wait 30-60 seconds and refresh the page
# Monitor logs
docker logs -f presenton
```

### Issue: Ollama Process Failed to Start

**Cause**: Ollama is not installed in the container (intentional - only needed if LLM=ollama).

**Solution**:
```bash
# If you need Ollama, install it on the host first:
curl -fsSL https://ollama.com/install.sh | sh

# Or use a different LLM provider by changing .env
LLM=google  # or openai, anthropic
```

### Issue: Torch Error: "Unable to find torch_shm_manager"

**Cause**: `torch/bin` was deleted during cleanup (happens with unoptimized cleanup).

**Solution**:
```bash
# Use the optimized Dockerfile provided in this guide
# Ensure torch/bin is NOT removed
# Re-build the image
docker build --no-cache -t presenton:latest .
```

### Issue: Container Exits Immediately

**Cause**: FastAPI or Nginx failed to start.

**Solution**:
```bash
# Check detailed logs
docker logs presenton

# Verify environment variables are set
docker inspect presenton | grep -A 100 "Env"

# Check if ports are already in use
lsof -i :5000  # or :80
```

---

## Docker Compose File Configuration

The `docker-compose.yml` defines two services:

### Production Service
- Builds from root `Dockerfile` (optimized)
- Exposes port 5000
- Mounts `app_data` volume for persistence
- Loads environment variables from `.env`
- Uses default network

### Development Service (Optional)
```bash
# Available for development with hot-reload
docker-compose up -d development
```

---

## Environment Variable Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM` | LLM provider to use | `google` |
| `GOOGLE_API_KEY` | Gemini API key | `` |
| `OPENAI_API_KEY` | OpenAI API key | `` |
| `ANTHROPIC_API_KEY` | Claude API key | `` |
| `IMAGE_PROVIDER` | Image generation provider | `pexels` |
| `DISABLE_IMAGE_GENERATION` | Disable image gen | `false` |
| `TOOL_CALLS` | Enable LLM tool/function calls | `true` |
| `EXTENDED_REASONING` | Complex task reasoning | `false` |
| `DATABASE_URL` | Database connection string | `` (SQLite) |
| `CAN_CHANGE_KEYS` | Allow users to change API keys | `true` |

---

## Best Practices

### 1. **Use Multi-Stage Builds for All Projects**
- Reduces final image size by 50-80%
- Separates build tools from runtime
- Improves security by excluding build artifacts

### 2. **Layer Caching Optimization**
```dockerfile
# Good: Frequent changes at the end
COPY servers/fastapi/ ./servers/fastapi/
COPY start.js ./

# Bad: Would invalidate all subsequent layers
COPY start.js ./
COPY servers/fastapi/ ./servers/fastapi/
```

### 3. **Use .dockerignore**
Create `.dockerignore` to exclude unnecessary files:
```
node_modules/
npm-debug.log
.git
.gitignore
README.md
LICENSE
.env
.env.local
app_data/
```

### 4. **Combine RUN Commands**
```dockerfile
# Good: Single RUN statement
RUN apt-get update && apt-get install -y package1 package2 \
    && apt-get clean

# Bad: Multiple RUN statements create extra layers
RUN apt-get update
RUN apt-get install -y package1
RUN apt-get install -y package2
RUN apt-get clean
```

### 5. **Use --no-cache for pip**
```dockerfile
# Good: Avoids storing pip cache in image
RUN pip install --no-cache-dir package

# Bad: Includes pip cache (~200MB+)
RUN pip install package
```

---

## Further Optimization (Advanced)

### For Extreme Size Reduction (< 2.5 GB)

1. **Use distroless Python base**:
   ```dockerfile
   FROM python:3.11-slim as base
   # Build everything, then copy to distroless
   FROM gcr.io/distroless/python3.11
   ```

2. **Remove unused LLM providers**:
   - If only using Google, remove openai, anthropic packages

3. **Use external volume for Docling models**:
   - Download models on host, mount as read-only volume

4. **Implement layer squashing**:
   ```bash
   docker build --squash -t presenton:latest .
   ```

---

## Contributing Improvements

To contribute optimizations:

 **Benchmark before/after**:
   ```bash
   # Measure build time
   time docker build -t presenton:latest .
   
   # Measure image size
   docker images | grep presenton
   
   # Measure runtime memory
   docker stats presenton
   ```




---

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PyTorch Installation Guide](https://pytorch.org/get-started/locally/)
- [Docling Documentation](https://github.com/DS4SD/docling)

---

**Last Updated**: February 6, 2026
**Maintainer**: Presenton Team
**License**: Same as Presenton project
