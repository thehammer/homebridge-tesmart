# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
