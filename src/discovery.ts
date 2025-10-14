/**
 * Network discovery for TESmart HDMI/KVM switches
 * Scans the local network for devices listening on port 5000 and identifies TESmart switches
 */
import { Socket } from 'net';
import { Logging } from 'homebridge';
import * as os from 'os';

export interface DiscoveredSwitch {
  ipAddress: string;
  modelInfo?: string;
}

/**
 * TESmart Switch Network Discovery
 */
export class TESmartDiscovery {
  private readonly PORT = 5000;
  private readonly PROTOCOL_PREFIX = '\xAA\xBB\x03';
  private readonly PROTOCOL_SUFFIX = '\xEE';
  private readonly RESPONSE_PREFIX = '\xAA\xBB\x03\x11';
  private readonly REQUEST_ACTIVE_INPUT = '\x10\x00';
  private readonly CONNECTION_TIMEOUT = 2000; // 2 seconds per device
  private readonly RESPONSE_TIMEOUT = 1500; // 1.5 seconds to wait for response

  constructor(private readonly log: Logging) {}

  /**
   * Discover TESmart switches on the local network
   * @param subnet Optional subnet to scan (e.g., '192.168.1'). If not provided, scans all local subnets.
   * @returns Array of discovered switches
   */
  public async discoverSwitches(subnet?: string): Promise<DiscoveredSwitch[]> {
    const subnets = subnet ? [subnet] : this.getLocalSubnets();

    if (subnets.length === 0) {
      this.log.warn('No network interfaces found for discovery');
      return [];
    }

    this.log.info(`Starting TESmart switch discovery on ${subnets.length} subnet(s)...`);

    const allDiscovered: DiscoveredSwitch[] = [];

    for (const sub of subnets) {
      this.log.debug(`Scanning subnet: ${sub}.0/24`);
      const discovered = await this.scanSubnet(sub);
      allDiscovered.push(...discovered);
    }

    this.log.info(`Discovery complete. Found ${allDiscovered.length} TESmart switch(es)`);
    return allDiscovered;
  }

  /**
   * Get all local IPv4 subnets from network interfaces
   */
  private getLocalSubnets(): string[] {
    const subnets: Set<string> = new Set();
    const interfaces = os.networkInterfaces();

    for (const [name, addresses] of Object.entries(interfaces)) {
      if (!addresses) {
        continue;
      }

      for (const addr of addresses) {
        // Skip loopback, internal, and IPv6 addresses
        if (addr.family === 'IPv4' && !addr.internal) {
          // Extract subnet (first 3 octets)
          const parts = addr.address.split('.');
          if (parts.length === 4) {
            const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
            subnets.add(subnet);
            this.log.debug(`Found local subnet: ${subnet}.0/24 on interface ${name}`);
          }
        }
      }
    }

    return Array.from(subnets);
  }

  /**
   * Scan a specific subnet (e.g., '192.168.1') for TESmart switches
   */
  private async scanSubnet(subnet: string): Promise<DiscoveredSwitch[]> {
    const promises: Promise<DiscoveredSwitch | null>[] = [];

    // Scan all 254 possible host addresses (skip .0 and .255)
    for (let i = 1; i <= 254; i++) {
      const ipAddress = `${subnet}.${i}`;
      promises.push(this.probeSwitchAtAddress(ipAddress));
    }

    // Wait for all probes to complete
    const results = await Promise.all(promises);

    // Filter out null results (non-TESmart devices or connection failures)
    return results.filter((result): result is DiscoveredSwitch => result !== null);
  }

  /**
   * Probe a specific IP address to check if it's a TESmart switch
   */
  private async probeSwitchAtAddress(ipAddress: string): Promise<DiscoveredSwitch | null> {
    return new Promise((resolve) => {
      const client = new Socket();
      let isResolved = false;
      let responseReceived = false;

      const cleanup = () => {
        if (!isResolved) {
          isResolved = true;
          try {
            client.destroy();
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      };

      const resolveNull = () => {
        cleanup();
        resolve(null);
      };

      const resolveSwitch = () => {
        if (!isResolved) {
          this.log.info(`✓ Discovered TESmart switch at ${ipAddress}`);
          cleanup();
          resolve({ ipAddress });
        }
      };

      // Set connection timeout
      client.setTimeout(this.CONNECTION_TIMEOUT);

      // Handle successful connection
      client.on('connect', () => {
        this.log.debug(`Connected to ${ipAddress}, sending identification command...`);

        // Send request active input command to identify TESmart switch
        const command = Buffer.from(
          this.PROTOCOL_PREFIX + this.REQUEST_ACTIVE_INPUT + this.PROTOCOL_SUFFIX,
          'binary',
        );
        client.write(command);

        // Wait for response
        setTimeout(() => {
          if (!responseReceived) {
            this.log.debug(`No TESmart response from ${ipAddress}`);
            resolveNull();
          }
        }, this.RESPONSE_TIMEOUT);
      });

      // Handle data response
      client.on('data', (data) => {
        const dataStr = data.toString('binary');

        // Check if this is a TESmart response
        if (dataStr.startsWith(this.RESPONSE_PREFIX)) {
          responseReceived = true;
          resolveSwitch();
        }
      });

      // Handle connection errors (expected for most IPs)
      client.on('error', () => {
        // Silently ignore - most IPs won't have anything listening
        resolveNull();
      });

      // Handle timeout
      client.on('timeout', () => {
        this.log.debug(`Connection timeout for ${ipAddress}`);
        resolveNull();
      });

      // Handle connection close
      client.on('close', () => {
        if (!isResolved) {
          resolveNull();
        }
      });

      // Attempt connection
      try {
        client.connect(this.PORT, ipAddress);
      } catch (error) {
        resolveNull();
      }
    });
  }

  /**
   * Test if a specific IP address is a TESmart switch
   * Useful for validating manually configured switches
   */
  public async isTESmartSwitch(ipAddress: string): Promise<boolean> {
    const result = await this.probeSwitchAtAddress(ipAddress);
    return result !== null;
  }
}
