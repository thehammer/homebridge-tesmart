import { CharacteristicValue, Service, PlatformAccessory, Categories } from 'homebridge';

import { TESmartSwitchPlatform } from './platform.js';
// import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchAPI } from './switch_api.js';

export class TESmartSwitchAccessory {
  private switchService: Service;
  private switchAPI: SwitchAPI;
  private inputs: Array<Service>;
  private pollingInterval?: NodeJS.Timeout;
  private pollingIntervalMs: number;
  private buzzerMuteSwitch?: Service;
  private ledTimeoutFan?: Service;
  private pollingEnabledSwitch?: Service;

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
    const buzzerName = `${config.label} Mute Buzzer`;
    this.buzzerMuteSwitch = this.accessory.getServiceById(Service.Switch, 'buzzer-mute') ||
                            this.accessory.addService(Service.Switch, buzzerName, 'buzzer-mute');
    this.buzzerMuteSwitch
      .setCharacteristic(Characteristic.Name, buzzerName)
      .setCharacteristic(Characteristic.ConfiguredName, buzzerName)
      .setHiddenService(true);
    this.buzzerMuteSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handleBuzzerMuteGet.bind(this))
      .onSet(this.handleBuzzerMuteSet.bind(this));
    // Set initial state from config
    this.buzzerMuteSwitch.updateCharacteristic(Characteristic.On, config.mute_buzzer || false);

    // Add LED timeout control using Fan service for selector-style interface
    // Fan rotation speed: 0 = Always On, 33 = 10s, 66 = 30s
    const ledFanName = `${config.label} LED Timeout`;
    this.ledTimeoutFan = this.accessory.getServiceById(Service.Fanv2, 'led-timeout') ||
                         this.accessory.addService(Service.Fanv2, ledFanName, 'led-timeout');
    this.ledTimeoutFan
      .setCharacteristic(Characteristic.Name, ledFanName)
      .setCharacteristic(Characteristic.ConfiguredName, ledFanName)
      .setHiddenService(true);

    // Always active (fan is always "on")
    this.ledTimeoutFan.getCharacteristic(Characteristic.Active)
      .onGet(() => Characteristic.Active.ACTIVE)
      .onSet(() => { /* No-op, always active */ });

    // Rotation speed controls the timeout value
    this.ledTimeoutFan.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 33.34 })
      .onGet(this.handleLEDTimeoutGet.bind(this))
      .onSet(this.handleLEDTimeoutSet.bind(this));

    // Set initial LED timeout state from config
    const ledTimeout = config.led_timeout || 'never';
    let initialSpeed = 0;
    if (ledTimeout === '10s') {
      initialSpeed = 33.34;
    } else if (ledTimeout === '30s') {
      initialSpeed = 66.68;
    }
    this.ledTimeoutFan.updateCharacteristic(Characteristic.RotationSpeed, initialSpeed);

    // Add polling enabled switch
    const pollingName = `${config.label} Auto-Detect Input`;
    this.pollingEnabledSwitch = this.accessory.getServiceById(Service.Switch, 'polling-enabled') ||
                                this.accessory.addService(Service.Switch, pollingName, 'polling-enabled');
    this.pollingEnabledSwitch
      .setCharacteristic(Characteristic.Name, pollingName)
      .setCharacteristic(Characteristic.ConfiguredName, pollingName)
      .setHiddenService(true);
    this.pollingEnabledSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handlePollingEnabledGet.bind(this))
      .onSet(this.handlePollingEnabledSet.bind(this));

    // Store polling interval and start polling if enabled
    this.pollingIntervalMs = config.polling_interval || 1000;
    const pollingEnabled = !config.disable_polling;
    this.pollingEnabledSwitch.updateCharacteristic(Characteristic.On, pollingEnabled);

    if (pollingEnabled) {
      this.startPolling();
    } else {
      this.platform.log.info(`Polling disabled for switch "${config.label}" - one-way control only`);
    }
  }

  /**
   * Start polling for input changes
   */
  private startPolling() {
    // Clear any existing polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.switchService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .updateValue(this.switchAPI.getActiveInput());
    }, this.pollingIntervalMs);

    this.platform.log.debug(`Polling enabled with interval: ${this.pollingIntervalMs}ms`);
  }

  /**
   * Stop polling for input changes
   */
  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      this.platform.log.debug('Polling disabled');
    }
  }

  /**
   * Clean up resources when accessory is removed
   */
  destroy() {
    this.stopPolling();
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
   * LED timeout fan handlers (rotation speed maps to timeout)
   * 0 = Always On, 33.34 = 10s, 66.68 = 30s
   */
  handleLEDTimeoutGet(): number {
    this.platform.log.debug('Triggered GET LED Timeout');
    const timeout = this.switchAPI.getLEDTimeout();

    if (timeout === '10s') {
      return 33.34;
    } else if (timeout === '30s') {
      return 66.68;
    } else {
      return 0; // never (always on)
    }
  }

  handleLEDTimeoutSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LED Timeout:', value);
    const speed = value as number;

    // Map rotation speed to timeout setting
    // 0-16: Always On
    // 17-49: 10s
    // 50-100: 30s
    if (speed < 17) {
      this.platform.log.debug('Setting LED timeout to Always On');
      this.switchAPI.setLEDTimeoutNever();
    } else if (speed < 50) {
      this.platform.log.debug('Setting LED timeout to 10s');
      this.switchAPI.setLEDTimeout10s();
    } else {
      this.platform.log.debug('Setting LED timeout to 30s');
      this.switchAPI.setLEDTimeout30s();
    }
  }

  /**
   * Polling enabled switch handlers
   */
  handlePollingEnabledGet(): boolean {
    this.platform.log.debug('Triggered GET Polling Enabled');
    return this.pollingInterval !== undefined;
  }

  handlePollingEnabledSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET Polling Enabled:', value);
    const enabled = value as boolean;

    if (enabled) {
      this.platform.log.info('Enabling auto-detect input (two-way control)');
      this.startPolling();
    } else {
      this.platform.log.info('Disabling auto-detect input (one-way control only)');
      this.stopPolling();
    }
  }
}