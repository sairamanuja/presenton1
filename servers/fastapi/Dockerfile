# ============================================
# Stage 1: Build Python dependencies
# ============================================
FROM python:3.11-slim-bookworm AS builder

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install all Python packages into the virtual env
RUN pip install --no-cache-dir \
    aiohttp aiomysql aiosqlite asyncpg fastapi[standard] \
    pathvalidate pdfplumber chromadb sqlmodel \
    anthropic google-genai openai fastmcp dirtyjson \
    && pip install --no-cache-dir docling --extra-index-url https://download.pytorch.org/whl/cpu

# Strip debug symbols from native libs and remove bloat
RUN find /opt/venv/lib/python3.11/site-packages/torch -name "*.so" -exec strip --strip-unneeded {} + 2>/dev/null || true \
    && rm -rf /opt/venv/lib/python3.11/site-packages/torch/test \
              /opt/venv/lib/python3.11/site-packages/torch/include \
              /opt/venv/lib/python3.11/site-packages/torch/share \
              /opt/venv/lib/python3.11/site-packages/nvidia/*/lib/*.a \
              /opt/venv/lib/python3.11/site-packages/docling/resources \
    && find /opt/venv -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -name '*.pyc' -delete 2>/dev/null || true

# ============================================
# Stage 2: Production runtime (minimal)
# ============================================
FROM python:3.11-slim-bookworm AS runner

# Install only the system packages needed at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/locale/* \
              /usr/share/info/* /usr/share/lintian/*

# Copy the pre-built virtual env from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

ENV APP_DATA_DIRECTORY=/app_data
ENV USER_CONFIG_PATH=/app_data/userConfig.json
ENV TEMP_DIRECTORY=/tmp/presenton

# Copy only the FastAPI source code
COPY . .

EXPOSE 8000

# Bind to 0.0.0.0 for Cloud Run (server.py defaults to 127.0.0.1)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
