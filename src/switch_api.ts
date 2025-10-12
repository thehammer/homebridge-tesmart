// API manual: https://support.tesmart.com/hc/en-us/article_attachments/27716770201369
import { CharacteristicValue, Service } from 'homebridge';
import { Socket } from 'net';
import { TESmartSwitchPlatform } from './platform.js';

export class SwitchAPI {
  private platform;
  private service;
  private client;
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
    this.client.connect(5000, ip_address);
    this.client.on('data', (data) => this.receive(data));
    this.requestActiveInput();
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
    this.client.write(Buffer.from(this.prefix + command + this.suffix, 'binary'));
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