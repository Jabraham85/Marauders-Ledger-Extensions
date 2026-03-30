export const GAME_DESIGN_SCHEMA_VERSION = 1;

export const GAME_DESIGN_NODE_TYPES = [
  'pillar',
  'coreLoop',
  'mechanic',
  'system',
  'progression',
  'economy',
  'questContent',
  'missionCard',
  'playtestFinding',
  'risk',
  'sticky',
  'audioPlayer',
];

export const GAME_DESIGN_STAGE_ORDER = [
  'vision',
  'coreLoop',
  'systems',
  'progressionEconomy',
  'content',
  'playtest',
];

export const GAME_DESIGN_STAGE_LABELS = {
  vision: 'Vision',
  coreLoop: 'Core Loop',
  systems: 'Systems',
  progressionEconomy: 'Progression & Economy',
  content: 'Content',
  playtest: 'Playtest',
};

export const GAME_DESIGN_NODE_TYPE_LABELS = {
  pillar: 'Pillar',
  coreLoop: 'Core Loop',
  mechanic: 'Mechanic',
  system: 'System',
  progression: 'Progression',
  economy: 'Economy',
  questContent: 'Quest/Content',
  missionCard: 'Mission Card',
  playtestFinding: 'Playtest Finding',
  risk: 'Risk',
  sticky: 'Sticky Note',
};

export const GAME_DESIGN_NODE_TYPE_COLORS = {
  pillar: '#9f7aea',
  coreLoop: '#3b82f6',
  mechanic: '#0ea5e9',
  system: '#10b981',
  progression: '#f59e0b',
  economy: '#f97316',
  questContent: '#14b8a6',
  missionCard: '#8b5cf6',
  playtestFinding: '#ef4444',
  risk: '#dc2626',
  sticky: '#fef08a',
};

export const GAME_DESIGN_RELATION_RULES = {
  pillar: ['coreLoop', 'mechanic', 'system'],
  coreLoop: ['mechanic', 'system', 'progression'],
  mechanic: ['system', 'progression', 'economy', 'questContent', 'playtestFinding'],
  system: ['progression', 'economy', 'questContent', 'playtestFinding', 'risk'],
  progression: ['economy', 'questContent', 'playtestFinding', 'risk'],
  economy: ['questContent', 'playtestFinding', 'risk'],
  questContent: ['missionCard', 'playtestFinding', 'risk'],
  missionCard: ['questContent', 'playtestFinding', 'risk'],
  playtestFinding: ['mechanic', 'system', 'progression', 'economy', 'questContent', 'risk'],
  risk: ['mechanic', 'system', 'progression', 'economy', 'questContent'],
};

export const DEFAULT_GAME_DESIGN_PROJECT_ID = 'main-game-design';

export function stageDefaults() {
  return {
    vision: false,
    coreLoop: false,
    systems: false,
    progressionEconomy: false,
    content: false,
    playtest: false,
  };
}
