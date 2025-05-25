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
}

const DEFAULT_SETTINGS: SyncSettings = {
    serverUrl: 'https://jollofriceboy.com/api',
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

            // Sync each vault
            for (const vault of vaults) {
                const currentVaultName = this.settings.vaultName;
                this.settings.vaultName = vault.name;
                
                new Notice(`Syncing vault: ${vault.name}`);
                await this.pullChanges();
                
                this.settings.vaultName = currentVaultName;
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
        }
    }
}