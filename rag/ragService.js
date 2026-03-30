/* =========================================================================
 *  Procedural RAG Engine — Bundled Service Module
 *  Concentric ring search, dual-registry manager, professor agents.
 *  Zero npm dependencies. Zero AI at retrieval time.
 * ========================================================================= */

// === STOP WORDS ================================================================
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'shall', 'may', 'might', 'can', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'their', 'his', 'her', 'its',
  'this', 'that', 'these', 'those',
  'who', 'what', 'which', 'when', 'where', 'how', 'why',
  'if', 'then', 'else', 'so', 'but', 'and', 'or', 'not', 'no', 'nor',
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'as',
  'into', 'about', 'between', 'through', 'during', 'before', 'after',
  'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'just', 'also', 'very', 'really', 'quite',
  'tell', 'know', 'think', 'find', 'get', 'give', 'go', 'make',
  'say', 'see', 'come', 'take', 'want', 'look', 'use',
  'there', 'here', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'any',
  'own', 'same', 'than', 'too', 'only',
]);

// === PORTER STEMMER ============================================================
// Standard Porter (1980) five-step suffix reduction.
// Replaces the flat 27-rule suffix table with proper consonant/vowel measure
// detection, which handles thousands of edge cases the table missed.

function _porterIsVowelAt(w, i) {
  var c = w[i];
  if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return true;
  if (c === 'y') return i > 0 && !_porterIsVowelAt(w, i - 1);
  return false;
}

function _porterMeasure(w) {
  var m = 0, inVowel = false;
  for (var i = 0; i < w.length; i++) {
    if (_porterIsVowelAt(w, i)) { inVowel = true; }
    else { if (inVowel) { m++; inVowel = false; } }
  }
  return m;
}

function _porterHasVowel(w) {
  for (var i = 0; i < w.length; i++) { if (_porterIsVowelAt(w, i)) return true; }
  return false;
}

function _porterEndsCVC(w) {
  var len = w.length;
  if (len < 3) return false;
  var c = w[len - 1];
  if (c === 'w' || c === 'x' || c === 'y') return false;
  return !_porterIsVowelAt(w, len - 1) && _porterIsVowelAt(w, len - 2) && !_porterIsVowelAt(w, len - 3);
}

function _porterEndsDoubleC(w) {
  if (w.length < 2) return false;
  return w[w.length - 1] === w[w.length - 2] && !_porterIsVowelAt(w, w.length - 1);
}

function stem(word) {
  if (!word || word.length <= 2) return word ? word.toLowerCase() : word;
  var w = word.toLowerCase();

  // Step 1a
  if (w.slice(-4) === 'sses') { w = w.slice(0, -2); }
  else if (w.slice(-3) === 'ies') { w = w.slice(0, -2); }
  else if (w.slice(-2) !== 'ss' && w.slice(-1) === 's') { w = w.slice(0, -1); }

  // Step 1b
  var step1bExtra = false;
  if (w.slice(-3) === 'eed') {
    if (_porterMeasure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.slice(-2) === 'ed') {
    var b1 = w.slice(0, -2);
    if (_porterHasVowel(b1)) { w = b1; step1bExtra = true; }
  } else if (w.slice(-3) === 'ing') {
    var b2 = w.slice(0, -3);
    if (_porterHasVowel(b2)) { w = b2; step1bExtra = true; }
  }
  if (step1bExtra) {
    var tail = w.slice(-2);
    if (tail === 'at' || tail === 'bl' || tail === 'iz') { w = w + 'e'; }
    else if (_porterEndsDoubleC(w)) {
      var last = w[w.length - 1];
      if (last !== 'l' && last !== 's' && last !== 'z') w = w.slice(0, -1);
    } else if (_porterMeasure(w) === 1 && _porterEndsCVC(w)) { w = w + 'e'; }
  }

  // Step 1c
  if (w.length > 2 && w.slice(-1) === 'y' && _porterHasVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + 'i';
  }

  // Step 2
  var s2 = [
    ['ational','ate'],['tional','tion'],['enci','ence'],['anci','ance'],['izer','ize'],
    ['bli','ble'],['alli','al'],['entli','ent'],['eli','e'],['ousli','ous'],
    ['ization','ize'],['ation','ate'],['ator','ate'],['alism','al'],['iveness','ive'],
    ['fulness','ful'],['ousness','ous'],['aliti','al'],['iviti','ive'],['biliti','ble'],['logi','log'],
  ];
  for (var i2 = 0; i2 < s2.length; i2++) {
    var sf2 = s2[i2][0], rp2 = s2[i2][1];
    if (w.slice(-sf2.length) === sf2) {
      var b3 = w.slice(0, -sf2.length);
      if (_porterMeasure(b3) > 0) w = b3 + rp2;
      break;
    }
  }

  // Step 3
  var s3 = [['icate','ic'],['ative',''],['alize','al'],['iciti','ic'],['ical','ic'],['ful',''],['ness','']];
  for (var i3 = 0; i3 < s3.length; i3++) {
    var sf3 = s3[i3][0], rp3 = s3[i3][1];
    if (w.slice(-sf3.length) === sf3) {
      var b4 = w.slice(0, -sf3.length);
      if (_porterMeasure(b4) > 0) w = b4 + rp3;
      break;
    }
  }

  // Step 4
  var s4 = ['al','ance','ence','er','ic','able','ible','ant','ement','ment','ent','ism','ate','iti','ous','ive','ize'];
  var handledS4 = false;
  for (var i4 = 0; i4 < s4.length; i4++) {
    var sf4 = s4[i4];
    if (w.slice(-sf4.length) === sf4) {
      var b5 = w.slice(0, -sf4.length);
      if (_porterMeasure(b5) > 1) w = b5;
      handledS4 = true;
      break;
    }
  }
  if (!handledS4 && w.slice(-3) === 'ion') {
    var b5b = w.slice(0, -3);
    if (_porterMeasure(b5b) > 1 && (b5b.slice(-1) === 's' || b5b.slice(-1) === 't')) w = b5b;
  }

  // Step 5a
  if (w.slice(-1) === 'e') {
    var b6 = w.slice(0, -1);
    var m6 = _porterMeasure(b6);
    if (m6 > 1 || (m6 === 1 && !_porterEndsCVC(b6))) w = b6;
  }

  // Step 5b
  if (_porterMeasure(w) > 1 && _porterEndsDoubleC(w) && w.slice(-1) === 'l') {
    w = w.slice(0, -1);
  }

  return w.length >= 2 ? w : word.toLowerCase();
}

function stemText(text) {
  return text.replace(/\b[a-z]+\b/gi, function (w) { return stem(w); });
}

// === SYNONYM DICTIONARY ========================================================
var SYNONYM_MAP = {
  grumpy:     { synonyms: ['stern', 'irritable', 'cranky', 'moody', 'short-tempered', 'gruff'] },
  kind:       { synonyms: ['gentle', 'caring', 'warm', 'compassionate', 'sympathetic'] },
  brave:      { synonyms: ['courageous', 'fearless', 'bold', 'valiant', 'heroic'] },
  evil:       { synonyms: ['dark', 'villainous', 'malevolent', 'wicked', 'sinister'] },
  old:        { synonyms: ['elderly', 'aged', 'ancient', 'veteran', 'senior'] },
  young:      { synonyms: ['youth', 'teenage', 'adolescent', 'student', 'child'] },
  professor:  { synonyms: ['teacher', 'instructor', 'faculty', 'mentor', 'educator'] },
  student:    { synonyms: ['pupil', 'learner', 'classmate', 'peer'] },
  auror:      { synonyms: ['law enforcement', 'ministry', 'dark wizard catcher', 'magical police'] },
  goblin:     { synonyms: ['ranrok', 'gringotts', 'goblin rebellion'] },
  hurt:       { synonyms: ['injured', 'wounded', 'injury', 'disabled', 'leg', 'scar', 'pain'] },
  dead:       { synonyms: ['killed', 'death', 'died', 'deceased', 'fallen', 'murdered'] },
  missing:    { synonyms: ['disappeared', 'vanished', 'lost', 'absent', 'gone'] },
  spell:      { synonyms: ['charm', 'hex', 'jinx', 'curse', 'incantation', 'enchantment'] },
  potion:     { synonyms: ['brew', 'elixir', 'concoction', 'tonic', 'draught'] },
  wand:       { synonyms: ['wand core', 'wand wood', 'ollivander', 'casting'] },
  broom:      { synonyms: ['flying', 'quidditch', 'mount', 'broomstick'] },
  hogwarts:   { synonyms: ['castle', 'school', 'grounds', 'great hall', 'common room'] },
  hogsmeade:  { synonyms: ['village', 'shop', 'three broomsticks', 'honeydukes'] },
  dungeon:    { synonyms: ['underground', 'cellar', 'vault', 'crypt'] },
  forest:     { synonyms: ['forbidden forest', 'woods', 'dark forest', 'wilderness'] },
  creature:   { synonyms: ['beast', 'animal', 'magical creature', 'fantastic beast', 'monster'] },
  dragon:     { synonyms: ['drake', 'wyvern', 'fire-breathing'] },
  hippogriff: { synonyms: ['buckbeak', 'flying mount', 'half-eagle'] },
  troll:      { synonyms: ['mountain troll', 'forest troll', 'river troll'] },
  combat:     { synonyms: ['fight', 'battle', 'duel', 'attack', 'defense', 'dodge'] },
  talent:     { synonyms: ['skill', 'ability', 'perk', 'upgrade', 'skill tree', 'talent point'] },
  gear:       { synonyms: ['equipment', 'armor', 'robe', 'outfit', 'hat', 'gloves'] },
  inventory:  { synonyms: ['items', 'collection', 'bag', 'storage', 'carrying'] },
  blueprint:  { synonyms: ['bp', 'visual script', 'graph', 'node'] },
  animation:  { synonyms: ['anim', 'montage', 'sequence', 'animgraph', 'skeletal'] },
  mesh:       { synonyms: ['model', '3d model', 'static mesh', 'skeletal mesh', 'geometry'] },
  texture:    { synonyms: ['material', 'shader', 'uv', 'diffuse', 'normal map'] },
  widget:     { synonyms: ['ui', 'hud', 'umg', 'user interface', 'menu'] },
  station:    { synonyms: ['station behavior', 'interaction station', 'ark station'] },
  datatable:  { synonyms: ['data table', 'dt_', 'csv', 'row data', 'data asset'] },
  level:      { synonyms: ['map', 'world', 'sublevel', 'streaming level', 'persistent level'] },
  workflow:   { synonyms: ['pipeline', 'process', 'procedure', 'steps', 'guideline'] },
  review:     { synonyms: ['feedback', 'critique', 'approval', 'sign-off', 'check'] },
  deploy:     { synonyms: ['release', 'ship', 'publish', 'build', 'package'] },
  bug:        { synonyms: ['defect', 'issue', 'crash', 'error', 'regression', 'glitch'] },
  meeting:    { synonyms: ['standup', 'sync', 'huddle', 'call', 'discussion'] },
  slack:      { synonyms: ['message', 'channel', 'thread', 'dm', 'chat'] },
  email:      { synonyms: ['outlook', 'mail', 'inbox', 'correspondence'] },
};

function lookupSynonyms(term) {
  var lower = term.toLowerCase();
  if (SYNONYM_MAP[lower]) return SYNONYM_MAP[lower];
  var withoutS = lower.endsWith('s') && lower.length > 3 ? lower.slice(0, -1) : null;
  if (withoutS && SYNONYM_MAP[withoutS]) return SYNONYM_MAP[withoutS];
  return null;
}

function addSynonym(term, synonyms) {
  SYNONYM_MAP[term.toLowerCase()] = { synonyms: synonyms };
}

// === CATEGORIES ================================================================
var CATEGORIES = {
  character: {
    patterns: [/\bwho is\b/, /\btell me about\b/, /\bdescribe\b/, /\bwhat do we know about\b/, /\bcharacter\b/, /\bbackstory\b/, /\bpersonality\b/, /\brelationship with\b/, /\bcompanions?\b/],
    adjacentCategories: ['lore', 'conversation'],
  },
  system: {
    patterns: [/\bhow does .+ work\b/, /\bexplain the .+ system\b/, /\bgameplay\b/, /\bmechanic\b/, /\bsystem\b/, /\bcombat\b/, /\btalent\b/, /\bskill tree\b/],
    adjacentCategories: ['technical', 'lore'],
  },
  technical: {
    patterns: [/\.uasset\b/, /\.xml\b/, /\bunreal\b/, /\bblueprint\b/, /\banimation\b/, /\bstation\b/, /\bark\b/, /\basset\b/, /\bdata ?table\b/, /\bmesh\b/, /\btexture\b/, /\bwidget\b/, /\bue[45]?\b/],
    adjacentCategories: ['system', 'process'],
  },
  process: {
    patterns: [/\bhow do i\b/, /\bsteps to\b/, /\bworkflow\b/, /\bpipeline\b/, /\bguideline\b/, /\bprocedure\b/, /\bbest practice\b/, /\btutorial\b/],
    adjacentCategories: ['technical', 'task'],
  },
  task: {
    patterns: [/\boverdue\b/, /\bstatus of\b/, /\bassigned to\b/, /\bsprint\b/, /\bblocker\b/, /\bticket\b/, /\bjira\b/, /\bdeadline\b/, /\bpriority\b/],
    adjacentCategories: ['process', 'conversation'],
  },
  lore: {
    patterns: [/\bin the game\b/, /\bhogwarts\b/, /\bspells?\b/, /\bpotions?\b/, /\bcreatures?\b/, /\blocations?\b/, /\bquests?\b/, /\bwizard(?:ing)?\b/, /\bmagic\b/, /\bhouse\b/, /\bwand\b/],
    adjacentCategories: ['character', 'system'],
  },
  inventory: {
    patterns: [/\bhow many\b/, /\bcount\b/, /\blist all\b/, /\bwhat are the\b/, /\benumerate\b/, /\bshow me all\b/],
    adjacentCategories: [],
  },
  conversation: {
    patterns: [/\bwhat did .+ say\b/, /\bdiscussed in\b/, /\bthread about\b/, /\bslack\b/, /\bmeeting\b/, /\bnotes from\b/, /\bmentioned\b/],
    adjacentCategories: ['character', 'task'],
  },
};
var FALLBACK_CATEGORY = 'general';

// === CLASSIFIER ================================================================
function classifyQuery(query) {
  var lower = query.toLowerCase();
  var matched = [];
  var catEntries = Object.entries(CATEGORIES);
  for (var i = 0; i < catEntries.length; i++) {
    var cat = catEntries[i][0], patterns = catEntries[i][1].patterns;
    for (var j = 0; j < patterns.length; j++) {
      if (patterns[j].test(lower)) { matched.push(cat); break; }
    }
  }
  return matched.length > 0 ? matched : [FALLBACK_CATEGORY];
}

// === AUTO AGENT ROUTING =======================================================
// Maps query categories (from classifyQuery) to the most appropriate professor.
// Priority follows the order of the array — first matching category wins.
// Only used when the caller passes no explicit agentId and the stored defaultAgent
// is still 'hecat' (the fallback), so user-overridden defaults are always respected.
var CATEGORY_TO_AGENT = {
  character:    'fig',     // who is / character / backstory / personality
  lore:         'fig',     // hogwarts / spells / quests / magic
  story:        'fig',     // narrative / lore adjacents caught by system/lore patterns
  technical:    'ronen',   // .uasset / blueprint / animation / UE / ARK / station
  system:       'ronen',   // how does X work / mechanic / system / gameplay
  task:         'sharp',   // Jira / sprint / blocker / ticket / deadline
  bug:          'sharp',   // crash / error / regression / defect
  process:      'weasley', // workflow / pipeline / steps / procedure / guideline
  conversation: 'weasley', // slack thread / meeting notes / discussed in
};
function selectAgentForQuery(categories) {
  for (var i = 0; i < categories.length; i++) {
    var mapped = CATEGORY_TO_AGENT[categories[i]];
    if (mapped) return mapped;
  }
  return 'hecat'; // broad / unknown / inventory queries
}

// === EXTRACTOR =================================================================
function extractKeywords(query) {
  var cleaned = query.toLowerCase().replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  var tokens = cleaned.split(' ').filter(function (t) { return t.length > 1 && !STOP_WORDS.has(t); });
  var seen = new Set();
  var groups = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (seen.has(token)) continue;
    seen.add(token);
    var dictEntry = lookupSynonyms(token);
    groups.push({ core: token, synonyms: dictEntry ? dictEntry.synonyms : [], stem: stem(token) });
    // The BM25 inverted index is built with /[^a-z0-9\s]/ which SPLITS on underscores
    // and hyphens. But extractKeywords uses /[^\w\s'-]/ which KEEPS underscores as part
    // of the token. This causes a mismatch: "mff_01" searches as one token but the index
    // has separate "mff" and "01" entries — producing zero BM25 results.
    // Fix: when a token contains _ or -, also add the split sub-tokens so the BM25 lookup
    // can find them in the index. This is purely additive — existing behavior is unchanged.
    if (token.indexOf('_') !== -1 || token.indexOf('-') !== -1) {
      var subTokens = token.replace(/[_-]/g, ' ').split(' ').filter(function (t) {
        return t.length > 1 && !STOP_WORDS.has(t);
      });
      for (var si = 0; si < subTokens.length; si++) {
        var sub = subTokens[si];
        if (!seen.has(sub)) {
          seen.add(sub);
          var subEntry = lookupSynonyms(sub);
          groups.push({ core: sub, synonyms: subEntry ? subEntry.synonyms : [], stem: stem(sub), isSubToken: true });
        }
      }
    }
  }
  return groups;
}

