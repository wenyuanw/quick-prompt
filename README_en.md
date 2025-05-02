# Quick Prompt

English | [中文](./README.md)

<p align="center">
  <img src="./assets/icon.png" alt="Quick Prompt Logo" width="128" style="background: transparent;">
</p>

A powerful browser extension focused on prompt management and quick input. Helps users create, manage, and organize prompt libraries, and quickly insert preset prompt content in any webpage input field, boosting your productivity.

## ✨ Features

- 📚 **Prompt Management**: Easily create, edit and manage your prompt library
- 🚀 **Quick Input**: Quickly trigger the prompt selector by typing `/p` in any webpage input field
- ⌨️ Support keyboard shortcuts (Ctrl+Shift+P / Command+Shift+P) to open the prompt selector
- 🎯 Customize prompts with titles, content, and tags
- 🔍 Search and filter prompts
- 🌙 Automatically adapt to system light/dark theme

## 🚀 How to Use

1. **Quick Trigger**: Type `/p` in any text input field on any webpage to trigger the prompt selector
2. **Keyboard Shortcut**: Use `Ctrl+Shift+P` (Windows/Linux) or `Command+Shift+P` (macOS) to open the prompt selector
3. **Select a Prompt**: Click on the desired prompt from the popup selector, and it will be automatically inserted into the current input field
4. **Manage Prompts**: Right-click on the extension icon and select "Options" to add, edit, or delete prompts

## ⚙️ Customization

1. Click on the extension icon, then click the "Manage Prompts" button
2. In the options page, you can:
   - Add new prompts
   - Edit existing prompts
   - Delete unwanted prompts
   - Add tags to prompts for categorization

## 📦 Installation Guide

### From App Store

_Coming soon_

### Build from Source

1. Clone the repository
   ```bash
   git clone <repository URL>
   cd quick-prompt
   ```

2. Install dependencies
   ```bash
   pnpm install
   ```

3. Development and build
   ```bash
   # Development mode (Chrome)
   pnpm dev
   
   # Development mode (Firefox)
   pnpm dev:firefox
   
   # Build extension (Chrome)
   pnpm build
   
   # Build extension (Firefox)
   pnpm build:firefox
   ```

### Install the Built Extension

#### Chrome / Edge
1. Open the extensions management page (`chrome://extensions` or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked extension"
4. Select the `.output/chrome-mv3/` directory in the project

#### Firefox
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file in the `.output/firefox-mv2/` directory of the project

## 📄 License

MIT

## 🤝 Contributing

Pull requests and issues are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 
