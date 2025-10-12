# Homebridge TESmart

[![npm version](https://badge.fury.io/js/homebridge-tesmart.svg)](https://www.npmjs.com/package/homebridge-tesmart)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Control your TESmart HDMI/KVM switches through Apple HomeKit using Homebridge.

## Features

- 🎮 Control TESmart HDMI/KVM switches from the Home app
- 📱 Switch between up to 16 HDMI inputs
- 🔄 Automatic reconnection with exponential backoff
- ⚙️ Easy configuration through Homebridge UI
- 🏷️ Custom labels for each input
- 👁️ Hide/show specific inputs in HomeKit
- 🔧 Configurable polling interval
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
3. Add your switch(es):
   - **Switch Label**: Friendly name (e.g., "Living Room HDMI")
   - **IP Address**: Static IP of your TESmart switch
   - **Model**: Select your switch model (8x1 or 16x1)
   - **Polling Interval**: How often to check active input (default: 1000ms)
4. Configure each input:
   - **Label**: Name for the input (e.g., "Apple TV", "PlayStation 5")
   - **Show in HomeKit**: Toggle to hide/show this input
5. Save and restart Homebridge

### Manual Configuration

Add this to your Homebridge `config.json`:

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | string | `"TESmart"` | **Required.** Must be "TESmart" |
| `name` | string | `"TESmart"` | Platform name |
| `switches` | array | `[]` | **Required.** Array of switch configurations |

#### Switch Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | string | - | **Required.** Friendly name for the switch |
| `ip_address` | string | - | **Required.** Static IP address of the switch |
| `model` | string | `"16x1"` | Switch model: `"8x1"` or `"16x1"` |
| `polling_interval` | number | `1000` | Polling interval in milliseconds (500-10000) |
| `input1` - `input16` | object | - | Input configuration (see below) |

#### Input Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | string | `"Input N"` | Friendly name for this input |
| `enabled` | boolean | `true` | Whether to show this input in HomeKit |

## Setup Guide

### 1. Assign Static IP to Your TESmart Switch

**Important:** Your TESmart switch must have a static IP address.

**Option A: Router DHCP Reservation (Recommended)**
1. Find your switch's MAC address
2. Log into your router admin panel
3. Create a DHCP reservation for the switch's MAC address
4. Reboot the switch

**Option B: TESmart Configuration Tool**
- Use the TESmart configuration software to assign a static IP
- Refer to your switch's manual for detailed instructions

### 2. Test Connectivity

```bash
# Test if the switch is reachable
ping 192.168.1.100

# Test if port 5000 is open (on macOS/Linux)
nc -zv 192.168.1.100 5000
```

### 3. Configure in Homebridge

Follow the configuration steps above using either the UI or manual config.

### 4. Restart Homebridge

The switch will appear as a **Television** accessory in HomeKit.

## Usage

### In the Home App

1. Open the **Home** app on your iPhone/iPad
2. Find your TESmart switch (listed as a TV)
3. Tap to view inputs
4. Select an input to switch to it

### With Siri

- "Switch Living Room HDMI to Apple TV"
- "Change Living Room HDMI to PlayStation 5"

### In Automation

Use HomeKit automations to automatically switch inputs based on:
- Time of day
- When you arrive/leave home
- When other accessories are triggered

## Troubleshooting

### Switch Not Appearing in HomeKit

1. **Check Homebridge logs** for error messages
2. **Verify IP address** - Can you ping the switch?
3. **Check port 5000** - Ensure it's not blocked by a firewall
4. **Static IP** - Make sure the switch has a static IP
5. **Restart Homebridge** after configuration changes

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
