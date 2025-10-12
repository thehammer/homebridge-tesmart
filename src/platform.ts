import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TESmartSwitchAccessory } from './platformAccessory.js';

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
    if (!this.validateConfig(config)) {
      this.log.error('Invalid configuration. Plugin will not start.');
      this.log.error('Please configure at least one TESmart switch in the Homebridge settings.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices(config);
    });
  }

  /**
   * Validates the plugin configuration
   */
  private validateConfig(config: PlatformConfig): boolean {
    // Check if switches array exists and is not empty
    if (!config.switches || !Array.isArray(config.switches) || config.switches.length === 0) {
      this.log.error('Configuration error: No switches configured');
      return false;
    }

    // Validate each switch configuration
    for (let i = 0; i < config.switches.length; i++) {
      const switchConfig = config.switches[i];

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

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  discoverDevices(config: PlatformConfig) {
    config.switches.forEach((aSwitch: PlatformConfig, index: number) => {
      this.log.debug(JSON.stringify(aSwitch));

      const uuid = this.api.hap.uuid.generate(config.platform + ':Switch' + index);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

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
    });
  }
}
