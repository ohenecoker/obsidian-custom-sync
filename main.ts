import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder } from 'obsidian';

interface SyncSettings {
    serverUrl: string;
    username: string;
    token: string;
    vaultName: string;
    syncInterval: number;
    lastSync: string;
    syncAllVaults: boolean;
    knownVaults: string[];
    quickSetupCode?: string;
}

const DEFAULT_SETTINGS: SyncSettings = {
    serverUrl: '',
    username: '',
    token: '',
    vaultName: '',
    syncInterval: 5, // minutes
    lastSync: '',
    syncAllVaults: false,
    knownVaults: []
}

export default class ObsidianSyncPlugin extends Plugin {
    settings: SyncSettings;
    syncInterval: number;
    isSyncing: boolean = false;

    async onload() {
        await this.loadSettings();

        // Add ribbon icon
        const ribbonIconEl = this.addRibbonIcon('sync', 'Sync Vault', async (evt: MouseEvent) => {
            await this.syncVault();
        });

        // Add command
        this.addCommand({
            id: 'sync-vault',
            name: 'Sync vault with server',
            callback: async () => {
                await this.syncVault();
            }
        });

        // Add command for syncing all vaults
        this.addCommand({
            id: 'sync-all-vaults',
            name: 'Sync all vaults with server',
            callback: async () => {
                await this.syncAllVaults();
            }
        });

        // Add command for vault setup instructions
        this.addCommand({
            id: 'show-vault-setup',
            name: 'Show vault setup instructions',
            callback: async () => {
                await this.showVaultSetupInstructions();
            }
        });

        // Add settings tab
        this.addSettingTab(new SyncSettingTab(this.app, this));

        // Start auto-sync if configured
        if (this.settings.token && this.settings.syncInterval > 0) {
            this.startAutoSync();
        }

        // Register events
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (!this.isSyncing && file instanceof TFile) {
                    await this.queueFileForSync(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (!this.isSyncing && file instanceof TFile) {
                    await this.queueFileForDeletion(file);
                }
            })
        );
    }

    onunload() {
        if (this.syncInterval) {
            window.clearInterval(this.syncInterval);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    startAutoSync() {
        if (this.syncInterval) {
            window.clearInterval(this.syncInterval);
        }

        this.syncInterval = window.setInterval(async () => {
            await this.syncVault();
        }, this.settings.syncInterval * 60 * 1000);
    }

    async login(username: string, password: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.settings.serverUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            this.settings.token = data.token;
            this.settings.username = username;
            await this.saveSettings();
            return true;
        } catch (error) {
            console.error('Login error:', error);
            new Notice('Login failed: ' + error.message);
            return false;
        }
    }

    async registerUser(username: string, password: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.settings.serverUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Registration failed');
            }

            // Auto-login after registration
            return await this.login(username, password);
        } catch (error) {
            console.error('Registration error:', error);
            new Notice('Registration failed: ' + error.message);
            return false;
        }
    }

    async syncVault() {
        if (this.isSyncing) {
            new Notice('Sync already in progress');
            return;
        }

        if (!this.settings.token) {
            new Notice('Please login first');
            return;
        }

        this.isSyncing = true;
        new Notice('Starting sync...');

        try {
            // Ensure vault exists on server
            await this.ensureVault();

            // Pull changes from server
            await this.pullChanges();

            // Push local changes to server
            await this.pushChanges();

            this.settings.lastSync = new Date().toISOString();
            await this.saveSettings();

            new Notice('Sync completed successfully');
        } catch (error) {
            console.error('Sync error:', error);
            new Notice('Sync failed: ' + error.message);
        } finally {
            this.isSyncing = false;
        }
    }

    async ensureVault() {
        const vaultName = this.settings.vaultName || this.app.vault.getName();
        
        const response = await fetch(`${this.settings.serverUrl}/vault`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ vaultName })
        });

        if (!response.ok) {
            throw new Error('Failed to create/access vault on server');
        }

        this.settings.vaultName = vaultName;
        await this.saveSettings();
    }

    async pullChanges() {
        const vaultName = this.settings.vaultName || this.app.vault.getName();
        
        const response = await fetch(`${this.settings.serverUrl}/sync/pull`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                vaultName,
                lastSync: this.settings.lastSync
            })
        });

        if (!response.ok) {
            throw new Error('Failed to pull changes from server');
        }

        const data = await response.json();
        const serverFiles = data.files;

        // Apply server changes to local vault
        for (const serverFile of serverFiles) {
            const localFile = this.app.vault.getAbstractFileByPath(serverFile.path);
            
            if (serverFile.deleted) {
                // Delete local file if it exists
                if (localFile instanceof TFile) {
                    await this.app.vault.delete(localFile);
                }
            } else {
                // Create or update local file
                if (localFile instanceof TFile) {
                    const localMtime = localFile.stat.mtime;
                    if (serverFile.modified_time > localMtime) {
                        await this.app.vault.modify(localFile, serverFile.content);
                    }
                } else {
                    // Create directories if needed
                    const dir = serverFile.path.substring(0, serverFile.path.lastIndexOf('/'));
                    if (dir) {
                        await this.ensureDirectory(dir);
                    }
                    await this.app.vault.create(serverFile.path, serverFile.content);
                }
            }
        }
    }

    async pushChanges() {
        const vaultName = this.settings.vaultName || this.app.vault.getName();
        const files = this.app.vault.getMarkdownFiles();
        
        const filesToSync = [];

        for (const file of files) {
            const content = await this.app.vault.read(file);
            filesToSync.push({
                path: file.path,
                content: content,
                modifiedTime: file.stat.mtime,
                deleted: false
            });
        }

        if (filesToSync.length === 0) {
            return;
        }

        const response = await fetch(`${this.settings.serverUrl}/sync/push`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                vaultName,
                files: filesToSync
            })
        });

        if (!response.ok) {
            throw new Error('Failed to push changes to server');
        }
    }

    async ensureDirectory(path: string) {
        const parts = path.split('/');
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    async queueFileForSync(file: TFile) {
        // In a real implementation, you might want to batch these
        // For now, we'll just note that the file changed
        console.log('File modified:', file.path);
    }

    async queueFileForDeletion(file: TFile) {
        // In a real implementation, you might want to batch these
        // For now, we'll just note that the file was deleted
        console.log('File deleted:', file.path);
    }

    async syncAllVaults() {
        if (!this.settings.token) {
            new Notice('Please login first');
            return;
        }

        new Notice('Fetching all vaults from server...');

        try {
            // Get list of all vaults for this user
            const response = await fetch(`${this.settings.serverUrl}/vaults`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.token}`,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch vault list');
            }

            const vaults = await response.json();
            this.settings.knownVaults = vaults.map((v: any) => v.name);
            await this.saveSettings();

            new Notice(`Found ${vaults.length} vaults. Syncing all...`);

            // Create a folder for synced vaults
            const syncedVaultsFolder = 'Synced Vaults';
            await this.ensureDirectory(syncedVaultsFolder);

            // Sync each vault into its own folder
            for (const vault of vaults) {
                // Skip if it's the current vault
                if (vault.name === this.settings.vaultName || vault.name === this.app.vault.getName()) {
                    continue;
                }

                new Notice(`Syncing vault: ${vault.name}`);
                
                // Create folder for this vault
                const vaultFolder = `${syncedVaultsFolder}/${vault.name}`;
                await this.ensureDirectory(vaultFolder);

                // Fetch files for this vault
                const filesResponse = await fetch(`${this.settings.serverUrl}/sync/pull`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.settings.token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        vaultName: vault.name,
                        lastSync: null // Get all files
                    })
                });

                if (!filesResponse.ok) {
                    new Notice(`Failed to sync vault: ${vault.name}`);
                    continue;
                }

                const data = await filesResponse.json();
                const serverFiles = data.files;

                // Create files in the vault folder
                for (const serverFile of serverFiles) {
                    if (!serverFile.deleted && serverFile.content) {
                        const targetPath = `${vaultFolder}/${serverFile.path}`;
                        
                        // Ensure directory exists
                        const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
                        if (dir) {
                            await this.ensureDirectory(dir);
                        }

                        // Check if file exists
                        const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
                        
                        if (existingFile instanceof TFile) {
                            // Update existing file
                            await this.app.vault.modify(existingFile, serverFile.content);
                        } else {
                            // Create new file
                            await this.app.vault.create(targetPath, serverFile.content);
                        }
                    }
                }
            }

            new Notice('All vaults synced successfully!');
        } catch (error) {
            console.error('Sync all vaults error:', error);
            new Notice('Failed to sync all vaults: ' + error.message);
        }
    }

    async fetchAllVaults() {
        if (!this.settings.token) {
            new Notice('Please login first');
            return;
        }

        try {
            const response = await fetch(`${this.settings.serverUrl}/vaults`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.token}`,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch vault list');
            }

            const vaults = await response.json();
            return vaults;
        } catch (error) {
            console.error('Fetch vaults error:', error);
            new Notice('Failed to fetch vaults: ' + error.message);
            return [];
        }
    }

    async showVaultSetupInstructions() {
        const vaults = await this.fetchAllVaults();
        if (!vaults || vaults.length === 0) {
            new Notice('No vaults found on server');
            return;
        }

        // Generate a quick setup code that includes all settings
        const quickSetupData = {
            serverUrl: this.settings.serverUrl,
            username: this.settings.username,
            token: this.settings.token,
            vaults: vaults.map((v: any) => v.name)
        };
        const quickSetupCode = btoa(JSON.stringify(quickSetupData));

        // Create a file with instructions
        const instructions = `# Vault Setup Instructions for Mobile

## Quick Setup (NEW! - Fewer Steps)

### Your Quick Setup Code:
\`\`\`
${quickSetupCode}
\`\`\`

### Steps:
1. Create a new vault in Obsidian mobile
2. Install BRAT plugin
3. Add this plugin: \`obsidian-sync-plugin/obsidian-sync-plugin\`
4. Enable the plugin
5. In plugin settings, paste the Quick Setup Code above
6. Select which vault to sync from the dropdown
7. Click "Apply Quick Setup" - Done!

## Your Vaults on Server:
${vaults.map((v: any) => `- ${v.name}`).join('\n')}

## Manual Setup (if Quick Setup doesn't work):

1. **For each vault you want to access:**
   - In Obsidian mobile, tap "Create new vault" or "Open folder as vault"
   - Name it the same as on the server (e.g., "${vaults[0]?.name || 'Work'}")
   - Create the vault

2. **Install this sync plugin in the new vault:**
   - Go to Settings → Community plugins
   - Browse and install "BRAT" 
   - Use BRAT to add: obsidian-sync-plugin/obsidian-sync-plugin
   - Enable the Custom Sync plugin

3. **Configure the plugin:**
   - Server URL: ${this.settings.serverUrl}
   - Username: ${this.settings.username}
   - Vault name: [Same as the vault name on server]
   - Use the same login credentials

4. **Sync the vault:**
   - Click "Sync Now" to pull all files from the server
`;

        // Create or update the instructions file
        const fileName = 'Vault Setup Instructions.md';
        const existingFile = this.app.vault.getAbstractFileByPath(fileName);
        
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, instructions);
        } else {
            await this.app.vault.create(fileName, instructions);
        }

        new Notice('Setup instructions created! Check "Vault Setup Instructions.md"');
        
        // Open the file
        const file = this.app.vault.getAbstractFileByPath(fileName);
        if (file instanceof TFile) {
            await this.app.workspace.openLinkText(fileName, '', false);
        }
    }

    async applyQuickSetup(code: string, selectedVault: string) {
        try {
            const data = JSON.parse(atob(code));
            
            // Apply settings
            this.settings.serverUrl = data.serverUrl;
            this.settings.username = data.username;
            this.settings.token = data.token;
            this.settings.vaultName = selectedVault;
            this.settings.knownVaults = data.vaults || [];
            
            await this.saveSettings();
            
            new Notice('Quick setup applied! Syncing vault...');
            
            // Automatically sync
            await this.syncVault();
            
            return true;
        } catch (error) {
            new Notice('Invalid quick setup code');
            console.error('Quick setup error:', error);
            return false;
        }
    }
}

