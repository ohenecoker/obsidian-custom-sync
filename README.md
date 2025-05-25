# Obsidian Custom Sync Plugin

This plugin allows you to sync your Obsidian vault with your own server running on your Raspberry Pi.

## Installation

1. Copy the following files to your Obsidian vault's `.obsidian/plugins/obsidian-custom-sync/` folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`

2. Reload Obsidian or go to Settings → Community plugins and enable "Custom Sync"

## Setup

1. Open plugin settings
2. Set your server URL (default: `http://10.0.0.204:3001`)
3. Register a new account or login with existing credentials
4. Configure auto-sync interval (optional)
5. Click "Sync Now" to start syncing

## Features

- Manual sync via ribbon icon or command palette
- Automatic sync at configurable intervals
- Conflict resolution (server changes take precedence)
- Support for file creation, modification, and deletion
- Secure authentication with JWT tokens

## Server Setup

The sync server should be running on your Raspberry Pi at port 3001. It stores:
- User accounts (with hashed passwords)
- Vault data in SQLite database
- File content and metadata

## Usage

- Click the sync icon in the ribbon to manually sync
- Use Command Palette: "Sync vault with server"
- Configure auto-sync in settings for automatic syncing

## Security Notes

- The plugin uses JWT tokens for authentication
- Passwords are hashed on the server using bcrypt
- For production use, consider using HTTPS instead of HTTP
- The server URL can be changed to use your domain with HTTPS