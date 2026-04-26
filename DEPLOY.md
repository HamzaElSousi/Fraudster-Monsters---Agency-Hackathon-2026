# Deployment Guide — Follow The Money

> **AI Accountability Dashboard · Agency 2026 Hackathon**

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Option A — Free Tier (Recommended for Demo)](#option-a--free-tier-recommended-for-demo)
   - [A1. Railway (easiest, ~10 min)](#a1-railway-easiest-10-min)
   - [A2. Render (free tier, slower cold starts)](#a2-render-free-tier-slower-cold-starts)
   - [A3. Fly.io (more control, still free)](#a3-flyio-more-control-still-free)
5. [Option B — AWS](#option-b--aws)
   - [B1. EC2 (simplest AWS path)](#b1-ec2-simplest-aws-path)
   - [B2. ECS + Fargate (containerized)](#b2-ecs--fargate-containerized)
   - [B3. Elastic Beanstalk (PaaS on AWS)](#b3-elastic-beanstalk-paas-on-aws)
6. [Option C — Google Cloud Platform (GCP)](#option-c--google-cloud-platform-gcp)
   - [C1. Cloud Run (serverless containers)](#c1-cloud-run-serverless-containers)
   - [C2. Compute Engine (VM)](#c2-compute-engine-vm)
7. [Data Layer: Sharing the 10GB Dataset](#data-layer-sharing-the-10gb-dataset)
8. [Environment Variables Reference](#environment-variables-reference)
9. [Docker Reference](#docker-reference)
10. [Post-Deploy Smoke Test](#post-deploy-smoke-test)
11. [Cost Comparison](#cost-comparison)

---

## Executive Summary

This app has two moving parts: a **FastAPI backend** (Python, DuckDB) and a **React/Vite frontend**. DuckDB is embedded — there is no separate database server to manage. The 10GB data files are not in the repo and must be provisioned separately on any deployment target.

**Bottom line by use case:**

| Use Case | Recommended Option | Est. Cost |
|----------|--------------------|-----------|
| Hackathon demo (1–3 days) | [Railway A1](#a1-railway-easiest-10-min) or [Fly.io A3](#a3-flyio-more-control-still-free) | Free |
| Post-hackathon public demo | [Render A2](#a2-render-free-tier-slower-cold-starts) or [Cloud Run C1](#c1-cloud-run-serverless-containers) | Free–$10/mo |
| Production / high traffic | [ECS Fargate B2](#b2-ecs--fargate-containerized) or [Cloud Run C1](#c1-cloud-run-serverless-containers) | $30–80/mo |
| Cheapest persistent VM | [EC2 t3.medium B1](#b1-ec2-simplest-aws-path) or [GCE e2-medium C2](#c2-compute-engine-vm) | ~$30/mo |

**Critical constraint:** DuckDB holds an exclusive write lock on `hackathon.duckdb`. Deploy **one backend instance only** — horizontal scaling is not supported without switching to a shared DB.

---

## Architecture Overview

```
Browser
  │
  ▼
[Frontend — React/Vite]
  Static files served by nginx (Docker) or Vite dev server
  Calls API at VITE_API_URL (default: http://localhost:8000)
  │
  ▼
[Backend — FastAPI / Python]
  Port 8000
  Loads JSONL files from data/ into DuckDB on first run (~2 min)
  DuckDB file: data/hackathon.duckdb (auto-created)
  AI: AWS Bedrock or Anthropic SDK (optional, degrades gracefully)
  │
  ▼
[Data — NOT in git]
  data/cra/        CRA T3010 JSONL (~6GB)
  data/fed/        Federal grants JSONL (~3GB)
  data/ab/         Alberta procurement JSONL (~1GB)
  data/hackathon.duckdb   Cached DB (auto-created)
```

---

## Pre-Deployment Checklist

- [ ] `data/` folder provisioned on target (see [Data Layer](#data-layer-sharing-the-10gb-dataset))
- [ ] `backend/.env` created from `backend/.env.example`
- [ ] AI API keys populated (optional — app degrades to template mode without them)
- [ ] `VITE_API_URL` set to the public backend URL in frontend build
- [ ] Port 8000 (backend) and 80/443 (frontend) open in firewall/security group
- [ ] At least **4GB RAM** available — DuckDB loads large tables into memory on first query

---

## Option A — Free Tier (Recommended for Demo)

### A1. Railway (easiest, ~10 min)

Railway auto-detects Python and Node apps, provides persistent volumes, and has a generous free tier.

**Steps:**

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. From project root
railway init

# 4. Upload data volume (Railway persistent volume)
#    In Railway dashboard: create a Volume, mount at /app/data
#    Then rsync your local data/ up:
railway run rsync -avz data/ /app/data/

# 5. Set environment variables in Railway dashboard:
#    DATA_DIR=/app/data
#    ANTHROPIC_API_KEY=... (or AWS keys)

# 6. Deploy backend
cd backend && railway up

# 7. Deploy frontend (separate Railway service)
cd ../frontend
# Set VITE_API_URL=https://your-backend.railway.app in Railway env vars
railway up
```

**Dockerfile used:** `docker-compose.yml` at project root (Railway can read it directly).

**Free tier limits:** 500 execution hours/month, 1GB RAM, 1GB persistent volume.  
For the full 10GB dataset, upgrade to the $5/mo Hobby plan with a larger volume.

---

### A2. Render (free tier, slower cold starts)

Render's free tier spins down after 15 min of inactivity (30 sec cold start on next request).

```bash
# render.yaml (create at project root)
```

Create a file `render.yaml`:

```yaml
services:
  - type: web
    name: ftm-backend
    env: python
    buildCommand: pip install -r backend/requirements.txt
    startCommand: cd backend && python3 main.py
    envVars:
      - key: DATA_DIR
        value: /opt/render/project/src/data
      - key: PORT
        value: 8000
    disk:
      name: data
      mountPath: /opt/render/project/src/data
      sizeGB: 15

  - type: web
    name: ftm-frontend
    env: node
    buildCommand: cd frontend && npm install && npm run build
    staticPublishPath: frontend/dist
    envVars:
      - key: VITE_API_URL
        fromService:
          name: ftm-backend
          type: web
          property: host
```

Push this file, connect repo to Render dashboard, and deploy.

**Upload data:** Use Render's shell (Dashboard → Shell) to pull data from Google Drive:
```bash
pip install gdown
gdown --folder https://drive.google.com/drive/folders/YOUR_FOLDER_ID -O /opt/render/project/src/data
```

---

### A3. Fly.io (more control, still free)

Fly.io gives you a real persistent VM with more control. Free tier: 3 shared-cpu VMs + 3GB volumes.

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# From project root
fly launch --no-deploy

# Create a persistent volume for data
fly volumes create ftm_data --size 15 --region iad

# Edit fly.toml — add the mount:
# [mounts]
#   source = "ftm_data"
#   destination = "/app/data"

# Set secrets
fly secrets set DATA_DIR=/app/data
fly secrets set ANTHROPIC_API_KEY=your_key_here

# Deploy
fly deploy

# SSH in and populate data volume
fly ssh console
# Then pull from Google Drive (see Data Layer section)
```

**fly.toml** (auto-generated, add the mounts section):

```toml
app = "ftm-backend"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[mounts]
  source = "ftm_data"
  destination = "/app/data"

[http_service]
  internal_port = 8000
  force_https = true

[[vm]]
  memory = "4gb"
  cpu_kind = "shared"
  cpus = 2
```

---

## Option B — AWS

### B1. EC2 (simplest AWS path)

Best for: simple, full-control, predictable cost. Recommended instance: **t3.medium** (2 vCPU, 4GB RAM, ~$30/mo) or **t3.large** (8GB RAM, ~$60/mo) if DuckDB needs more headroom.

```bash
# 1. Launch EC2 instance
#    AMI: Ubuntu 22.04 LTS
#    Instance type: t3.medium (minimum) or t3.large (recommended)
#    Storage: 30GB root + 20GB EBS for data
#    Security group: inbound 22 (SSH), 8000 (API), 80/443 (frontend)

# 2. SSH in
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# 3. Install dependencies
sudo apt update && sudo apt install -y python3 python3-pip nodejs npm nginx

# 4. Clone repo
git clone https://github.com/HamzaElSousi/Fraudster-Monsters---Agency-Hackathon-2026.git
cd Fraudster-Monsters---Agency-Hackathon-2026

# 5. Mount EBS data volume
sudo mkfs.ext4 /dev/xvdf
sudo mkdir -p /app/data
sudo mount /dev/xvdf /app/data
# Add to /etc/fstab for persistence:
echo "/dev/xvdf /app/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

# 6. Download data (from Google Drive — see Data Layer section)

# 7. Configure backend
cp backend/.env.example backend/.env
echo "DATA_DIR=/app/data" >> backend/.env
# Add API keys to backend/.env

# 8. Install Python deps + start backend
cd backend && pip3 install -r requirements.txt
nohup python3 main.py > /var/log/ftm-backend.log 2>&1 &

# 9. Build frontend
cd ../frontend
echo "VITE_API_URL=http://YOUR_EC2_IP:8000" > .env.production
npm install && npm run build

# 10. Configure nginx to serve frontend + proxy /api to backend
sudo tee /etc/nginx/sites-available/ftm <<'NGINX'
server {
    listen 80;
    root /home/ubuntu/Fraudster-Monsters---Agency-Hackathon-2026/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/ftm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Optional:** Use AWS Systems Manager Session Manager instead of SSH (no open port 22).

---

### B2. ECS + Fargate (containerized)

Best for: production-grade, auto-scaling ready (once DuckDB is replaced with RDS). For hackathon: over-engineered but impresses judges.

```bash
# 1. Build and push image to ECR
aws ecr create-repository --repository-name ftm-backend --region us-east-1
aws ecr get-login-password | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -t ftm-backend .
docker tag ftm-backend:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/ftm-backend:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/ftm-backend:latest

# 2. Create EFS volume for data (replaces local disk)
aws efs create-file-system --creation-token ftm-data

# 3. Create ECS Cluster, Task Definition, Service via console or CLI
#    Task definition: 2 vCPU / 4GB RAM minimum
#    Mount EFS at /app/data
#    Environment: DATA_DIR=/app/data

# 4. Frontend: deploy to S3 + CloudFront
aws s3 mb s3://ftm-frontend
cd frontend && npm run build
aws s3 sync dist/ s3://ftm-frontend --delete
aws cloudfront create-distribution --origin-domain-name ftm-frontend.s3-website-us-east-1.amazonaws.com
```

**Cost estimate:** Fargate (2vCPU/4GB) ~$60/mo + EFS ~$0.30/GB/mo + CloudFront ~$0/mo on free tier.

---

### B3. Elastic Beanstalk (PaaS on AWS)

Simpler than ECS, more AWS-managed. Good middle ground.

```bash
# Install EB CLI
pip install awsebcli

# From project root
eb init ftm-app --region us-east-1 --platform python-3.11

# Create .ebextensions/01_setup.config:
mkdir -p .ebextensions
cat > .ebextensions/01_setup.config <<'YAML'
option_settings:
  aws:elasticbeanstalk:application:environment:
    DATA_DIR: /var/app/data
  aws:elasticbeanstalk:container:python:
    WSGIPath: backend/main:app
packages:
  yum:
    python3: []
YAML

eb create ftm-env --instance-type t3.medium
eb setenv DATA_DIR=/var/app/data ANTHROPIC_API_KEY=your_key
eb deploy
```

**Frontend:** Deploy separately to S3 + CloudFront (same as B2 step 4).

---

## Option C — Google Cloud Platform (GCP)

### C1. Cloud Run (serverless containers)

**Best overall for hackathon/demo** — scales to zero (free when idle), HTTPS automatic, generous free tier (2M requests/mo).

```bash
# 1. Install gcloud CLI and authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Build and push to Artifact Registry
gcloud artifacts repositories create ftm-repo --repository-format=docker --location=us-central1
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT/ftm-repo/ftm-backend

# 3. Create a Cloud Storage bucket for data
gsutil mb -l us-central1 gs://ftm-data-YOUR_PROJECT
# Upload data files:
gsutil -m cp -r data/cra gs://ftm-data-YOUR_PROJECT/
gsutil -m cp -r data/fed gs://ftm-data-YOUR_PROJECT/
gsutil -m cp -r data/ab gs://ftm-data-YOUR_PROJECT/

# 4. Deploy Cloud Run service with a persistent disk (Cloud Run Volume Mount)
gcloud run deploy ftm-backend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT/ftm-repo/ftm-backend \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --set-env-vars DATA_DIR=/app/data \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest \
  --allow-unauthenticated

# 5. Frontend — deploy to Firebase Hosting (free)
npm install -g firebase-tools
firebase login
cd frontend
echo "VITE_API_URL=https://ftm-backend-xxxx.run.app" > .env.production
npm run build
firebase init hosting  # point to dist/
firebase deploy
```

**Cost:** Cloud Run free tier covers ~2M requests/month. Above that: ~$0.40 per million requests + compute time. For a demo with moderate traffic: effectively $0.

**Important:** Cloud Run containers are stateless — the DuckDB file won't persist between invocations. Two options:
- Mount a **Cloud Filestore** (NFS) volume at `/app/data` — ~$200/mo (expensive)
- Use **Cloud Run with min-instances=1** + a Cloud Storage FUSE mount (experimental but free-ish)
- **Recommended:** Use a small **Compute Engine VM** (C2 below) for the backend; use Cloud Run for a stateless API proxy only

---

### C2. Compute Engine (VM)

Same idea as EC2 but on GCP. Recommended instance: **e2-medium** (2 vCPU, 4GB RAM, ~$30/mo).

```bash
# 1. Create VM
gcloud compute instances create ftm-vm \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server

# 2. Create and attach persistent disk for data
gcloud compute disks create ftm-data-disk --size=20GB --zone=us-central1-a
gcloud compute instances attach-disk ftm-vm --disk=ftm-data-disk --zone=us-central1-a

# 3. SSH in and set up
gcloud compute ssh ftm-vm --zone=us-central1-a

# Inside VM:
sudo mkfs.ext4 /dev/sdb
sudo mkdir -p /app/data
sudo mount /dev/sdb /app/data
echo "/dev/sdb /app/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

sudo apt update && sudo apt install -y python3 python3-pip nodejs npm nginx git

git clone https://github.com/HamzaElSousi/Fraudster-Monsters---Agency-Hackathon-2026.git
cd Fraudster-Monsters---Agency-Hackathon-2026

# Download data (see Data Layer section)
# Then follow same steps as EC2 B1 from step 6 onward

# 4. Open firewall ports
gcloud compute firewall-rules create allow-ftm \
  --allow tcp:80,tcp:443,tcp:8000 \
  --target-tags=http-server
```

**Frontend:** Same nginx config as EC2, or deploy to **Firebase Hosting** (free).

---

## Data Layer: Sharing the 10GB Dataset

The `data/` folder is excluded from git (14GB — too large). Here is how to distribute it to teammates and deployment targets.

### Sharing with teammates via Google Drive

1. **Create a shared Google Drive folder** named `ftm-data-agency2026`
2. Upload the following (zip each subfolder for faster upload):
   ```
   data/cra/       → upload as cra.zip (~6GB)
   data/fed/       → upload as fed.zip (~3GB)
   data/ab/        → upload as ab.zip (~1GB)
   ```
3. **Share the folder link** with edit access to all team members
4. Each teammate runs:
   ```bash
   # Install gdown
   pip install gdown

   # Download and unzip (replace FOLDER_ID with the ID from the Drive URL)
   gdown --folder https://drive.google.com/drive/folders/FOLDER_ID -O data/
   unzip data/cra.zip -d data/
   unzip data/fed.zip -d data/
   unzip data/ab.zip -d data/
   ```
5. On first backend run (`python3 main.py`), DuckDB will load the JSONL files into `data/hackathon.duckdb` (~2 min). After that, startup is instant.

### Deploying data to a remote server

**Option 1 — rsync (SSH access):**
```bash
rsync -avzP --progress data/ user@YOUR_SERVER:/app/data/
```

**Option 2 — from Google Drive on the server:**
```bash
pip install gdown
gdown --folder https://drive.google.com/drive/folders/FOLDER_ID -O /app/data
```

**Option 3 — AWS S3 (if using AWS):**
```bash
# Upload
aws s3 sync data/ s3://your-ftm-data-bucket/

# Download on EC2/ECS
aws s3 sync s3://your-ftm-data-bucket/ /app/data/
```

**Option 4 — GCS (if using GCP):**
```bash
# Upload
gsutil -m rsync -r data/ gs://ftm-data-YOUR_PROJECT/

# Download on VM
gsutil -m rsync -r gs://ftm-data-YOUR_PROJECT/ /app/data/
```

### Folder structure expected by backend

```
data/
├── hackathon.duckdb          ← auto-created on first run (do NOT upload this)
├── cra/
│   ├── loops.jsonl
│   ├── loop_charity_financials.jsonl
│   ├── loop_financials.jsonl
│   ├── loop_participants.jsonl
│   ├── loop_edges.jsonl
│   ├── loop_edge_year_flows.jsonl
│   ├── identified_hubs.jsonl
│   ├── scc_summary.jsonl
│   ├── govt_funding_by_charity.jsonl
│   ├── cra_identification.jsonl
│   └── cra_directors.jsonl
├── fed/
│   └── grants_contributions.jsonl
└── ab/
    └── ab_sole_source.jsonl
```

---

## Environment Variables Reference

Create `backend/.env` from `backend/.env.example`:

```bash
# Required for AI chat (at least one):
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...          # Only needed for temporary credentials (event-day AWS)
ANTHROPIC_API_KEY=...          # Alternative to AWS Bedrock

# Optional overrides:
DATA_DIR=../data               # Default: ../data (relative to backend/)
PORT=8000                      # Default: 8000
HOST=0.0.0.0                   # Default: 0.0.0.0

# Frontend (set before build or as runtime env):
VITE_API_URL=http://localhost:8000   # Override if backend is on a different host
```

App works **without any API keys** — AI chat degrades to template responses. All data queries work normally.

---

## Docker Reference

A `docker-compose.yml` is included at the project root. It starts both services and serves the frontend via nginx on port 80.

```bash
# Build and start
docker-compose up --build

# With data volume (edit docker-compose.yml to mount your data/ path):
# volumes:
#   - ./data:/app/data

# Backend only
docker build -f Dockerfile -t ftm-backend .
docker run -p 8000:8000 -v $(pwd)/data:/app/data --env-file backend/.env ftm-backend
```

**Dockerfile** is at project root, targets the backend. Frontend is built as a multi-stage image and served via nginx.

---

## Post-Deploy Smoke Test

Run these checks after any deployment:

```bash
BASE=https://your-deployed-url.com  # or http://IP:8000 for backend-only

# 1. Health check
curl $BASE/api/health
# Expected: {"status":"ok","ai_enabled":true/false,"tables_loaded":true}

# 2. Stats (confirms DuckDB loaded)
curl "$BASE/api/stats" | python3 -m json.tool | head -20

# 3. Zombies
curl "$BASE/api/zombies?min_funding=100000&limit=5" | python3 -m json.tool

# 4. Loops
curl "$BASE/api/loops?min_hops=2&max_hops=6&limit=5" | python3 -m json.tool

# 5. Chat (template fallback — no keys needed)
curl -X POST $BASE/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "show me zombie charities"}' | python3 -m json.tool

# 6. Frontend loads
curl -s https://your-frontend-url.com | grep -c "Follow The Money"
```

All 6 passing = deployment successful.

---

## Cost Comparison

| Option | Platform | Monthly Cost | RAM | Notes |
|--------|----------|-------------|-----|-------|
| A1 Railway | Railway | Free–$5 | 1–2GB | Best for quick demo |
| A2 Render | Render | Free | 512MB | Cold starts on free tier |
| A3 Fly.io | Fly | Free | 256MB–4GB | Best free option with full control |
| B1 EC2 t3.medium | AWS | ~$30 | 4GB | Simple, predictable |
| B1 EC2 t3.large | AWS | ~$60 | 8GB | Recommended for DuckDB headroom |
| B2 ECS Fargate | AWS | ~$60–80 | 4–8GB | Production-grade |
| B3 Elastic Beanstalk | AWS | ~$35 | 4GB | Easier than ECS |
| C1 Cloud Run | GCP | ~$0–10 | 4GB | Needs persistent disk workaround |
| C2 e2-medium GCE | GCP | ~$27 | 4GB | Cheapest persistent VM |

**Recommendation for hackathon day:** Deploy to **Railway (A1)** or **Fly.io (A3)** in the morning. Takes ~15 minutes, free, and gives you a public HTTPS URL to show judges without any cloud account billing surprises.

**Recommendation post-hackathon:** Move to **EC2 t3.large (B1)** or **GCE e2-medium (C2)** for a persistent public demo. ~$30/mo, full control, no cold starts.