class SyncSettingTab extends PluginSettingTab {
    plugin: ObsidianSyncPlugin;

    constructor(app: App, plugin: ObsidianSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Custom Sync Settings'});

        // Quick Setup Section (shown first if not logged in)
        if (!this.plugin.settings.token) {
            containerEl.createEl('h3', {text: 'Quick Setup'});
            
            let quickSetupCode = '';
            let selectedVault = '';
            let vaultDropdown: any;
            
            new Setting(containerEl)
                .setName('Quick Setup Code')
                .setDesc('Paste the code from another device to quickly configure')
                .addTextArea(text => {
                    text.setPlaceholder('Paste your quick setup code here...')
                        .setValue('')
                        .onChange((value) => {
                            quickSetupCode = value.trim();
                            // Try to decode and show available vaults
                            try {
                                const data = JSON.parse(atob(quickSetupCode));
                                if (data.vaults && data.vaults.length > 0 && vaultDropdown) {
                                    // Clear and update dropdown
                                    vaultDropdown.selectEl.empty();
                                    vaultDropdown.addOption('', 'Select a vault...');
                                    data.vaults.forEach((vault: string) => {
                                        vaultDropdown.addOption(vault, vault);
                                    });
                                    vaultDropdown.setValue(data.vaults[0]);
                                    selectedVault = data.vaults[0];
                                }
                            } catch (e) {
                                // Invalid code, ignore
                            }
                        });
                    text.inputEl.style.width = '100%';
                    text.inputEl.style.minHeight = '100px';
                });

            new Setting(containerEl)
                .setName('Select Vault')
                .setDesc('Choose which vault to sync')
                .addDropdown(dropdown => {
                    vaultDropdown = dropdown;
                    dropdown.addOption('', 'Select a vault...');
                    dropdown.onChange((value) => {
                        selectedVault = value;
                    });
                });

            new Setting(containerEl)
                .addButton(button => button
                    .setButtonText('Apply Quick Setup')
                    .setCta()
                    .onClick(async () => {
                        if (quickSetupCode && selectedVault) {
                            const success = await this.plugin.applyQuickSetup(quickSetupCode, selectedVault);
                            if (success) {
                                this.display(); // Refresh settings
                            }
                        } else {
                            new Notice('Please paste a quick setup code and select a vault');
                        }
                    }));

            containerEl.createEl('hr');
            containerEl.createEl('h3', {text: 'Manual Setup'});
        }

        // Server URL
        new Setting(containerEl)
            .setName('Server URL')
            .setDesc('URL of your sync server')
            .addText(text => text
                .setPlaceholder('https://example.com/sync')
                .setValue(this.plugin.settings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Login/Register section
        if (!this.plugin.settings.token) {
            containerEl.createEl('h3', {text: 'Authentication'});
            
            let username = '';
            let password = '';

            new Setting(containerEl)
                .setName('Username')
                .addText(text => text
                    .setPlaceholder('Enter username')
                    .onChange((value) => {
                        username = value;
                    }));

            new Setting(containerEl)
                .setName('Password')
                .addText(text => {
                    text.inputEl.type = 'password';
                    text.setPlaceholder('Enter password')
                        .onChange((value) => {
                            password = value;
                        });
                });

            new Setting(containerEl)
                .addButton(button => button
                    .setButtonText('Login')
                    .onClick(async () => {
                        if (await this.plugin.login(username, password)) {
                            this.display(); // Refresh the settings page
                        }
                    }))
                .addButton(button => button
                    .setButtonText('Register')
                    .onClick(async () => {
                        if (await this.plugin.registerUser(username, password)) {
                            this.display(); // Refresh the settings page
                        }
                    }));
        } else {
            // Show logged in user
            new Setting(containerEl)
                .setName('Logged in as')
                .setDesc(this.plugin.settings.username)
                .addButton(button => button
                    .setButtonText('Logout')
                    .onClick(async () => {
                        this.plugin.settings.token = '';
                        this.plugin.settings.username = '';
                        await this.plugin.saveSettings();
                        this.display(); // Refresh the settings page
                    }));

            // Vault name
            new Setting(containerEl)
                .setName('Vault name')
                .setDesc('Name of this vault on the server')
                .addText(text => text
                    .setPlaceholder(this.app.vault.getName())
                    .setValue(this.plugin.settings.vaultName)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultName = value;
                        await this.plugin.saveSettings();
                    }));

            // Sync interval
            new Setting(containerEl)
                .setName('Auto-sync interval')
                .setDesc('Minutes between automatic syncs (0 to disable)')
                .addText(text => text
                    .setPlaceholder('5')
                    .setValue(String(this.plugin.settings.syncInterval))
                    .onChange(async (value) => {
                        const interval = parseInt(value) || 0;
                        this.plugin.settings.syncInterval = interval;
                        await this.plugin.saveSettings();
                        
                        if (interval > 0) {
                            this.plugin.startAutoSync();
                        } else if (this.plugin.syncInterval) {
                            window.clearInterval(this.plugin.syncInterval);
                        }
                    }));

            // Last sync
            if (this.plugin.settings.lastSync) {
                new Setting(containerEl)
                    .setName('Last sync')
                    .setDesc(new Date(this.plugin.settings.lastSync).toLocaleString());
            }

            // Manual sync button
            new Setting(containerEl)
                .addButton(button => button
                    .setButtonText('Sync Now')
                    .onClick(async () => {
                        await this.plugin.syncVault();
                    }));

            // Sync all vaults section
            containerEl.createEl('h3', {text: 'All Vaults'});

            // Sync all vaults toggle
            new Setting(containerEl)
                .setName('Sync all vaults')
                .setDesc('Pull changes from all your vaults on the server')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.syncAllVaults)
                    .onChange(async (value) => {
                        this.plugin.settings.syncAllVaults = value;
                        await this.plugin.saveSettings();
                    }));

