import { CharacteristicValue, Service, PlatformAccessory, Categories } from 'homebridge';

import { TESmartSwitchPlatform } from './platform.js';
// import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchAPI } from './switch_api.js';
import { InputConfigV2 } from './types.js';

export class TESmartSwitchAccessory {
  private switchService: Service;
  private switchAPI: SwitchAPI;
  private inputs: Array<Service>;
  private pollingInterval?: NodeJS.Timeout;
  private pollingIntervalMs: number;
  private buzzerMuteSwitch?: Service;
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

    // Build input list from either new array format or legacy format
    const inputsToProcess: Array<{ identifier: number; label: string; enabled: boolean }> = [];

    this.platform.log.debug(`[FORMAT DEBUG] config.inputs exists: ${!!config.inputs}`);
    this.platform.log.debug(`[FORMAT DEBUG] config.inputs isArray: ${Array.isArray(config.inputs)}`);
    this.platform.log.debug(`[FORMAT DEBUG] config.inputs length: ${config.inputs?.length}`);
    this.platform.log.debug('[FORMAT DEBUG] config.inputs content:', JSON.stringify(config.inputs));

    if (config.inputs && Array.isArray(config.inputs) && config.inputs.length > 0) {
      // New array format - use order from array
      this.platform.log.info('Using new inputs array format');
      config.inputs.forEach((input: InputConfigV2) => {
        inputsToProcess.push({
          identifier: input.physicalInput,
          label: input.label,
          enabled: input.enabled ?? true,
        });
      });
    } else {
      // Legacy format - use input1-input16 in order
      this.platform.log.info('Using legacy input1-input16 format');
      for (let identifier = 1; identifier <= 16; identifier++) {
        const input = 'input' + identifier;
        const inputConfig = config[input];

        if (inputConfig) {
          inputsToProcess.push({
            identifier: identifier,
            label: inputConfig.label,
            enabled: inputConfig.enabled ?? true,
          });
        }
      }
    }

    // Process inputs in the order they were configured
    for (const inputData of inputsToProcess) {
      const identifier = inputData.identifier;
      const input = 'input' + identifier;
      const inputConfig = { label: inputData.label, enabled: inputData.enabled };

      displayOrder.push(identifier);
      this.platform.log('Input' + identifier, inputConfig.label);
      const existingInput = this.switchService.linkedServices.find(source => source.subtype === input);

      if (existingInput) {
        // Log current state of existing input
        const currentConfiguredName = existingInput.getCharacteristic(Characteristic.ConfiguredName).value;
        this.platform.log.info(`[INPUT NAME DEBUG] Existing input found: ${input}`);
        this.platform.log.info(`[INPUT NAME DEBUG] Config label: "${inputConfig.label}"`);
        this.platform.log.info(`[INPUT NAME DEBUG] Current ConfiguredName characteristic: "${currentConfiguredName}"`);

        // Check if they match
        if (currentConfiguredName !== inputConfig.label) {
          this.platform.log.warn(
            `[INPUT NAME DEBUG] MISMATCH DETECTED! Expected "${inputConfig.label}" but is "${currentConfiguredName}"`,
          );
        }

        // Update ConfiguredName to match config (fixes name not updating on restart)
        this.platform.log.info(`[INPUT NAME DEBUG] Updating ConfiguredName to: "${inputConfig.label}"`);
        existingInput.updateCharacteristic(Characteristic.ConfiguredName, inputConfig.label);

        // Update visibility based on enabled status
        const visibilityState = inputConfig.enabled
          ? Characteristic.CurrentVisibilityState.SHOWN
          : Characteristic.CurrentVisibilityState.HIDDEN;
        existingInput.updateCharacteristic(Characteristic.CurrentVisibilityState, visibilityState);
        this.platform.log.info(
          `[INPUT NAME DEBUG] Updated visibility to: ${inputConfig.enabled ? 'SHOWN' : 'HIDDEN'}`,
        );

        // Add listener to track if ConfiguredName gets changed externally
        existingInput.getCharacteristic(Characteristic.ConfiguredName)
          .on('change', (change) => {
            this.platform.log.warn(
              `[INPUT NAME DEBUG] ConfiguredName CHANGED for ${input}! Old: "${change.oldValue}" -> New: "${change.newValue}"`,
            );
          });

        // Add existing input to inputs array for tracking
        this.inputs.push(existingInput);
      } else {
        this.platform.log.info('Adding new input: ', inputConfig.label);
        this.platform.log.info(`[INPUT NAME DEBUG] Creating new input service: ${input}`);
        this.platform.log.info(`[INPUT NAME DEBUG] addService displayName param: "${inputConfig.label}"`);
        this.platform.log.info(`[INPUT NAME DEBUG] Will set ConfiguredName to: "${inputConfig.label}"`);

        const inputService = this.accessory.addService(this.platform.Service.InputSource, inputConfig.label, input);

        inputService.setCharacteristic(Characteristic.Identifier, identifier)
          .setCharacteristic(Characteristic.ConfiguredName, inputConfig.label)
          .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
          .setCharacteristic(Characteristic.Name, input);

        // Verify what was actually set
        const verifyConfiguredName = inputService.getCharacteristic(Characteristic.ConfiguredName).value;
        this.platform.log.info(`[INPUT NAME DEBUG] Verified ConfiguredName after creation: "${verifyConfiguredName}"`);

        // Add listener to track if ConfiguredName gets changed externally
        inputService.getCharacteristic(Characteristic.ConfiguredName)
          .on('change', (change) => {
            this.platform.log.warn(
              `[INPUT NAME DEBUG] ConfiguredName CHANGED for ${input}! Old: "${change.oldValue}" -> New: "${change.newValue}"`,
            );
          });

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

    const currentValue = this.switchAPI.getActiveInput();
    this.platform.log.debug('Current active input:', currentValue);

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