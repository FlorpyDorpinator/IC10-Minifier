# IC10 Safe Minifier (VS Code Extension)

Command: IC10: Safe Minify current file
- Minifies the active `.ic10` file into a sibling file named `minified_<original>`.
- Safe transformations: remove indentation/blank lines, inline simple defines, replace aliases with r-registers, remove unused labels, collapse spaces outside quotes, preserve HASH(...) directives and quoted strings.

## Use
- Open an `.ic10` file
- Press `Ctrl+Shift+P` → `IC10: Safe Minify current file`
- Or press `Ctrl+Alt+M`

## Develop
- Press `F5` in VS Code to start an Extension Development Host and test the command.

## Package and publish
1. Install vsce (packager):
   npm install -g @vscode/vsce
2. From this folder, create a .vsix:
   vsce package
3. Create a Publisher on the VS Code Marketplace and publish:
   vsce publish

Update `package.json` publisher field before publishing.

## Settings
- `ic10SafeMinifier.stripComments` (boolean, default true): Strip full-line and inline comments (`# ...`) outside quotes while preserving `HASH(...)` directive lines.

## License
MIT — see `LICENSE` file.
