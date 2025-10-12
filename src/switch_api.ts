// API manual: https://support.tesmart.com/hc/en-us/article_attachments/27716770201369
import { CharacteristicValue, Service } from 'homebridge';
import { Socket } from 'net';
import { TESmartSwitchPlatform } from './platform.js';

export class SwitchAPI {
  private platform;
  private service;
  private client;
  private isConnected = false;
  private prefix = '\xAA\xBB\x03';
  private suffix = '\xEE';
  private switch = '\x01';
  private inputs = [
    '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
    '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F', '\x10',
  ];

  private led_timeout_10s = '\x03\x0A';
  private led_timeout_30s = '\x03\x1E';
  private led_timeout_never = '\x03\x00';
  private mute_buzzer = '\x02\x00';
  private unmute_buzzer = '\x02\x01';
  private request_active_input = '\x10\x00';
  private response = this.prefix + '\x11';
  private responseInbound = false;
  private active_input = 0;

  constructor(private readonly ip_address: string, platform: TESmartSwitchPlatform, service: Service) {
    this.platform = platform;
    this.service = service;
    this.client = new Socket();

    // Set up socket event handlers
    this.client.on('connect', () => {
      this.platform.log.info(`Connected to TESmart switch at ${ip_address}`);
      this.isConnected = true;
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
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.platform.log.warn(`Connection closed for switch at ${ip_address}`);
      this.isConnected = false;
    });

    this.client.on('timeout', () => {
      this.platform.log.error(`Connection timeout for switch at ${ip_address}`);
      this.isConnected = false;
    });

    // Attempt connection
    try {
      this.client.connect(5000, ip_address);
    } catch (error) {
      this.platform.log.error(`Failed to connect to switch at ${ip_address}:`, error);
      this.isConnected = false;
    }
  }

  activeInput() {
    return this.active_input;
  }

  requestActiveInput() {
    this.send(this.request_active_input);
  }

  switchTo(input: number) {
    this.send(this.switch + this.inputs[input - 1]);
  }

  setLEDTimeout10s() {
    this.send(this.led_timeout_10s);
  }

  setLEDTimeout30s() {
    this.send(this.led_timeout_30s);
  }

  setLEDTimeoutNever() {
    this.send(this.led_timeout_never);
  }

  muteBuzzer() {
    this.send(this.mute_buzzer);
  }

  unmuteBuzzer() {
    this.send(this.unmute_buzzer);
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
    }
  }

  private send(command: string) {
    if (!this.isConnected) {
      this.platform.log.warn('Cannot send command - not connected to switch');
      return false;
    }

    try {
      this.client.write(Buffer.from(this.prefix + command + this.suffix, 'binary'));
      return true;
    } catch (error) {
      this.platform.log.error('Error sending command to switch:', error);
      return false;
    }
  }

  private receive(data: Buffer) {
    if (data.toString('binary') === this.response) {
      this.responseInbound = true;
    } else {
      if (this.responseInbound) {
        this.responseInbound = false;
        this.active_input = data[0] + 1;

        this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).updateValue(this.active_input as CharacteristicValue);
      }
    }
  }
}