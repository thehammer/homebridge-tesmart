import { CharacteristicValue, Service, PlatformAccessory, Categories } from 'homebridge';

import { TESmartSwitchPlatform } from './platform.js';
// import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchAPI } from './switch_api.js';

export class TESmartSwitchAccessory {
  private switchService: Service;
  private switchAPI: SwitchAPI;
  private inputs: Array<Service>;
  private pollingInterval?: NodeJS.Timeout;
  private buzzerMuteSwitch?: Service;
  private ledTimeout10sSwitch?: Service;
  private ledTimeout30sSwitch?: Service;

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

    // Add buzzer mute switch
    this.buzzerMuteSwitch = this.accessory.getService('Mute Buzzer') ||
                            this.accessory.addService(Service.Switch, 'Mute Buzzer', 'buzzer-mute');
    this.buzzerMuteSwitch.setCharacteristic(Characteristic.Name, 'Mute Buzzer');
    this.buzzerMuteSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handleBuzzerMuteGet.bind(this))
      .onSet(this.handleBuzzerMuteSet.bind(this));
    // Set initial state from config
    this.buzzerMuteSwitch.updateCharacteristic(Characteristic.On, config.mute_buzzer || false);

    // Add LED timeout switches (mutually exclusive group)
    this.ledTimeout10sSwitch = this.accessory.getService('LED Timeout 10s') ||
                                this.accessory.addService(Service.Switch, 'LED Timeout 10s', 'led-timeout-10s');
    this.ledTimeout10sSwitch.setCharacteristic(Characteristic.Name, 'LED Timeout 10s');
    this.ledTimeout10sSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handleLEDTimeout10sGet.bind(this))
      .onSet(this.handleLEDTimeout10sSet.bind(this));

    this.ledTimeout30sSwitch = this.accessory.getService('LED Timeout 30s') ||
                                this.accessory.addService(Service.Switch, 'LED Timeout 30s', 'led-timeout-30s');
    this.ledTimeout30sSwitch.setCharacteristic(Characteristic.Name, 'LED Timeout 30s');
    this.ledTimeout30sSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handleLEDTimeout30sGet.bind(this))
      .onSet(this.handleLEDTimeout30sSet.bind(this));

    // Set initial LED timeout state from config
    const ledTimeout = config.led_timeout || 'never';
    this.ledTimeout10sSwitch.updateCharacteristic(Characteristic.On, ledTimeout === '10s');
    this.ledTimeout30sSwitch.updateCharacteristic(Characteristic.On, ledTimeout === '30s');

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

  /**
   * Buzzer mute switch handlers
   */
  handleBuzzerMuteGet(): boolean {
    this.platform.log.debug('Triggered GET Buzzer Mute');
    return this.switchAPI.isBuzzerMuted();
  }

  handleBuzzerMuteSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET Buzzer Mute:', value);
    const shouldMute = value as boolean;

    if (shouldMute) {
      this.switchAPI.muteBuzzer();
    } else {
      this.switchAPI.unmuteBuzzer();
    }
  }

  /**
   * LED timeout 10s switch handlers
   */
  handleLEDTimeout10sGet(): boolean {
    this.platform.log.debug('Triggered GET LED Timeout 10s');
    return this.switchAPI.getLEDTimeout() === '10s';
  }

  handleLEDTimeout10sSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LED Timeout 10s:', value);
    const isOn = value as boolean;

    if (isOn) {
      // Turn on 10s timeout
      this.switchAPI.setLEDTimeout10s();
      // Turn off the 30s switch
      this.ledTimeout30sSwitch?.updateCharacteristic(this.platform.Characteristic.On, false);
    } else {
      // If turning off 10s, set to never (always on)
      this.switchAPI.setLEDTimeoutNever();
    }
  }

  /**
   * LED timeout 30s switch handlers
   */
  handleLEDTimeout30sGet(): boolean {
    this.platform.log.debug('Triggered GET LED Timeout 30s');
    return this.switchAPI.getLEDTimeout() === '30s';
  }

  handleLEDTimeout30sSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LED Timeout 30s:', value);
    const isOn = value as boolean;

    if (isOn) {
      // Turn on 30s timeout
      this.switchAPI.setLEDTimeout30s();
      // Turn off the 10s switch
      this.ledTimeout10sSwitch?.updateCharacteristic(this.platform.Characteristic.On, false);
    } else {
      // If turning off 30s, set to never (always on)
      this.switchAPI.setLEDTimeoutNever();
    }
  }
}