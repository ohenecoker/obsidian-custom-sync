# Setup Guide

This guide will help you set up the Obsidian Custom Sync Plugin and server.

## Prerequisites

- Node.js 18+ installed on your server
- Obsidian v0.15.0 or higher
- A server or Raspberry Pi to host the sync server

## Server Setup

### 1. Install the Sync Server

```bash
# Clone the server repository
git clone https://github.com/obsidian-sync-plugin/sync-server.git
cd sync-server

# Install dependencies
npm install

# Start the server
npm start
```

### 2. Configure the Server

The server runs on port 3001 by default. You can configure it using environment variables:

```bash
# Create .env file
PORT=3001
JWT_SECRET=your-secret-key-here
DB_PATH=./data/sync.db
```

### 3. Set Up HTTPS (Recommended)

For production use, set up a reverse proxy with HTTPS:

#### Using Nginx:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Using Cloudflare (Easy Option):

1. Add your domain to Cloudflare
2. Point your domain to your server's IP
3. Enable "Full" SSL mode
4. Use Cloudflare's proxy for automatic HTTPS

## Plugin Setup

### Desktop Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/obsidian-custom-sync/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

### Mobile Installation

1. Install BRAT plugin from Community plugins
2. In BRAT settings, click "Add Beta plugin"
3. Enter: `obsidian-sync-plugin/obsidian-sync-plugin`
4. Enable the Custom Sync plugin

### Configuration

1. Open plugin settings
2. Enter your server URL:
   - Local: `http://192.168.1.100:3001`
   - With HTTPS: `https://your-domain.com/api`
3. Register a new account or login
4. Set your vault name
5. Configure auto-sync interval (optional)

## Quick Setup for Multiple Devices

### On Your First Device:
1. Configure the plugin completely
2. Go to settings and click "Copy Quick Setup Code"
3. The code contains your server URL, credentials, and vault list

### On Additional Devices:
1. Install the plugin
2. Open settings
3. Paste the Quick Setup code
4. Select which vault to sync
5. Click "Apply Quick Setup"

## Troubleshooting

### Connection Issues
- Check server is running: `curl http://your-server:3001/health`
- Verify firewall allows port 3001
- For HTTPS, ensure certificates are valid

### Sync Issues
- Check "Last sync" time in settings
- Use "Sync Now" to force sync
- Check server logs for errors

### Mobile Issues
- Ensure BRAT is properly installed
- Try reinstalling the plugin via BRAT
- Check Obsidian console for errors

## Security Best Practices

1. **Use HTTPS in production**
2. **Set a strong JWT_SECRET**
3. **Regular backups of server database**
4. **Use strong passwords**
5. **Keep server software updated**

## Advanced Configuration

### Multiple Vaults
- Each vault syncs independently
- Use "Sync All Vaults" to pull all vaults
- Vaults are organized in "Synced Vaults" folder

### Auto-sync
- Set interval in minutes (0 to disable)
- Plugin syncs automatically when files change
- Manual sync always available via ribbon icon

### Conflict Resolution
- Server changes take precedence
- Local changes are preserved if newer
- No data is lost during conflicts