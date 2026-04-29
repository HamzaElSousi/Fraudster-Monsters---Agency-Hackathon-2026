# Deploy to AWS — Follow The Money

> Copy-paste guide. EC2 + your existing Bedrock credentials. ~20 minutes.

---

## What You Need Before Starting

- AWS Console access (same account as your Bedrock credentials)
- Your `backend/.env` file with AWS keys already working locally
- The `data/hackathon.duckdb` file (~768MB) on your local machine
- A terminal with SSH

---

## Step 1: Launch EC2 Instance (AWS Console)

1. Go to **EC2 > Launch Instance** in the AWS Console
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `follow-the-money` |
| AMI | **Ubuntu 24.04 LTS** (free tier eligible) |
| Instance type | **t3.large** (8GB RAM — DuckDB needs it) |
| Key pair | Create new or use existing (download the .pem file) |
| Network | Default VPC, public subnet, **Auto-assign public IP: Enable** |
| Storage | **30 GB** gp3 (enough for OS + app + DuckDB) |

3. Under **Security Group**, create a new one with these inbound rules:

| Type | Port | Source |
|------|------|--------|
| SSH | 22 | My IP |
| HTTP | 80 | Anywhere (0.0.0.0/0) |
| Custom TCP | 8000 | Anywhere (0.0.0.0/0) |

4. Click **Launch Instance**. Wait for it to show "Running".
5. Copy the **Public IPv4 address** (e.g., `3.15.42.100`).

---

## Step 2: Upload Data to the Server

From your local terminal (WSL or PowerShell):

```bash
# Set your EC2 details
EC2_IP=3.15.42.100          # ← replace with your IP
KEY=~/your-key.pem          # ← replace with your key path

# Fix key permissions (required)
chmod 400 $KEY

# Upload the pre-built DuckDB file (~768MB, takes 5-10 min on fast internet)
scp -i $KEY "/mnt/c/Users/Hamza/Desktop/Current Project/AI Accountability Hackathon/data/hackathon.duckdb" ubuntu@$EC2_IP:~/hackathon.duckdb
```

If your upload is too slow for the full 768MB, you can also upload just the essential JSONL files (the server will build DuckDB on first run, takes ~2 min):

```bash
# Alternative: upload only the small essential files
scp -i $KEY -r "/mnt/c/Users/Hamza/Desktop/Current Project/AI Accountability Hackathon/data/cra" ubuntu@$EC2_IP:~/data-cra/
scp -i $KEY -r "/mnt/c/Users/Hamza/Desktop/Current Project/AI Accountability Hackathon/data/ab" ubuntu@$EC2_IP:~/data-ab/
scp -i $KEY -r "/mnt/c/Users/Hamza/Desktop/Current Project/AI Accountability Hackathon/data/fed" ubuntu@$EC2_IP:~/data-fed/
```

---

## Step 3: SSH In and Set Up the Server

```bash
ssh -i $KEY ubuntu@$EC2_IP
```

Then run this entire block:

```bash
# Install system dependencies
sudo apt update && sudo apt install -y python3 python3-pip python3-venv nodejs npm nginx git

# Clone the repo
git clone https://github.com/HamzaElSousi/Fraudster-Monsters---Agency-Hackathon-2026.git
cd Fraudster-Monsters---Agency-Hackathon-2026

# Create data directory and move uploaded files
mkdir -p data
if [ -f ~/hackathon.duckdb ]; then
    mv ~/hackathon.duckdb data/hackathon.duckdb
    echo "DuckDB file placed. Backend will start instantly."
else
    # If you uploaded JSONL files instead:
    mv ~/data-cra data/cra 2>/dev/null
    mv ~/data-ab data/ab 2>/dev/null
    mv ~/data-fed data/fed 2>/dev/null
    echo "JSONL files placed. First run will build DuckDB (~2 min)."
fi
```

---

## Step 4: Configure Backend Environment

```bash
# Create .env from template
cp backend/.env.example backend/.env

# Edit with your real credentials
nano backend/.env
```

Paste your working credentials (same as your local `backend/.env`):

```env
# AWS Bedrock (your existing hackathon credentials)
AWS_ACCESS_KEY_ID=ASIA2B3E...your key...
AWS_SECRET_ACCESS_KEY=33ZWOVd...your secret...
AWS_SESSION_TOKEN=IQoJb3Jp...your token...
AWS_REGION=us-west-2
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6

# Data path
DATA_DIR=/home/ubuntu/Fraudster-Monsters---Agency-Hackathon-2026/data

# Server
HOST=0.0.0.0
PORT=8000
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## Step 5: Start Backend

```bash
cd ~/Fraudster-Monsters---Agency-Hackathon-2026

# Install Python dependencies
cd backend && pip3 install -r requirements.txt --break-system-packages

