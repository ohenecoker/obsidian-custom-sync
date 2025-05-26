# Obsidian Custom Sync Plugin

A self-hosted synchronization plugin for Obsidian that allows you to sync your vaults across devices using your own server.

## Features

- 🔄 **Full vault synchronization** - Sync all your notes, folders, and attachments
- 🏠 **Self-hosted** - Complete control over your data on your own server
- 📱 **Cross-platform** - Works on desktop and mobile (iOS/Android)
- 🔐 **Secure authentication** - JWT tokens and bcrypt password hashing
- ⚡ **Auto-sync** - Configurable automatic synchronization intervals
- 🗂️ **Multi-vault support** - Sync multiple vaults to the same server
- 🚀 **Quick Setup** - Easy configuration sharing between devices
- 🔄 **Conflict resolution** - Smart handling of simultaneous edits

## Installation

### Desktop

1. Download the latest release from [Releases](https://github.com/obsidian-sync-plugin/obsidian-sync-plugin/releases)
2. Extract files to your vault's `.obsidian/plugins/obsidian-custom-sync/` folder
3. Reload Obsidian
4. Enable "Custom Sync" in Settings → Community plugins

### Mobile (iOS/Android)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, add beta plugin: `obsidian-sync-plugin/obsidian-sync-plugin`
3. Enable the Custom Sync plugin

## Setup

### Server Setup

First, you need to run the sync server. See the [server repository](https://github.com/obsidian-sync-plugin/sync-server) for installation instructions.

### Plugin Configuration

1. Open plugin settings
2. Enter your server URL (e.g., `https://your-domain.com/api`)
3. Register a new account or login with existing credentials
4. Set vault name (defaults to current vault name)
5. Configure auto-sync interval (optional)
6. Click "Sync Now" to start syncing

### Quick Setup for Additional Devices

1. On your configured device, go to plugin settings
2. Click "Copy Quick Setup Code"
3. On the new device, paste the code in the Quick Setup section
4. Select which vault to sync
5. Click "Apply Quick Setup"

## Usage

### Manual Sync
- Click the sync icon in the ribbon
- Use Command Palette: "Sync vault with server"
- Use the "Sync Now" button in settings

### Automatic Sync
- Set sync interval in settings (in minutes)
- Plugin will sync automatically at specified intervals
- Set to 0 to disable auto-sync

### Multi-Vault Sync

To sync multiple vaults:

1. Use "Fetch All Vaults" to see available vaults
2. Use "Sync All Vaults" to pull all vaults into a "Synced Vaults" folder
3. Or create separate Obsidian vaults for each synced vault

## Security

- All communication uses JWT authentication
- Passwords are hashed with bcrypt on the server
- Use HTTPS in production for encrypted communication
- Server stores vault data in SQLite database

## Building from Source

```bash
npm install
npm run build
```

For development with auto-reload:
```bash
npm run dev
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

- Report issues at [GitHub Issues](https://github.com/obsidian-sync-plugin/obsidian-sync-plugin/issues)
- For server setup help, see the [server documentation](https://github.com/obsidian-sync-plugin/sync-server)

## Acknowledgments

Built for the Obsidian community with ❤️