#!/bin/bash

# Exit on error
set -e

echo "🚀 Deploying AI service to production..."

# Check if running as root (required for system service)
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

# Install system dependencies
echo "📦 Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-pip python3-venv nginx supervisor

# Create service user
echo "👤 Creating service user..."
useradd -r -s /bin/false aiservice || true

# Create application directories
echo "📁 Creating application directories..."
mkdir -p /opt/aiservice
mkdir -p /var/log/aiservice

# Copy application files
echo "📋 Copying application files..."
cp -r ./* /opt/aiservice/
chown -R aiservice:aiservice /opt/aiservice
chown -R aiservice:aiservice /var/log/aiservice

# Setup virtual environment
echo "🔧 Setting up virtual environment..."
python3 -m venv /opt/aiservice/venv
source /opt/aiservice/venv/bin/activate
pip install --upgrade pip
pip install -r /opt/aiservice/requirements.txt

# Create supervisor configuration
echo "⚙️ Configuring supervisor..."
cat > /etc/supervisor/conf.d/aiservice.conf << EOF
[program:aiservice]
directory=/opt/aiservice
command=/opt/aiservice/venv/bin/gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b unix:/tmp/aiservice.sock
user=aiservice
autostart=true
autorestart=true
stderr_logfile=/var/log/aiservice/error.log
stdout_logfile=/var/log/aiservice/access.log
environment=ENVIRONMENT="production"
EOF

# Create nginx configuration
echo "🌐 Configuring nginx..."
cat > /etc/nginx/sites-available/aiservice << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://unix:/tmp/aiservice.sock;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Enable nginx site
ln -sf /etc/nginx/sites-available/aiservice /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Reload services
echo "🔄 Reloading services..."
supervisorctl reread
supervisorctl update
supervisorctl restart aiservice
nginx -t && systemctl restart nginx

echo "✅ Deployment complete!"
echo "🌍 Service should now be running on port 80"
echo "📝 Logs are available in /var/log/aiservice/"
echo "💡 To check status: supervisorctl status aiservice"