function getGroupTerms(group, matchMode) {
  if (matchMode === 'exact') return [group.core];
  var terms = [group.core].concat(group.synonyms);
  if (matchMode === 'stem') {
    var stemmed = new Set(terms.map(function (t) { return stem(t); }));
    stemmed.add(group.stem);
    return Array.from(new Set(terms.concat(Array.from(stemmed))));
  }
  return terms;
}

// === ROUTING TABLE =============================================================
var ROUTING_TABLE = {
  character:    { primary: ['wiki', 'reference', 'kb'], secondary: ['chat'], deprioritized: ['files', 'tasks'] },
  system:       { primary: ['kb', 'wiki'], secondary: ['reference'], deprioritized: ['files', 'tasks'] },
  technical:    { primary: ['files', 'wiki'], secondary: ['kb'], deprioritized: ['reference', 'tasks'] },
  process:      { primary: ['wiki', 'chat'], secondary: ['tasks'], deprioritized: ['reference', 'files'] },
  task:         { primary: ['tasks', 'chat'], secondary: ['wiki'], deprioritized: ['reference', 'kb', 'files'] },
  lore:         { primary: ['reference', 'kb'], secondary: ['wiki'], deprioritized: ['files', 'tasks'] },
  inventory:    { primary: ['wiki', 'reference', 'chat', 'files', 'tasks', 'kb', 'custom'], secondary: [], deprioritized: [] },
  conversation: { primary: ['chat'], secondary: ['wiki'], deprioritized: ['reference', 'files', 'kb'] },
  general:      { primary: ['wiki', 'kb'], secondary: ['chat', 'reference'], deprioritized: [] },
};
var SOURCE_WEIGHTS = { primary: 1.0, secondary: 0.7, unknown: 0.7, deprioritized: 0.3 };

// === SOURCE KIND NORMALIZATION =================================================
// Maps real source kind strings (folder names, integration labels) to the
// abstract routing-table categories used by ROUTING_TABLE and agent overrides.
// The routing table, weight lookups, and agent allowedSourceKinds all speak
// abstract categories — this is the single bridge between the two namespaces.
var _normalizeCache = new Map();
function normalizeSourceKind(kind) {
  if (!kind) return 'custom';
  var cached = _normalizeCache.get(kind);
  if (cached) return cached;
  var k = kind.toLowerCase();
  var result;
  if (/^ue__|\.uasset|\.umap|unreal|content[\\/]|articy|sundance|sun-dev/.test(k)) {
    result = 'files';
  } else if (/confluence|wiki|notion|sharepoint|docs\./.test(k)) {
    result = 'wiki';
  } else if (/jira|ticket|task|sprint|issue|linear|asana|monday/.test(k)) {
    result = 'tasks';
  } else if (/slack|teams|discord|chat|message|dm|channel/.test(k)) {
    result = 'chat';
  } else if (/potterdb|potter|reference|lore|glossary|encyclopedia|fandom/.test(k)) {
    result = 'reference';
  } else if (/kb|knowledge.?base|internal|guide|handbook/.test(k)) {
    result = 'kb';
  } else if (k === 'custom' || k === 'personal' || k === 'uploaded') {
    result = 'custom';
  } else {
    result = 'custom';
  }
  _normalizeCache.set(kind, result);
  return result;
}

// Resolves the effective source kind for a full chunk object.
// When normalizeSourceKind() returns 'custom' (the catch-all), this function
// also inspects the chunk's url, sourceId, sourceLabel, and title for UE/Articy
// project patterns that weren't reflected in the sourceKind field — e.g. chunks
// indexed from UE shard files without an explicit sourceKind get kind 'custom'
// but their url path contains 'd:/sun-dev' or '/content/' which reveals their
// true nature as engine files (Ronen's domain, not Fig's).
var _UE_PATH_RE = /d:[/\\]|[/\\]sun-dev|[/\\]sundance[/\\]|[/\\]content[/\\]|\.uasset|\.umap|articy|blueprint|da_station|ark_station/i;
var _UE_KEY_RE  = /^(?:cnvf|cin|civ|cnv|da|ark|bp|wbp|sm|sk|sk_mesh|mat|mi|t_|pc_|ns_|seq|lvl|map)_/i;
function resolveChunkKind(chunk) {
  var declared = normalizeSourceKind(chunk.sourceKind);
  if (declared !== 'custom') return declared;
  // 'custom' is the catch-all — inspect other chunk metadata for UE fingerprints.
  var url     = (chunk.url       || '').toLowerCase();
  var sid     = (chunk.sourceId  || '').toLowerCase();
  var label   = (chunk.sourceLabel || '').toLowerCase();
  var title   = (chunk.title    || '');
  if (_UE_PATH_RE.test(url) || _UE_PATH_RE.test(sid) || _UE_PATH_RE.test(label)) return 'files';
  if (_UE_KEY_RE.test(title))  return 'files';
  return 'custom';
}

// === ADJACENCY =================================================================
function getAdjacentCategories(categories) {
  var adjacent = new Set();
  for (var i = 0; i < categories.length; i++) {
    var def = CATEGORIES[categories[i]];
    if (def && def.adjacentCategories) {
      for (var j = 0; j < def.adjacentCategories.length; j++) {
        if (!categories.includes(def.adjacentCategories[j])) adjacent.add(def.adjacentCategories[j]);
      }
    }
  }
  return Array.from(adjacent);
}

// === ROUTER ====================================================================
function routeSources(categories, ring, knownSourceKinds) {
  var weights = new Map();
  function setMax(key, weight) {
    var c = weights.get(key) || 0;
    if (weight > c) weights.set(key, weight);
  }
  var effectiveCats = ring >= 4 ? categories.concat(getAdjacentCategories(categories)) : categories;
  for (var i = 0; i < effectiveCats.length; i++) {
    var route = ROUTING_TABLE[effectiveCats[i]] || ROUTING_TABLE.general;
    for (var j = 0; j < route.primary.length; j++) setMax(route.primary[j], SOURCE_WEIGHTS.primary);
    if (ring >= 3) {
      for (var j2 = 0; j2 < route.secondary.length; j2++) setMax(route.secondary[j2], SOURCE_WEIGHTS.secondary);
      for (var j3 = 0; j3 < route.deprioritized.length; j3++) setMax(route.deprioritized[j3], SOURCE_WEIGHTS.deprioritized);
    }
  }
  for (var k = 0; k < knownSourceKinds.length; k++) {
    if (!weights.has(knownSourceKinds[k])) setMax(knownSourceKinds[k], SOURCE_WEIGHTS.unknown);
  }
  return weights;
}

/** Apply per-agent source-kind weights.
 *  Agent overrides are keyed by ABSTRACT kind (files, wiki, tasks, …).
 *  For each entry in the routing map (which may be either abstract or a concrete
 *  source-kind like ue__Content_Gameplay), look up the override using the
 *  entry's abstract equivalent so that "files: 2.5" automatically weights
 *  every ue__Content_* source at 2.5 without needing to enumerate them all.
 *  No upper cap: specialty sources can go to 2.5+ to dominate their domain. */
function mergeRouteWithAgentOverrides(routeWeights, agentOverrides) {
  if (!agentOverrides) return routeWeights;
  var out = new Map();
  routeWeights.forEach(function (base, kind) {
    // Try exact key first, then fall back to the abstract normalized key
    var override = agentOverrides[kind] != null
      ? agentOverrides[kind]
      : agentOverrides[normalizeSourceKind(kind)];
    out.set(kind, override != null ? Number(override) : base);
  });
  // Also add any agent-override abstract kinds not already represented
  Object.keys(agentOverrides).forEach(function (kind) {
    if (!out.has(kind)) out.set(kind, Number(agentOverrides[kind]));
  });
  return out;
}

