/**
 * Custom Homebridge UI server for TESmart plugin
 * Provides migration endpoint for converting legacy config format
 */

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    console.log('[INFO] TESmart Custom UI Server starting...');

    // Test endpoint to verify server is running
    this.onRequest('/ping', async () => {
      console.log('[INFO] Ping received');
      return { status: 'ok', message: 'TESmart UI server is running' };
    });

    // Endpoint to check if any switches need migration
    this.onRequest('/check-migration', async () => {
      try {
        const config = await this.getCachedConfig();
        console.log('[DEBUG] Retrieved config:', JSON.stringify(config, null, 2));

        const needsMigration = this.checkIfMigrationNeeded(config);
        const switchCount = needsMigration ? this.getLegacySwitchCount(config) : 0;

        console.log('[DEBUG] Migration check result:', { needsMigration, switchCount });

        return {
          needsMigration,
          switchCount,
        };
      } catch (error) {
        console.error('[ERROR] Failed to check migration:', error);
        return {
          needsMigration: false,
          switchCount: 0,
          error: error.message,
        };
      }
    });

    // Endpoint to perform migration
    this.onRequest('/migrate-config', async () => {
      try {
        const config = await this.getCachedConfig();

        if (!config || !Array.isArray(config.switches)) {
          throw new Error('Invalid plugin configuration');
        }

        let migrationCount = 0;
        let totalInputsMigrated = 0;

        config.switches.forEach((switchConfig) => {
          const result = this.migrateInputConfig(switchConfig);
          if (result.migrated) {
            migrationCount++;
            totalInputsMigrated += result.inputCount;
          }
        });

        if (migrationCount === 0) {
          return {
            success: false,
            message: 'No switches need migration. All switches are already using the new format.',
          };
        }

        // Save the migrated configuration
        await this.updateConfig(config);

        return {
          success: true,
          message: `Successfully migrated ${migrationCount} switch${migrationCount > 1 ? 'es' : ''} (${totalInputsMigrated} inputs). Please restart Homebridge for changes to take effect.`,
          switchCount: migrationCount,
          inputCount: totalInputsMigrated,
        };
      } catch (error) {
        console.error('Migration failed:', error);
        return {
          success: false,
          message: `Migration failed: ${error.message}`,
        };
      }
    });

    this.ready();
  }

  /**
   * Check if any switches need migration from legacy format
   */
  checkIfMigrationNeeded(config) {
    if (!config || !Array.isArray(config.switches)) {
      return false;
    }

    return config.switches.some((switchConfig) => {
      // Check if has invalid inputs array
      if (switchConfig.inputs && Array.isArray(switchConfig.inputs)) {
        const hasValidInputs = switchConfig.inputs.every(input =>
          input.physicalInput !== undefined && input.label !== undefined
        );
        if (!hasValidInputs) {
          return true; // Needs migration (invalid array)
        }
        if (switchConfig.inputs.length > 0) {
          return false; // Already migrated with valid data
        }
      }

      // Check if has legacy format (input1-input16)
      return Object.keys(switchConfig).some(key => key.match(/^input\d+$/));
    });
  }

  /**
   * Count how many switches have legacy format
   */
  getLegacySwitchCount(config) {
    if (!config || !Array.isArray(config.switches)) {
      return 0;
    }

    return config.switches.filter((switchConfig) => {
      // Check if has invalid inputs array
      if (switchConfig.inputs && Array.isArray(switchConfig.inputs)) {
        const hasValidInputs = switchConfig.inputs.every(input =>
          input.physicalInput !== undefined && input.label !== undefined
        );
        if (!hasValidInputs) {
          return true;
        }
        if (switchConfig.inputs.length > 0) {
          return false;
        }
      }

      // Check if has legacy format
      return Object.keys(switchConfig).some(key => key.match(/^input\d+$/));
    }).length;
  }

  /**
   * Migrate a single switch config from legacy to new format
   */
  migrateInputConfig(switchConfig) {
    // Check if already migrated (has valid inputs array)
    if (switchConfig.inputs && Array.isArray(switchConfig.inputs) && switchConfig.inputs.length > 0) {
      const hasValidInputs = switchConfig.inputs.every(input =>
        input.physicalInput !== undefined && input.label !== undefined
      );

      if (hasValidInputs) {
        return { migrated: false, inputCount: 0 }; // Already in new format
      }

      // Invalid inputs array, clear it and migrate from legacy format
      delete switchConfig.inputs;
    }

    // Check if old format exists
    const hasOldFormat = Object.keys(switchConfig).some(key =>
      key.match(/^input\d+$/)
    );

    if (!hasOldFormat) {
      return { migrated: false, inputCount: 0 }; // No inputs configured at all
    }

    // Migrate from old to new format
    const migratedInputs = [];

    for (let i = 1; i <= 16; i++) {
      const inputKey = `input${i}`;
      const oldInput = switchConfig[inputKey];

      if (oldInput) {
        migratedInputs.push({
          physicalInput: i,
          enabled: oldInput.enabled ?? true,
          label: oldInput.label || `Input ${i}`,
        });

        // Remove old format
        delete switchConfig[inputKey];
      }
    }

    // Set new format
    switchConfig.inputs = migratedInputs;

    return { migrated: true, inputCount: migratedInputs.length };
  }

  /**
   * Get cached config (reads from Homebridge config.json)
   */
  async getCachedConfig() {
    try {
      const pluginConfig = await this.getPluginConfigSchema();
      const currentConfig = await this.getPluginConfig();

      return currentConfig.find(x => x.platform === pluginConfig.pluginAlias);
    } catch (error) {
      console.error('Failed to get cached config:', error);
      return null;
    }
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
