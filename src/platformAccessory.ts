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
  private ledTimeoutService?: Service;
  private ledTimeoutInputs: Service[] = [];
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
    this.switchService.setPrimaryService(true);

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

    // Add buzzer switch (On = buzzer enabled, Off = buzzer muted)
    const buzzerName = `${config.label} Buzzer`;
    this.buzzerMuteSwitch = this.accessory.getServiceById(Service.Switch, 'buzzer-mute') ||
                            this.accessory.addService(Service.Switch, buzzerName, 'buzzer-mute');
    this.buzzerMuteSwitch
      .setCharacteristic(Characteristic.Name, buzzerName)
      .setCharacteristic(Characteristic.ConfiguredName, buzzerName)
      .setHiddenService(true);
    this.buzzerMuteSwitch.getCharacteristic(Characteristic.On)
      .onGet(this.handleBuzzerEnabledGet.bind(this))
      .onSet(this.handleBuzzerEnabledSet.bind(this));
    // Set initial state from config (inverted: mute_buzzer=true means switch is OFF)
    this.buzzerMuteSwitch.updateCharacteristic(Characteristic.On, !(config.mute_buzzer || false));

    // Add LED timeout control using Television service with InputSources for labeled list
    const ledServiceName = `${config.label} LED Timeout`;
    this.ledTimeoutService = this.accessory.getServiceById(Service.Television, 'led-timeout') ||
                             this.accessory.addService(Service.Television, ledServiceName, 'led-timeout');
    this.ledTimeoutService
      .setCharacteristic(Characteristic.Name, ledServiceName)
      .setCharacteristic(Characteristic.ConfiguredName, ledServiceName)
      .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.NOT_DISCOVERABLE)
      .setHiddenService(true);

    // Active characteristic (always on)
    this.ledTimeoutService.getCharacteristic(Characteristic.Active)
      .onGet(() => Characteristic.Active.ACTIVE)
      .onSet(() => { /* No-op, always active */ });

    // ActiveIdentifier for selection
    this.ledTimeoutService.getCharacteristic(Characteristic.ActiveIdentifier)
      .onGet(this.handleLEDTimeoutIdentifierGet.bind(this))
      .onSet(this.handleLEDTimeoutIdentifierSet.bind(this));

    // Create InputSource services for each LED timeout option
    const ledTimeoutOptions = [
      { id: 1, label: 'Always On', value: 'never' },
      { id: 2, label: '10 Seconds', value: '10s' },
      { id: 3, label: '30 Seconds', value: '30s' },
    ];

    ledTimeoutOptions.forEach(option => {
      const subtype = `led-timeout-${option.value}`;
      let inputService = this.accessory.getServiceById(Service.InputSource, subtype);

      if (!inputService) {
        inputService = this.accessory.addService(Service.InputSource, option.label, subtype);
        inputService
          .setCharacteristic(Characteristic.Identifier, option.id)
          .setCharacteristic(Characteristic.ConfiguredName, option.label)
          .setCharacteristic(Characteristic.Name, option.label)
          .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.OTHER);

        this.ledTimeoutService!.addLinkedService(inputService);
      }

      this.ledTimeoutInputs.push(inputService);
    });

    // Set initial LED timeout state from config
    const ledTimeout = config.led_timeout || 'never';
    let initialIdentifier = 1; // Always On
    if (ledTimeout === '10s') {
      initialIdentifier = 2;
    } else if (ledTimeout === '30s') {
      initialIdentifier = 3;
    }
    this.ledTimeoutService.updateCharacteristic(Characteristic.ActiveIdentifier, initialIdentifier);

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
   * Buzzer enabled switch handlers (On = buzzer enabled, Off = buzzer muted)
   */
  handleBuzzerEnabledGet(): boolean {
    this.platform.log.debug('Triggered GET Buzzer Enabled');
    return !this.switchAPI.isBuzzerMuted(); // Inverted logic
  }

  handleBuzzerEnabledSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET Buzzer Enabled:', value);
    const enabled = value as boolean;

    if (enabled) {
      this.switchAPI.unmuteBuzzer(); // On = unmute
    } else {
      this.switchAPI.muteBuzzer(); // Off = mute
    }
  }

  /**
   * LED timeout selector handlers (uses Television/InputSource pattern)
   * 1 = Always On, 2 = 10s, 3 = 30s
   */
  handleLEDTimeoutIdentifierGet(): number {
    this.platform.log.debug('Triggered GET LED Timeout Identifier');
    const timeout = this.switchAPI.getLEDTimeout();

    if (timeout === '10s') {
      return 2;
    } else if (timeout === '30s') {
      return 3;
    } else {
      return 1; // never (always on)
    }
  }

  handleLEDTimeoutIdentifierSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LED Timeout Identifier:', value);
    const identifier = value as number;

    switch (identifier) {
      case 1:
        this.platform.log.debug('Setting LED timeout to Always On');
        this.switchAPI.setLEDTimeoutNever();
        break;
      case 2:
        this.platform.log.debug('Setting LED timeout to 10 Seconds');
        this.switchAPI.setLEDTimeout10s();
        break;
      case 3:
        this.platform.log.debug('Setting LED timeout to 30 Seconds');
        this.switchAPI.setLEDTimeout30s();
        break;
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