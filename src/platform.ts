import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TESmartSwitchAccessory } from './platformAccessory.js';
import { TESmartPlatformConfig, SwitchConfig, InputConfig, InputConfigV2 } from './types.js';
import { TESmartDiscovery } from './discovery.js';

export class TESmartSwitchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    if (!log.success) {
      log.success = log.info;
    }

    // Validate configuration before starting
    const testConfig = config as TESmartPlatformConfig;

    // If discovery is disabled, require at least one configured switch
    if (!testConfig.enableDiscovery && !this.validateConfig(config)) {
      this.log.error('Invalid configuration. Plugin will not start.');
      this.log.error('Please configure at least one TESmart switch or enable network discovery.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.initializeDevices(config as TESmartPlatformConfig);
    });
  }

  /**
   * Validates the plugin configuration
   */
  private validateConfig(config: PlatformConfig): config is TESmartPlatformConfig {
    // Check if switches array exists and is not empty
    const testConfig = config as TESmartPlatformConfig;
    if (!testConfig.switches || !Array.isArray(testConfig.switches) || testConfig.switches.length === 0) {
      return false;
    }

    // Validate each switch configuration
    for (let i = 0; i < testConfig.switches.length; i++) {
      const switchConfig = testConfig.switches[i];

      if (!switchConfig.label || typeof switchConfig.label !== 'string') {
        this.log.error(`Configuration error: Switch ${i + 1} is missing a label`);
        return false;
      }

      if (!switchConfig.ip_address || typeof switchConfig.ip_address !== 'string') {
        this.log.error(`Configuration error: Switch "${switchConfig.label}" is missing an IP address`);
        return false;
      }

      // Validate IP address format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(switchConfig.ip_address)) {
        this.log.error(`Configuration error: Switch "${switchConfig.label}" has invalid IP address: ${switchConfig.ip_address}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Migrates legacy input1-input16 config format to new inputs array format
   */
  private migrateInputConfig(switchConfig: SwitchConfig): boolean {
    // Check if already migrated (has valid inputs array)
    if (switchConfig.inputs && Array.isArray(switchConfig.inputs) && switchConfig.inputs.length > 0) {
      // Validate that inputs array has proper structure
      const hasValidInputs = switchConfig.inputs.every(input =>
        input.physicalInput !== undefined && input.label !== undefined,
      );

      if (hasValidInputs) {
        return false; // Already in new format with valid data, no migration needed
      }

      // Invalid inputs array, clear it and migrate from legacy format
      this.log.warn(`[CONFIG MIGRATION] Found invalid inputs array for switch "${switchConfig.label}", will migrate from legacy format`);
      delete switchConfig.inputs;
    }

    // Check if old format exists
    const hasOldFormat = Object.keys(switchConfig).some(key =>
      key.match(/^input\d+$/),
    );

    if (!hasOldFormat) {
      return false; // No inputs configured at all
    }

    // Migrate from old to new format
    const migratedInputs: InputConfigV2[] = [];

    for (let i = 1; i <= 16; i++) {
      const inputKey = `input${i}` as keyof SwitchConfig;
      const oldInput = switchConfig[inputKey] as InputConfig | undefined;

      if (oldInput) {
        migratedInputs.push({
          physicalInput: i,
          enabled: oldInput.enabled ?? true,
          label: oldInput.label || `Input ${i}`,
        });

        // Remove old format field
        delete switchConfig[inputKey];
      }
    }

    // Set new format
    switchConfig.inputs = migratedInputs;

    this.log.warn(`[CONFIG MIGRATION] Migrated input configuration for switch "${switchConfig.label}"`);
    this.log.warn('[CONFIG MIGRATION] Old input1-input16 format converted to new "inputs" array');
    this.log.warn('[CONFIG MIGRATION] You can now reorder inputs via drag & drop in Homebridge UI');
    this.log.warn('[CONFIG MIGRATION] Please save your config in Homebridge UI to persist these changes');

    return true; // Migration performed
  }

  /**
   * Initialize devices: run discovery if enabled, then configure all switches
   */
  private async initializeDevices(config: TESmartPlatformConfig): Promise<void> {
    const configuredSwitches: SwitchConfig[] = config.switches || [];

    // Migrate any switches with legacy input format
    let migrationPerformed = false;
    configuredSwitches.forEach(switchConfig => {
      if (this.migrateInputConfig(switchConfig)) {
        migrationPerformed = true;
      }
    });

    if (migrationPerformed) {
      this.log.warn('[CONFIG MIGRATION] Migration complete! Inputs will work with legacy config.');
      this.log.warn('[CONFIG MIGRATION] To enable drag & drop reordering, save your config via Homebridge UI.');
    }

    let allSwitches: SwitchConfig[] = [...configuredSwitches];

    // Run network discovery if enabled
    if (config.enableDiscovery) {
      this.log.info('Network discovery is enabled');
      try {
        const discovery = new TESmartDiscovery(this.log);
        const discovered = await discovery.discoverSwitches(config.discoverySubnet);

        if (discovered.length > 0) {
          // Get list of already configured IP addresses
          const configuredIPs = new Set(configuredSwitches.map(s => s.ip_address));

          // Add discovered switches that aren't already configured
          const newSwitches: SwitchConfig[] = discovered
            .filter(device => !configuredIPs.has(device.ipAddress))
            .map(device => {
              this.log.info(`Adding discovered switch at ${device.ipAddress}`);
              return {
                label: `TESmart Switch (${device.ipAddress})`,
                ip_address: device.ipAddress,
              };
            });

          allSwitches = [...configuredSwitches, ...newSwitches];
        } else {
          this.log.warn('No TESmart switches found during discovery');
        }
      } catch (error) {
        this.log.error('Network discovery failed:', error);
      }
    }

    // If still no switches, exit
    if (allSwitches.length === 0) {
      this.log.error('No switches configured or discovered. Plugin will not start.');
      return;
    }

    // Configure all switches
    this.discoverDevices({ ...config, switches: allSwitches });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  discoverDevices(config: TESmartPlatformConfig) {
    config.switches.forEach((aSwitch: SwitchConfig, index: number) => {
      try {
        this.log.debug(JSON.stringify(aSwitch));

        const uuid = this.api.hap.uuid.generate(config.platform + ':Switch' + index);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Update the accessory context with the current (potentially migrated) config
          existingAccessory.context.device = aSwitch;
          this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new TESmartSwitchAccessory(this, existingAccessory);

          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        } else {
          this.log.info('Adding new accessory: ', aSwitch.label);
          const accessory = new this.api.platformAccessory(aSwitch.label, uuid);

          accessory.context.device = aSwitch;
          accessory.category = this.api.hap.Categories.OTHER;

          new TESmartSwitchAccessory(this, accessory);

          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          // this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
        }
      } catch (error) {
        this.log.error(`Failed to setup accessory "${aSwitch.label}":`, error);
        this.log.error('This accessory will be skipped. Please check your configuration and network connection.');
      }
    });
  }
}
