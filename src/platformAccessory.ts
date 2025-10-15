import { CharacteristicValue, Service, PlatformAccessory, Categories } from 'homebridge';

import { TESmartSwitchPlatform } from './platform.js';
// import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchAPI } from './switch_api.js';

export class TESmartSwitchAccessory {
  private switchService: Service;
  private switchAPI: SwitchAPI;
  private inputs: Array<Service>;
  private pollingInterval?: NodeJS.Timeout;

  constructor(
    private readonly platform: TESmartSwitchPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const Service = this.platform.Service;
    const Characteristic = this.platform.Characteristic;
    const config = this.accessory.context.device;
    this.inputs = [];

    try {
      this.accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'TESmart');
      this.accessory.category = Categories.TV_SET_TOP_BOX;

      // this.switchService = this.accessory.getService(Service.TargetControl) ||
      //                      this.accessory.addService(Service.TargetControl);
      this.switchService = this.accessory.getService(Service.Television) ||
                           this.accessory.addService(Service.Television);

      this.switchAPI = new SwitchAPI(
        config.ip_address,
        this.platform,
        this.switchService,
        config.mute_buzzer || false,
        config.led_timeout || 'never',
      );
    } catch (error) {
      this.platform.log.error(`Failed to initialize accessory "${config.label}":`, error);
      throw error;
    }

    this.switchService.setCharacteristic(Characteristic.Name, accessory.context.device.label);
    this.switchService.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
    this.switchService.setCharacteristic(Characteristic.ActiveIdentifier, 1);

    this.switchService.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this))
      .setProps({ perms: [this.platform.api.hap.Perms.PAIRED_READ, this.platform.api.hap.Perms.NOTIFY] });

    this.switchService.getCharacteristic(Characteristic.ActiveIdentifier)
      .onGet(this.handleActiveIdentifierGet.bind(this))
      .onSet(this.handleActiveIdentifierSet.bind(this));

    this.switchService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    const displayOrder: Uint8Array | number[] = [];

    // handle remote control input
    this.switchService.getCharacteristic(Characteristic.RemoteKey)
      .onSet((newValue: CharacteristicValue) => {
        this.platform.log.debug('Set RemoteKey => ', newValue);
      });

    for (let identifier = 1; identifier <= 16; identifier++) {
      const input = 'input' + identifier;
      const inputConfig = config[input];

      // Skip if input config is not defined
      if (!inputConfig) {
        continue;
      }

      displayOrder.push(identifier);
      this.platform.log('Input' + identifier, inputConfig.label);
      const existingInput = this.switchService.linkedServices.find(source => source.subtype === input);

      if (existingInput) {
        this.platform.log.debug('Input exists.');
      } else {
        this.platform.log.info('Adding new input: ', inputConfig.label);
        const inputService = this.accessory.addService(this.platform.Service.InputSource, config.label, input);

        inputService.setCharacteristic(Characteristic.Identifier, identifier)
          .setCharacteristic(Characteristic.ConfiguredName, inputConfig.label)
          .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
          .setCharacteristic(Characteristic.Name, input);

        if (inputConfig.enabled) {
          inputService.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);
        } else {
          inputService.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.HIDDEN);
        }

        this.inputs.push(inputService);
        this.switchService.addLinkedService(inputService);
      }
    }

    this.platform.log.debug('displayOrder', this.platform.api.hap.encode(1, displayOrder).toString('base64'));
    this.switchService.getCharacteristic(Characteristic.DisplayOrder)
      .updateValue(this.platform.api.hap.encode(1, displayOrder).toString('base64'));

    // Poll for active input changes (unless disabled)
    if (!config.disable_polling) {
      const pollingInterval = config.polling_interval || 1000;
      this.pollingInterval = setInterval(() => {
        this.switchService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.switchAPI.getActiveInput());
      }, pollingInterval);
      this.platform.log.debug(`Polling enabled with interval: ${pollingInterval}ms`);
    } else {
      this.platform.log.info(`Polling disabled for switch "${config.label}" - one-way control only`);
    }
  }

  /**
   * Clean up resources when accessory is removed
   */
  destroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    this.switchAPI.disconnect();
  }

  handleActiveGet() {
    this.platform.log.debug('Triggered GET Active');

    const currentValue = this.platform.Characteristic.Active.ACTIVE;

    return currentValue;
  }

  handleActiveSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET Active:', value);
  }

  handleActiveIdentifierGet() {
    this.platform.log.debug('Triggered GET ActiveIdentifier');

    const currentValue = 1;

    return currentValue;
  }

  handleActiveIdentifierSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET ActiveIdentifier:', value);

    this.switchAPI.switchTo(value as number);
  }

  handleButtonEventGet() {
    this.platform.log.debug('Triggered GET ButtonEvent');

    return 1;
  }
}