/** Heuristic: chunk is mostly raw Unreal/data-asset rows (bad primary evidence for Chronicler / roster questions). */
function looksLikeRawEngineAssetChunk(chunk) {
  var title = chunk.title || '';
  var text = chunk.text || '';
  var blob = (title + '\n' + text).slice(0, 14000);
  var lower = blob.toLowerCase();

  var daHits = blob.match(/\bda_[a-z0-9_]{6,}\b/gi) || [];
  if (daHits.length >= 3) return true;
  if (/da_characterconfig_|da_combatconfig_|da_companion_|combatconfig_companion|characterconfig_/i.test(blob)) return true;
  if (daHits.length >= 2 && /characterconfig|combatconfig|companion|positioningconfig/i.test(blob)) return true;

  var uassetCount = (blob.match(/\.uasset\b/gi) || []).length;
  var umapCount = (blob.match(/\.umap\b/gi) || []).length;
  if (uassetCount + umapCount >= 2) return true;
  if (uassetCount >= 1 && (/\/content\/|\\content\\/i.test(blob) || daHits.length >= 1)) return true;
  if (/combatconfigs?\/|_combatconfig_/i.test(lower) && (/\bcompanions?\b/.test(lower) || uassetCount >= 1)) return true;
  if ((/\bga_[a-z0-9_]{10,}\b/i.test(lower) || /\bbp_[a-z0-9_]{8,}\b/i.test(blob)) && uassetCount >= 1) return true;
  var longPath = (blob.match(/\/content\/\S{14,}/gi) || []).length;
  if (longPath >= 3 && uassetCount >= 1) return true;
  if (/\|\s*`?da_/i.test(blob) && /\bcombat|companion|character config\b/i.test(lower)) return true;
  return false;
}

/** User asked narrative / identity / lore style, not implementation. */
function narrativeQueryWithoutTechnical(categories, query) {
  var ql = (query || '').toLowerCase();
  if (/\.uasset\b|\.umap\b|unreal engine|\bue\d\b|blueprint\b|data asset\b|combatconfig|\/content\//i.test(ql)) return false;
  var i;
  var tech = { technical: 1, system: 1, inventory: 1 };
  for (i = 0; i < categories.length; i++) {
    if (tech[categories[i]]) return false;
  }
  var nar = { character: 1, lore: 1, conversation: 1 };
  for (i = 0; i < categories.length; i++) {
    if (nar[categories[i]]) return true;
  }
  if (categories.indexOf('general') >= 0 && /\bcompanions?\b|\broster\b|\bwho (is|are)\b|\bnpcs?\b/i.test(ql)) return true;
  return false;
}

function engineDumpPenaltyMultiplier(agentId, categories, query) {
  if (!narrativeQueryWithoutTechnical(categories, query)) return 1;
  var id = agentId || 'hecat';
  if (id === 'sharp' || id === 'ronen') return 1;
  if (id === 'fig') return 0.055;
  if (id === 'weasley') return 0.12;
  return 0.18;
}

function buildNeedleSet(regularGroups, matchMode) {
  var set = new Set();
  for (var i = 0; i < regularGroups.length; i++) {
    var terms = getGroupTerms(regularGroups[i], matchMode);
    for (var j = 0; j < terms.length; j++) {
      var t = String(terms[j]).toLowerCase();
      if (t.length >= 3) set.add(t);
    }
  }
  if (set.size > 96) {
    var arr = Array.from(set).slice(0, 96);
    set = new Set(arr);
  }
  return set;
}

function chunkHasAnyNeedle(chunk, needleSet, matchMode) {
  if (!needleSet || needleSet.size === 0) return true;
  var blob = matchMode === 'stem'
    ? (chunk.textStemmed + ' ' + chunk.titleStemmed)
    : (chunk.text + ' ' + chunk.titleLower);
  var hit = false;
  needleSet.forEach(function (needle) {
    if (hit) return;
    if (blob.indexOf(needle) >= 0) hit = true;
  });
  return hit;
}

// === SCORER ====================================================================
function scoreResults(chunks, keywordGroups, matchMode, sourceWeights) {
  if (keywordGroups.length === 0 || chunks.length === 0) return [];
  var regularGroups = keywordGroups.filter(function (g) { return !g.isFacet; });
  var facetGroups = keywordGroups.filter(function (g) { return g.isFacet; });
  var allGroups = regularGroups.concat(facetGroups);
  var groupTermSets = allGroups.map(function (g) {
    return { group: g, terms: g.isFacet ? g.synonyms : getGroupTerms(g, matchMode) };
  });
  var needleSet = buildNeedleSet(regularGroups, matchMode);
  var groupDocCounts = new Array(allGroups.length).fill(0);

  var rawScores = [];
  var ci;
  for (ci = 0; ci < chunks.length; ci++) {
    var chunk = chunks[ci];
    if (!chunkHasAnyNeedle(chunk, needleSet, matchMode)) continue;
    var searchText = matchMode === 'stem'
      ? (chunk.textStemmed + ' ' + chunk.titleStemmed)
      : (chunk.text + ' ' + chunk.titleLower);
    var groupHits = [];
    var groupScores = [];
    for (var gi = 0; gi < groupTermSets.length; gi++) {
      var terms = groupTermSets[gi].terms;
      var matched = [];
      for (var ti = 0; ti < terms.length; ti++) {
        if (searchText.indexOf(terms[ti].toLowerCase()) >= 0) matched.push(terms[ti]);
      }
      groupHits.push(matched);
      var hits = matched.length;
      if (hits === 0) { groupScores.push(0); }
      else { groupScores.push(Math.min(1.0, 0.4 + (hits - 1) * 0.15)); groupDocCounts[gi]++; }
    }
    rawScores.push({ chunk: chunk, groupHits: groupHits, groupScores: groupScores });
  }

  var totalDocs = Math.max(1, rawScores.length);

  var idfWeights = groupDocCounts.map(function (count) { return Math.log(1 + totalDocs / (1 + count)); });
  var results = [];
  for (var ri = 0; ri < rawScores.length; ri++) {
    var rs = rawScores[ri];
    var regularWeightedSum = 0, regularWeightTotal = 0, facetBonus = 0, groupsHit = 0, facetsHit = 0;
    for (var gi2 = 0; gi2 < rs.groupScores.length; gi2++) {
      var group = allGroups[gi2];
      if (group.isFacet) {
        if (rs.groupScores[gi2] > 0) { facetBonus += rs.groupScores[gi2] * group.facetWeight; facetsHit++; }
      } else {
        var idf = idfWeights[gi2];
        regularWeightedSum += rs.groupScores[gi2] * idf;
        regularWeightTotal += idf;
        if (rs.groupScores[gi2] > 0) groupsHit++;
      }
    }
    if (regularWeightTotal === 0 && facetBonus === 0) continue;
    var rawRelevance = regularWeightTotal > 0 ? regularWeightedSum / regularWeightTotal : 0;
    var breadthFactor = 1 + 0.1 * groupsHit;
    var relevance = rawRelevance * breadthFactor + facetBonus;
    var sourceWeight = sourceWeights.get(rs.chunk.sourceKind) || sourceWeights.get(normalizeSourceKind(rs.chunk.sourceKind)) || 0.7;
    relevance *= sourceWeight;
    results.push({
      chunk: rs.chunk,
      relevance: relevance,
      debug: {
        rawRelevance: Math.round(rawRelevance * 1000) / 1000,
        facetBonus: Math.round(facetBonus * 1000) / 1000,
        facetsHit: facetsHit,
        breadthFactor: Math.round(breadthFactor * 100) / 100,
        sourceWeight: sourceWeight,
        finalRelevance: Math.round(relevance * 1000) / 1000,
      },
    });
  }
  results.sort(function (a, b) { return b.relevance - a.relevance; });
  return results;
}

// === CHUNK =====================================================================
function normalizeChunk(raw) {
  var text = (raw.text || '').toLowerCase();
  var title = raw.title || '';
  return {
    id: raw.id, sourceId: raw.sourceId,
    sourceKind: raw.sourceKind || 'custom',
    sourceLabel: raw.sourceLabel || raw.sourceId,
    title: title, text: text,
    textStemmed: stemText(text),
    titleLower: title.toLowerCase(),
    titleStemmed: stemText(title.toLowerCase()),
    url: raw.url || null,
    lastModified: raw.lastModified || null,
    metadata: raw.metadata || {},
  };
}

function validateChunk(chunk) {
  var errors = [];
  if (!chunk.id) errors.push('missing id');
  if (!chunk.sourceId) errors.push('missing sourceId');
  if (!chunk.text && !chunk.title) errors.push('missing text and title');
  return errors;
}

// === ENTITY INDEX ==============================================================
function extractEntityName(title) {
  var name = title
    .replace(/\s*[—–-]\s*(character bible|character|bio|biography|overview|design|technical design|workflow guide|profile)$/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();
  if (name.length < 2) return null;
  if (/^(thread|meeting|task|fix|review|update|bug|feature):/i.test(name)) return null;
  return name;
}

var EntityIndex = (function () {
  function EI() { this._entities = new Map(); }
  EI.prototype.rebuild = function (chunks) {
    this._entities.clear();
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      var title = chunk.title || '';
      if (!title || title.length < 3) continue;
      var name = extractEntityName(title.toLowerCase().trim());
      if (!name) continue;
      if (!this._entities.has(name)) {
        this._entities.set(name, { name: name, originalTitle: chunk.title, sourceKinds: new Set(), chunkIds: [] });
      }
      var entry = this._entities.get(name);
      entry.sourceKinds.add(chunk.sourceKind);
      entry.chunkIds.push(chunk.id);
    }
  };
  EI.prototype.findInQuery = function (query) {
    var lower = query.toLowerCase();
    var matches = [];
    this._entities.forEach(function (entry, name) { if (lower.includes(name)) matches.push(entry); });
    matches.sort(function (a, b) { return b.name.length - a.name.length; });
    return matches;
  };
  Object.defineProperty(EI.prototype, 'size', { get: function () { return this._entities.size; } });
  EI.prototype.getAll = function () { return Array.from(this._entities.values()); };
  return EI;
})();

// === SOURCE REGISTRY ===========================================================
var SourceRegistry = (function () {
  function SR() {
    this._chunks = [];
    this._sourceIndex = new Map();
    this._entityIndex = new EntityIndex();
    this._invertedIndex = new InvertedIndex();
  }

  Object.defineProperty(SR.prototype, 'entityIndex', { get: function () { return this._entityIndex; } });
  Object.defineProperty(SR.prototype, 'invertedIndex', { get: function () { return this._invertedIndex; } });
  Object.defineProperty(SR.prototype, 'size', { get: function () { return this._chunks.length; } });

  SR.prototype.getSourceKinds = function () {
    var kinds = new Set();
    this._sourceIndex.forEach(function (meta) { kinds.add(meta.sourceKind); });
    return Array.from(kinds);
  };

  SR.prototype.getSources = function () {
    var sources = [];
    this._sourceIndex.forEach(function (meta, sourceId) {
      sources.push({ sourceId: sourceId, sourceKind: meta.sourceKind, sourceLabel: meta.sourceLabel, chunkCount: meta.chunkIds.size });
    });
    return sources;
  };

  // skipIndexRebuild: pass true during bulk shard loading to avoid rebuilding
  // the inverted index on every addSource call. Call buildInvertedIndex() once
  // after all shards are loaded. Single-source post-startup ops leave it false.
  SR.prototype.addSource = function (sourceId, rawChunks, skipIndexRebuild) {
    var normalized = [];
    for (var i = 0; i < rawChunks.length; i++) {
      var errors = validateChunk(rawChunks[i]);
      if (errors.length > 0) continue;
      normalized.push(normalizeChunk(rawChunks[i]));
    }
    if (!this._sourceIndex.has(sourceId) && normalized.length > 0) {
      this._sourceIndex.set(sourceId, { sourceKind: normalized[0].sourceKind, sourceLabel: normalized[0].sourceLabel, chunkIds: new Set() });
    }
    var meta = this._sourceIndex.get(sourceId);
    for (var j = 0; j < normalized.length; j++) { this._chunks.push(normalized[j]); if (meta) meta.chunkIds.add(normalized[j].id); }
    this._entityIndex.rebuild(this._chunks);
    if (!skipIndexRebuild) this._invertedIndex.build(this._chunks);
    return normalized.length;
  };

  SR.prototype.buildInvertedIndex = function () {
    this._invertedIndex.build(this._chunks);
  };

  SR.prototype.refreshSource = function (sourceId, rawChunks) {
    this.removeSource(sourceId);
    return this.addSource(sourceId, rawChunks);
  };

  SR.prototype.removeSource = function (sourceId) {
    var meta = this._sourceIndex.get(sourceId);
    if (!meta) return 0;
    var idSet = meta.chunkIds;
    var before = this._chunks.length;
    this._chunks = this._chunks.filter(function (c) { return !idSet.has(c.id); });
    this._sourceIndex.delete(sourceId);
    this._entityIndex.rebuild(this._chunks);
    this._invertedIndex.build(this._chunks);
    return before - this._chunks.length;
  };

  // Returns up to `limit` chunks for a given sourceId, in insertion order.
  // Optional `sectionTitle` restricts to chunks whose title matches exactly.
  SR.prototype.getChunksForSource = function (sourceId, limit, sectionTitle) {
    var meta = this._sourceIndex.get(sourceId);
    if (!meta) return [];
    var ids = meta.chunkIds;
    var result = [];
    var cap = limit || 50;
    for (var i = 0; i < this._chunks.length && result.length < cap; i++) {
      var c = this._chunks[i];
      if (!ids.has(c.id)) continue;
      if (sectionTitle && c.title !== sectionTitle) continue;
      result.push(c);
    }
    return result;
  };

  // Returns up to `radius` chunks before and after the anchor chunk within the
  // same sourceId. Chunks are ordered by their position in the _chunks array
  // (insertion order = the order they were written to the shard file).
  SR.prototype.getNeighborChunks = function (sourceId, anchorChunkId, radius) {
    var meta = this._sourceIndex.get(sourceId);
    if (!meta) return [];
    var ids = meta.chunkIds;
    // Build an ordered list of chunk indices for this source
    var positions = [];
    for (var i = 0; i < this._chunks.length; i++) {
      if (ids.has(this._chunks[i].id)) positions.push(i);
    }
    // Find the anchor position
    var anchorPos = -1;
    for (var j = 0; j < positions.length; j++) {
      if (this._chunks[positions[j]].id === anchorChunkId) { anchorPos = j; break; }
    }
    if (anchorPos === -1) return [];
    var r = radius || 1;
    var start = Math.max(0, anchorPos - r);
    var end   = Math.min(positions.length - 1, anchorPos + r);
    var result = [];
    for (var k = start; k <= end; k++) {
      if (k !== anchorPos) result.push(this._chunks[positions[k]]);
    }
    return result;
  };

  // Returns deduplicated chunk titles for a source (for section-level browsing).
  SR.prototype.getChunkTitlesForSource = function (sourceId) {
    var meta = this._sourceIndex.get(sourceId);
    if (!meta) return [];
    var ids = meta.chunkIds;
    var seen = new Set();
    var titles = [];
    for (var i = 0; i < this._chunks.length; i++) {
      var c = this._chunks[i];
      if (ids.has(c.id) && c.title && !seen.has(c.title)) {
        seen.add(c.title);
        titles.push(c.title);
      }
    }
    return titles;
  };

  SR.prototype.getChunks = function (sourceKindFilter) {
    if (!sourceKindFilter) return this._chunks;
    return this._chunks.filter(function (c) {
      return sourceKindFilter.has(c.sourceKind) || sourceKindFilter.has(normalizeSourceKind(c.sourceKind));
    });
  };

  SR.prototype.serialize = function () { return JSON.stringify({ version: 1, chunks: this._chunks }); };

  SR.deserialize = function (json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    var reg = new SR();
    if (data.version === 1 && Array.isArray(data.chunks)) {
      var bySource = new Map();
      for (var i = 0; i < data.chunks.length; i++) {
        var c = data.chunks[i];
        if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, []);
        bySource.get(c.sourceId).push(c);
      }
      bySource.forEach(function (chunks, sourceId) {
        reg._chunks = reg._chunks.concat(chunks);
        reg._sourceIndex.set(sourceId, { sourceKind: chunks[0].sourceKind, sourceLabel: chunks[0].sourceLabel, chunkIds: new Set(chunks.map(function (ch) { return ch.id; })) });
      });
    }
    reg._entityIndex.rebuild(reg._chunks);
    reg._invertedIndex.build(reg._chunks);
    return reg;
  };

  return SR;
})();

// === INVERTED INDEX ============================================================
// Posting-list index built from all chunks at source-load time.
// Enables O(matched_docs) lookup instead of O(all_docs) linear scan.
// Stored on SourceRegistry and rebuilt (like EntityIndex) on any chunk change.

var InvertedIndex = (function () {
  function II() {
    this._postings = new Map(); // stemmed_term -> [{idx, tf}]
    this._df = new Map();       // stemmed_term -> document frequency
    this._docLengths = [];      // chunkIdx -> word count
    this._totalLength = 0;
    this._N = 0;                // total documents indexed
    this._avgdl = 0;
  }

  II.prototype.build = function (chunks) {
    this._postings.clear();
    this._df.clear();
    this._docLengths = [];
    this._totalLength = 0;
    this._N = chunks.length;

    var tmpPostings = new Map(); // stemmed_term -> Map(chunkIdx -> tf)

    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      var rawText = ((chunk.titleLower || '') + ' ' + (chunk.text || '')).toLowerCase();
      var tokens = rawText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (t) {
        return t.length >= 2 && !STOP_WORDS.has(t);
      });
      var docLen = tokens.length;
      this._docLengths[i] = docLen;
      this._totalLength += docLen;

      var tfMap = new Map();
      for (var j = 0; j < tokens.length; j++) {
        var s = stem(tokens[j]);
        if (!s || s.length < 2) continue;
        tfMap.set(s, (tfMap.get(s) || 0) + 1);
      }

      tfMap.forEach(function (tf, term) {
        if (!tmpPostings.has(term)) tmpPostings.set(term, new Map());
        tmpPostings.get(term).set(i, tf);
      });
    }

    var self = this;
    tmpPostings.forEach(function (docMap, term) {
      var list = [];
      docMap.forEach(function (tf, idx) { list.push({ idx: idx, tf: tf }); });
      self._postings.set(term, list);
      self._df.set(term, docMap.size);
    });

    this._avgdl = this._N > 0 ? this._totalLength / this._N : 1;
  };

  /**
   * Non-blocking version of build().
   * Processes chunks in idle-time slices using requestIdleCallback (falling back
   * to setTimeout batches) so the UI stays responsive even over 100k+ chunks.
   * onDone() is called when the index is fully built.
   */
  II.prototype.buildAsync = function (chunks, onDone) {
    var self = this;
    self._postings = new Map();
    self._df = new Map();
    self._docLengths = new Array(chunks.length);
    self._totalLength = 0;
    self._N = chunks.length;
    var tmpPostings = new Map();
    var i = 0;

    function processChunk(idx) {
      var chunk = chunks[idx];
      var rawText = ((chunk.titleLower || '') + ' ' + (chunk.text || '')).toLowerCase();
      var tokens = rawText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (t) {
        return t.length >= 2 && !STOP_WORDS.has(t);
      });
      var docLen = tokens.length;
      self._docLengths[idx] = docLen;
      self._totalLength += docLen;
      var tfMap = new Map();
      for (var j = 0; j < tokens.length; j++) {
        var s = stem(tokens[j]);
        if (!s || s.length < 2) continue;
        tfMap.set(s, (tfMap.get(s) || 0) + 1);
      }
      tfMap.forEach(function (tf, term) {
        if (!tmpPostings.has(term)) tmpPostings.set(term, new Map());
        tmpPostings.get(term).set(idx, tf);
      });
    }

    function finalize() {
      tmpPostings.forEach(function (docMap, term) {
        var list = [];
        docMap.forEach(function (tf, idx) { list.push({ idx: idx, tf: tf }); });
        self._postings.set(term, list);
        self._df.set(term, docMap.size);
      });
      self._avgdl = self._N > 0 ? self._totalLength / self._N : 1;
      if (typeof onDone === 'function') onDone();
    }

    function tick(deadline) {
      if (deadline && typeof deadline.timeRemaining === 'function') {
        // requestIdleCallback path — process while there is idle time
        while (i < chunks.length && deadline.timeRemaining() > 1) processChunk(i++);
      } else {
        // setTimeout fallback — fixed batch of 1 500 chunks (~frame-friendly)
        var batchEnd = Math.min(i + 1500, chunks.length);
        while (i < batchEnd) processChunk(i++);
      }
      if (i < chunks.length) schedule(tick);
      else finalize();
    }

    function schedule(fn) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(fn, { timeout: 15000 });
      } else {
        setTimeout(function () { fn(null); }, 0);
      }
    }

    schedule(tick);
  };

  /** Look up posting list for a single (already-stemmed) term. */
  II.prototype.getPostings = function (stemmedTerm) {
    return this._postings.get(stemmedTerm) || [];
  };

  /** df for a single stemmed term. */
  II.prototype.getDf = function (stemmedTerm) {
    return this._df.get(stemmedTerm) || 0;
  };

  Object.defineProperty(II.prototype, 'N', { get: function () { return this._N; } });
  Object.defineProperty(II.prototype, 'avgdl', { get: function () { return this._avgdl; } });
  Object.defineProperty(II.prototype, 'docLengths', { get: function () { return this._docLengths; } });

  return II;
})();

// === BM25 SEARCH ===============================================================
// Okapi BM25 (k1=1.2, b=0.75). Replaces concentric ring linear scan with
// index-accelerated scoring over only the chunks that contain a query term.
// Normalises the top BM25 score to 1.0 so minRelevance thresholds behave the
// same way as in the classic engine.

var BM25_K1 = 1.2;
var BM25_B  = 0.75;

function bm25Search(query, keywordGroups, categories, registry, options) {
  var topK          = (options && options.topK) || 5;
  var minRelevance  = (options && options.minRelevance != null) ? options.minRelevance : 0.10;
  var agentOverrides = options && options.agentSourceKindOverrides;
  var agentIdForPenalty = options && options.agentId;

  var chunks = registry.getChunks();
  if (chunks.length === 0) {
    return {
      results: [], meta: {
        query: query, categories: categories, keywordGroups: keywordGroups.filter(function (g) { return !g.isFacet; }),
        templateExpansion: [], entityMatches: [], ringReached: null,
        totalCandidates: 0, returnedCount: 0, engine: 'bm25',
      },
    };
  }

  var index = registry.invertedIndex;
  var N = index.N;
  var avgdl = index.avgdl;
  var docLengths = index.docLengths;

  // Build flat list of {stemmedTerm, boost} from keyword groups
  var termBoosts = new Map(); // stemmedTerm -> max boost
  function addTerm(raw, boost) {
    var s = stem(raw);
    if (!s || s.length < 2) return;
    var cur = termBoosts.get(s) || 0;
    if (boost > cur) termBoosts.set(s, boost);
  }

  var regularGroups = keywordGroups.filter(function (g) { return !g.isFacet; });
  for (var ri = 0; ri < regularGroups.length; ri++) {
    var g = regularGroups[ri];
    addTerm(g.core, 1.0);
    if (g.stem) addTerm(g.stem, 0.6);
    for (var si = 0; si < g.synonyms.length; si++) addTerm(g.synonyms[si], 0.7);
  }

  var facetGroups = keywordGroups.filter(function (g) { return g.isFacet; });
  for (var fi = 0; fi < facetGroups.length; fi++) {
    var fg = facetGroups[fi];
    for (var fj = 0; fj < fg.synonyms.length; fj++) addTerm(fg.synonyms[fj], fg.facetWeight * 0.5);
  }

  if (termBoosts.size === 0) {
    return {
      results: [], meta: {
        query: query, categories: categories, keywordGroups: regularGroups,
        templateExpansion: [], entityMatches: [], ringReached: null,
        totalCandidates: 0, returnedCount: 0, engine: 'bm25',
      },
    };
  }

  // Accumulate BM25 scores across all candidate chunks
  var scores = new Map(); // chunkIdx -> cumulative score

  termBoosts.forEach(function (boost, stemmedTerm) {
    var postings = index.getPostings(stemmedTerm);
    if (postings.length === 0) return;
    var df = index.getDf(stemmedTerm);
    var idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    for (var pi = 0; pi < postings.length; pi++) {
      var p = postings[pi];
      var dl = docLengths[p.idx] || 1;
      var tfNorm = (p.tf * (BM25_K1 + 1)) / (p.tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl));
      var contrib = idf * tfNorm * boost;
      scores.set(p.idx, (scores.get(p.idx) || 0) + contrib);
    }
  });

  // Apply source-kind routing weights
  var knownSourceKinds = registry.getSourceKinds();
  var sourceWeights = routeSources(categories, 3, knownSourceKinds);
  sourceWeights = mergeRouteWithAgentOverrides(sourceWeights, agentOverrides);

  // Sort by raw BM25 score to find normalisation factor
  var ranked = [];
  scores.forEach(function (score, idx) { ranked.push({ idx: idx, score: score }); });
  ranked.sort(function (a, b) { return b.score - a.score; });

  var normFactor = ranked.length > 0 ? ranked[0].score : 1;
  if (normFactor <= 0) normFactor = 1;

  // Build result list
  var results = [];
  var limit = Math.min(ranked.length, topK * 4); // collect extra for penalty filtering

  for (var ki = 0; ki < limit; ki++) {
    var item = ranked[ki];
    var chunk = chunks[item.idx];
    if (!chunk) continue;
    var normalised = item.score / normFactor;
    var sourceWeight = sourceWeights.get(chunk.sourceKind) || sourceWeights.get(normalizeSourceKind(chunk.sourceKind)) || 0.7;
    var finalRelevance = normalised * sourceWeight;
    results.push({
      chunk: chunk,
      relevance: finalRelevance,
      debug: {
        bm25Raw: Math.round(item.score * 1000) / 1000,
        normalised: Math.round(normalised * 1000) / 1000,
        sourceWeight: sourceWeight,
        finalRelevance: Math.round(finalRelevance * 1000) / 1000,
        engine: 'bm25',
      },
    });
  }

  // Engine dump penalty (same as classic engine)
  var dumpPen = engineDumpPenaltyMultiplier(agentIdForPenalty, categories, query);
  if (dumpPen < 1) {
    results = results.map(function (r) {
      if (!looksLikeRawEngineAssetChunk(r.chunk)) return r;
      var rel = r.relevance * dumpPen;
      return { chunk: r.chunk, relevance: rel, debug: Object.assign({}, r.debug, { engineAssetSnippetsDownranked: true, penaltyFactor: dumpPen }) };
    }).sort(function (a, b) { return b.relevance - a.relevance; });
  }

  // fig agent: filter raw engine asset chunks for narrative queries
  var narrative = narrativeQueryWithoutTechnical(categories, query);
  if (agentIdForPenalty === 'fig' && narrative) {
    results = results.filter(function (r) { return !looksLikeRawEngineAssetChunk(r.chunk); });
    if (results.length === 0) {
      var floor = minRelevance * 0.5;
      results = ranked
        .slice(0, Math.min(ranked.length, topK * 4))
        .map(function (item) {
          var chunk = chunks[item.idx];
          if (!chunk || looksLikeRawEngineAssetChunk(chunk)) return null;
          var norm = item.score / normFactor;
          var sw = sourceWeights.get(chunk.sourceKind) || sourceWeights.get(normalizeSourceKind(chunk.sourceKind)) || 0.7;
          return { chunk: chunk, relevance: norm * sw, debug: {} };
        })
        .filter(function (r) { return r && r.relevance >= floor; })
        .sort(function (a, b) { return b.relevance - a.relevance; })
        .slice(0, topK);
    }
  }

  results = results.filter(function (r) { return r.relevance >= minRelevance; }).slice(0, topK);

  return {
    results: results,
    meta: {
      query: query, categories: categories,
      keywordGroups: regularGroups,
      templateExpansion: facetGroups.map(function (g) { return g.core; }),
      entityMatches: [],
      ringReached: null,
      totalCandidates: scores.size,
      returnedCount: results.length,
      engine: 'bm25',
    },
  };
}

// === MATCH MODES ===============================================================
var RING_MATCH_MODES = ['exact', 'synonym', 'stem', 'stem', 'stem'];
function getMatchMode(ring) { return RING_MATCH_MODES[Math.min(ring, RING_MATCH_MODES.length - 1)]; }

// === CATEGORY TEMPLATES ========================================================
var CATEGORY_TEMPLATES = {
  character: {
    broadQueryPatterns: [/\btell me about\b/, /\bwho is\b/, /\bdescribe\b/, /\bwhat do we know about\b/, /\beverything about\b/, /\bwhat can you tell me about\b/],
    facets: {
      identity:      ['name', 'age', 'gender', 'species', 'blood status'],
      affiliation:   ['house', 'year', 'school', 'faction', 'allegiance', 'occupation'],
      personality:   ['personality', 'traits', 'temperament', 'demeanor', 'attitude'],
      relationships: ['friend', 'companion', 'rival', 'mentor', 'family', 'ally', 'enemy', 'relationship'],
      backstory:     ['backstory', 'history', 'past', 'origin', 'background', 'childhood'],
      abilities:     ['ability', 'skill', 'talent', 'specialty', 'expertise', 'power'],
      questline:     ['quest', 'questline', 'mission', 'storyline', 'arc', 'companion quest'],
      appearance:    ['appearance', 'look', 'outfit', 'robe', 'scar', 'hair', 'distinguishing'],
    },
    broadWeight: 0.3, narrowWeight: 0.05,
  },
  system: {
    broadQueryPatterns: [/\bhow does .+ work\b/, /\bexplain the .+ system\b/, /\btell me about the .+ system\b/, /\bwhat is the .+ system\b/],
    facets: {
      mechanics:   ['mechanic', 'rule', 'how it works', 'loop', 'flow'],
      controls:    ['control', 'input', 'button', 'hotbar', 'keybind'],
      progression: ['progression', 'upgrade', 'unlock', 'level', 'tier', 'talent tree', 'perk'],
      entities:    ['enemy', 'npc', 'boss', 'creature', 'type', 'variant'],
      balance:     ['balance', 'difficulty', 'scaling', 'damage', 'hp', 'stats'],
    },
    broadWeight: 0.25, narrowWeight: 0.05,
  },
  technical: {
    broadQueryPatterns: [/\btell me about the .+ asset\b/, /\bhow is .+ set up\b/, /\bwhat files\b/],
    facets: {
      fileStructure:  ['file', 'path', 'folder', 'directory', 'asset', 'uasset'],
      configuration:  ['config', 'setting', 'parameter', 'property', 'datatable'],
      dependencies:   ['reference', 'dependency', 'linked', 'parent', 'child'],
      pipeline:       ['pipeline', 'import', 'export', 'build', 'cook'],
      naming:         ['naming', 'convention', 'prefix', 'suffix', 'pattern'],
    },
    broadWeight: 0.2, narrowWeight: 0.05,
  },
  lore: {
    broadQueryPatterns: [/\btell me about\b/, /\bwhat is\b/, /\bwhat are\b/, /\bexplain\b/],
    facets: {
      description: ['description', 'what is', 'definition', 'type', 'classification'],
      location:    ['location', 'where', 'found', 'place', 'region', 'area'],
      usage:       ['use', 'used for', 'effect', 'purpose', 'application'],
      history:     ['history', 'origin', 'lore', 'legend', 'story'],
      related:     ['related', 'similar', 'variant', 'counterpart', 'opposite'],
    },
    broadWeight: 0.25, narrowWeight: 0.05,
  },
  task: {
    broadQueryPatterns: [/\bwhat.+tasks?\b/, /\bstatus\b/, /\bwhat.+assigned\b/],
    facets: {
      status:   ['status', 'progress', 'open', 'closed', 'in progress', 'blocked', 'done'],
      priority: ['priority', 'urgent', 'high', 'critical', 'low'],
      owner:    ['assigned', 'owner', 'responsible', 'who'],
      timeline: ['due', 'deadline', 'sprint', 'date', 'overdue', 'eta'],
      scope:    ['description', 'requirements', 'acceptance criteria', 'scope'],
    },
    broadWeight: 0.2, narrowWeight: 0.05,
  },
  process: {
    broadQueryPatterns: [/\bhow do i\b/, /\bsteps to\b/, /\bworkflow for\b/],
    facets: {
      steps:    ['step', 'first', 'then', 'next', 'finally', 'procedure'],
      tools:    ['tool', 'software', 'application', 'plugin', 'editor'],
      inputs:   ['input', 'source', 'raw', 'original', 'starting'],
      outputs:  ['output', 'result', 'deliverable', 'artifact', 'final'],
      pitfalls: ['warning', 'common mistake', 'gotcha', 'avoid', 'pitfall', 'troubleshoot'],
    },
    broadWeight: 0.2, narrowWeight: 0.05,
  },
  conversation: {
    broadQueryPatterns: [/\bwhat did .+ say\b/, /\bwhat was discussed\b/],
    facets: {
      participants: ['said', 'mentioned', 'asked', 'replied', 'suggested'],
      topic:        ['about', 'regarding', 'topic', 'subject', 'discussion'],
      decisions:    ['decided', 'agreed', 'action item', 'conclusion', 'resolution'],
      timeline:     ['when', 'date', 'meeting', 'thread', 'channel'],
    },
    broadWeight: 0.2, narrowWeight: 0.05,
  },
};

function isBroadQuery(query, category) {
  var template = CATEGORY_TEMPLATES[category];
  if (!template) return false;
  var lower = query.toLowerCase();
  return template.broadQueryPatterns.some(function (p) { return p.test(lower); });
}

function getTemplate(category) { return CATEGORY_TEMPLATES[category] || null; }

// === EXPANDER ==================================================================
function expandWithTemplates(query, categories, existingGroups, entityMatches) {
  var expansionGroups = [];
  for (var ci = 0; ci < categories.length; ci++) {
    var template = getTemplate(categories[ci]);
    if (!template) continue;
    var broad = isBroadQuery(query, categories[ci]);
    var weight = broad ? template.broadWeight : template.narrowWeight;
    if (weight <= 0) continue;
    var facetEntries = Object.entries(template.facets);
    for (var fi = 0; fi < facetEntries.length; fi++) {
      var facetName = facetEntries[fi][0], facetTerms = facetEntries[fi][1];
      var alreadyCovered = existingGroups.some(function (g) {
        return facetTerms.includes(g.core) || g.synonyms.some(function (s) { return facetTerms.includes(s); });
      });
      if (alreadyCovered) continue;
      expansionGroups.push({ core: '_facet:' + facetName, synonyms: facetTerms, stem: facetName, isFacet: true, facetWeight: weight });
    }
  }
  return existingGroups.concat(expansionGroups);
}

// === LLM QUERY EXPANSION =======================================================
// Optional async step: ask the AI extension to generate additional search terms.
// Falls back silently to baseGroups if the AI extension is not loaded or the
// call fails. Caches results by query string for the session lifetime.

var _expansionCache = new Map();

function expandQueryWithLLM(query, baseGroups) {
  var api = window.appAPI || window.electronAPI;
  if (!api || typeof api.aiChat !== 'function') return Promise.resolve(baseGroups);

  var cacheKey = query.toLowerCase().trim();
  if (_expansionCache.has(cacheKey)) {
    var cached = _expansionCache.get(cacheKey);
    return Promise.resolve(baseGroups.concat(cached));
  }

  var systemPrompt =
    'You are a search query expansion assistant. Given a user query, return 4-7 alternative search terms ' +
    'that would help find relevant documents. Each term should be a short phrase or single word. ' +
    'Return ONLY the terms, one per line, no numbering, no explanation.';
  var userMsg = 'Query: ' + query;

  return Promise.resolve(
    api.aiChat({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] })
  ).then(function (res) {
    var text = (res && (res.content || res.response || res.text)) || '';
    var lines = text.split('\n')
      .map(function (l) { return l.trim().toLowerCase().replace(/^[-*\u2022\d.]+\s*/, ''); })
      .filter(function (l) { return l.length >= 2 && l.length <= 40; });

    var expansionGroups = lines.slice(0, 7).map(function (term) {
      var synonymEntry = lookupSynonyms(term);
      return {
        core: term,
        synonyms: synonymEntry ? synonymEntry.synonyms : [],
        stem: stem(term),
        isExpanded: true,
        expandedBoost: 0.6,
      };
    });

    try { _expansionCache.set(cacheKey, expansionGroups); } catch (e) {}
    return baseGroups.concat(expansionGroups);
  }).catch(function () {
    return baseGroups;
  });
}

// === CONCENTRIC SEARCH =========================================================
var MAX_RING = 3;

function concentricSearch(query, registry, options) {
  var topK = (options && options.topK) || 5;
  var minRelevance = (options && options.minRelevance != null) ? options.minRelevance : 0.10;
  var maxRing = (options && options.maxRing) || MAX_RING;
  var agentOverrides = options && options.agentSourceKindOverrides;
  var agentIdForPenalty = options && options.agentId;

  // Accept pre-computed values from the async pipeline (e.g. after LLM expansion)
  var categories = (options && options._precomputedCategories) || classifyQuery(query);
  var baseKeywordGroups = extractKeywords(query);
  var knownSourceKinds = registry.getSourceKinds();
  var entityMatches = (options && options._entityMatches) || registry.entityIndex.findInQuery(query);
  var keywordGroups = (options && options._precomputedGroups) || expandWithTemplates(query, categories, baseKeywordGroups, entityMatches);

  var resultMap = new Map();
  var ringReached = 0;

  for (var ring = 0; ring <= maxRing; ring++) {
    ringReached = ring;
    var matchMode = getMatchMode(ring);
    var sourceWeights = routeSources(categories, ring, knownSourceKinds);
    sourceWeights = mergeRouteWithAgentOverrides(sourceWeights, agentOverrides);
    var sourceKindFilter = new Set(sourceWeights.keys());
    var chunks = registry.getChunks(sourceKindFilter);
    var scored = scoreResults(chunks, keywordGroups, matchMode, sourceWeights);

    for (var si = 0; si < scored.length; si++) {
      var result = scored[si];
      var id = result.chunk.id;
      var existing = resultMap.get(id);
      if (!existing || result.relevance > existing.relevance) resultMap.set(id, result);
    }
    var aboveThreshold = Array.from(resultMap.values()).filter(function (r) { return r.relevance >= minRelevance; });
    if (aboveThreshold.length >= topK) break;
  }

  var allResults = Array.from(resultMap.values())
    .filter(function (r) { return r.relevance >= minRelevance; })
    .sort(function (a, b) { return b.relevance - a.relevance; });

  var dumpPen = engineDumpPenaltyMultiplier(agentIdForPenalty, categories, query);
  if (dumpPen < 1) {
    allResults = allResults.map(function (r) {
      if (!looksLikeRawEngineAssetChunk(r.chunk)) return r;
      var rel = r.relevance * dumpPen;
      var dbg = Object.assign({}, r.debug, { engineAssetSnippetsDownranked: true, penaltyFactor: dumpPen });
      return { chunk: r.chunk, relevance: rel, debug: dbg };
    }).sort(function (a, b) { return b.relevance - a.relevance; });
  }

  var narrative = narrativeQueryWithoutTechnical(categories, query);
  var relaxedRelevanceFloor = false;
  if (agentIdForPenalty === 'fig' && narrative) {
    allResults = allResults.filter(function (r) { return !looksLikeRawEngineAssetChunk(r.chunk); });
    if (allResults.length === 0) {
      relaxedRelevanceFloor = true;
      var floor = minRelevance * 0.5;
      allResults = Array.from(resultMap.values())
        .filter(function (r) {
          if (looksLikeRawEngineAssetChunk(r.chunk)) return false;
          return r.relevance >= floor;
        })
        .sort(function (a, b) { return b.relevance - a.relevance; })
        .slice(0, topK);
    }
  }

  var minRelCut = relaxedRelevanceFloor ? minRelevance * 0.5 : minRelevance;
  allResults = allResults
    .filter(function (r) { return r.relevance >= minRelCut; })
    .slice(0, topK);

  return {
    results: allResults,
    meta: {
      query: query, categories: categories,
      keywordGroups: baseKeywordGroups,
      templateExpansion: keywordGroups.filter(function (g) { return g.isFacet; }).map(function (g) { return g.core; }),
      entityMatches: entityMatches.map(function (e) { return e.name; }),
      ringReached: ringReached,
      totalCandidates: resultMap.size,
      returnedCount: allResults.length,
    },
  };
}

// === ASSEMBLER =================================================================
function assembleContext(searchOutput) {
  var results = searchOutput.results, meta = searchOutput.meta;
  var sources = results.map(function (r, i) {
    return {
      index: i + 1, id: r.chunk.id, title: r.chunk.title,
      sourceId: r.chunk.sourceId, sourceLabel: r.chunk.sourceLabel, sourceKind: r.chunk.sourceKind,
      text: r.chunk.text, url: r.chunk.url,
      relevance: Math.round(r.relevance * 1000) / 1000,
    };
  });
  var numberedContext = sources.map(function (s) {
    return '[SOURCE ' + s.index + '] ' + s.title + ' (' + s.sourceLabel + ')\n' + s.text;
  }).join('\n\n');
  var debug = {
    query: meta.query, categories: meta.categories,
    keywordGroups: meta.keywordGroups.map(function (g) { return { core: g.core, synonyms: g.synonyms, stem: g.stem }; }),
    templateExpansion: meta.templateExpansion || [],
    entityMatches: meta.entityMatches || [],
    ringReached: meta.ringReached,
    totalCandidates: meta.totalCandidates,
  };
  return { sources: sources, numberedContext: numberedContext, debug: debug };
}

// === LLM RERANKING =============================================================
// Optional async step: after BM25 or classic retrieval, ask the AI extension
// to score each candidate for relevance on a 0-10 scale, then re-sort.
// Falls back to the original order if AI is unavailable or the call fails.
// Only operates on the top-N candidates (default 25) to control latency.

var RERANK_CANDIDATE_LIMIT = 25;

function rerankWithLLM(query, searchOutput) {
  var api = window.appAPI || window.electronAPI;
  if (!api || typeof api.aiChat !== 'function') return Promise.resolve(searchOutput);
  var results = searchOutput.results;
  if (!results || results.length < 2) return Promise.resolve(searchOutput);

  var candidates = results.slice(0, RERANK_CANDIDATE_LIMIT);

  var snippets = candidates.map(function (r, i) {
    var text = (r.chunk.text || '').slice(0, 300).replace(/\s+/g, ' ').trim();
    return '[' + (i + 1) + '] ' + (r.chunk.title || 'Untitled') + ': ' + text;
  }).join('\n\n');

  var systemPrompt =
    'You are a relevance ranking assistant. Given a query and a list of document snippets, ' +
    'score each document from 0 to 10 based on relevance to the query. ' +
    'Return ONLY a JSON array of numbers in the same order as the documents, like: [8, 3, 7, ...]';
  var userMsg = 'Query: ' + query + '\n\nDocuments:\n' + snippets;

  return Promise.resolve(
    api.aiChat({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] })
  ).then(function (res) {
    var text = (res && (res.content || res.response || res.text)) || '';
    var match = text.match(/\[[\d,.\s]+\]/);
    if (!match) return searchOutput;

    var scores;
    try { scores = JSON.parse(match[0]); } catch (e) { return searchOutput; }
    if (!Array.isArray(scores) || scores.length < candidates.length) return searchOutput;

    var reranked = candidates.map(function (r, i) {
      var llmScore = Number(scores[i]) || 0;
      var blended = r.relevance * 0.4 + (llmScore / 10) * 0.6;
      return Object.assign({}, r, {
        relevance: blended,
        debug: Object.assign({}, r.debug, { llmRerankScore: llmScore, blendedRelevance: Math.round(blended * 1000) / 1000 }),
      });
    }).sort(function (a, b) { return b.relevance - a.relevance; });

    var tail = results.slice(RERANK_CANDIDATE_LIMIT);
    return Object.assign({}, searchOutput, { results: reranked.concat(tail) });
  }).catch(function () {
    return searchOutput;
  });
}

// === LLM GAP ANALYSIS (RECURSIVE RETRIEVAL) ====================================
// Optional async step: given the initial retrieval results, ask the LLM what
// aspects of the query are NOT covered, then run a second BM25 pass for those
// gaps. Results are merged before reranking so the reranker sees the full set.
// Falls back silently to [] if AI is unavailable or the call fails.
// Caches by (query + top-5 source IDs) to avoid duplicate calls.

var _gapCache = new Map();

function identifyGapsWithLLM(query, sources) {
  var api = window.appAPI || window.electronAPI;
  if (!api || typeof api.aiChat !== 'function') return Promise.resolve([]);
  if (!sources || sources.length === 0) return Promise.resolve([]);

  var cacheKey = query.toLowerCase().trim() + '|' +
    sources.slice(0, 5).map(function (s) { return s.id; }).join(',');
  if (_gapCache.has(cacheKey)) return Promise.resolve(_gapCache.get(cacheKey));

  var snippets = sources.slice(0, 8).map(function (s, i) {
    return '[' + (i + 1) + '] ' + (s.title || 'Untitled') + ': ' +
      (s.text || '').slice(0, 150).replace(/\s+/g, ' ').trim();
  }).join('\n');

  var systemPrompt =
    'You are a search gap analyst. Given a user query and a set of retrieved snippets, ' +
    'identify which specific aspects of the query are NOT addressed by any of the snippets. ' +
    'Rules:\n' +
    '- Reply with 1-3 short search phrases (2-6 words each), ONE per line.\n' +
    '- Each phrase must be a concrete search term a person would type, NOT a sentence or explanation.\n' +
    '- If coverage is truly complete, reply with exactly: NONE\n' +
    '- Never write explanatory text, bullet points, numbers, or punctuation.\n' +
    'Examples of good output:\n' +
    'property customization registration\n' +
    'field def display name editor\n' +
    'Examples of BAD output (never do this):\n' +
    'The sources already cover the topic.\n' +
    '1. registration steps';
  var userMsg = 'Query: ' + query + '\n\nRetrieved snippets:\n' + snippets;

  return Promise.resolve(
    api.aiChat({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] })
  ).then(function (res) {
    var text = ((res && (res.content || res.response || res.text)) || '').trim();
    // If LLM explicitly says nothing is missing, treat as coverage complete
    if (/^NONE$/i.test(text) || /^none\.?$/i.test(text)) return [];
    var lines = text.split('\n')
      .map(function (l) { return l.trim().toLowerCase().replace(/^[-*\u2022\d.]+\s*/, '').replace(/[.,:;?!]+$/, ''); })
      .filter(function (l) {
        // Reject lines that are clearly prose/explanatory (contain "the sources", "already", "cover", etc.)
        if (l.length < 3 || l.length > 60) return false;
        if (/\b(the sources|already cover|fully covered|does not|cannot|provides|includes|this covers)\b/i.test(l)) return false;
        // Reject lines that look like sentences (contain multiple full words with "the", "a ", "is", "are", "have", "been")
        var wordCount = l.split(/\s+/).length;
        if (wordCount > 6) return false;
        return true;
      });
    var gapGroups = lines.slice(0, 3).map(function (term) {
      return { core: term, synonyms: [], stem: stem(term), isGapFill: true, expandedBoost: 0.55 };
    });
    try { _gapCache.set(cacheKey, gapGroups); } catch (e) {}
    return gapGroups;
  }).catch(function () {
    return [];
  });
}

// === ENGINE FACTORY ============================================================
function createRAGEngine() {
  var registry = new SourceRegistry();
  return {
    search: function (query, options) { return assembleContext(concentricSearch(query, registry, options)); },
    searchRaw: function (query, options) { return concentricSearch(query, registry, options); },
    addSource: function (sourceId, chunks, skipIndex) { return registry.addSource(sourceId, chunks, skipIndex); },
    refreshSource: function (sourceId, chunks) { return registry.refreshSource(sourceId, chunks); },
    removeSource: function (sourceId) { return registry.removeSource(sourceId); },
    getSources: function () { return registry.getSources(); },
    get size() { return registry.size; },
    serialize: function () { return registry.serialize(); },
    get registry() { return registry; },
  };
}

function restoreRAGEngine(serializedData) {
  var registry = SourceRegistry.deserialize(serializedData);
  return {
    search: function (query, options) { return assembleContext(concentricSearch(query, registry, options)); },
    searchRaw: function (query, options) { return concentricSearch(query, registry, options); },
    addSource: function (sourceId, chunks, skipIndex) { return registry.addSource(sourceId, chunks, skipIndex); },
    refreshSource: function (sourceId, chunks) { return registry.refreshSource(sourceId, chunks); },
    removeSource: function (sourceId) { return registry.removeSource(sourceId); },
    getSources: function () { return registry.getSources(); },
    get size() { return registry.size; },
    serialize: function () { return registry.serialize(); },
    get registry() { return registry; },
  };
}

// === DEEP DIVE MODE ============================================================
// Exhaustive multi-round retrieval for broad "give me everything" queries.
// estimateDeepDive() gives a lightweight pre-flight cost estimate.
// deepDiveSearch() runs iterative rounds until coverage is exhausted.

var DEEP_QUERY_PATTERNS = [
  /\b(all|every|each)\b.{0,40}\b(behavior|animation|ark|asset|file|station|npc|character|spell|ability|quest|mission|event|state|node|task|ticket|page|document)\b/i,
  /\b(complete|full|comprehensive|exhaustive)\b.{0,30}\b(list|overview|breakdown|summary|catalog|inventory)\b/i,
  /\b(list all|find all|show all|give me all|tell me every|enumerate|walk me through all|show me every)\b/i,
  /\b(what are all|how many .+ are there|how many .+ exist)\b/i,
];

/** Returns true if the query signals an exhaustive / catalogue-style intent. */
function isDeepQuery(query) {
  var lower = query.toLowerCase();
  return DEEP_QUERY_PATTERNS.some(function (p) { return p.test(lower); });
}

/**
 * Lightweight estimate of how heavy a deep-dive search would be.
 * Runs one BM25 pass at a very low threshold and no topK cap,
 * then extrapolates rounds, chunks, and approximate token cost.
 *
 * @returns {{ isHeavy, reason, estimatedChunks, estimatedRounds, estimatedTokens, confidence }}
 */
function estimateDeepDive(query, agentId) {
  var mgr = getManager();
  // Use cached merged engine if the pre-warm has completed; fall back to a
  // synchronous build only if nothing is ready yet (edge-case: user sends a
  // message the instant shards finish loading, before pre-warm completes).
  var merged = mgr._mergedEngine || mgr._buildMergedEngine();
  var agent = RAG_AGENTS[agentId] || RAG_AGENTS.hecat;
  var allowedKinds = agent.allowedSourceKinds || null;
  var corpus = merged.registry; // always use full corpus for BM25 index integrity

  var categories = classifyQuery(query);
  var baseGroups = extractKeywords(query);
  var entityMatches = corpus.entityIndex ? corpus.entityIndex.findInQuery(query) : [];
  var keywordGroups = expandWithTemplates(query, categories, baseGroups, entityMatches);

  // Preliminary search — normal threshold, small topK, real relevance ranking.
  // These become the "what I found so far" preview for the user.
  var prelimResult = bm25Search(query, keywordGroups, categories, corpus, {
    topK: 12, minRelevance: 0.06,
    agentSourceKindOverrides: agent.sourceKindOverrides || null,
  });
  // Post-filter preliminary results by agent's allowed kinds
  if (allowedKinds) {
    prelimResult.results = prelimResult.results.filter(function (r) { return allowedKinds.has(resolveChunkKind(r.chunk)); });
  }
  var sampleSources = prelimResult.results.slice(0, 8).map(function (r) {
    return { title: r.chunk.title, sourceLabel: r.chunk.sourceLabel, sourceKind: r.chunk.sourceKind, relevance: Math.round(r.relevance * 100) / 100 };
  });

  // Wide pass — very low threshold to count total candidate coverage
  var wideResult = bm25Search(query, keywordGroups, categories, corpus, {
    topK: 500, minRelevance: 0.01,
    agentSourceKindOverrides: agent.sourceKindOverrides || null,
  });

  var matchingChunks = wideResult.results.length;
  var isHeavy = matchingChunks >= 30 || isDeepQuery(query);
  var estimatedRounds = Math.max(1, Math.ceil(matchingChunks / 40));
  var estimatedTokens = matchingChunks * 250; // ~250 tokens per chunk (conservative)
  var reason = isDeepQuery(query)
    ? 'Query requests exhaustive coverage (' + matchingChunks + ' candidate chunks found)'
    : matchingChunks + ' candidate chunks found — a full pass is recommended';

  return {
    isHeavy: isHeavy,
    reason: reason,
    estimatedChunks: matchingChunks,
    estimatedRounds: estimatedRounds,
    estimatedTokens: estimatedTokens,
    sampleSources: sampleSources,
    confidence: matchingChunks >= 30 ? 'high' : 'medium',
  };
}

/**
 * Uses the LLM to generate 1–2 clarifying questions based on what the
 * preliminary search found. Returns Promise<{ questions: string[] }>.
 */
function generateClarifyingQuestions(query, sampleSources) {
  var api = window.appAPI || window.electronAPI;
  if (!api || typeof api.aiChat !== 'function') return Promise.resolve({ questions: [] });

  var sourceList = sampleSources.slice(0, 6).map(function (s) { return '- ' + s.title + ' (' + s.sourceLabel + ')'; }).join('\n');
  var systemMsg =
    'You are a research assistant helping the user scope a large knowledge-base search. ' +
    'Based on the user query and the preliminary sources found, generate 1 or 2 SHORT clarifying questions ' +
    'that would help produce a more accurate or focused result. ' +
    'Keep questions brief (under 15 words each). Return ONLY the questions, one per line, no numbering or preamble.';
  var userMsg =
    'User query: "' + query + '"\n\n' +
    'Preliminary sources found:\n' + (sourceList || '(none yet)') + '\n\n' +
    'What 1-2 clarifying questions should I ask?';

  return Promise.resolve(
    api.aiChat({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }] })
  ).then(function (res) {
    var text = (res && (res.content || res.response || res.text)) || '';
    var questions = text.split('\n')
      .map(function (l) { return l.trim().replace(/^[-*\u2022\d.]+\s*/, ''); })
      .filter(function (l) { return l.length > 5 && l.length < 120; })
      .slice(0, 2);
    return { questions: questions };
  }).catch(function () {
    return { questions: [] };
  });
}

/**
 * Iterative multi-round retrieval. Each round shifts keyword emphasis so new
 * chunks surface that were below the threshold or overshadowed by higher-scoring
 * ones in earlier rounds. Deduplicates by chunk ID across rounds.
 *
 * @param {string} query
 * @param {string} agentId
 * @param {function} onProgress  Called after each round: ({ round, totalFound, newInRound, done })
 * @param {object}  [opts]       { maxRounds=8, topKPerRound=50, minRelevance=0.04 }
 * @returns {{ sources, numberedContext, rounds, totalFound }}
 */
function deepDiveSearch(query, agentId, onProgress, opts) {
  var maxRounds       = (opts && opts.maxRounds)       || 8;
  var topKPerRound    = (opts && opts.topKPerRound)    || 50;
  var minRel          = (opts && opts.minRelevance)    != null ? opts.minRelevance : 0.04;
  var neighborRadius  = (opts && opts.neighborExpansion != null) ? opts.neighborExpansion : 2;

  var mgr = getManager();
  // Use cached merged engine if pre-warm is done; sync fallback otherwise.
  var merged = mgr._mergedEngine || mgr._buildMergedEngine();
  var agent = RAG_AGENTS[agentId] || RAG_AGENTS.hecat;
  var allowedKinds = agent.allowedSourceKinds || null;
  var corpus = merged.registry; // always use full corpus for BM25 index integrity

  var categories = classifyQuery(query);
  var baseGroups = extractKeywords(query);
  var entityMatches = corpus.entityIndex ? corpus.entityIndex.findInQuery(query) : [];

  // Build keyword group variants for each round by rotating facet emphasis
  var allFacetGroups = expandWithTemplates(query, categories, baseGroups, entityMatches);

  var seen = new Set();
  var allResults = [];

  // Round-level threshold schedule: start wider each round if needed
  var thresholdSchedule = [minRel, minRel * 0.8, minRel * 0.6, minRel * 0.5, minRel * 0.4, minRel * 0.3, minRel * 0.2, minRel * 0.1];

  for (var round = 1; round <= maxRounds; round++) {
    var roundThreshold = thresholdSchedule[Math.min(round - 1, thresholdSchedule.length - 1)];

    // Rotate which facet groups lead this round (shift array by round-1)
    var facetShift = round - 1;
    var roundGroups = baseGroups.concat(
      allFacetGroups.slice(facetShift).concat(allFacetGroups.slice(0, facetShift))
    );

    var roundResult = bm25Search(query, roundGroups, categories, corpus, {
      topK: topKPerRound,
      minRelevance: roundThreshold,
      agentSourceKindOverrides: agent.sourceKindOverrides || null,
    });

    // Post-filter by agent's allowed source kinds
    var roundCandidates = allowedKinds
      ? roundResult.results.filter(function (r) { return allowedKinds.has(resolveChunkKind(r.chunk)); })
      : roundResult.results;

    var newInRound = 0;
    for (var ri = 0; ri < roundCandidates.length; ri++) {
      var r = roundCandidates[ri];
      var chunkId = r.chunk.id;
      if (!seen.has(chunkId)) {
        seen.add(chunkId);
        allResults.push(r);
        newInRound++;
      }
    }

    if (onProgress) {
      onProgress({ round: round, totalFound: allResults.length, newInRound: newInRound, done: false });
    }

    // Stop early if nothing new found
    if (newInRound === 0) break;
  }

  if (onProgress) {
    onProgress({ round: -1, totalFound: allResults.length, newInRound: 0, done: true });
  }

  // Sort all collected chunks by relevance descending
  allResults.sort(function (a, b) { return b.relevance - a.relevance; });

  // Expand with neighbors after the main sort so only scored chunks trigger expansion
  if (neighborRadius > 0) {
    allResults = mgr._expandWithNeighbors(allResults, neighborRadius, merged.registry);
    // Re-sort to keep scored results first, neighbor-injected ones after
    allResults.sort(function (a, b) {
      var aScore = a.isNeighbor ? 0 : a.relevance;
      var bScore = b.isNeighbor ? 0 : b.relevance;
      return bScore - aScore;
    });
  }

  // Assemble context using the same shape as assembleContext()
  var sources = allResults.map(function (r, i) {
    return {
      index: i + 1, id: r.chunk.id, title: r.chunk.title,
      sourceId: r.chunk.sourceId, sourceLabel: r.chunk.sourceLabel, sourceKind: r.chunk.sourceKind,
      text: r.chunk.text, url: r.chunk.url,
      relevance: Math.round(r.relevance * 1000) / 1000,
    };
  });

  var numberedContext = sources.map(function (s) {
    return '[SOURCE ' + s.index + '] ' + s.title + ' (' + s.sourceLabel + ')\n' + s.text;
  }).join('\n\n');

  return { sources: sources, numberedContext: numberedContext, rounds: maxRounds, totalFound: allResults.length };
}

// === PROFESSOR AGENTS ==========================================================
var RAG_AGENTS = {
  fig: {
    id: 'fig', name: 'Professor Fig', title: 'The Chronicler',
    domain: 'Story, narrative, lore, world-building',
    description: 'Patient and wise. Specializes in lore, character bibles, story arcs, and world-building documents.',
    topK: 8, minRelevance: 0.095, extendedMode: true,
    // Excluded: files (raw UE asset dumps are not story evidence), tasks (Jira tickets).
    // Within allowed sources: wiki and reference are primary; kb and chat are fallback.
    allowedSourceKinds: new Set(['wiki', 'reference', 'kb', 'chat', 'custom']),
    sourceKindOverrides: { wiki: 2.0, reference: 1.8, kb: 1.2, chat: 0.5, custom: 0.7 },
    systemPrompt:
      'You are Professor Fig \u2014 The Chronicler: narrative, character identity, lore, and player-facing story. ' +
      'Prefer wiki pages, character bibles, design prose, quest/narrative docs, and lore references. ' +
      'Do not fabricate story beats. If sources are sparse, say so and answer cautiously. ' +
      'Cite sources with [N]. Synthesize rich lore coherently when the sources support it.',
  },
  sharp: {
    id: 'sharp', name: 'Professor Sharp', title: 'The Investigator',
    domain: 'Debugging, crash reports, bug triage, root cause analysis',
    description: 'Analytical and precise. Former Auror. Follows evidence chains to find root causes in bugs, crashes, and Jira issues. Ask Sharp when something is broken.',
    topK: 6, minRelevance: 0.12, extendedMode: false,
    // Excluded: reference (PotterDB lore irrelevant to bugs), kb (lore knowledge base).
    // Primary: Jira tasks and bug reports. Secondary: relevant game files and Slack threads.
    allowedSourceKinds: new Set(['tasks', 'files', 'chat', 'wiki', 'custom']),
    sourceKindOverrides: { tasks: 2.5, chat: 1.8, files: 1.2, wiki: 0.5, custom: 0.6 },
    systemPrompt:
      'You are Professor Sharp \u2014 a former Auror. Your job is bug investigation and root cause analysis. ' +
      'You approach every problem like a case file: look for Jira tickets, error reports, Slack threads, and related changelists first. ' +
      'Do NOT describe how a system works from first principles \u2014 that is Ronen\u2019s job. ' +
      'Identify what broke, when, why, and what to fix. When evidence is contradictory, flag the conflict. List concrete next steps.',
  },
  ronen: {
    id: 'ronen', name: 'Professor Ronen', title: 'The Artificer',
    domain: 'Game code, Unreal assets, blueprints, data tables, technical architecture',
    description: 'Enthusiastic and creative. Reads game files, UE assets, blueprints, and data tables. Ask Ronen when you want to understand how something is built.',
    topK: 7, minRelevance: 0.10, extendedMode: false,
    // Excluded: chat (Slack), tasks (Jira) — neither contains architecture documentation.
    // Primary: UE game files (Content folder assets). Strong secondary: Confluence tech docs.
    allowedSourceKinds: new Set(['files', 'wiki', 'reference', 'kb', 'custom']),
    sourceKindOverrides: { files: 2.5, wiki: 0.9, kb: 0.6, reference: 0.4, custom: 0.5 },
    systemPrompt:
      'You are Professor Ronen \u2014 an enthusiast for elegant technical solutions. ' +
      'Your first instinct is always the game files: Unreal assets, blueprints, data tables, Data Assets, and configuration. ' +
      'When asked about code, systems, or architecture, read and explain from the actual asset data in the sources. ' +
      'Structure answers with: what the system is, how it is configured, what the key assets/files are, and how they connect. ' +
      'Always cite specific asset names, paths, and property values. If you are asked to look for bugs or issues, hand that framing to Sharp \u2014 but you can still read the relevant files.',
  },
  weasley: {
    id: 'weasley', name: 'Professor Weasley', title: 'The Organizer',
    domain: 'Workflows, task management, processes, schedules',
    description: 'Organized and action-oriented. Manages workflows, tracks tasks, and enforces procedures.',
    topK: 6, minRelevance: 0.10, extendedMode: false,
    // Excluded: files (raw code assets), reference (PotterDB lore), kb (lore knowledge base).
    // Within allowed: tasks are primary; wiki (process docs, pipelines) is strong secondary.
    allowedSourceKinds: new Set(['tasks', 'wiki', 'chat', 'custom']),
    sourceKindOverrides: { tasks: 2.0, wiki: 1.5, chat: 0.9, custom: 0.6 },
    systemPrompt: 'You are Professor Weasley \u2014 organized, practical, and action-oriented. Present information as clear workflows with numbered steps. Highlight blockers, deadlines, and ownership. When tasks are mentioned, include their status and priority. Suggest concrete next actions.',
  },
  hecat: {
    id: 'hecat', name: 'Professor Hecat', title: 'The Scholar',
    domain: 'General knowledge, cross-domain, broad queries',
    description: 'Seasoned scholar with broad expertise. Best for queries spanning multiple domains.',
    topK: 10, minRelevance: 0.10, extendedMode: false,
    allowedSourceKinds: null, // no filter — searches the full corpus
    sourceKindOverrides: null,
    systemPrompt: 'You are Professor Hecat \u2014 a seasoned scholar with expertise across all domains. Draw connections between different areas of knowledge. Be thorough in your citations. When a query touches multiple topics, address each one and note where they intersect.',
  },
};

// === RAG MANAGER ===============================================================
var RAG_CONFIG_KEY = 'producerTrackerRagConfig';
var RAG_PERSONAL_KEY = 'producerTrackerRagPersonal';
var RAG_SHARED_CACHE_KEY = 'producerTrackerRagSharedCache';

var DEFAULT_RAG_CONFIG = {
  dataMode: 'both',
  sharedPath: 'S:\\JoseAbraham\\RAG',
  disabledSources: [],
  defaultAgent: 'hecat',
  extendedMode: false,
  topK: 10,
  minRelevance: 0.10,
  // v1.4.0 additions
  searchEngine: 'bm25',        // 'classic' | 'bm25'
  queryExpansion: false,       // use LLM to expand query terms before retrieval
  reranking: false,            // use LLM to rerank top-N after retrieval
  // v1.5.0 additions
  recursiveRetrieval: false,   // LLM gap-fill: identify uncovered aspects, run second BM25 pass
};

var _tauriInvoke = null;

function callTauri(cmd, args) {
  if (_tauriInvoke) return _tauriInvoke(cmd, args || {});
  var api = window.appAPI || window.electronAPI;
  if (api && typeof api.tauriInvoke === 'function') {
    _tauriInvoke = api.tauriInvoke;
    return _tauriInvoke(cmd, args || {});
  }
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    _tauriInvoke = window.__TAURI__.core.invoke;
    return _tauriInvoke(cmd, args || {});
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    _tauriInvoke = window.__TAURI__.invoke;
    return _tauriInvoke(cmd, args || {});
  }
  return Promise.reject(new Error('Tauri bridge not available'));
}

var RAGManager = (function () {
  function RM() {
    this._shared = createRAGEngine();
    this._personal = createRAGEngine();
    this._config = Object.assign({}, DEFAULT_RAG_CONFIG);
    this._progressListeners = new Set();
    this._sharedRev = 0;
    this._personalRev = 0;
    this._configRev = 0;
    this._mergedEngine = null;
    this._mergedSignature = '';
    this._mergedBuildPromise = null;
    this._mergedBuildSig = '';
  }

  RM.prototype.getConfig = function () { return Object.assign({}, this._config); };

  RM.prototype.setConfig = function (partial) {
    Object.assign(this._config, partial);
    this._configRev++;
    this._markMergedDirty();
    try { localStorage.setItem(RAG_CONFIG_KEY, JSON.stringify(this._config)); } catch (e) {}
  };

  RM.prototype.listSources = function () {
    var shared = this._shared.getSources().map(function (s) { return Object.assign({}, s, { registry: 'shared' }); });
    var personal = this._personal.getSources().map(function (s) { return Object.assign({}, s, { registry: 'personal' }); });
    var disabled = new Set(this._config.disabledSources || []);
    return shared.concat(personal).map(function (s) { return Object.assign({}, s, { active: !disabled.has(s.sourceId) }); });
  };

  // Fetches up to `topN` chunks for a named sourceId from personal-then-shared registries.
  // Optional `sectionTitle` restricts to chunks of that title only.
  RM.prototype.fetchChunksForSource = function (sourceId, topN, sectionTitle) {
    var cap = topN || 20;
    var chunks = this._personal.registry.getChunksForSource(sourceId, cap, sectionTitle);
    if (chunks.length === 0) {
      chunks = this._shared.registry.getChunksForSource(sourceId, cap, sectionTitle);
    }
    return chunks;
  };

  // For each result in `results`, fetch up to `radius` neighboring chunks from the
  // same source (same sourceId, adjacent positions in shard order). Neighbors are
  // inserted into the result list adjacent to their anchor, de-duped by chunk id,
  // and tagged with isNeighbor:true and a near-zero relevance so they appear AFTER
  // scored results in assembleContext but are still cited as [SOURCE N].
  RM.prototype._expandWithNeighbors = function (results, radius, registry) {
    if (!radius || radius < 1 || !results || results.length === 0) return results;
    var seen = new Set();
    var expanded = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (seen.has(r.chunk.id)) continue;
      seen.add(r.chunk.id);
      expanded.push(r);
      // Fetch neighbors from the merged registry (personal has priority since we
      // use the _personal registry first; if not found there, try _shared).
      var nb = this._personal.registry.getNeighborChunks(r.chunk.sourceId, r.chunk.id, radius);
      if (!nb || nb.length === 0) {
        nb = this._shared.registry.getNeighborChunks(r.chunk.sourceId, r.chunk.id, radius);
      }
      for (var j = 0; j < nb.length; j++) {
        if (!seen.has(nb[j].id)) {
          seen.add(nb[j].id);
          expanded.push({ chunk: nb[j], relevance: 0.001, isNeighbor: true });
        }
      }
    }
    return expanded;
  };

  // Returns all unique chunk titles for a sourceId (personal-then-shared).
  RM.prototype.getSourceSections = function (sourceId) {
    var titles = this._personal.registry.getChunkTitlesForSource(sourceId);
    if (titles.length === 0) {
      titles = this._shared.registry.getChunkTitlesForSource(sourceId);
    }
    return titles;
  };

  RM.prototype.toggleSource = function (sourceId, active) {
    var disabled = new Set(this._config.disabledSources || []);
    if (active) disabled.delete(sourceId); else disabled.add(sourceId);
    this.setConfig({ disabledSources: Array.from(disabled) });
  };

  RM.prototype.addSource = function (registry, sourceId, chunks) {
    var engine = registry === 'shared' ? this._shared : this._personal;
    var count = engine.addSource(sourceId, chunks);
    if (registry === 'shared') this._sharedRev++; else this._personalRev++;
    this._markMergedDirty();
    this._persist(registry);
    return count;
  };

  RM.prototype.removeSource = function (registry, sourceId) {
    var engine = registry === 'shared' ? this._shared : this._personal;
    var count = engine.removeSource(sourceId);
    if (registry === 'shared') this._sharedRev++; else this._personalRev++;
    this._markMergedDirty();
    this._persist(registry);
    return count;
  };

  RM.prototype.refreshSource = function (registry, sourceId, chunks) {
    var engine = registry === 'shared' ? this._shared : this._personal;
    var count = engine.refreshSource(sourceId, chunks);
    if (registry === 'shared') this._sharedRev++; else this._personalRev++;
    this._markMergedDirty();
    this._persist(registry);
    return count;
  };

  RM.prototype.search = function (query, optionsOverride) {
    return this._searchAsync(query, optionsOverride || {});
  };

  RM.prototype._searchAsync = async function (query, optionsOverride) {
    var _t0 = Date.now();
    // Auto-routing: when no explicit agentId is given and the stored defaultAgent
    // is still the generic fallback ('hecat'), use classifyQuery to pick the most
    // appropriate professor for this specific query instead of always using hecat.
    var _explicitAgent = optionsOverride.agentId || null;
    var _configDefault = this._config.defaultAgent;
    var agentId = _explicitAgent
      || (_configDefault && _configDefault !== 'hecat' ? _configDefault : null)
      || selectAgentForQuery(classifyQuery(query));
    var autoRouted = !_explicitAgent;
    var agent = RAG_AGENTS[agentId] || RAG_AGENTS.hecat;
    var engine = optionsOverride.engine || this._config.searchEngine || 'bm25';
    var doExpansion = optionsOverride.queryExpansion != null ? optionsOverride.queryExpansion : this._config.queryExpansion;
    var doReranking = optionsOverride.reranking != null ? optionsOverride.reranking : this._config.reranking;

    var topK      = optionsOverride.topK || agent.topK || this._config.topK;
    var minRel    = optionsOverride.minRelevance != null ? optionsOverride.minRelevance : (agent.minRelevance != null ? agent.minRelevance : this._config.minRelevance);
    var maxRing   = optionsOverride.maxRing != null ? optionsOverride.maxRing : MAX_RING;

    var merged = await this._buildMergedEngineAsync();
    // allowedKinds is applied as a POST-retrieval filter (not pre-filter).
    // Pre-filtering breaks BM25 because the inverted index stores indices into
    // the FULL chunks array — replacing registry.chunks with a subset makes
    // those indices map to the wrong chunks.
    var allowedKinds = agent.allowedSourceKinds || null;

    // Step 1: classify + extract keywords
    var categories = classifyQuery(query);
    var baseGroups = extractKeywords(query);
    var entityMatches = merged.registry.entityIndex.findInQuery(query);
    var keywordGroups = expandWithTemplates(query, categories, baseGroups, entityMatches);

    // Step 2: optional LLM query expansion
    if (doExpansion) {
      try { keywordGroups = await expandQueryWithLLM(query, keywordGroups); } catch (e) {}
    }

    // Step 3: retrieve
    var searchOpts = {
      topK: topK, minRelevance: minRel, maxRing: maxRing,
      agentId: agentId, agentSourceKindOverrides: agent.sourceKindOverrides || null,
    };
    var raw;
    if (engine === 'bm25') {
      raw = bm25Search(query, keywordGroups, categories, merged.registry, searchOpts);
      // inject entity matches into meta for assembler parity
      raw.meta.entityMatches = entityMatches.map(function (e) { return e.name; });
      raw.meta.keywordGroups = baseGroups;
      raw.meta.templateExpansion = keywordGroups.filter(function (g) { return g.isFacet; }).map(function (g) { return g.core; });
    } else {
      raw = concentricSearch(query, merged.registry, Object.assign({}, searchOpts, {
        _precomputedCategories: categories,
        _precomputedGroups: keywordGroups,
        _entityMatches: entityMatches,
      }));
    }

    // Post-retrieval filter: remove chunks whose source kind is not in the agent's
    // allowed set. This is done AFTER retrieval so the BM25 inverted index (which
    // uses indices into the full corpus) is never given a partial chunk array.
    if (allowedKinds && raw.results && raw.results.length > 0) {
      raw.results = raw.results.filter(function (r) {
        return allowedKinds.has(resolveChunkKind(r.chunk));
      });
      // If agent filter removed everything, run a softer-threshold retry that
      // still respects the same allowedKinds — never fall back to fully unfiltered
      // (that would let e.g. UE asset files bleed into Professor Fig's answers).
      if (raw.results.length === 0) {
        var fallback = engine === 'bm25'
          ? bm25Search(query, keywordGroups, categories, merged.registry, Object.assign({}, searchOpts, { minRelevance: minRel * 0.5 }))
          : concentricSearch(query, merged.registry, Object.assign({}, searchOpts, { minRelevance: minRel * 0.5, _precomputedCategories: categories, _precomputedGroups: keywordGroups, _entityMatches: entityMatches }));
        raw.results = fallback.results.filter(function (r) {
          return allowedKinds.has(resolveChunkKind(r.chunk));
        });
        // Only if the agent is Hecat (no filter) or still empty after filtered retry,
        // allow a completely unfiltered last resort — log a warning so it's visible.
        if (raw.results.length === 0) {
          console.warn('[RAG] Agent "' + agentId + '" found no sources within its allowed kinds (' + Array.from(allowedKinds).join(', ') + '). Returning empty — no cross-domain bleed.');
        }
      }
    }

    // Step 3.5: neighbor expansion — for each retrieved chunk, also pull adjacent
    // chunks from the same source page so the LLM sees surrounding context.
    // Depth is controlled by the caller: 0=off, 1=±1 (Extended), 2=±2 (Deep Dive).
    var expandRadius = optionsOverride.neighborExpansion != null
      ? optionsOverride.neighborExpansion
      : (this._config.neighborExpansion || 0);
    if (expandRadius > 0 && raw.results && raw.results.length > 0) {
      raw.results = self._expandWithNeighbors(raw.results, expandRadius, merged.registry);
    }
    var neighborsAdded = raw.results ? raw.results.filter(function (r) { return r.isNeighbor; }).length : 0;

    // Step 4: assemble context
    var assembled = assembleContext(raw);
    assembled.agentId = agentId;
    assembled.agentName = agent.name;
    assembled.agentPrompt = agent.systemPrompt;
    assembled.autoRouted = autoRouted;
    assembled.engine = engine;
    assembled.queryExpansionUsed = doExpansion;
    assembled.neighborsAdded = neighborsAdded;
    assembled.neighborExpansion = expandRadius;
    assembled.recursiveUsed = false;
    assembled.recursiveSteps = [];

    // Step 5: iterative recursive gap-fill loop (max 3 passes)
    // Each pass: gap analysis → BM25 for gaps → merge → repeat until coverage
    // confirmed or no new results. Runs before reranking so the reranker sees
    // the fully enriched result set.
    var doRecursive = optionsOverride.recursiveRetrieval != null ? optionsOverride.recursiveRetrieval : this._config.recursiveRetrieval;
    console.log('[RAG v1.5] recursive flag:', doRecursive, '| optOverride.recursiveRetrieval:', optionsOverride.recursiveRetrieval, '| cfg.recursiveRetrieval:', this._config.recursiveRetrieval, '| sources:', assembled.sources ? assembled.sources.length : 0);
    if (doRecursive && assembled.sources && assembled.sources.length > 0) {
      var MAX_RECURSIVE_PASSES = 3;
      // Gap searches cast a wider net than the initial query. Each pass can add up
      // to _gapTopK new candidates. The total pool is allowed to grow up to
      // _maxTotal so that recursive genuinely expands coverage, not just swaps.
      var _gapTopK  = Math.max(topK * 2, 20);   // wider net per gap pass
      var _maxTotal = Math.max(topK * 3, 25);    // pool cap across all passes
      var _allResults = raw.results.slice();

      var _emitStep = function (data) {
        try {
          var step = Object.assign({ ts: Date.now() }, data);
          assembled.recursiveSteps.push(step);
          var _sa = window.appAPI || window.electronAPI;
          if (_sa && typeof _sa.interopPublish === 'function') {
            _sa.interopPublish({ channel: 'rag/search-step', source: 'rag', payload: step });
          }
        } catch (e) {}
      };

      // Emit initial pass result
      _emitStep({
        pass: 0, type: 'initial-results',
        terms: [query],
        resultCount: _allResults.length,
        topSources: assembled.sources.slice(0, 5).map(function (s) {
          return { title: s.title, kind: s.sourceKind, score: s.relevance };
        }),
      });

      for (var _pass = 1; _pass <= MAX_RECURSIVE_PASSES; _pass++) {
        // Gap analysis — ask LLM what the current results are missing
        var _gapGroups = [];
        try { _gapGroups = await identifyGapsWithLLM(query, assembled.sources); } catch (e) {}

        if (_gapGroups.length === 0) {
          // LLM confirmed coverage is sufficient
          _emitStep({ pass: _pass, type: 'coverage-complete', totalSources: _allResults.length });
          break;
        }

        _emitStep({
          pass: _pass, type: 'gaps-found',
          gaps: _gapGroups.map(function (g) { return g.core; }),
        });

        // Gap search — use the same engine as the initial search so classic-mode
        // recursive doesn't silently fall back to BM25 (which may have an empty index).
        var _gapSearchOpts = Object.assign({}, searchOpts, { topK: _gapTopK });
        var _gapRaw = (engine === 'bm25')
          ? bm25Search(query, _gapGroups, categories, merged.registry, _gapSearchOpts)
          : concentricSearch(query, merged.registry, Object.assign({}, _gapSearchOpts, {
              _precomputedCategories: categories,
              _precomputedGroups: _gapGroups,
              _entityMatches: entityMatches,
            }));
        var _existingIds = new Set(_allResults.map(function (r) { return r.chunk.id; }));
        var _newResults = (_gapRaw.results || []).filter(function (r) { return !_existingIds.has(r.chunk.id); });

        if (_newResults.length === 0) {
          // Gap search found nothing new — stop
          _emitStep({
            pass: _pass, type: 'no-new-results',
            gaps: _gapGroups.map(function (g) { return g.core; }),
          });
          break;
        }

        _emitStep({
          pass: _pass, type: 'new-results',
          gaps: _gapGroups.map(function (g) { return g.core; }),
          newCount: _newResults.length,
          newSources: _newResults.slice(0, 4).map(function (r) {
            return { title: r.chunk.title, kind: r.chunk.sourceKind, score: Math.round(r.relevance * 1000) / 1000 };
          }),
        });

        // Merge new results — pool grows up to _maxTotal (not capped back to topK)
        _allResults = _allResults.concat(_newResults)
          .sort(function (a, b) { return b.relevance - a.relevance; })
          .slice(0, _maxTotal);
        var _mergedAssembled = assembleContext({ results: _allResults, meta: raw.meta });
        assembled.sources = _mergedAssembled.sources;
        assembled.numberedContext = _mergedAssembled.numberedContext;
        assembled.debug = _mergedAssembled.debug;
        assembled.recursiveUsed = true;

        _emitStep({
          pass: _pass, type: 'merged',
          totalSources: _allResults.length,
          initialTopK: topK,
          allSources: assembled.sources.slice(0, 12).map(function (s) {
            return { title: s.title, kind: s.sourceKind, score: s.relevance };
          }),
        });

        if (_pass === MAX_RECURSIVE_PASSES) {
          _emitStep({ pass: _pass, type: 'max-passes-reached', totalSources: _allResults.length });
        }
      }
    }

    // Step 6: optional LLM reranking
    if (doReranking && assembled.sources && assembled.sources.length > 1) {
      try {
        var rerankedOutput = await rerankWithLLM(query, { results: assembled.sources.map(function (s) { return { chunk: { id: s.id, title: s.title, text: s.text, sourceKind: s.sourceKind, sourceId: s.sourceId, sourceLabel: s.sourceLabel, url: s.url }, relevance: s.relevance, debug: {} }; }) });
        if (rerankedOutput && rerankedOutput.results) {
          assembled.sources = rerankedOutput.results.map(function (r, i) {
            return { index: i + 1, id: r.chunk.id, title: r.chunk.title, sourceId: r.chunk.sourceId, sourceLabel: r.chunk.sourceLabel, sourceKind: r.chunk.sourceKind, text: r.chunk.text, url: r.chunk.url, relevance: Math.round(r.relevance * 1000) / 1000 };
          });
          assembled.numberedContext = assembled.sources.map(function (s) {
            return '[SOURCE ' + s.index + '] ' + s.title + ' (' + s.sourceLabel + ')\n' + s.text;
          }).join('\n\n');
          assembled.rerankingUsed = true;
        }
      } catch (e) {}
    }

    // Publish telemetry — both to analytics trace (persistent) and the interop
    // bus (live, visible in Interop Hub events panel).
    try {
      var _trackApi = window.appAPI || window.electronAPI;
      var _payload = {
        query:               (query || '').slice(0, 120),
        engine:              engine,
        agentId:             agentId,
        categories:          assembled.debug ? assembled.debug.categories : [],
        resultCount:         assembled.sources ? assembled.sources.length : 0,
        totalCandidates:     assembled.debug ? (assembled.debug.totalCandidates || 0) : 0,
        ringReached:         assembled.debug ? (assembled.debug.ringReached != null ? assembled.debug.ringReached : null) : null,
        queryExpansionUsed:  !!assembled.queryExpansionUsed,
        rerankingUsed:       !!assembled.rerankingUsed,
        recursiveUsed:       !!assembled.recursiveUsed,
        durationMs:          Date.now() - _t0,
        topSource:           assembled.sources && assembled.sources.length > 0 ? (assembled.sources[0].title || '').slice(0, 60) : null,
      };
      if (_trackApi && typeof _trackApi.analyticsTrack === 'function') {
        _trackApi.analyticsTrack({ event: 'rag.search', payload: _payload });
      }
      if (_trackApi && typeof _trackApi.interopPublish === 'function') {
        _trackApi.interopPublish({ channel: 'rag/search', source: 'rag', payload: _payload });
      }
    } catch (e) {}

    return assembled;
  };

  /** Run both classic and BM25 engines side-by-side for comparison. */
  RM.prototype.compareSearch = function (query, optionsOverride) {
    var opts = optionsOverride || {};
    var classicP = this._searchAsync(query, Object.assign({}, opts, { engine: 'classic', queryExpansion: false, reranking: false }));
    var bm25P    = this._searchAsync(query, Object.assign({}, opts, { engine: 'bm25',    queryExpansion: false, reranking: false }));
    return Promise.all([classicP, bm25P]).then(function (results) {
      return { classic: results[0], bm25: results[1] };
    });
  };

  RM.prototype.loadSharedRegistry = function () {
    var self = this;
    if (!this._config.sharedPath) return Promise.resolve({ ok: false, error: 'No shared path configured' });

    var shardRegistryPath = self._config.sharedPath + '\\shard-registry.json';
    var legacyPath = self._config.sharedPath + '\\rag-registry.json';

    return callTauri('marketplace_path_exists', { path: shardRegistryPath }).then(function (shardExists) {
      if (shardExists) return self._loadShardBased(shardRegistryPath);
      return callTauri('marketplace_path_exists', { path: legacyPath }).then(function (legacyExists) {
        if (!legacyExists) return { ok: false, error: 'No registry found (tried shard-registry.json and rag-registry.json)' };
        return callTauri('marketplace_read_text_file', { path: legacyPath }).then(function (json) {
          self._shared = restoreRAGEngine(json);
          self._sharedRev++;
          self._markMergedDirty();
          try { localStorage.setItem(RAG_SHARED_CACHE_KEY, json); } catch (e) {}
          return { ok: true, size: self._shared.size };
        });
      });
    }).catch(function (err) {
      try {
        var cached = localStorage.getItem(RAG_SHARED_CACHE_KEY);
        if (cached) {
          self._shared = restoreRAGEngine(cached);
          self._sharedRev++;
          self._markMergedDirty();
          return { ok: true, size: self._shared.size, cached: true };
        }
      } catch (e2) {}
      return { ok: false, error: (err && err.message) || 'Failed to load shared registry' };
    });
  };

  RM.prototype._loadShardBased = function (registryPath) {
    var self = this;
    var basePath = self._config.sharedPath;
    return callTauri('marketplace_read_text_file', { path: registryPath }).then(function (json) {
      var shardIndex = JSON.parse(json);
      var shardIds = Object.keys(shardIndex);
      self._emitProgress({ phase: 'loading-shards', total: shardIds.length, loaded: 0 });

      var engine = createRAGEngine();
      var loaded = 0;
      var totalChunks = 0;

      function loadNext(idx) {
        if (idx >= shardIds.length) {
          // All shards loaded. We intentionally skip building the inverted index
          // here — _buildMergedEngineAsync() builds it in idle-time slices so the
          // UI is never blocked. The localStorage serialization is also skipped
          // because 100k+ chunks produce ~30-50 MB of JSON that exceeds the
          // storage quota and takes seconds to serialize with no benefit.
          self._shared = engine;
          self._sharedRev++;
          self._markMergedDirty();
          self._emitProgress({ phase: 'done', total: shardIds.length, loaded: loaded, chunks: totalChunks });
          try {
            var _ra = window.appAPI || window.electronAPI;
            var _rp = { shards: shardIds.length, chunks: totalChunks, path: basePath };
            if (_ra && typeof _ra.analyticsTrack === 'function') _ra.analyticsTrack({ event: 'rag.registry-loaded', payload: _rp });
            if (_ra && typeof _ra.interopPublish === 'function') _ra.interopPublish({ channel: 'rag/registry-loaded', source: 'rag', payload: _rp });
          } catch (e) {}
          // Pre-warm the merged engine asynchronously so the first search is instant.
          setTimeout(function () { try { self._buildMergedEngineAsync(); } catch (e) {} }, 50);
          return Promise.resolve({ ok: true, size: totalChunks });
        }

        var shardId = shardIds[idx];
        var metaPath = basePath + '\\shards\\' + shardId + '\\meta.jsonl';

        return callTauri('marketplace_path_exists', { path: metaPath }).then(function (exists) {
          if (!exists) {
            loaded++;
            self._emitProgress({ phase: 'loading-shards', total: shardIds.length, loaded: loaded });
            return loadNext(idx + 1);
          }
          return callTauri('marketplace_read_text_file', { path: metaPath }).then(function (raw) {
            var lines = raw.split('\n');
            var chunks = [];
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              try {
                var obj = JSON.parse(line);
                chunks.push({
                  id: obj.contentHash || (shardId + '_' + i),
                  sourceId: shardId,
                  sourceKind: obj.sourceType || obj.extra?.type || 'custom',
                  sourceLabel: obj.title || shardId,
                  title: obj.title || '',
                  text: obj.text || '',
                  url: obj.url || null,
                  lastModified: obj.lastModified || null,
                  metadata: obj.extra || {},
                });
              } catch (e) {}
            }
            if (chunks.length > 0) {
              engine.addSource(shardId, chunks, true); // skip per-shard index rebuild
              totalChunks += chunks.length;
            }
            loaded++;
            self._emitProgress({ phase: 'loading-shards', total: shardIds.length, loaded: loaded, chunks: totalChunks });
            return loadNext(idx + 1);
          });
        }).catch(function () {
          loaded++;
          return loadNext(idx + 1);
        });
      }

      return loadNext(0);
    });
  };

  RM.prototype.saveSharedRegistry = function () {
    // Only export PERSONAL sources to the share.
    // The shared registry is built by the shard pipeline and stored as individual
    // shard JSONL files — serialising it back would produce 30-50 MB of JSON and
    // lock the JS thread for several seconds. Personal sources are small (user-added
    // PDFs/text) and are the only thing that makes sense to push out to the team.
    if (!this._config.sharedPath) return Promise.resolve({ ok: false, error: 'No shared path configured' });
    if (this._personal.size === 0) return Promise.resolve({ ok: true, size: 0, skipped: true });
    var filePath = this._config.sharedPath + '\\personal-export.json';
    var data = this._personal.serialize();
    return callTauri('marketplace_write_text_file', { path: filePath, contents: data })
      .then(function () { return { ok: true, size: data.length }; })
      .catch(function (err) { return { ok: false, error: (err && err.message) || 'Failed to save personal sources' }; });
  };

  RM.prototype.loadPersonalRegistry = function () {
    try {
      var json = localStorage.getItem(RAG_PERSONAL_KEY);
      if (json) {
        this._personal = restoreRAGEngine(json);
        this._personalRev++;
        this._markMergedDirty();
      }
      return { ok: true, size: this._personal.size };
    } catch (e) { return { ok: false, error: 'Failed to load personal registry' }; }
  };

  RM.prototype.loadConfig = function () {
    try {
      var raw = localStorage.getItem(RAG_CONFIG_KEY);
      if (raw) this._config = Object.assign({}, DEFAULT_RAG_CONFIG, JSON.parse(raw));
    } catch (e) {}
    if (!this._config.sharedPath || this._config.sharedPath === 'S:\\Team\\RAG') {
      this._config.sharedPath = DEFAULT_RAG_CONFIG.sharedPath;
      try { localStorage.setItem(RAG_CONFIG_KEY, JSON.stringify(this._config)); } catch (e) {}
    }
    this._configRev++;
    this._markMergedDirty();
  };

  RM.prototype.onProgress = function (cb) {
    this._progressListeners.add(cb);
    return function () { this._progressListeners.delete(cb); }.bind(this);
  };

  RM.prototype._emitProgress = function (data) {
    this._progressListeners.forEach(function (cb) { try { cb(data); } catch (e) {} });
  };

  RM.prototype._markMergedDirty = function () {
    this._mergedEngine = null;
    this._mergedSignature = '';
    this._mergedBuildPromise = null;
    this._mergedBuildSig = '';
  };

  /**
   * Async version of _buildMergedEngine.
   * Copies chunks synchronously (fast), rebuilds entity index synchronously (fast),
   * then builds the inverted index in idle-time slices so the UI stays responsive.
   * Returns a Promise<mergedEngine> that resolves when the index is ready.
   * Subsequent calls with the same signature return the cached Promise/engine.
   */
  RM.prototype._buildMergedEngineAsync = function () {
    var self = this;
    var mode = self._config.dataMode || 'both';
    var disabled = new Set(self._config.disabledSources || []);
    var disabledList = Array.from(disabled).sort();
    var signature = [mode, disabledList.join('|'), self._sharedRev, self._personalRev, self._configRev].join('::');

    if (self._mergedEngine && self._mergedSignature === signature) return Promise.resolve(self._mergedEngine);
    if (self._mergedBuildPromise && self._mergedBuildSig === signature) return self._mergedBuildPromise;

    var merged = createRAGEngine();
    var mergedRegistry = merged.registry;

    var addFiltered = function (engine) {
      var chunks = engine.registry.getChunks();
      for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        if (disabled.has(c.sourceId)) continue;
        mergedRegistry._chunks.push(c);
        var meta = mergedRegistry._sourceIndex.get(c.sourceId);
        if (!meta) {
          meta = { sourceKind: c.sourceKind, sourceLabel: c.sourceLabel, chunkIds: new Set() };
          mergedRegistry._sourceIndex.set(c.sourceId, meta);
        }
        meta.chunkIds.add(c.id);
      }
    };

    if (mode === 'shared' || mode === 'both') addFiltered(self._shared);
    if (mode === 'personal' || mode === 'both') addFiltered(self._personal);
    mergedRegistry._entityIndex.rebuild(mergedRegistry._chunks);

    self._mergedBuildSig = signature;
    self._mergedBuildPromise = new Promise(function (resolve) {
      mergedRegistry._invertedIndex.buildAsync(mergedRegistry._chunks, function () {
        // Only commit if the signature hasn't been invalidated during the build
        if (self._mergedBuildSig === signature) {
          self._mergedEngine = merged;
          self._mergedSignature = signature;
          self._mergedBuildPromise = null;
          self._mergedBuildSig = '';
        }
        resolve(merged);
      });
    });

    return self._mergedBuildPromise;
  };

  RM.prototype._persist = function (registry) {
    if (registry === 'personal') {
      try { localStorage.setItem(RAG_PERSONAL_KEY, this._personal.serialize()); } catch (e) {}
    }
  };

  RM.prototype._buildMergedEngine = function () {
    var disabled = new Set(this._config.disabledSources || []);
    var mode = this._config.dataMode || 'both';
    var disabledList = Array.from(disabled).sort();
    var signature = [mode, disabledList.join('|'), this._sharedRev, this._personalRev, this._configRev].join('::');
    if (this._mergedEngine && this._mergedSignature === signature) return this._mergedEngine;

    var merged = createRAGEngine();
    var mergedRegistry = merged.registry;

    var addFiltered = function (engine) {
      var chunks = engine.registry.getChunks();
      for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        if (disabled.has(c.sourceId)) continue;
        mergedRegistry._chunks.push(c);
        var meta = mergedRegistry._sourceIndex.get(c.sourceId);
        if (!meta) {
          meta = { sourceKind: c.sourceKind, sourceLabel: c.sourceLabel, chunkIds: new Set() };
          mergedRegistry._sourceIndex.set(c.sourceId, meta);
        }
        meta.chunkIds.add(c.id);
      }
    };

    if (mode === 'shared' || mode === 'both') addFiltered(this._shared);
    if (mode === 'personal' || mode === 'both') addFiltered(this._personal);
    mergedRegistry._entityIndex.rebuild(mergedRegistry._chunks);
    mergedRegistry._invertedIndex.build(mergedRegistry._chunks);

    this._mergedEngine = merged;
    this._mergedSignature = signature;
    return this._mergedEngine;
  };

  return RM;
})();

// === SERVICE INIT / DESTROY ====================================================
var _manager = null;
var _progressCleanups = [];

function getManager() {
  if (!_manager) {
    _manager = new RAGManager();
    _manager.loadConfig();
    _manager.loadPersonalRegistry();
    // Do NOT load the shared registry immediately on service init — reading all
    // shard files from the network share via sequential Tauri IPC calls right at
    // startup competes with React rendering and the other service inits.
    // Defer until startup has settled (6 s) then load silently in the background.
    setTimeout(function () {
      _manager.loadSharedRegistry().then(function (res) {
        if (res.ok) console.log('[RAG] Shared registry loaded: ' + res.size + ' chunks' + (res.cached ? ' (cached)' : ''));
        else console.warn('[RAG] Shared registry: ' + (res.error || 'unavailable'));
      });
    }, 6000);
  }
  return _manager;
}

function init(appAPI) {
  var mgr = getManager();
  console.log('[RAG] Service initializing...');

  appAPI.ragGetConfig = function () { return mgr.getConfig(); };
  appAPI.ragSetConfig = function (partial) { mgr.setConfig(partial); return { ok: true }; };

  appAPI.ragCustomSources = function () { return mgr.listSources(); };
  appAPI.ragToggleSource = function (args) { mgr.toggleSource(args.id, args.active); return { ok: true }; };

  // Fetches all stored chunks for a specific sourceId (bypasses relevance ranking).
  // Optional sectionTitle restricts to chunks of that title only (section-level pinning).
  // Used by the /cite feature in AiChatView to inject pinned source content directly
  // into the system prompt regardless of what the normal BM25 search would retrieve.
  appAPI.ragFetchPinnedChunks = function (args) {
    var chunks = mgr.fetchChunksForSource(args.sourceId, args.topN || 20, args.sectionTitle || undefined);
    return {
      ok: true,
      sourceId: args.sourceId,
      sectionTitle: args.sectionTitle || null,
      chunks: chunks.map(function (c) {
        return { id: c.id, title: c.title, text: c.text, sourceId: c.sourceId, sourceLabel: c.sourceLabel, sourceKind: c.sourceKind };
      }),
    };
  };

  // Returns all unique chunk titles for a sourceId — used by the citation picker's
  // section-level drill-down (stage 3) so the user can pin a specific section of a shard.
  appAPI.ragGetSourceSections = function (args) {
    var sections = mgr.getSourceSections(args.sourceId);
    return { ok: true, sourceId: args.sourceId, sections: sections };
  };

  // Returns up to `radius` neighbor chunks on either side of `chunkId` within
  // the same sourceId. Used for manual context expansion in the UI.
  appAPI.ragFetchNeighborChunks = function (args) {
    var r = args.radius != null ? args.radius : 1;
    var nb = mgr._personal.registry.getNeighborChunks(args.sourceId, args.chunkId, r);
    if (!nb || nb.length === 0) {
      nb = mgr._shared.registry.getNeighborChunks(args.sourceId, args.chunkId, r);
    }
    return {
      ok: true,
      sourceId: args.sourceId,
      chunkId: args.chunkId,
      neighbors: (nb || []).map(function (c) {
        return { id: c.id, title: c.title, text: c.text, sourceId: c.sourceId, sourceLabel: c.sourceLabel, sourceKind: c.sourceKind };
      }),
    };
  };

  appAPI.ragSearch = function (args) {
    return Promise.resolve(mgr.search(args.query, {
      topK: args.topK,
      minRelevance: args.minRelevance,
      maxRing: args.maxRing,
      agentId: args.agentId,
      engine: args.engine,
      queryExpansion: args.queryExpansion,
      reranking: args.reranking,
      recursiveRetrieval: args.recursiveRetrieval,
      neighborExpansion: args.neighborExpansion,
    })).then(function (result) {
      return {
        ok: true,
        results: result.sources.map(function (s) {
          return {
            id: s.id, title: s.title, text: s.text,
            sourceId: s.sourceId, sourceKind: s.sourceKind, sourceLabel: s.sourceLabel,
            url: s.url, similarity: s.relevance, relevance: s.relevance,
          };
        }),
        debug: result.debug,
        numberedContext: result.numberedContext,
        agentId: result.agentId,
        agentName: result.agentName,
        agentPrompt: result.agentPrompt,
        autoRouted: !!result.autoRouted,
        engine: result.engine,
        queryExpansionUsed: result.queryExpansionUsed,
        rerankingUsed: result.rerankingUsed,
        recursiveUsed: result.recursiveUsed,
        neighborsAdded: result.neighborsAdded || 0,
        neighborExpansion: result.neighborExpansion || 0,
        recursiveSteps: result.recursiveSteps && result.recursiveSteps.length > 0 ? result.recursiveSteps : undefined,
      };
    }).catch(function (err) {
      return { ok: false, error: (err && err.message) || 'Search failed' };
    });
  };

  appAPI.ragCompareSearch = function (args) {
    return mgr.compareSearch(args.query, {
      topK: args.topK,
      minRelevance: args.minRelevance,
      agentId: args.agentId,
    }).then(function (out) {
      function mapResult(r) {
        return {
          ok: true,
          results: (r.sources || []).map(function (s) {
            return { id: s.id, title: s.title, text: s.text, sourceId: s.sourceId, sourceKind: s.sourceKind, sourceLabel: s.sourceLabel, url: s.url, similarity: s.relevance, relevance: s.relevance };
          }),
          debug: r.debug,
          numberedContext: r.numberedContext,
          agentId: r.agentId,
          agentName: r.agentName,
          engine: r.engine,
        };
      }
      return { ok: true, classic: mapResult(out.classic), bm25: mapResult(out.bm25) };
    }).catch(function (err) {
      return { ok: false, error: (err && err.message) || 'Compare search failed' };
    });
  };

  appAPI.ragGetEngineInfo = function () {
    var cfg = mgr.getConfig();
    return {
      searchEngine: cfg.searchEngine || 'bm25',
      queryExpansion: !!cfg.queryExpansion,
      reranking: !!cfg.reranking,
      recursiveRetrieval: !!cfg.recursiveRetrieval,
      aiAvailable: !!(window.appAPI && typeof window.appAPI.aiChat === 'function'),
      totalChunks: mgr.listSources().reduce(function (sum, s) { return sum + (s.chunkCount || 0); }, 0),
    };
  };

  appAPI.ragGetAgents = function () {
    return Object.values(RAG_AGENTS).map(function (a) {
      return { id: a.id, name: a.name, title: a.title, domain: a.domain, description: a.description };
    });
  };

  /** Returns a preliminary search estimate including sampleSources for the pre-flight card.
   *  Synchronous — safe to call before showing the confirmation card. */
  appAPI.ragEstimateDeepDive = function (args) {
    try {
      return Object.assign({ ok: true }, estimateDeepDive(args.query, args.agentId));
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'Estimate failed', isHeavy: false };
    }
  };

  /** Async — generates 1-2 clarifying questions from the LLM based on preliminary sources. */
  appAPI.ragGenerateClarifyingQuestions = function (args) {
    return generateClarifyingQuestions(args.query, args.sampleSources || [])
      .then(function (r) { return Object.assign({ ok: true }, r); })
      .catch(function (err) { return { ok: false, questions: [], error: (err && err.message) || 'Failed' }; });
  };

  /** Runs the multi-round deep-dive retrieval, firing onRagProgress events per round.
   *  Returns the full deduplicated result when done. */
  appAPI.ragDeepDiveSearch = function (args) {
    return new Promise(function (resolve) {
      var progressFn = typeof appAPI.onRagProgress === 'function' ? appAPI.onRagProgress : null;
      try {
        var result = deepDiveSearch(
          args.query,
          args.agentId,
          function (prog) {
            if (progressFn) {
              try { progressFn(prog); } catch (e) {}
            }
          },
          { maxRounds: args.maxRounds, topKPerRound: args.topKPerRound, minRelevance: args.minRelevance, neighborExpansion: args.neighborExpansion != null ? args.neighborExpansion : 2 }
        );
        // Normalize sources to the same shape as ragSearch results
        var agent = RAG_AGENTS[args.agentId] || RAG_AGENTS.hecat;
        resolve({
          ok: true,
          results: result.sources.map(function (s) {
            return { id: s.id, title: s.title, text: s.text, sourceId: s.sourceId, sourceKind: s.sourceKind, sourceLabel: s.sourceLabel, url: s.url, similarity: s.relevance, relevance: s.relevance };
          }),
          numberedContext: result.numberedContext,
          rounds: result.rounds,
          totalFound: result.totalFound,
          agentId: agent.id,
          agentName: agent.name,
          agentPrompt: agent.systemPrompt,
        });
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || 'Deep dive search failed' });
      }
    });
  };

  appAPI.ragAddSource = function (args) {
    var count = mgr.addSource(args.registry || 'personal', args.sourceId, args.chunks);
    return { ok: true, added: count };
  };

  appAPI.ragRemoveSource = function (args) {
    var count = mgr.removeSource(args.registry || 'personal', args.sourceId);
    return { ok: true, removed: count };
  };

  appAPI.ragLoadShared = function () { return mgr.loadSharedRegistry(); };
  appAPI.ragSaveShared = function () { return mgr.saveSharedRegistry(); };

  appAPI.ragGetCompiledKnowledge = function () { return null; };

  /** Desktop shell may implement these Tauri commands; otherwise callers get a clear error. */
  function tauriRag(cmd, args) {
    return callTauri(cmd, args || {}).then(function (res) {
      if (res && typeof res === 'object' && ('ok' in res || 'error' in res)) return res;
      return { ok: true, data: res };
    }).catch(function (err) {
      return { ok: false, error: (err && err.message) ? err.message : ('Command "' + cmd + '" is not available. Implement it in the Tauri host or use the RAG Engine view to load shared registries.') };
    });
  }

  function buildDefaultIntegrationContext() {
    var cfg = mgr.getConfig();
    return [
      '# RAG integration (generated)',
      '',
      'Use the in-app **RAG Engine** view and **Knowledge Sources** to manage data. This app exposes retrieval via `window.electronAPI` / `window.appAPI`.',
      '',
      '## Current configuration',
      '',
      '- **Shared data path:** `' + String(cfg.sharedPath || '(not set)') + '`',
      '- **Search data mode:** `' + String(cfg.dataMode || 'both') + '` (shared / personal / both)',
      '- **Default RAG agent:** `' + String(cfg.defaultAgent || '') + '`',
      '',
      '## Bridge methods (renderer)',
      '',
      '- `ragGetConfig` / `ragSetConfig` — RAG settings',
      '- `ragCustomSources` — list sources (`sourceId`, `sourceLabel`, `chunkCount`, `registry`)',
      '- `ragSearch` — `{ query, topK?, agentId?, maxRing? }` → numbered context for LLM prompts',
      '- `ragToggleSource` — `{ id: sourceId, active }`',
      '- `ragLoadShared` / `ragSaveShared` — shared registry file I/O',
      '- `ragAddFiles`, `ragAddFolder`, `ragAddUrl`, `ragAddToSource`, `ragIndexCustom` — require native indexer commands in the desktop host',
      '',
      '## AI chat',
      '',
      'Enable **extended mode** in AI settings for deeper retrieval (`aiGetConfig` / `aiSetConfig`, field `extendedMode`).',
      '',
    ].join('\n');
  }

  appAPI.ragAddFiles = function () { return tauriRag('rag_add_files', {}); };
  appAPI.ragAddFolder = function () { return tauriRag('rag_add_folder', {}); };
  appAPI.ragAddUrl = function (args) { return tauriRag('rag_add_url', args || {}); };
  appAPI.ragAddToSource = function (args) { return tauriRag('rag_add_to_source', args || {}); };

  appAPI.ragIndexCustom = function () {
    return tauriRag('rag_index_custom', {}).then(function (res) {
      if (res && res.ok === false) return res;
      try {
        mgr.loadPersonalRegistry();
      } catch (e) {}
      return res && typeof res === 'object' && res.ok !== undefined ? res : { ok: true };
    });
  };

  appAPI.ragGenerateContext = function () {
    return tauriRag('rag_generate_integration_context', {}).then(function (res) {
      if (res && res.ok && res.context) return res;
      if (res && res.ok && res.data && typeof res.data === 'string') return { ok: true, context: res.data };
      return { ok: true, context: buildDefaultIntegrationContext() };
    });
  };

  appAPI.onRagProgress = function (callback) { return mgr.onProgress(callback); };
  appAPI.onRagSearchProgress = function () { return function () {}; };

  if (window.electronAPI && window.electronAPI !== appAPI) {
    Object.keys(appAPI).forEach(function (key) {
      if (key.startsWith('rag') || key === 'onRagProgress' || key === 'onRagSearchProgress') {
        window.electronAPI[key] = appAPI[key];
      }
    });
  }

  console.log('[RAG] Service ready. Sources: ' + mgr.listSources().length + ', Agents: ' + Object.keys(RAG_AGENTS).length);
}

function destroy(appAPI) {
  var ragKeys = ['ragGetConfig', 'ragSetConfig', 'ragCustomSources', 'ragToggleSource', 'ragSearch',
    'ragGetAgents', 'ragAddSource', 'ragRemoveSource', 'ragLoadShared', 'ragSaveShared',
    'ragGetCompiledKnowledge', 'ragIndexCustom', 'ragAddFiles', 'ragAddFolder', 'ragAddUrl', 'ragAddToSource',
    'ragGenerateContext', 'onRagProgress', 'onRagSearchProgress',
    'ragCompareSearch', 'ragGetEngineInfo', 'ragFetchPinnedChunks', 'ragGetSourceSections', 'ragFetchNeighborChunks'];
  ragKeys.forEach(function (key) {
    delete appAPI[key];
    if (window.electronAPI && window.electronAPI !== appAPI) delete window.electronAPI[key];
  });
  _manager = null;
  console.log('[RAG] Service destroyed.');
}

module.exports = { init: init, destroy: destroy };
