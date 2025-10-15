# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2025-10-15

### Fixed
- Switch accessories now display with proper descriptive names in HomeKit
  - Format: "{Switch Label} Mute Buzzer", "{Switch Label} LED 10s", "{Switch Label} LED 30s"
  - Previously all three switches showed only the switch label, making them indistinguishable

## [1.4.0] - 2025-10-15

### Added
- **HomeKit controls for buzzer and LED timeout** - No more restarting Homebridge to change these settings!
  - New "Mute Buzzer" switch accessory - Toggle buzzer mute on/off directly from HomeKit
  - New "LED Timeout 10s" switch accessory - Set 10 second LED timeout
  - New "LED Timeout 30s" switch accessory - Set 30 second LED timeout
  - LED timeout switches are mutually exclusive (turning one on turns the other off)
  - When both LED timeout switches are off, LEDs stay on always (never timeout)
  - All controls work with Siri and HomeKit automations
  - State is tracked and survives Homebridge restarts

### Changed
- Buzzer and LED timeout config options (`mute_buzzer`, `led_timeout`) now only set initial state
  - After initial setup, use the HomeKit switches to control these settings
  - Config options are still useful for setting defaults on first setup or after reset

## [1.3.0] - 2025-10-15

### Added
- **Disable polling option** - New `disable_polling` boolean config option
  - When enabled, stops automatic polling of switch state
  - Provides one-way control: HomeKit can control the switch, but external changes (physical buttons, IR remote) won't be detected
  - Useful for reducing network traffic or when external control isn't needed
  - Polling interval field is hidden in UI when polling is disabled

## [1.2.0] - 2025-10-15

### Added
- **Buzzer mute option** - Configure switches to mute the beep sound when changing inputs
  - New `mute_buzzer` boolean config option (default: false)
  - Setting applied automatically on connection
- **LED timeout configuration** - Control how long front panel LEDs stay on
  - New `led_timeout` config option with values: "never" (always on), "10s", or "30s"
  - Default is "never" (always on)
  - Setting applied automatically on connection

### Changed
- Removed on/off toggle from HomeKit interface - switches now always appear as "on"
  - TESmart switches don't have power control, so the toggle was non-functional
  - This provides a cleaner, more accurate HomeKit interface

## [1.1.1] - 2025-10-15

### Fixed
- Node.js engine compatibility now explicitly supports Node 18.17.0, 20.9.0, and 22.0.0
- Config schema now uses proper JSON Schema format for required fields (array at object level instead of boolean on individual properties)
- All discovered switches now properly display with label format "TESmart Switch (IP_ADDRESS)"

## [1.1.0] - 2025-10-15

### Added
- **Automatic network discovery** - Automatically find TESmart switches on your local network
  - Enable via `enableDiscovery` configuration option in Homebridge UI or config.json
  - Optional `discoverySubnet` parameter to limit scanning to specific subnet
  - Scans all 254 addresses in each subnet (or specified subnet only)
  - Discovery runs on plugin startup and takes 1-2 minutes
  - Discovered switches are automatically added alongside manually configured switches
  - Protocol-based identification ensures only TESmart switches are detected

### Changed
- Configuration now supports discovery-only mode (no manual switches required if discovery is enabled)
- Updated README with comprehensive network discovery documentation
- Enhanced configuration validation to allow startup with only discovery enabled

## [1.0.0] - 2025-10-12

### Added
- Initial release of homebridge-tesmart plugin
- Support for TESmart HDMI/KVM switches (tested with HSW1601A1U 16x1)
- Control switches through Apple HomeKit as Television accessories
- Switch between up to 16 HDMI inputs
- Automatic reconnection with exponential backoff
- Configuration through Homebridge UI with Plugin Settings GUI
- Custom labels for each input
- Hide/show specific inputs in HomeKit
- Configurable polling interval (500-10000ms)
- Support for multiple switches
- Comprehensive error handling and logging
- Input validation and configuration checking
- TypeScript types and interfaces for better code quality

### Fixed
- DisplayOrder array not being populated correctly
- LED timeout command using wrong value
- Memory leak from unclearable setInterval
- Missing null checks for input configurations
- Socket connection error handling

### Technical Details
- Built with TypeScript
- Implements Homebridge Dynamic Platform Plugin pattern
- Uses TCP socket connection on port 5000
- Follows TESmart binary protocol specification
- Meets Homebridge Verified requirements

## Links

- [Homebridge Plugin Page](https://www.npmjs.com/package/homebridge-tesmart)
- [GitHub Repository](https://github.com/thehammer/homebridge-tesmart)
- [Issue Tracker](https://github.com/thehammer/homebridge-tesmart/issues)
