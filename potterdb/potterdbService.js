// Potter DB Service — fetches lore from api.potterdb.com and feeds it into
// the RAG personal registry. Data is persisted to localStorage so it
// survives page reloads without needing a re-sync after every app restart.

var POTTERDB_SOURCE_ID = 'potterdb';
var POTTERDB_BASE = 'https://api.potterdb.com/v1';
var STORAGE_KEY = 'maraudersLedger_potterdb_chunks';
var STATUS_KEY  = 'maraudersLedger_potterdb_status';

var _status = { synced: false, chunkCount: 0, lastSync: null, syncing: false };

// ── Persistence helpers ──────────────────────────────────────────────────────

function saveChunksToStorage(chunks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chunks));
  } catch (e) {
    // Storage quota exceeded — not critical, just won't auto-restore
  }
}

function loadChunksFromStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveStatusToStorage(status) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ synced: status.synced, chunkCount: status.chunkCount, lastSync: status.lastSync }));
  } catch (e) {}
}

function loadStatusFromStorage() {
  try {
    var raw = localStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ── API fetch helpers ────────────────────────────────────────────────────────

async function fetchPage(url) {
  var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

async function fetchAllPages(endpoint, onProgress) {
  var items = [];
  var url = POTTERDB_BASE + endpoint + '?page[size]=100';
  var page = 1;
  while (url) {
    var data = await fetchPage(url);
    if (Array.isArray(data.data)) items = items.concat(data.data);
    if (onProgress) onProgress(items.length);
    // Support both JSON:API links.next and meta.pagination.next
    var nextLink = (data.links && data.links.next) || null;
    if (!nextLink && data.meta && data.meta.pagination && data.meta.pagination.next) {
      page = data.meta.pagination.next;
      nextLink = POTTERDB_BASE + endpoint + '?page[number]=' + page + '&page[size]=100';
    }
    url = nextLink || null;
  }
  return items;
}

// ── Chunk converters ─────────────────────────────────────────────────────────

function spellToChunk(spell) {
  var a = spell.attributes || {};
  var parts = [];
  if (a.incantation)    parts.push('Incantation: ' + a.incantation);
  if (a.effect)         parts.push('Effect: ' + a.effect);
  if (a.category)       parts.push('Category: ' + a.category);
  if (a.type)           parts.push('Type: ' + a.type);
  if (a.light)          parts.push('Light colour: ' + a.light);
  if (a.hand)           parts.push('Hand movement: ' + a.hand);
  if (a.creator)        parts.push('Creator: ' + a.creator);
  return {
    id: 'potterdb-spell-' + spell.id,
    sourceId: POTTERDB_SOURCE_ID,
    sourceKind: 'potterdb',
    sourceLabel: 'Potter DB',
    title: (a.name || spell.id) + ' (spell)',
    text: parts.join('\n') || a.name || spell.id,
    url: a.wiki || null,
  };
}

function potionToChunk(potion) {
  var a = potion.attributes || {};
  var parts = [];
  if (a.effect)          parts.push('Effect: ' + a.effect);
  if (a.characteristics) parts.push('Characteristics: ' + a.characteristics);
  if (a.difficulty)      parts.push('Difficulty: ' + a.difficulty);
  if (a.ingredients)     parts.push('Ingredients: ' + a.ingredients);
  if (a.inventors)       parts.push('Inventors: ' + a.inventors);
  if (a.manufacturers)   parts.push('Manufacturers: ' + a.manufacturers);
  if (a.side_effects)    parts.push('Side effects: ' + a.side_effects);
  if (a.time)            parts.push('Brewing time: ' + a.time);
  return {
    id: 'potterdb-potion-' + potion.id,
    sourceId: POTTERDB_SOURCE_ID,
    sourceKind: 'potterdb',
    sourceLabel: 'Potter DB',
    title: (a.name || potion.id) + ' (potion)',
    text: parts.join('\n') || a.name || potion.id,
    url: a.wiki || null,
  };
}

function characterToChunk(character) {
  var a = character.attributes || {};
  var parts = [];
  if (a.species)   parts.push('Species: ' + a.species);
  if (a.gender)    parts.push('Gender: ' + a.gender);
  if (a.house)     parts.push('House: ' + a.house);
  if (a.ancestry)  parts.push('Ancestry: ' + a.ancestry);
  if (a.wand)      parts.push('Wand: ' + a.wand);
  if (a.patronus)  parts.push('Patronus: ' + a.patronus);
  if (a.animagus)  parts.push('Animagus form: ' + a.animagus);
  if (a.born)      parts.push('Born: ' + a.born);
  if (a.died)      parts.push('Died: ' + a.died);
  if (a.job)       parts.push('Job: ' + a.job);
  if (a.boggart)   parts.push('Boggart: ' + a.boggart);
  if (a.eye_color) parts.push('Eye colour: ' + a.eye_color);
  if (a.hair_color) parts.push('Hair colour: ' + a.hair_color);
  return {
    id: 'potterdb-char-' + character.id,
    sourceId: POTTERDB_SOURCE_ID,
    sourceKind: 'potterdb',
    sourceLabel: 'Potter DB',
    title: (a.name || character.id) + ' (character)',
    text: parts.join('\n') || a.name || character.id,
    url: a.wiki || null,
  };
}

// ── Core sync ────────────────────────────────────────────────────────────────

async function syncLore(appAPI, onProgress) {
  if (_status.syncing) return { ok: false, error: 'Sync already in progress.' };
  _status.syncing = true;
  try {
    // Clear existing data from the registry
    if (typeof appAPI.ragRemoveSource === 'function') {
      appAPI.ragRemoveSource({ registry: 'personal', sourceId: POTTERDB_SOURCE_ID });
    }

    var chunks = [];
    var errors = [];

    try {
      if (onProgress) onProgress({ phase: 'spells', count: 0 });
      var spells = await fetchAllPages('/spells', function (n) {
        if (onProgress) onProgress({ phase: 'spells', count: n });
      });
      for (var i = 0; i < spells.length; i++) chunks.push(spellToChunk(spells[i]));
    } catch (e) { errors.push('spells: ' + (e.message || e)); }

    try {
      if (onProgress) onProgress({ phase: 'potions', count: 0 });
      var potions = await fetchAllPages('/potions', function (n) {
        if (onProgress) onProgress({ phase: 'potions', count: n });
      });
      for (var j = 0; j < potions.length; j++) chunks.push(potionToChunk(potions[j]));
    } catch (e) { errors.push('potions: ' + (e.message || e)); }

    try {
      if (onProgress) onProgress({ phase: 'characters', count: 0 });
      var characters = await fetchAllPages('/characters', function (n) {
        if (onProgress) onProgress({ phase: 'characters', count: n });
      });
      for (var k = 0; k < characters.length; k++) chunks.push(characterToChunk(characters[k]));
    } catch (e) { errors.push('characters: ' + (e.message || e)); }

    if (chunks.length === 0) {
      return { ok: false, error: 'No data returned from Potter DB API. ' + (errors.length ? errors.join('; ') : 'Check network connection.') };
    }

    if (typeof appAPI.ragAddSource === 'function') {
      appAPI.ragAddSource({ registry: 'personal', sourceId: POTTERDB_SOURCE_ID, chunks: chunks });
    }

    _status.synced = true;
    _status.chunkCount = chunks.length;
    _status.lastSync = new Date().toISOString();

    // Persist so next app start can restore without re-syncing
    saveChunksToStorage(chunks);
    saveStatusToStorage(_status);

    return { ok: true, chunkCount: chunks.length, errors: errors.length ? errors : undefined };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Sync failed.' };
  } finally {
    _status.syncing = false;
  }
}

// ── Service init ─────────────────────────────────────────────────────────────

function init(appAPI) {
  // Restore persisted status (so UI shows last sync info without a round-trip)
  var storedStatus = loadStatusFromStorage();
  if (storedStatus) {
    _status.synced = !!storedStatus.synced;
    _status.chunkCount = storedStatus.chunkCount || 0;
    _status.lastSync = storedStatus.lastSync || null;
  }

  // Auto-restore chunks from localStorage into the RAG index on every startup
  var cached = loadChunksFromStorage();
  if (cached && cached.length > 0 && typeof appAPI.ragAddSource === 'function') {
    try {
      appAPI.ragAddSource({ registry: 'personal', sourceId: POTTERDB_SOURCE_ID, chunks: cached });
      _status.synced = true;
      _status.chunkCount = cached.length;
    } catch (e) {}
  }

  appAPI.potterdbGetStatus = function () {
    return Object.assign({}, _status);
  };

  appAPI.potterdbSync = function (opts) {
    var onProgress = (opts && opts.onProgress) || null;
    return syncLore(appAPI, onProgress);
  };

  appAPI.potterdbClear = function () {
    if (typeof appAPI.ragRemoveSource === 'function') {
      appAPI.ragRemoveSource({ registry: 'personal', sourceId: POTTERDB_SOURCE_ID });
    }
    _status.synced = false;
    _status.chunkCount = 0;
    _status.lastSync = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    try { localStorage.removeItem(STATUS_KEY); } catch (e) {}
    return { ok: true };
  };
}

export { init };
