# Homebridge TESmart

[![npm version](https://badge.fury.io/js/homebridge-tesmart.svg)](https://www.npmjs.com/package/homebridge-tesmart)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Control your TESmart HDMI/KVM switches through Apple HomeKit using Homebridge.

## Features

- 🎮 Control TESmart HDMI/KVM switches from the Home app
- 📱 Switch between up to 16 HDMI inputs
- 🔍 **Automatic network discovery** - Find switches on your network automatically
- 🔄 Automatic reconnection with exponential backoff
- ⚙️ Easy configuration through Homebridge UI
- 🏷️ Custom labels for each input
- 👁️ Hide/show specific inputs in HomeKit
- 🔧 Configurable polling interval or disable polling for one-way control
- 🔕 **Control buzzer directly from HomeKit** - Toggle buzzer mute on/off without restarting
- 💡 **Control LED timeout from HomeKit** - Switch between 10s, 30s, or always on
- 📡 Supports multiple switches

## Compatibility

**Tested Models:**
- TESmart HSW1601A1U (16x1 HDMI Switch)

**Expected to Work:**
- TESmart 8x1 HDMI Switches
- Other TESmart switches using the same TCP protocol (port 5000)

If you've tested this plugin with other models, please [open an issue](https://github.com/thehammer/homebridge-tesmart/issues) to let us know!

## Requirements

- **Homebridge** v1.8.0 or later
- **Node.js** v18.17.0 or v20.9.0 or later
- TESmart HDMI/KVM switch with network connectivity
- **Static IP address** assigned to your TESmart switch

## Installation

### Option 1: Homebridge UI (Recommended)

1. Search for "TESmart" in the Homebridge UI plugins page
2. Click **Install**
3. Configure your switches using the settings UI

### Option 2: Command Line

```bash
npm install -g homebridge-tesmart
```

## Configuration

### Using Homebridge UI (Recommended)

1. Navigate to the **Plugins** page in Homebridge UI
2. Find **Homebridge TESmart** and click **Settings**

#### Option A: Automatic Discovery (Easiest)

1. Enable **"Enable Network Discovery"** checkbox
2. (Optional) Set **"Discovery Subnet"** to limit scanning to a specific subnet (e.g., "192.168.1")
3. Save and restart Homebridge
4. The plugin will automatically find and add TESmart switches on your network
5. Check the logs to see discovered switches (discovery takes 1-2 minutes on first startup)

#### Option B: Manual Configuration

1. Add your switch(es) manually:
   - **Switch Label**: Friendly name (e.g., "Living Room HDMI")
   - **IP Address**: Static IP of your TESmart switch
   - **Model**: Select your switch model (8x1 or 16x1)
   - **Polling Interval**: How often to check active input (default: 1000ms)
   - **Mute Buzzer**: Disable beep sounds when switching inputs
   - **LED Timeout**: Set front panel LED timeout (Always On, 10s, or 30s)
2. Configure each input:
   - **Label**: Name for the input (e.g., "Apple TV", "PlayStation 5")
   - **Show in HomeKit**: Toggle to hide/show this input
3. Save and restart Homebridge

**Note:** You can use both methods together. Manually configured switches will always be included, and discovery will add any additional switches found on the network.

### Manual Configuration (config.json)

Add this to your Homebridge `config.json`:

#### With Network Discovery:

```json
{
  "platforms": [
    {
      "platform": "TESmart",
      "name": "TESmart",
      "enableDiscovery": true,
      "discoverySubnet": "192.168.1"
    }
  ]
}
```

#### With Manual Switch Configuration:

```json
{
  "platforms": [
    {
      "platform": "TESmart",
      "name": "TESmart",
      "switches": [
        {
          "label": "Living Room HDMI Switch",
          "ip_address": "192.168.1.100",
          "model": "16x1",
          "polling_interval": 1000,
          "mute_buzzer": false,
          "led_timeout": "never",
          "input1": {
            "label": "Apple TV",
            "enabled": true
          },
          "input2": {
            "label": "PlayStation 5",
            "enabled": true
          },
          "input3": {
            "label": "Xbox Series X",
            "enabled": true
          },
          "input4": {
            "label": "Nintendo Switch",
            "enabled": true
          }
        }
      ]
    }
  ]
}
```

#### Combined (Discovery + Manual):

```json
{
  "platforms": [
    {
      "platform": "TESmart",
      "name": "TESmart",
      "enableDiscovery": true,
      "discoverySubnet": "192.168.1",
      "switches": [
        {
          "label": "Living Room HDMI Switch",
          "ip_address": "192.168.1.100",
          "model": "16x1"
        }
      ]
    }
  ]
}
```

### Configuration Options

#### Platform Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | `"TESmart"` | **Required.** Must be "TESmart" |
| `name` | string | `"TESmart"` | Platform name |
| `enableDiscovery` | boolean | `false` | Enable automatic network discovery of TESmart switches |
| `discoverySubnet` | string | - | Optional. Limit discovery to a specific subnet (e.g., "192.168.1"). Leave empty to scan all local networks. |
| `switches` | array | `[]` | Array of manually configured switches. At least one switch or `enableDiscovery: true` is required. |

#### Switch Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | string | - | **Required.** Friendly name for the switch |
| `ip_address` | string | - | **Required.** Static IP address of the switch |
| `model` | string | `"16x1"` | Switch model: `"8x1"` or `"16x1"` |
| `disable_polling` | boolean | `false` | Disable automatic state polling. When enabled, HomeKit can still control the switch, but external changes (physical buttons, IR remote) won't be detected. Provides one-way control only. |
| `polling_interval` | number | `1000` | Polling interval in milliseconds (500-10000). Ignored if `disable_polling` is `true`. |
| `mute_buzzer` | boolean | `false` | Mute the buzzer beep when switching inputs |
| `led_timeout` | string | `"never"` | LED timeout: `"never"` (always on), `"10s"`, or `"30s"` |
| `input1` - `input16` | object | - | Input configuration (see below) |

#### Input Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | string | `"Input N"` | Friendly name for this input |
| `enabled` | boolean | `true` | Whether to show this input in HomeKit |

## Setup Guide

### Quick Start with Network Discovery

**Easiest method - no IP address needed:**

1. Install the plugin through Homebridge UI
2. Open plugin settings
3. Enable **"Enable Network Discovery"**
4. Save and restart Homebridge
5. Check logs - the plugin will automatically find your switches (takes 1-2 minutes)
6. Switches will appear as **Television** accessories in HomeKit

### Manual Setup

**For static IP configuration or advanced setups:**

#### 1. Assign Static IP to Your TESmart Switch

**Option A: Router DHCP Reservation (Recommended)**
1. Find your switch's MAC address
2. Log into your router admin panel
3. Create a DHCP reservation for the switch's MAC address
4. Reboot the switch

**Option B: TESmart Configuration Tool**
- Use the TESmart configuration software to assign a static IP
- Refer to your switch's manual for detailed instructions

#### 2. Test Connectivity

```bash
# Test if the switch is reachable
ping 192.168.1.100

# Test if port 5000 is open (on macOS/Linux)
nc -zv 192.168.1.100 5000
```

#### 3. Configure in Homebridge

Follow the manual configuration steps above using either the UI or config.json.

#### 4. Restart Homebridge

The switch will appear as a **Television** accessory in HomeKit.

## Usage

### In the Home App

1. Open the **Home** app on your iPhone/iPad
2. Find your TESmart switch (listed as a TV)
3. Tap to view inputs
4. Select an input to switch to it

**Additional Controls:**

Each switch also includes three additional switch accessories:
- **Mute Buzzer** - Toggle to mute/unmute the beep sound when changing inputs
- **LED Timeout 10s** - Turn on to set LED timeout to 10 seconds (turns off other timeout options)
- **LED Timeout 30s** - Turn on to set LED timeout to 30 seconds (turns off other timeout options)
- When both LED timeout switches are off, LEDs stay on always

### With Siri

**Input Switching:**
- "Switch Living Room HDMI to Apple TV"
- "Change Living Room HDMI to PlayStation 5"

**Buzzer Control:**
- "Turn on Mute Buzzer" (mutes beep sounds)
- "Turn off Mute Buzzer" (enables beep sounds)

**LED Timeout Control:**
- "Turn on LED Timeout 10s" (sets 10 second timeout)
- "Turn on LED Timeout 30s" (sets 30 second timeout)
- "Turn off LED Timeout 10s and LED Timeout 30s" (LEDs always on)

### In Automation

Use HomeKit automations to automatically:
- Switch inputs based on time of day or presence
- Mute buzzer at night
- Set LED timeout based on room lighting
- Trigger input changes when other accessories activate

## Troubleshooting

### Switch Not Appearing in HomeKit

1. **Check Homebridge logs** for error messages
2. **Try network discovery** - Enable discovery to automatically find switches
3. **Verify IP address** (manual config) - Can you ping the switch?
4. **Check port 5000** - Ensure it's not blocked by a firewall
5. **Restart Homebridge** after configuration changes

### Network Discovery Not Finding Switches

1. **Check logs** - Discovery takes 1-2 minutes, watch for progress
2. **Verify network** - Ensure Homebridge and switches are on the same network
3. **Try specific subnet** - Set `discoverySubnet` to your network (e.g., "192.168.1")
4. **Check firewall** - Ensure port 5000 is not blocked
5. **Manual fallback** - Configure switches manually if discovery fails

### Connection Issues

The plugin includes automatic reconnection with exponential backoff. If the connection is lost:
- It will attempt to reconnect up to 10 times
- Delays increase exponentially: 1s, 2s, 4s, 8s... up to 60s
- Check Homebridge logs for reconnection status

### Inputs Not Switching

1. **Test the switch manually** using its remote/buttons
2. **Check logs** for error messages when switching
3. **Verify model selection** (8x1 vs 16x1) matches your switch
4. **Network latency** - Try increasing `polling_interval`

### Logs Show "Cannot send command - not connected"

This means the plugin can't establish a TCP connection to the switch:
- Verify the IP address is correct
- Check your network/firewall settings
- Ensure the switch is powered on
- Try rebooting the switch

## Development

### Build from Source

```bash
# Clone the repository
git clone https://github.com/thehammer/homebridge-tesmart.git
cd homebridge-tesmart

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link for local development
npm link

# Watch for changes
npm run watch
```

### Protocol Documentation

TESmart switches use a simple TCP protocol on port 5000:

**Message Format:**
```
[PREFIX] [COMMAND] [SUFFIX]
PREFIX: 0xAA 0xBB 0x03
SUFFIX: 0xEE
```

**Switch Input Command:**
```
0xAA 0xBB 0x03 0x01 [INPUT] 0xEE
INPUT: 0x01-0x10 (ports 1-16)
```

**Query Active Input:**
```
0xAA 0xBB 0x03 0x10 0x00 0xEE
```

See [TESmart API Documentation](https://support.tesmart.com/hc/en-us/article_attachments/27716770201369) for more details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/thehammer/homebridge-tesmart/issues)
- **Homebridge Discord**: [#plugin-development](https://discord.gg/homebridge)

## License

Apache-2.0 - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to the [Homebridge](https://homebridge.io) team
- TESmart for their HDMI/KVM switches and protocol documentation

---

**Made with ❤️ for the Homebridge community**