            // Show known vaults
            if (this.plugin.settings.knownVaults.length > 0) {
                new Setting(containerEl)
                    .setName('Known vaults')
                    .setDesc(this.plugin.settings.knownVaults.join(', '));
            }

            // Fetch all vaults button
            new Setting(containerEl)
                .addButton(button => button
                    .setButtonText('Fetch All Vaults')
                    .onClick(async () => {
                        const vaults = await this.plugin.fetchAllVaults();
                        if (vaults && vaults.length > 0) {
                            new Notice(`Found ${vaults.length} vaults: ${vaults.map((v: any) => v.name).join(', ')}`);
                            this.display(); // Refresh the settings page
                        }
                    }))
                .addButton(button => button
                    .setButtonText('Sync All Vaults')
                    .onClick(async () => {
                        await this.plugin.syncAllVaults();
                    }));

            // Mobile vault setup
            new Setting(containerEl)
                .setName('Mobile Setup')
                .setDesc('Generate instructions for setting up all vaults on mobile')
                .addButton(button => button
                    .setButtonText('Generate Setup Guide')
                    .onClick(async () => {
                        await this.plugin.showVaultSetupInstructions();
                    }));

            // Quick Setup Code Generator
            new Setting(containerEl)
                .setName('Quick Setup Code')
                .setDesc('Copy this code to quickly set up on another device')
                .addButton(button => button
                    .setButtonText('Copy Quick Setup Code')
                    .onClick(async () => {
                        const vaults = await this.plugin.fetchAllVaults();
                        const quickSetupData = {
                            serverUrl: this.plugin.settings.serverUrl,
                            username: this.plugin.settings.username,
                            token: this.plugin.settings.token,
                            vaults: vaults ? vaults.map((v: any) => v.name) : []
                        };
                        const quickSetupCode = btoa(JSON.stringify(quickSetupData));
                        
                        // Copy to clipboard
                        await navigator.clipboard.writeText(quickSetupCode);
                        new Notice('Quick setup code copied to clipboard!');
                    }));
        }
    }
}