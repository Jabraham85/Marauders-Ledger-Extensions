/**
 * Drop-in settings panel: copy to `S:\...\extensions\ai\` and point manifest
 * `provides.settingsPanel` here if you use a custom options route.
 * Extensions → AI (built-in id `ai`) already uses the same component in-app.
 */
const AIProviderPanel = require('ledger/AIProviderPanel').default;

export default function SettingsBridge() {
  return React.createElement(AIProviderPanel);
}
