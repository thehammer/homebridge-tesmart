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
  private buzzerMuted: boolean;
  private currentLEDTimeout: 'never' | '10s' | '30s';

  // Reconnection management
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly INITIAL_RECONNECT_DELAY = 1000; // 1 second
  private readonly MAX_RECONNECT_DELAY = 60000; // 1 minute

  constructor(
    private readonly ip_address: string,
    platform: TESmartSwitchPlatform,
    service: Service,
    private readonly shouldMuteBuzzer: boolean = false,
    private readonly ledTimeout: 'never' | '10s' | '30s' = 'never',
  ) {
    this.platform = platform;
    this.service = service;
    this.client = new Socket();

    // Initialize state from config
    this.buzzerMuted = shouldMuteBuzzer;
    this.currentLEDTimeout = ledTimeout;

    // Set up socket event handlers
    this.client.on('connect', () => {
      this.platform.log.info(`Connected to TESmart switch at ${ip_address}`);
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
      this.requestActiveInput();
      this.applyInitialSettings();
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
      // Don't schedule reconnect here - wait for 'close' event
    });

    this.client.on('close', () => {
      this.platform.log.warn(`Connection closed for switch at ${ip_address}`);
      this.connectionState = ConnectionState.DISCONNECTED;
      this.scheduleReconnect();
    });

    this.client.on('timeout', () => {
      this.platform.log.error(`Connection timeout for switch at ${ip_address}`);
      this.connectionState = ConnectionState.ERROR;
      this.client.destroy(); // Force close, which will trigger reconnect
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
    const result = this.send(TESmartCommand.LED_TIMEOUT_10S);
    if (result) {
      this.currentLEDTimeout = '10s';
    }
    return result;
  }

  /**
   * Set LED timeout to 30 seconds
   */
  public setLEDTimeout30s(): boolean {
    const result = this.send(TESmartCommand.LED_TIMEOUT_30S);
    if (result) {
      this.currentLEDTimeout = '30s';
    }
    return result;
  }

  /**
   * Disable LED timeout (always on)
   */
  public setLEDTimeoutNever(): boolean {
    const result = this.send(TESmartCommand.LED_TIMEOUT_NEVER);
    if (result) {
      this.currentLEDTimeout = 'never';
    }
    return result;
  }

  /**
   * Get current LED timeout setting
   */
  public getLEDTimeout(): 'never' | '10s' | '30s' {
    return this.currentLEDTimeout;
  }

  /**
   * Mute the switch buzzer
   */
  public muteBuzzer(): boolean {
    const result = this.send(TESmartCommand.MUTE_BUZZER);
    if (result) {
      this.buzzerMuted = true;
    }
    return result;
  }

  /**
   * Unmute the switch buzzer
   */
  public unmuteBuzzer(): boolean {
    const result = this.send(TESmartCommand.UNMUTE_BUZZER);
    if (result) {
      this.buzzerMuted = false;
    }
    return result;
  }

  /**
   * Check if buzzer is currently muted
   */
  public isBuzzerMuted(): boolean {
    return this.buzzerMuted;
  }

  /**
   * Disconnect from the switch
   */
  public disconnect(): void {
    // Cancel any pending reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.client) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.client.destroy();
    }
  }

  /**
   * Apply initial settings to the switch on connection
   */
  private applyInitialSettings(): void {
    // Apply buzzer setting
    if (this.shouldMuteBuzzer) {
      this.platform.log.debug('Muting switch buzzer');
      this.send(TESmartCommand.MUTE_BUZZER);
    }

    // Apply LED timeout setting
    if (this.ledTimeout === '10s') {
      this.platform.log.debug('Setting LED timeout to 10 seconds');
      this.setLEDTimeout10s();
    } else if (this.ledTimeout === '30s') {
      this.platform.log.debug('Setting LED timeout to 30 seconds');
      this.setLEDTimeout30s();
    } else {
      this.platform.log.debug('Setting LED timeout to always on');
      this.setLEDTimeoutNever();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    // Don't reconnect if we've hit the max attempts
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.platform.log.error(
        `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for switch at ${this.ip_address}. ` +
        'Please check your network and switch configuration.',
      );
      return;
    }

    // Clear any existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Calculate backoff delay with exponential increase
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY,
    );

    this.reconnectAttempts++;
    this.platform.log.info(
      `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} ` +
      `for switch at ${this.ip_address} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect to the switch
   */
  private reconnect(): void {
    this.platform.log.info(`Attempting to reconnect to switch at ${this.ip_address}...`);

    try {
      // Create a new socket for reconnection
      this.client.connect(this.PORT, this.ip_address);
      this.connectionState = ConnectionState.CONNECTING;
    } catch (error) {
      this.platform.log.error(`Reconnection failed for switch at ${this.ip_address}:`, error);
      this.connectionState = ConnectionState.ERROR;
      // scheduleReconnect will be called by the 'close' event
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