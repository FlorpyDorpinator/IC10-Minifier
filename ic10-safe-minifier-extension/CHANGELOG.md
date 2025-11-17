# Changelog

All notable changes to the IC10 Safe Minifier extension will be documented in this file.

## [1.0.3] - 2025-11-17

### Fixed
- Fixed label preservation: Added all 57 IC10 branch/jump instructions to ensure labels referenced by any branching operation are correctly preserved during minification (previously only supported 10 instructions, causing labels used by `bgeal`, `bleal`, `breqz`, and many others to be incorrectly removed)

## [1.0.2] - 2025-11-17

### Fixed
- Fixed keybinding activation: Corrected `when` clause syntax in keybindings to properly quote the `.ic10` file extension, ensuring Ctrl+Alt+M and Ctrl+Alt+P hotkeys now work correctly

## [1.0.1] - 2025-11-17

### Added
- Initial marketplace release
- Safe minification for IC10 (Stationeers) assembly code
- Command: "IC10: Safe Minify current file"
- Command: "IC10: Preview Minified (no save)"
- Keybinding: Ctrl+Alt+M for minify
- Keybinding: Ctrl+Alt+P for preview
- Configuration option to strip comments
- Preserves HASH(...) directives and quoted strings
- Removes indentation, blank lines, and unused labels
- Inlines defines and replaces aliases with registers

## [1.0.0] - 2025-11-17

### Added
- Initial release
