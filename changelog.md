# Changelog

All notable changes to the IC10 Safe Minifier extension will be documented in this file.

## [1.1.0] - 2026-01-03

### Fixed (CRITICAL)
- **CRITICAL BUG FIX**: Fixed absolute line jump calculation in "Convert Labels to Line Numbers" feature. Previously, line numbers were calculated based on original positions before label definitions were removed, causing incorrect jump targets. Now properly calculates final output line positions after all label definitions are stripped, ensuring accurate IC10 0-based line numbers.

## [1.0.9] - 2025-12-30

### Added
- New command: "IC10: Convert Labels to Line Numbers" - Converts all label references to absolute line numbers (IC10 0-based) and removes label definitions
- New keybinding: Ctrl+Alt+J for label-to-line-number conversion
- Creates a new file with " ABSOLUTE" suffix containing the converted code

## [1.0.8] - 2025-12-05

### Fixed
- Fixed preview command: Now replaces all content in temp file instead of appending when the temp file is already open

## [1.0.7] - 2025-11-27

### Fixed
- Fixed inline comment removal on lines with HASH() or STR() functions - now properly strips comments like `# Use space if empty` even when the line contains function calls

## [1.0.6] - 2025-11-26

### Fixed
- Fixed comment removal: Now correctly removes quoted string comments (e.g., `"yummy cheese"`) that don't contain actual function calls like HASH() or STR()
- Improved logic to only preserve lines with actual HASH() or STR() function calls, not just any line with quotes

## [1.0.5] - 2025-11-24

### Fixed
- Fixed alias parsing: Now correctly removes alias definitions that have inline comments
- Fixed keybindings: Changed minify hotkey from Ctrl+Alt+M to Ctrl+Alt+Y to avoid conflicts
- Changed activation event to `onStartupFinished` for better performance

## [1.0.4] - 2025-11-17

### Fixed
- Fixed keybinding activation: Added missing `activationEvents` to ensure extension loads and keybindings are registered when VS Code starts
- Added language definition for `.ic10` files to properly register the file type with VS Code

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
