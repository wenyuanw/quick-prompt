# Quick Prompt

English | [中文](./README.md)

<p align="center">
  <img src="./assets/icon.png" alt="Quick Prompt Logo" width="128" style="background: transparent;">
</p>

A powerful browser extension focused on prompt management and quick input. Helps users create, manage, and organize prompt libraries, and quickly insert preset prompt content in any webpage input field, boosting your productivity.

> Since browser extensions only work on web pages, I've open-sourced a functionally identical [Raycast extension](https://github.com/wenyuanw/quick-prompt-raycast) that's compatible with the browser extension's data format, allowing seamless migration using the same JSON data.

## ✨ Features

- 📚 **Prompt Management**: Easily create, edit and manage your prompt library
- 🚀 **Quick Input**: Quickly trigger the prompt selector by typing `/p` in any webpage input field
- ⌨️ Support keyboard shortcuts (Ctrl+Shift+P / Command+Shift+P) to open the prompt selector
- 📋 Support keyboard shortcuts (Ctrl+Shift+S / Command+Shift+S) to save selected text as a prompt
- 📑 Support right-click context menu to save selected text as a prompt
- 🎯 Customize prompts with titles, content, and tags
- 🔄 **Variable Support**: Use variables in prompts with `{{variable_name}}` format, fill in specific values when using
- 💾 **Data Backup**: Export and import your prompt library for easy cross-device migration and backup
- 🔍 Search and filter prompts
- 🌙 Automatically adapt to system light/dark theme

## ⚠️ Known Issues

- On Doubao (doubao.com) website, when using `/p` to trigger the prompt selector, some input fields may have an issue where the `/p` trigger text is not properly cleared. But don't worry! My trusty partner Cursor and I are working day and night to find a solution and fix it ASAP!

## 🚀 How to Use

1. **Quick Trigger**: Type `/p` in any text input field on any webpage to trigger the prompt selector
2. **Keyboard Shortcut for Selector**: Use `Ctrl+Shift+P` (Windows/Linux) or `Command+Shift+P` (macOS) to open the prompt selector
3. **Select a Prompt**: Click on the desired prompt from the popup selector, and it will be automatically inserted into the current input field
4. **Quick Save Prompt**: Select any text and use `Ctrl+Shift+S` (Windows/Linux) or `Command+Shift+S` (macOS) to quickly save it as a prompt
5. **Right-click Menu Save**: Select any text, right-click and choose "Save this prompt" to save the selected content as a prompt
6. **Export Prompt Library**: Click the "Export" button on the management page to save all your prompts as a JSON file locally
7. **Import Prompt Library**: Click the "Import" button on the management page to import prompts from a local JSON file (supports merging with or replacing existing prompts)

## 📸 Screenshots

Quick Prompt offers an intuitive and user-friendly interface for managing and using prompts.

### Prompt Selector

![Prompt Selector](https://github.com/user-attachments/assets/41b9897c-d701-4ff0-97f7-2f1754f570a8)

![Prompt Selector](https://github.com/user-attachments/assets/22d9d30c-b4c3-4e34-a0a0-8ef51e2cb942)

Use the `/p` shortcut command or keyboard shortcuts to quickly bring up the prompt selector in any input field, making it easy to select and insert the prompts you need.

### Prompt Management Page

![Prompt Management](https://github.com/user-attachments/assets/371ae51e-1cee-4a66-a2a5-cca017396872)

In the management page, you can create new prompts, edit existing ones, add tags, and organize them by categories. The interface is clean and straightforward to use.

### Right-click Context Menu

![Context Menu](https://github.com/user-attachments/assets/17fc3bfd-3fa4-4b0b-ae1a-5cfd0b62be2e)

Simply select any text on a webpage and right-click to quickly save it as a prompt, enhancing your productivity.

### Prompt Variable Input

![Prompt Variable Dialog](https://github.com/user-attachments/assets/c91c1156-983a-454d-aad0-5698b0291b9b)

Prompts support variable configuration. After selecting a prompt with variables, a dialog will pop up for entering the corresponding variable values.

## ⚙️ Customization

1. Click on the extension icon, then click the "Manage My Prompts" button
2. In the management page, you can:
   - Add new prompts
   - Edit existing prompts
   - Delete unwanted prompts
   - Add tags to prompts for categorization
   - Export your prompt library for backup
   - Import previously backed up prompt libraries

## 📦 Installation Guide

### From App Store

Now available on Chrome Web Store! [Click here to download](https://chromewebstore.google.com/detail/quick-prompt/hnjamiaoicaepbkhdoknhhcedjdocpkd)

### From GitHub Releases

1. Visit the [GitHub Releases page](https://github.com/wenyuanw/quick-prompt/releases)
2. Download the latest pre-built extension package
3. Extract the downloaded file
4. Follow the installation instructions below for the built extension

### Build from Source

1. Clone the repository
   ```bash
   git clone https://github.com/wenyuanw/quick-prompt.git
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
