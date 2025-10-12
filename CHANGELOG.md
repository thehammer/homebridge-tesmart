# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
