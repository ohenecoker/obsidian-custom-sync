# Release v1.4.1

## What's New

This release fixes a critical issue with the Quick Setup feature on mobile devices.

### Bug Fixes
- **Fixed Quick Setup on Mobile**: The Quick Setup text field now displays properly on mobile devices by using a text area instead of a text input field
- **Improved Mobile UI**: The Quick Setup code input is now larger and more user-friendly on mobile devices

### Installation

#### Desktop
1. Download `obsidian-custom-sync-1.4.1.zip`
2. Extract to `.obsidian/plugins/obsidian-custom-sync/`
3. Reload Obsidian and enable the plugin

#### Mobile
1. Install BRAT plugin
2. Add beta plugin: `obsidian-sync-plugin/obsidian-sync-plugin`
3. Enable Custom Sync plugin

### Quick Setup
The Quick Setup feature allows you to easily configure the plugin on new devices:
1. On a configured device, copy the Quick Setup code
2. On the new device, paste the code and select a vault
3. Click "Apply Quick Setup" to complete configuration

### Requirements
- Obsidian v0.15.0 or higher
- A running sync server (see server repository for setup)

### Support
Report issues at: https://github.com/obsidian-sync-plugin/obsidian-sync-plugin/issues