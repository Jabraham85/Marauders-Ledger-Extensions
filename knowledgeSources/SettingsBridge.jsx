/**
 * Optional alias if the host maps `settings` to a bridge file.
 * Prefer `KnowledgeSourcesPanel.jsx` in manifest `provides.entries.settings`.
 */
import KnowledgeSourcesPanel from './KnowledgeSourcesPanel.jsx';

export default function SettingsBridge() {
  return <KnowledgeSourcesPanel />;
}
