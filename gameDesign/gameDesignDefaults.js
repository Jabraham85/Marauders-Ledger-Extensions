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
  'videoPlayer',
  'imageNode',
  'frame',
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
  audioPlayer: 'Audio Cue',
  videoPlayer: 'Video',
  imageNode: 'Image',
  frame: 'Frame',
};

export const GAME_DESIGN_NODE_TYPE_COLORS = {
  pillar:          '#a78bfa', // violet-400  — strategic, commanding
  coreLoop:        '#60a5fa', // blue-400    — primary, foundational
  mechanic:        '#38bdf8', // sky-400     — implementation (distinct from blue)
  system:          '#2dd4bf', // teal-400    — infrastructure
  progression:     '#facc15', // yellow-400  — growth, advancement
  economy:         '#fb923c', // orange-400  — value, exchange (distinct from yellow)
  questContent:    '#4ade80', // green-400   — content, narrative
  missionCard:     '#c084fc', // purple-400  — missions (distinct from violet pillar)
  playtestFinding: '#fbbf24', // amber-400   — feedback (distinct from red risk)
  risk:            '#f87171', // red-400     — danger, blockers
  sticky:          '#fde68a', // amber-200   — informal notes
  audioPlayer:     '#34d399', // emerald-400 — audio/media (distinct from teal system)
  videoPlayer:     '#f472b6', // pink-400    — video media
  imageNode:       '#a3e635', // lime-400    — image/visual media
  frame:           '#64748b', // slate-500   — container frame
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

export const MISSION_TYPES = [
  'main', 'side', 'brandFantasy', 'companion', 'worldProblem', 'implicit',
];

export const MISSION_TYPE_LABELS = {
  main: 'Main',
  side: 'Side',
  brandFantasy: 'Brand Fantasy',
  companion: 'Companion',
  worldProblem: 'World Problem',
  implicit: 'Implicit',
};

export function emptyMissionKernel() {
  return {
    missionId: '',
    headerName: '',
    missionType: 'side',
    team: '',
    npcs: [],
    locations: [],
    systems: [],
    synopsis: '',
    downstreamAffects: [],
    hasBranchingEndings: false,
    endings: [],
    hasDAS: false,
    das: [],
    affectsHousePoints: false,
    housePointsChars: [],
    hasChoiceImpacts: false,
    choiceImpacts: [],
    hasWorldStateChanges: false,
    worldStateChanges: [],
    hasMissionRumors: false,
    rumors: [],
    playtime: '',
    season: '',
    term: '',
    columnLabel: '',
    columnIndex: 0,
  };
}

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
