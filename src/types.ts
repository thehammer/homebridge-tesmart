/**
 * Type definitions for the TESmart Homebridge plugin
 */

/**
 * Configuration for a single HDMI input
 */
export interface InputConfig {
  enabled: boolean;
  label: string;
}

/**
 * Configuration for a TESmart switch
 */
export interface SwitchConfig {
  label: string;
  ip_address: string;
  model?: '8x1' | '16x1';
  polling_interval?: number;
  input1?: InputConfig;
  input2?: InputConfig;
  input3?: InputConfig;
  input4?: InputConfig;
  input5?: InputConfig;
  input6?: InputConfig;
  input7?: InputConfig;
  input8?: InputConfig;
  input9?: InputConfig;
  input10?: InputConfig;
  input11?: InputConfig;
  input12?: InputConfig;
  input13?: InputConfig;
  input14?: InputConfig;
  input15?: InputConfig;
  input16?: InputConfig;
}

/**
 * Platform configuration
 */
export interface TESmartPlatformConfig {
  platform: string;
  name?: string;
  switches: SwitchConfig[];
}

/**
 * TESmart device models
 */
export enum TESmartModel {
  EIGHT_PORT = '8x1',
  SIXTEEN_PORT = '16x1',
}

/**
 * TESmart protocol commands
 */
export enum TESmartCommand {
  SWITCH_INPUT = '\x01',
  MUTE_BUZZER = '\x02\x00',
  UNMUTE_BUZZER = '\x02\x01',
  LED_TIMEOUT_10S = '\x03\x0A',
  LED_TIMEOUT_30S = '\x03\x1E',
  LED_TIMEOUT_NEVER = '\x03\x00',
  REQUEST_ACTIVE_INPUT = '\x10\x00',
}

/**
 * Connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}
