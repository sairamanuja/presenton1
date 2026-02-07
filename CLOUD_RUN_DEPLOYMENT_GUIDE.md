# Google Cloud Run Deployment Guide - Presenton

This guide documents the step-by-step process to deploy the Presenton application (FastAPI backend + Next.js frontend) to Google Cloud Run.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Setup on GCP](#project-setup-on-gcp)
3. [Building Docker Images](#building-docker-images)
4. [Pushing Images to Artifact Registry](#pushing-images-to-artifact-registry)
5. [Deploying FastAPI Backend](#deploying-fastapi-backend)
6. [Deploying Next.js Frontend](#deploying-nextjs-frontend)
7. [Configuring Persistent Storage](#configuring-persistent-storage)
8. [Enabling Service-to-Service Communication](#enabling-service-to-service-communication)
9. [Verification & Testing](#verification--testing)

---

## Prerequisites

### Required Tools
- Google Cloud SDK (`gcloud` CLI)
- Docker (for building and pushing images)
- Git (for version control)
- curl (for testing endpoints)

### Install Google Cloud SDK
```bash
# On Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Initialize gcloud
gcloud init
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Verify Installation
```bash
gcloud --version
docker --version
```

---

## Project Setup on GCP

### Step 1: Set Environment Variables
```bash
# Define your GCP project details
export PROJECT_ID="dev-project-484806"
export REGION="asia-south1"
export ARTIFACT_REGISTRY_REPO="presenton1"
export GCS_BUCKET="${PROJECT_ID}-presenton-data"
```

### Step 2: Create GCS Bucket for Persistent Storage
This bucket will store user configuration files that persist across Cloud Run restarts.

```bash
# Create the bucket
gsutil mb -l ${REGION} gs://${GCS_BUCKET}

# Enable versioning (optional but recommended)
gsutil versioning set on gs://${GCS_BUCKET}
```

### Step 3: Create Artifact Registry Repository
This repository will store your Docker images.

```bash
# Create Artifact Registry repository
gcloud artifacts repositories create ${ARTIFACT_REGISTRY_REPO} \
  --repository-format=docker \
  --location=${REGION}

# Verify it was created
gcloud artifacts repositories list
```

### Step 4: Configure Docker Authentication
```bash
# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Verify authentication
docker pull ${REGION}-docker.pkg.dev/gcr.io/distroless/base
```

---

## Building Docker Images

Navigate to your project root directory:
```bash
cd /path/to/presenton1
```

### Step 5: Build FastAPI Backend Image

```bash
# Build the FastAPI image
docker build -t presenton-fastapi:latest ./servers/fastapi

# Test locally (optional)
docker run -p 8080:8080 -e GEMINI_API_KEY="your-key" presenton-fastapi:latest
```

**Expected output:** Image builds successfully, showing Python environment setup and ChromaDB model download.

### Step 6: Build Next.js Frontend Image

```bash
# Build the Next.js image
docker build -t presenton-nextjs:latest ./servers/nextjs

# Test locally (optional)
docker run -p 3000:3000 presenton-nextjs:latest
```

**Expected output:** Multi-stage build completes, showing deps, builder, and runner stages.

---

## Pushing Images to Artifact Registry

### Step 7: Tag Images for Artifact Registry

```bash
# Tag FastAPI image
docker tag presenton-fastapi:latest \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest

# Tag Next.js image
docker tag presenton-nextjs:latest \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/nextjs:latest
```

### Step 8: Push Images to Artifact Registry

```bash
# Push FastAPI image
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest

# Push Next.js image
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/nextjs:latest
```

**Expected output:**
```
Digest: sha256:...
Status: Downloaded newer image for ...
4.0 MB complete
All pushed successfully
```

Verify images are in the registry:
```bash
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}
```

---

## Deploying FastAPI Backend

### Step 9: Deploy FastAPI to Cloud Run

```bash
# Deploy FastAPI service
gcloud run deploy presenton-fastapi \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest \
  --platform managed \
  --region ${REGION} \
  --cpu 2 \
  --memory 2Gi \
  --timeout 3600 \
  --execution-environment gen2 \
  --allow-unauthenticated
```

**Parameters explained:**
- `--cpu 2`: Allocate 2 CPU cores
- `--memory 2Gi`: Allocate 2GB memory
- `--timeout 3600`: 1 hour timeout for model downloads
- `--execution-environment gen2`: Use newer Cloud Run generation
- `--allow-unauthenticated`: Allow public access

**Save the output URL:**
```
Service URL: https://presenton-fastapi-XXXXXXXXXX-XX.a.run.app
```

### Step 10: Add Environment Variables to FastAPI

```bash
# Set environment variables for FastAPI
gcloud run services update presenton-fastapi \
  --region ${REGION} \
  --set-env-vars=\
GEMINI_API_KEY="your-gemini-api-key",\
PEXELS_API_KEY="your-pexels-api-key",\
ENVIRONMENT="production"
```

### Step 11: Attach GCS Bucket to FastAPI

```bash
# Add persistent storage volume
gcloud run services update presenton-fastapi \
  --region ${REGION} \
  --execution-environment gen2 \
  --add-volume=name=appdata,type=cloud-storage,bucket=${GCS_BUCKET} \
  --add-volume-mount=volume=appdata,mount-path=/app_data
```

**Note:** This creates/updates a new revision of the service.

### Step 12: Verify FastAPI Deployment

```bash
# Get the service details
gcloud run services describe presenton-fastapi --region=${REGION}

# Test the API
FASTAPI_URL=$(gcloud run services describe presenton-fastapi \
  --region=${REGION} --format='value(status.url)')

curl -s ${FASTAPI_URL}/api/v1/ppt/template-management/summary | jq .
```

**Expected output:** JSON response with template data, HTTP 200 status.

---

## Deploying Next.js Frontend

### Step 13: Deploy Next.js to Cloud Run

```bash
# Deploy Next.js service
gcloud run deploy presenton-nextjs \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/nextjs:latest \
  --platform managed \
  --region ${REGION} \
  --cpu 1 \
  --memory 1Gi \
  --timeout 3600 \
  --execution-environment gen2 \
  --allow-unauthenticated
```

**Save the output URL:**
```
Service URL: https://presenton-nextjs-XXXXXXXXXX-XX.a.run.app
```

### Step 14: Update FastAPI URL in Next.js Environment

Get the actual FastAPI URL from step 11, then update Next.js:

```bash
# Get FastAPI service URL
FASTAPI_URL=$(gcloud run services describe presenton-fastapi \
  --region=${REGION} --format='value(status.url)')

# Update Next.js with FastAPI backend URL
gcloud run services update presenton-nextjs \
  --region ${REGION} \
  --set-env-vars=INTERNAL_API_URL="${FASTAPI_URL}"
```

### Step 15: Attach GCS Bucket to Next.js

```bash
# Add persistent storage volume
gcloud run services update presenton-nextjs \
  --region ${REGION} \
  --execution-environment gen2 \
  --add-volume=name=appdata,type=cloud-storage,bucket=${GCS_BUCKET} \
  --add-volume-mount=volume=appdata,mount-path=/app_data
```

### Step 16: Verify Next.js Deployment

```bash
# Get the service details
gcloud run services describe presenton-nextjs --region=${REGION}

# Test the frontend
NEXTJS_URL=$(gcloud run services describe presenton-nextjs \
  --region=${REGION} --format='value(status.url)')

curl -s ${NEXTJS_URL} | head -20
```

**Expected output:** HTML response with Next.js application, HTTP 200 status.

---

## Configuring Persistent Storage

### Step 17: Grant Service Account Permissions

The Cloud Run service account needs permission to read/write to the GCS bucket.

```bash
# Get the default service account
SERVICE_ACCOUNT=$(gcloud iam service-accounts list \
  --filter="displayName:Compute Engine default service account" \
  --format='value(email)')

# Grant Cloud Storage Object Admin role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member serviceAccount:${SERVICE_ACCOUNT} \
  --role roles/storage.objectAdmin

# Verify the role was granted
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/storage.objectAdmin" \
  --format='value(bindings.members)'
```

### Step 18: Test Persistent Storage

```bash
# Test writing to /app_data via user-config API
NEXTJS_URL=$(gcloud run services describe presenton-nextjs \
  --region=${REGION} --format='value(status.url)')

# Test GET
curl -s ${NEXTJS_URL}/api/user-config

# Test POST
curl -s -X POST ${NEXTJS_URL}/api/user-config \
  -H "Content-Type: application/json" \
  -d '{"llmProvider":"gemini"}' | jq .
```

**Expected output:** HTTP 200 with `{}` or user configuration JSON.

---

## Enabling Service-to-Service Communication

### Step 19: Make FastAPI Public

Since Next.js needs to invoke FastAPI via HTTP calls, the backend must be publicly accessible:

```bash
# Grant public access to FastAPI
gcloud run services add-iam-policy-binding presenton-fastapi \
  --member allUsers \
  --role roles/run.invoker \
  --region ${REGION}

# Verify it was granted
gcloud run services get-iam-policy presenton-fastapi \
  --region ${REGION}
```

### Step 20: Test Service-to-Service Communication

```bash
# From your local machine, test if Next.js can communicate with FastAPI
NEXTJS_URL=$(gcloud run services describe presenton-nextjs \
  --region=${REGION} --format='value(status.url)')

# Call an endpoint that requires FastAPI communication
curl -s ${NEXTJS_URL}/api/v1/ppt/template-management/summary | jq .
```

**Expected output:** Template data from FastAPI, HTTP 200 status.

---

## Verification & Testing

### Step 21: View Service Logs

```bash
# FastAPI logs
gcloud run services logs read presenton-fastapi \
  --region=${REGION} \
  --limit 50

# Next.js logs
gcloud run services logs read presenton-nextjs \
  --region=${REGION} \
  --limit 50
```

### Step 22: Monitor Service Metrics

```bash
# View FastAPI metrics
gcloud run services describe presenton-fastapi \
  --region=${REGION}

# View Next.js metrics
gcloud run services describe presenton-nextjs \
  --region=${REGION}
```

### Step 23: Full Integration Test

```bash
# 1. Get Frontend URL
NEXTJS_URL=$(gcloud run services describe presenton-nextjs \
  --region=${REGION} --format='value(status.url)')

# 2. Get Backend URL
FASTAPI_URL=$(gcloud run services describe presenton-fastapi \
  --region=${REGION} --format='value(status.url)')

echo "Frontend: ${NEXTJS_URL}"
echo "Backend: ${FASTAPI_URL}"

# 3. Test Backend Template API
echo "Testing Backend..."
curl -s ${FASTAPI_URL}/api/v1/ppt/template-management/summary | jq .

# 4. Test Frontend
echo "Testing Frontend..."
curl -s ${NEXTJS_URL} | grep -o "<title>.*</title>"

# 5. Test User Config (Frontend to Backend through Next.js)
echo "Testing User Config..."
curl -s ${NEXTJS_URL}/api/user-config | jq .

# 6. Test Settings Save
echo "Testing Settings Save..."
curl -s -X POST ${NEXTJS_URL}/api/user-config \
  -H "Content-Type: application/json" \
  -d '{"llmProvider":"gemini","canChangeKeys":false}' | jq .
```

---

## Updating Deployments

### Updating After Code Changes

```bash
# 1. Build new image
docker build -t presenton-fastapi:latest ./servers/fastapi

# 2. Tag for registry
docker tag presenton-fastapi:latest \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest

# 3. Push to registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest

# 4. Deploy new revision
gcloud run deploy presenton-fastapi \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest \
  --region ${REGION}
```

The same process applies for Next.js.

---

## Troubleshooting

### Service fails to start
```bash
# Check logs for errors
gcloud run services logs read SERVICE_NAME --region=${REGION} --limit 100
```

### ENOENT: File not found errors
```bash
# Ensure /app_data directory is created in code before writing:
# TypeScript: fs.mkdirSync(path.dirname(filePath), { recursive: true })
# Python: os.makedirs(os.path.dirname(file_path), exist_ok=True)
```

### Services can't communicate
```bash
# Ensure backend has public access
gcloud run services add-iam-policy-binding presenton-fastapi \
  --member allUsers \
  --role roles/run.invoker \
  --region ${REGION}

# Verify INTERNAL_API_URL in Next.js points to correct backend URL
gcloud run services describe presenton-nextjs --region=${REGION} | grep INTERNAL_API_URL
```

### GCS bucket permission errors
```bash
# Grant service account storage permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member serviceAccount:$(gcloud iam service-accounts list \
    --filter="displayName:Compute Engine default service account" \
    --format='value(email)') \
  --role roles/storage.objectAdmin
```

---

## Cost Optimization

### Resource Allocation
- **FastAPI**: 2 CPU, 2Gi memory (due to ChromaDB model loading)
- **Next.js**: 1 CPU, 1Gi memory (frontend, lighter workload)

### Reduce Costs
```bash
# Reduce CPU allocation (if models not used constantly)
gcloud run services update presenton-fastapi \
  --region ${REGION} \
  --cpu 1 \
  --memory 1Gi

# Set memory and CPU limits
gcloud run services update presenton-fastapi \
  --region ${REGION} \
  --memory 4Gi \
  --cpu 2
```

### Enable Autoscaling
```bash
# Default: 0-100 instances, these are good defaults
# To customize:
gcloud run services update presenton-fastapi \
  --region ${REGION} \
  --min-instances 0 \
  --max-instances 100
```

---

## Backup & Disaster Recovery

### Backup GCS Bucket
```bash
# Enable versioning (if not done earlier)
gsutil versioning set on gs://${GCS_BUCKET}

# Export configs to local backup
gsutil -m cp -r gs://${GCS_BUCKET}/* ./backup/
```

### Restore from Backup
```bash
# Copy files back to bucket
gsutil -m cp -r ./backup/* gs://${GCS_BUCKET}/
```

---

## Production Checklist

- [ ] Project created on GCP
- [ ] Artifact Registry created
- [ ] GCS bucket created
- [ ] Dockerfiles optimized (ChromaDB pre-download)
- [ ] Environment variables set for both services
- [ ] FastAPI deployed with 2 CPU, 2Gi memory
- [ ] Next.js deployed with 1 CPU, 1Gi memory
- [ ] GCS bucket mounted to both services at /app_data
- [ ] FastAPI made public for service-to-service communication
- [ ] INTERNAL_API_URL set correctly in Next.js
- [ ] User config API tested and working
- [ ] All sensitive keys stored in `.env` files (not code)
- [ ] Logs reviewed for errors
- [ ] Integration test passed (frontend → backend communication)

---

## Quick Commands Reference

```bash
# Set variables
export PROJECT_ID="dev-project-484806"
export REGION="asia-south1"
export ARTIFACT_REGISTRY_REPO="presenton1"
export GCS_BUCKET="${PROJECT_ID}-presenton-data"

# Build and push
docker build -t presenton-fastapi:latest ./servers/fastapi
docker tag presenton-fastapi:latest ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest

# Deploy
gcloud run deploy presenton-fastapi --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/fastapi:latest --platform managed --region ${REGION} --cpu 2 --memory 2Gi --execution-environment gen2

# Get URLs
gcloud run services describe presenton-fastapi --region=${REGION} --format='value(status.url)'
gcloud run services describe presenton-nextjs --region=${REGION} --format='value(status.url)'

# View logs
gcloud run services logs read presenton-fastapi --region=${REGION} --limit 50
gcloud run services logs read presenton-nextjs --region=${REGION} --limit 50

# Test endpoints
curl -s https://presenton-nextjs-XXXXXXXXXX-XX.a.run.app/api/user-config | jq .
```

This guide documents the complete deployment process used for Presenton on Google Cloud Run.
