// API manual: https://support.tesmart.com/hc/en-us/article_attachments/27716770201369
import { CharacteristicValue, Service } from 'homebridge';
import { Socket } from 'net';
import { TESmartSwitchPlatform } from './platform.js';
import { ConnectionState, TESmartCommand } from './types.js';

/**
 * TESmart Switch API
 * Handles TCP communication with TESmart HDMI/KVM switches
 */
export class SwitchAPI {
  private readonly platform: TESmartSwitchPlatform;
  private readonly service: Service;
  private readonly client: Socket;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;

  // Protocol constants
  private readonly PROTOCOL_PREFIX = '\xAA\xBB\x03';
  private readonly PROTOCOL_SUFFIX = '\xEE';
  private readonly RESPONSE_PREFIX = '\xAA\xBB\x03\x11';
  private readonly PORT = 5000;

  // Input port mappings (0x01-0x10 for ports 1-16)
  private readonly INPUT_CODES = [
    '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
    '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F', '\x10',
  ];

  // State tracking
  private responseInbound = false;
  private activeInput = 0;

  constructor(private readonly ip_address: string, platform: TESmartSwitchPlatform, service: Service) {
    this.platform = platform;
    this.service = service;
    this.client = new Socket();

    // Set up socket event handlers
    this.client.on('connect', () => {
      this.platform.log.info(`Connected to TESmart switch at ${ip_address}`);
      this.connectionState = ConnectionState.CONNECTED;
      this.requestActiveInput();
    });

    this.client.on('data', (data) => {
      try {
        this.receive(data);
      } catch (error) {
        this.platform.log.error('Error processing data from switch:', error);
      }
    });

    this.client.on('error', (error) => {
      this.platform.log.error(`Socket error for switch at ${ip_address}:`, error.message);
      this.connectionState = ConnectionState.ERROR;
    });

    this.client.on('close', () => {
      this.platform.log.warn(`Connection closed for switch at ${ip_address}`);
      this.connectionState = ConnectionState.DISCONNECTED;
    });

    this.client.on('timeout', () => {
      this.platform.log.error(`Connection timeout for switch at ${ip_address}`);
      this.connectionState = ConnectionState.ERROR;
    });

    // Attempt connection
    try {
      this.connectionState = ConnectionState.CONNECTING;
      this.client.connect(this.PORT, ip_address);
    } catch (error) {
      this.platform.log.error(`Failed to connect to switch at ${ip_address}:`, error);
      this.connectionState = ConnectionState.ERROR;
    }
  }

  /**
   * Get the currently active input number (1-16)
   */
  public getActiveInput(): number {
    return this.activeInput;
  }

  /**
   * Get the current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected to the switch
   */
  public isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Request the currently active input from the switch
   */
  public requestActiveInput(): void {
    this.send(TESmartCommand.REQUEST_ACTIVE_INPUT);
  }

  /**
   * Switch to a specific input (1-16)
   */
  public switchTo(input: number): boolean {
    if (input < 1 || input > 16) {
      this.platform.log.error(`Invalid input number: ${input}. Must be between 1 and 16.`);
      return false;
    }
    return this.send(TESmartCommand.SWITCH_INPUT + this.INPUT_CODES[input - 1]);
  }

  /**
   * Set LED timeout to 10 seconds
   */
  public setLEDTimeout10s(): boolean {
    return this.send(TESmartCommand.LED_TIMEOUT_10S);
  }

  /**
   * Set LED timeout to 30 seconds
   */
  public setLEDTimeout30s(): boolean {
    return this.send(TESmartCommand.LED_TIMEOUT_30S);
  }

  /**
   * Disable LED timeout (always on)
   */
  public setLEDTimeoutNever(): boolean {
    return this.send(TESmartCommand.LED_TIMEOUT_NEVER);
  }

  /**
   * Mute the switch buzzer
   */
  public muteBuzzer(): boolean {
    return this.send(TESmartCommand.MUTE_BUZZER);
  }

  /**
   * Unmute the switch buzzer
   */
  public unmuteBuzzer(): boolean {
    return this.send(TESmartCommand.UNMUTE_BUZZER);
  }

  /**
   * Disconnect from the switch
   */
  public disconnect(): void {
    if (this.client) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.client.destroy();
    }
  }

  /**
   * Send a command to the switch
   */
  private send(command: string): boolean {
    if (!this.isConnected()) {
      this.platform.log.warn('Cannot send command - not connected to switch');
      return false;
    }

    try {
      const buffer = Buffer.from(this.PROTOCOL_PREFIX + command + this.PROTOCOL_SUFFIX, 'binary');
      this.client.write(buffer);
      return true;
    } catch (error) {
      this.platform.log.error('Error sending command to switch:', error);
      return false;
    }
  }

  /**
   * Process data received from the switch
   */
  private receive(data: Buffer): void {
    const dataStr = data.toString('binary');

    // Check if this is a response header
    if (dataStr === this.RESPONSE_PREFIX) {
      this.responseInbound = true;
      return;
    }

    // Process the response data
    if (this.responseInbound) {
      this.responseInbound = false;

      // Extract active input (0-based to 1-based)
      this.activeInput = data[0] + 1;

      // Update HomeKit characteristic
      this.service
        .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .updateValue(this.activeInput as CharacteristicValue);

      this.platform.log.debug(`Active input updated to: ${this.activeInput}`);
    }
  }
}