# Start backend in background
nohup python3 main.py > /tmp/ftm-backend.log 2>&1 &

# Wait for it to load (watch the log)
tail -f /tmp/ftm-backend.log
# Wait until you see: "Uvicorn running on http://0.0.0.0:8000"
# Then press Ctrl+C to stop tailing
```

Test it:
```bash
curl http://localhost:8000/api/health
# Should return: {"status":"ok", ...}

curl http://localhost:8000/api/stats | python3 -m json.tool | head -5
# Should show zombie_count, total_funding_loops, etc.
```

---

## Step 6: Build and Serve Frontend

```bash
cd ~/Fraudster-Monsters---Agency-Hackathon-2026/frontend

# Install Node dependencies
npm install

# Build for production (API calls go to same server via nginx proxy)
VITE_API_URL="" npm run build
```

Configure nginx to serve the frontend and proxy API calls:

```bash
sudo tee /etc/nginx/sites-available/ftm <<'NGINX'
server {
    listen 80;
    server_name _;

    root /home/ubuntu/Fraudster-Monsters---Agency-Hackathon-2026/frontend/dist;
    index index.html;

    # Frontend — React SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
NGINX

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/ftm /etc/nginx/sites-enabled/ftm
sudo nginx -t && sudo systemctl restart nginx
```

---

## Step 7: Open in Browser

Go to: **http://YOUR_EC2_IP** (port 80, no port number needed)

Example: `http://3.15.42.100`

---

## Step 8: Verify Everything Works

Run through this checklist:

```bash
EC2_IP=3.15.42.100  # your IP

# Health check
curl http://$EC2_IP/api/health

# Stats loaded
curl http://$EC2_IP/api/stats | python3 -m json.tool | head -10

# Zombies return data
curl "http://$EC2_IP/api/zombies?limit=3" | python3 -m json.tool | head -20

# AI chat works (Bedrock)
curl -X POST http://$EC2_IP/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "show me zombie charities"}' | python3 -m json.tool | head -10
```

Open in browser and test:
- [ ] Home page loads with stats
- [ ] Dashboard shows 6 finding cards with real numbers
- [ ] Click a zombie row — navigates to entity case file
- [ ] AI Chat — type a question, get agentic response with tool badges
- [ ] Alerts page shows cross-challenge entities

---

## Troubleshooting

**Backend won't start:**
```bash
# Check the log
cat /tmp/ftm-backend.log | tail -30

# Common fix: DuckDB file not found
ls -la data/hackathon.duckdb
# If missing, check DATA_DIR in backend/.env matches the actual path
```

**Frontend shows blank page:**
```bash
# Check nginx config
sudo nginx -t

# Check frontend built successfully
ls frontend/dist/index.html

# Rebuild if needed
cd frontend && VITE_API_URL="" npm run build
```

**AI chat returns template responses (not agentic):**
```bash
# Check if AI is enabled
curl http://localhost:8000/api/health | python3 -m json.tool | grep ai_enabled

# If false: your AWS session token may have expired
# Get new credentials and update backend/.env, then restart:
kill $(pgrep -f "python3 main.py")
cd backend && nohup python3 main.py > /tmp/ftm-backend.log 2>&1 &
```

**Session token expired (common with hackathon credentials):**
```bash
# Update backend/.env with fresh credentials
nano ~/Fraudster-Monsters---Agency-Hackathon-2026/backend/.env

# Restart backend
kill $(pgrep -f "python3 main.py")
cd ~/Fraudster-Monsters---Agency-Hackathon-2026/backend
nohup python3 main.py > /tmp/ftm-backend.log 2>&1 &
```

---

## Quick Reference

| What | Where |
|------|-------|
| App URL | `http://YOUR_EC2_IP` |
| Backend API | `http://YOUR_EC2_IP/api/health` |
| Backend logs | `tail -f /tmp/ftm-backend.log` |
| Restart backend | `kill $(pgrep -f "python3 main.py") && cd ~/Fraudster-Monsters---Agency-Hackathon-2026/backend && nohup python3 main.py > /tmp/ftm-backend.log 2>&1 &` |
| Rebuild frontend | `cd ~/Fraudster-Monsters---Agency-Hackathon-2026/frontend && VITE_API_URL="" npm run build && sudo systemctl restart nginx` |
| SSH in | `ssh -i your-key.pem ubuntu@YOUR_EC2_IP` |
| Estimated cost | ~$0.08/hr ($2/day) for t3.large |

---

## After the Hackathon

To avoid charges, **stop or terminate the EC2 instance** from the AWS Console when you're done presenting. A stopped instance costs ~$0 (only EBS storage at ~$2.40/month for 30GB). A terminated instance costs nothing.
