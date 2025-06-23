# Clearlight Controls

A web-based control system for Clearlight sauna devices, featuring a SvelteKit frontend and Node.js backend with real-time communication via Socket.IO.

> **Important**: Replace `example.com` with your own domain throughout this README. While you can use IP addresses for local development or even production, SSL certificates are required for iPhone app pinning and secure production deployments.

## Features

- Real-time device control and monitoring
- Web-based interface built with SvelteKit and Tailwind CSS
- Socket.IO for live communication between frontend and backend
- Device connection management and error handling
- Responsive design with touch support

## Prerequisites

- Node.js (v22 or higher)
- pnpm (recommended) or npm
- Git
- Nginx (optional, for production)
- Certbot (for SSL certificates)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/spinrag/node-gizwits.git
git clone https://github.com/spinrag/node-clearlightsauna.git
cd node-clearlightsauna
```

### 2. Install Dependencies

This project uses pnpm workspaces with frontend and backend packages:

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install all dependencies for both frontend and backend
pnpm install
```

Repeat for node-gizwits
```bash
cd ../node-gizwits

npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Backend Configuration
PORT=3000
CLEARLIGHT_IP=192.168.1.100  # Replace with your device IP address

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:8099,http://localhost:3000,https://*.example.com

# Frontend Configuration (optional, defaults are used)
VITE_DEV_MODE=true
```

#### Environment Variables Explained

- `PORT`: Backend server port (default: 3000)
- `CLEARLIGHT_IP`: IP address of your Clearlight device
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS
  - Supports wildcards like `http://localhost:*` and `https://*.example.com`
- `VITE_DEV_MODE`: Frontend development mode flag

### 4. Development

#### Start Development Servers

```bash
# Start both frontend and backend in development mode
pnpm dev

# Or start them separately:
pnpm dev:frontend  # Frontend on http://localhost:8099
pnpm dev:backend   # Backend on http://localhost:3000
```

#### Available Scripts

```bash
# Development
pnpm dev                    # Start both frontend and backend
pnpm dev:frontend          # Start frontend only
pnpm dev:backend           # Start backend only

# Build
pnpm build                 # Build both frontend and backend

# Production
pnpm start                 # Start backend server
PORT=8099 node frontend/build # Start frontend server on port 8099
```

## Production Deployment

### 1. Build the Application

```bash
pnpm build
```

### 2. SSL Certificate with Let's Encrypt (Optional)

Install Certbot:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Or for manual installation
sudo apt install certbot
```

Obtain SSL certificates for both domains:

```bash
# Automatic installation with Nginx
sudo certbot --nginx -d sauna.example.com -d sauna-api.example.com

# Or manual installation
sudo certbot certonly --standalone -d sauna.example.com -d sauna-api.example.com
```

Set up auto-renewal:

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Add to crontab for automatic renewal
sudo crontab -e
# Add this line:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Nginx Configuration (Optional but required for SSL)

Create an Nginx configuration file `/etc/nginx/sites-available/clearlight-sauna`:

```nginx
# Frontend server configuration
server {
    listen 80;
    server_name sauna.example.com;

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name sauna.example.com;

    # SSL certificate and key files (adjust paths if necessary)
    ssl_certificate /etc/letsencrypt/live/sauna.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sauna.example.com/privkey.pem;

    # Optional: Strong Diffie-Hellman group
    ssl_dhparam /etc/ssl/certs/dhparam.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy settings for frontend
    location / {
        # Allow access without a password from the specified IP range
        satisfy any;
        allow 192.168.0.0/16;
        deny all;

        # Prompt for password if not in the allowed IP range
        auth_basic "Restricted Access";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://localhost:8099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API server configuration
server {
    listen 80;
    server_name sauna-api.example.com;

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name sauna-api.example.com;

    # SSL certificate and key files (adjust paths if necessary)
    ssl_certificate /etc/letsencrypt/live/sauna-api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sauna-api.example.com/privkey.pem;

    # Optional: Strong Diffie-Hellman group
    ssl_dhparam /etc/ssl/certs/dhparam.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy settings for backend API
    location / {
        # Allow access without a password from the specified IP range
        satisfy any;
        allow 192.168.0.0/16;
        deny all;

        # Prompt for password if not in the allowed IP range
        auth_basic "Restricted Access";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support for Socket.IO
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/clearlight-controls /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Basic Authentication Setup (Optional)

If you want to use basic authentication for additional security:

```bash
# Install apache2-utils for htpasswd command
sudo apt install apache2-utils

# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd username

# Add additional users (without -c flag)
sudo htpasswd /etc/nginx/.htpasswd another_username
```

### 5. Start Production Server

Create a production `.env` file in the root directory:

```bash
# Production Environment Configuration
NODE_ENV=production
PORT=3000
CLEARLIGHT_IP=your-device-ip
ALLOWED_ORIGINS=https://sauna.example.com,https://sauna-api.example.com

# Optional: Logging level (error, warn, info, debug)
LOG_LEVEL=warn
```

Then start the backend server:

```bash
# Start the backend server
pnpm start
```

For persistent deployment, consider using a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Start the application from root of repository
pm2 start "pnpm dev:backend" --name sauna-backend
pm2 start "PORT=8099 node frontend/build" --name sauna-frontend

# Save PM2 configuration
pm2 save
pm2 startup
```

## Project Structure

```
node-clearlightsauna/
├── frontend/                # SvelteKit frontend application
│   ├── src/                 # Source code
│   ├── static/              # Static assets
│   ├── build/               # Built files (after build)
│   └── package.json         # Frontend dependencies
├── backend/                 # Node.js backend server
│   ├── server.js            # Main server file
│   ├── public/              # Static files served by backend
│   └── package.json         # Backend dependencies
├── package.json             # Root package.json (workspace)
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── README.md                # This file
```

## Troubleshooting

### Common Issues

1. **Device Connection Failed**
   - Verify the `CLEARLIGHT_IP` in your `.env` file
   - Ensure the device is powered on and connected to the network
   - Check firewall settings

2. **CORS Errors**
   - Verify `ALLOWED_ORIGINS` includes your frontend URL
   - Check that the backend is running on the correct port

3. **SSL Certificate Issues**
   - Ensure your domain is properly configured with DNS
   - Check that port 80/443 is accessible for Certbot
   - Verify Nginx configuration syntax

4. **Build Errors**
   - Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
   - Check Node.js version compatibility

5. **Authentication Issues**
   - Verify the `.htpasswd` file exists and has correct permissions
   - Check that the IP allow/deny rules are configured correctly

### Logs

- Backend logs: Check console output or PM2 logs (`pm2 logs sauna-backend`)
- Frontend logs: PM2 logs (`pm2 logs sauna-frontend`)
- Nginx logs: `/var/log/nginx/error.log` and `/var/log/nginx/access.log`
- SSL renewal logs: `/var/log/letsencrypt/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0).

**Key Requirements:**
- **Attribution**: You must credit the original authors
- **Copyleft**: Any derivative work must also be open source under GPL-3.0
- **Source Code**: You must provide source code for any modifications
- **Bug Fixes**: Improvements must be shared back with the community

**What this means:**
- ✅ You can use, modify, and distribute this code
- ✅ You can use it commercially
- ❌ You cannot make it proprietary
- ❌ You cannot distribute without source code
- ✅ You must credit the original authors
- ✅ You must share any improvements back

For the complete license text, see the [LICENSE](LICENSE) file or visit [https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html).