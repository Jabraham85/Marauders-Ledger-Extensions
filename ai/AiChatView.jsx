import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';

const AGENT_ICONS = {
  fig: '\u{1F9D9}', sharp: '\u{1F50D}', ronen: '\u{2699}',
  weasley: '\u{1F4CB}', hecat: '\u{1F4DA}',
};

var MISSION_KERNEL_SYSTEM_PROMPT = [
  'You are a narrative design assistant for a Hogwarts-era video game.',
  '',
  'Generate a complete Mission Kernel from the description and any source documents provided.',
  'The output will be placed directly on a Narrative Design Board as a mission card node.',
  '',
  'Output a 1-2 sentence summary, then immediately a ```mission-kernel code block with EXACT JSON:',
  '```mission-kernel',
  '{',
  '  "missionId": "M_XXX_01",',
  '  "headerName": "Mission Display Name",',
  '  "missionType": "side",',
  '  "team": "",',
  '  "npcs": ["NPC Name 1", "NPC Name 2"],',
  '  "locations": ["Location Name 1"],',
  '  "systems": ["Conversation", "Exploration"],',
  '  "synopsis": "2-4 sentence synopsis focused on what the player does.",',
  '  "downstreamAffects": [],',
  '  "hasBranchingEndings": false,',
  '  "endings": [{"title": "Complete", "variableCode": "M_XXX_01.Complete == 1", "description": "What happens."}],',
  '  "hasDAS": false,',
  '  "das": [],',
  '  "affectsHousePoints": false,',
  '  "housePointsChars": [],',
  '  "hasChoiceImpacts": false,',
  '  "choiceImpacts": [],',
  '  "hasWorldStateChanges": false,',
  '  "worldStateChanges": [],',
  '  "playtime": "15 minutes",',
  '  "rumors": []',
  '}',
  '```',
  '',
  'Rules:',
  '  missionType: main | side | brandFantasy | companion | worldProblem | implicit',
  '  missionId: M_[A-Z]{2,4}_[0-9]{2} — infer prefix from the setting/location, else M_UNK_01',
  '  endings: always include at least a "Complete" entry; add branching endings only if described',
  '  synopsis: player-action-focused, 2-4 sentences, no lore dumps',
  '  Use source documents to populate npcs, locations, systems accurately',
  '  das: only if NPCs react to player actions after mission (ambient dialogue)',
  '  rumors: only if missionType is side',
].join('\n');

function parseMissionKernelPatch(text) {
  var match = (text || '').match(/```mission-kernel\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    var parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      missionId: String(parsed.missionId || '').slice(0, 40),
      headerName: String(parsed.headerName || '').slice(0, 100),
      missionType: String(parsed.missionType || 'side'),
      team: String(parsed.team || '').slice(0, 80),
      npcs: Array.isArray(parsed.npcs) ? parsed.npcs.map(function (v) { return String(v).slice(0, 80); }).slice(0, 30) : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations.map(function (v) { return String(v).slice(0, 80); }).slice(0, 20) : [],
      systems: Array.isArray(parsed.systems) ? parsed.systems.map(function (v) { return String(v).slice(0, 80); }).slice(0, 20) : [],
      synopsis: String(parsed.synopsis || '').slice(0, 1500),
      downstreamAffects: Array.isArray(parsed.downstreamAffects) ? parsed.downstreamAffects.slice(0, 10) : [],
      hasBranchingEndings: !!parsed.hasBranchingEndings,
      endings: Array.isArray(parsed.endings) ? parsed.endings.slice(0, 10) : [],
      hasDAS: !!parsed.hasDAS,
      das: Array.isArray(parsed.das) ? parsed.das.slice(0, 10) : [],
      affectsHousePoints: !!parsed.affectsHousePoints,
      housePointsChars: Array.isArray(parsed.housePointsChars) ? parsed.housePointsChars.slice(0, 10) : [],
      hasChoiceImpacts: !!parsed.hasChoiceImpacts,
      choiceImpacts: Array.isArray(parsed.choiceImpacts) ? parsed.choiceImpacts.slice(0, 10) : [],
      hasWorldStateChanges: !!parsed.hasWorldStateChanges,
      worldStateChanges: Array.isArray(parsed.worldStateChanges) ? parsed.worldStateChanges.slice(0, 10) : [],
      hasMissionRumors: !!(Array.isArray(parsed.rumors) && parsed.rumors.length),
      rumors: Array.isArray(parsed.rumors) ? parsed.rumors.slice(0, 10) : [],
      playtime: String(parsed.playtime || '').slice(0, 40),
    };
  } catch (e) {
    return null;
  }
}

var BOARD_PATCH_SYSTEM_PROMPT = [
  'You are a game design assistant helping build a Game Design Board.',
  '',
  'RULES — read carefully before generating nodes:',
  '1. Use ONLY information that was explicitly discussed in the conversation. Do NOT invent names, systems, IDs, mechanics, or lore that were not mentioned.',
  '2. NEVER generate placeholder text. Do NOT write [PLACEHOLDER], [TBD], [TO BE DEFINED], Lorem ipsum, or any stand-in text. If a detail is unknown, omit that node entirely rather than filling it with a placeholder.',
  '3. Descriptions must be specific and substantive — say what the thing actually does or means in 1-3 concrete sentences. Do NOT truncate or summarize — include all relevant detail (up to 300 chars).',
  '4. Titles must be human-readable, not codes or IDs (e.g. "Dragon Debrief" not "MIS_002_v1"). Keep titles under 50 chars.',
  '',
  'NODE COUNT RULE — this is critical:',
  'Generate EXACTLY as many nodes as needed to fully represent ALL distinct concepts, systems, mechanics, quests, risks, and relationships discussed. For a brief 1-topic conversation aim for 5-10 nodes. For a detailed multi-topic discussion aim for 12-25 nodes. NEVER artificially cap at 7 or 8. Every distinct named system, mechanic, mission, or concern mentioned in the conversation deserves its own node.',
  '',
  'NODE TYPE SELECTION — pick the most specific type:',
  '  pillar          - A core creative vision statement, design principle, or top-level goal',
  '  coreLoop        - The fundamental player gameplay loop that everything else plugs into',
  '  system          - A LARGE system containing multiple mechanics (combat system, progression system)',
  '  mechanic        - A SPECIFIC gameplay mechanic or interaction (dodge roll, crafting recipe, dialogue choice)',
  '  progression     - Player progression paths, skill trees, unlocks, or leveling milestones',
  '  economy         - Resource generation, currency, costs, trade, or economic balancing',
  '  questContent    - A specific quest, side mission, story beat, or narrative moment',
  '  missionCard     - A full mission, level, chapter, or major story sequence',
  '  playtestFinding - An observation or finding from playtesting or user research',
  '  risk            - A design risk, unresolved concern, or open question requiring attention',
  '  sticky          - A free-form design note, decision, or idea that does not fit other types',
  '',
  'After a single brief sentence of explanation, output a ```board-patch code block with this EXACT JSON (no extra fields).',
  'IMPORTANT: you MUST close the code block with a closing ``` on its own line.',
  '```board-patch',
  '{',
  '  "nodes": [',
  '    { "type": "mechanic", "title": "Short Title", "description": "What this represents in specific detail." }',
  '  ],',
  '  "edges": [',
  '    { "sourceIndex": 0, "targetIndex": 1, "relationType": "supports" }',
  '  ]',
  '}',
  '```',
  'Valid relationType values: supports, requires, conflicts, extends.',
  'Do NOT include node IDs.',
  '',
  'LAYOUT RULES — these directly affect how readable the board is:',
  '5. Build a TREE or DAG, not a web. Each node should have at most 2 incoming edges and at most 2 outgoing edges.',
  '6. Edges must flow in one direction (left-to-right): the sourceIndex node must be a prerequisite or parent of the targetIndex node. Never create cycles.',
  '7. Aim for a WIDE, SHALLOW graph — prefer breadth over depth. Maximum chain length is 4 columns. If you have many related nodes, fan them out horizontally as siblings rather than stacking them in a long chain.',
  '8. Do NOT add an edge unless it represents a genuine dependency, containment, or causal relationship. Avoid "decorative" edges that just connect everything together.',
  '9. CRITICAL — NO STAR TOPOLOGY: Never connect more than 3 nodes to a single target. If 4+ mechanics all relate to one quest, create an intermediate `system` node (e.g. "Combat Mechanics") that groups them, then connect: mechanics → system → quest. One hub receiving 6+ wires is unreadable.',
  '10. CRITICAL — NO UNCONNECTED ORPHANS IN COLUMN 0: Every mechanic, risk, or sticky that has no place in the main dependency flow should be omitted rather than added as an isolated node. Only add nodes that are genuinely connected to at least one other node via a meaningful edge.',
].join('\n');

function computeBoardLayout(nodes, edges) {
  var n = nodes.length;
  if (n === 0) return [];

  // Spacing: nodes are 260px wide × ~160px tall (taller with content).
  // COL_W and ROW_H are centre-to-centre distances, so gaps are COL_W-260 and ROW_H-160.
  var COL_W = 400;  // 140px horizontal gap between 260px-wide nodes
  var ROW_H = 280;  // 120px vertical gap between nodes — enough for tall mission cards

  // Canonical vertical order within a column (lower index = higher on screen)
  var TYPE_ORDER = {
    pillar: 0, missionCard: 1, coreLoop: 2,
    system: 3, progression: 4, economy: 5,
    mechanic: 6, questContent: 7,
    playtestFinding: 8, risk: 9, sticky: 10,
  };
  function typeOrder(idx) {
    var t = nodes[idx] && nodes[idx].type;
    return TYPE_ORDER[t] !== undefined ? TYPE_ORDER[t] : 5;
  }

  // Build adjacency lists
  var outAdj = nodes.map(function () { return []; });
  var inAdj  = nodes.map(function () { return []; });
  var inDeg  = new Array(n).fill(0);
  (edges || []).forEach(function (e) {
    var s = Number(e.sourceIndex), t = Number(e.targetIndex);
    if (s >= 0 && s < n && t >= 0 && t < n && s !== t) {
      outAdj[s].push(t);
      inAdj[t].push(s);
      inDeg[t]++;
    }
  });

  // Longest-path BFS depth assignment — determines column
  var depth = new Array(n).fill(-1);
  var queue = [];
  for (var i = 0; i < n; i++) {
    if (inDeg[i] === 0) { depth[i] = 0; queue.push(i); }
  }
  if (queue.length === 0) {
    // Fully cyclic — fall back to type-ordered single group
    for (var j = 0; j < n; j++) { depth[j] = 0; queue.push(j); }
  }
  for (var qi = 0; qi < queue.length; qi++) {
    var cur = queue[qi];
    outAdj[cur].forEach(function (nxt) {
      if (depth[nxt] < depth[cur] + 1) { depth[nxt] = depth[cur] + 1; queue.push(nxt); }
    });
  }
  for (var k = 0; k < n; k++) { if (depth[k] < 0) depth[k] = 0; }

  // ── Annotation push-forward ──────────────────────────────────────────────
  // Nodes with no incoming edges (inDeg === 0) that connect to targets at depth ≥ 2
  // are "annotation" nodes (risks, stickies, QA findings commenting on a later stage).
  // BFS placed them at depth 0, but that forces a long diagonal wire across the board.
  // Push them to (min target depth - 1) so they sit right next to what they annotate.
  // True structural roots (nodes whose targets are all at depth 1, i.e. the main flow
  // starts at them) are left at depth 0.
  for (var ai = 0; ai < n; ai++) {
    if (inDeg[ai] !== 0) continue;          // only roots
    if (outAdj[ai].length === 0) continue;  // skip isolated nodes (no edges at all)
    var minTgt = Infinity;
    outAdj[ai].forEach(function (t) { if (depth[t] < minTgt) minTgt = depth[t]; });
    if (minTgt > 1) {
      // Push annotation node to sit immediately left of its nearest target
      depth[ai] = minTgt - 1;
    }
  }

  // Group nodes into columns by depth
  var maxDepth = depth.reduce(function (a, b) { return Math.max(a, b); }, 0);
  var cols = [];
  for (var c = 0; c <= maxDepth; c++) cols.push([]);
  for (var m = 0; m < n; m++) cols[depth[m]].push(m);

  // Initial within-column ordering: by type priority
  cols.forEach(function (col) {
    col.sort(function (a, b) { return typeOrder(a) - typeOrder(b); });
  });

  // Place a column: each column centred independently at y = 0
  var positions = new Array(n);
  function placeColumn(col, colIdx) {
    var total = col.length * ROW_H;
    var startY = -Math.floor(total / 2) + Math.floor(ROW_H / 2);
    col.forEach(function (nodeIdx, rowIdx) {
      positions[nodeIdx] = {
        x: colIdx * COL_W,
        y: startY + rowIdx * ROW_H,
      };
    });
  }
  cols.forEach(function (col, ci) { placeColumn(col, ci); });

  // Barycenter crossing-reduction: 4 alternating forward / backward passes.
  // Each pass re-sorts a column's nodes so that each node's Y position is closest
  // to the average Y of its neighbours in the adjacent column — this reduces
  // the number of edge crossings without changing column assignments.
  var numCols = maxDepth + 1;
  for (var pass = 0; pass < 4; pass++) {
    var fwd = (pass % 2 === 0);
    var lo = fwd ? 1 : numCols - 2;
    var hi = fwd ? numCols : -1;
    var step = fwd ? 1 : -1;
    for (var ci2 = lo; ci2 !== hi; ci2 += step) {
      var col2 = cols[ci2];
      if (col2.length <= 1) continue;
      var bc = col2.map(function (nodeIdx) {
        // Use predecessors on forward passes, successors on backward passes
        var nbrs = fwd ? inAdj[nodeIdx] : outAdj[nodeIdx];
        var yVals = nbrs
          .filter(function (nb) { return positions[nb] !== undefined; })
          .map(function (nb) { return positions[nb].y; });
        var avg = yVals.length > 0
          ? yVals.reduce(function (a, b) { return a + b; }, 0) / yVals.length
          : typeOrder(nodeIdx) * 1000;
        // 75% topology-driven, 25% type-priority nudge to keep related types close
        return { nodeIdx: nodeIdx, bc: avg * 0.75 + typeOrder(nodeIdx) * 30 };
      });
      bc.sort(function (a, b) { return a.bc - b.bc; });
      cols[ci2] = bc.map(function (b) { return b.nodeIdx; });
      placeColumn(cols[ci2], ci2);
    }
  }

  // Shift x so the whole graph is horizontally centred around x = 0
  var totalW = numCols * COL_W;
  var offsetX = -Math.floor(totalW / 2) + Math.floor(COL_W / 2);
  for (var p = 0; p < n; p++) {
    positions[p] = { x: positions[p].x + offsetX, y: positions[p].y };
  }

  return positions;
}

function parseBoardPatch(text) {
  // Allow missing closing ``` in case the model truncated the output.
  var match = (text || '').match(/```board-patch\s*([\s\S]*?)(?:```|$)/);
  if (!match) return null;
  try {
    var parsed = JSON.parse(match[1].trim());
    if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) return null;
    var cleanEdges = Array.isArray(parsed.edges) ? parsed.edges.slice(0, 128).map(function (e) {
      return {
        sourceIndex: Number(e.sourceIndex) || 0,
        targetIndex: Number(e.targetIndex) || 0,
        relationType: String(e.relationType || 'supports'),
      };
    }) : [];
    var positions = computeBoardLayout(parsed.nodes.slice(0, 60), cleanEdges);
    return {
      nodes: parsed.nodes.slice(0, 60).map(function (n, i) {
        var pos = positions[i] || { x: -240 + i * 300, y: -120 };
        return {
          type: String(n.type || 'mechanic'),
          title: String(n.title || 'AI Node').slice(0, 80),
          description: String(n.description || '').slice(0, 500),
          x: pos.x,
          y: pos.y,
        };
      }),
      edges: cleanEdges,
    };
  } catch (err) {
    return null;
  }
}

/** Fallback if ragGetAgents() omits description — aligned with rag/ragService RAG_AGENTS */
var AGENT_DESCRIPTIONS = {
  fig: 'The Chronicler — lore, identities, story design; avoids treating raw .uasset/combat-config dumps as narrative canon unless you asked for engine data.',
  sharp: 'The Investigator — root cause, bugs, evidence chains. Prioritizes tasks, files, and recent signals.',
  ronen: 'The Artificer — Unreal systems, asset paths, technical architecture. Structured, implementation-focused.',
  weasley: 'The Organizer — workflows, tasks, deadlines, ownership. Clear steps and next actions.',
  hecat: 'The Scholar — broad, cross-domain queries when the topic spans multiple areas.',
};

function getApi() {
  return window.appAPI || window.electronAPI || null;
}

function formatAnswer(text) {
  if (!text) return '';
  var html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^### (.+)$/gm, '<span style="font-weight:700;color:var(--hp-accent,#D3A625)">$1</span>');
  html = html.replace(/^## (.+)$/gm, '<span style="font-weight:700;font-size:14px;color:var(--hp-accent,#D3A625)">$1</span>');
  html = html.replace(/\[(\d+)\]/g, '<span style="display:inline-block;background:rgba(211,166,37,0.15);color:var(--hp-accent,#D3A625);border:1px solid rgba(211,166,37,0.35);border-radius:3px;padding:0 3px;font-size:10px;font-weight:700;font-family:monospace;vertical-align:baseline;line-height:1.4;margin:0 1px" title="Source $1">$1</span>');
  return html;
}

function canOpenSourceUrl(source) {
  var url = source && typeof source.url === 'string' ? source.url.trim() : '';
  return /^https?:\/\//i.test(url);
}

function openSourceUrl(source) {
  if (!canOpenSourceUrl(source)) return;
  var url = String(source.url).trim();
  var api = getApi();
  if (api && typeof api.openExternal === 'function') {
    api.openExternal(url);
    return;
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {}
}

function tryLedgerExtendedThoughtPlaybook() {
  try {
    var m = require('ledger/ragPlaybooks');
    return (m && m.EXTENDED_THOUGHT_RAG_PLAYBOOK) || '';
  } catch (e) {
    return '';
  }
}

// hasPins: true when the caller also has pinned [P1]... sources prepended above this prompt.
// When hasPins is true the INSTRUCTIONS must acknowledge both citation systems so they
// don't conflict with the "treat with highest priority" directive in the pinned header.
function buildPromptFromRAG(numberedContext, sourceCount, agentPrompt, extendedMode, hasPins) {
  var personality = agentPrompt || "You are the Hogwarts Legacy dev team's knowledge assistant.";
  var playbook = extendedMode ? tryLedgerExtendedThoughtPlaybook() : '';
  // Strip numberedContext that is just headers with no body text (empty chunk text produces
  // "[SOURCE N] title (label)\n" entries — truthy but useless for the LLM).
  var hasRealContent = numberedContext && /\[SOURCE \d+\][^\n]*\n[^\n\[]+/.test(numberedContext);
  var instructionText;
  if (hasPins && hasRealContent) {
    // Both pinned and regular RAG sources present — unified instruction covering both.
    instructionText = 'Your ONLY allowed sources of information are: (a) the PINNED SOURCES labeled [P1], [P2], etc. shown above, and (b) the REFERENCE DATA labeled [SOURCE N] shown above. Use ALL of them. Cite pinned sources as [P1], [P2], etc. and RAG sources as [1], [2], etc. Do NOT supplement with pre-training knowledge. If none of the provided sources contain the answer, respond with: "The available knowledge sources do not contain information about this topic. You may want to check whether this data has been indexed." Do not invent or extrapolate facts beyond what the sources state. Do not mention your role, routing, or any internal system names.';
  } else if (hasPins && !hasRealContent) {
    // Only pinned sources — override the "no reference data" message.
    instructionText = 'Your ONLY source of information is the PINNED SOURCES labeled [P1], [P2], etc. shown above. Read all of them. Cite with [P1], [P2], etc. notation. Do NOT supplement with pre-training knowledge. If the pinned sources do not contain the answer, say so explicitly.';
  } else if (hasRealContent) {
    instructionText = 'Your ONLY source of information for this response is the REFERENCE DATA provided above. Read ALL sources. Cite every fact with [N] brackets corresponding to the source number. Do NOT supplement with knowledge from your pre-training — if the reference data does not contain the answer, respond explicitly with: "The available knowledge sources do not contain information about this topic. You may want to check whether this data has been indexed." Do not invent or extrapolate facts beyond what the sources state. Do not mention your role, routing, or any internal system names — answer the question directly.';
  } else {
    instructionText = 'No reference data was found for this query. Do NOT make up specific facts, internal codes, asset names, or lore details. If you do not know the answer from verifiable sources, say so clearly rather than guessing. Do not mention your role or routing.';
  }
  var depthNote = extendedMode && hasRealContent
    ? '\nDEPTH REQUIREMENT: You are in Extended mode. Write a thorough, detailed response — cover all key information from every source including specifics and context. Use markdown structure (headers or bullet points) when the answer has multiple aspects. Do not truncate.\n'
    : '';
  var ragBody = personality + '\n\nDOMAIN TERMS:\n- "ARK" = animation station system. "station" = ARK interaction point.\n' +
    (hasRealContent ? '\n=== REFERENCE DATA (' + sourceCount + ' sources) ===\n' + numberedContext + '\n' : '') +
    depthNote +
    '\n=== INSTRUCTIONS ===\n' + instructionText;
  if (playbook) {
    return playbook + '\n\n' + ragBody;
  }
  return ragBody;
}

// Fix 2: agentPrompt parameter preserves the professor's persona on extended/deep-dive paths.
// Fix 5: hasPins unifies citation instructions when pinned + RAG sources coexist.
// isDeepDive: true when called from the deep-dive path (more sources, higher token budget).
// Controls depth instruction strength — deep dive demands exhaustive multi-section output.
function buildExtendedPrompt(numberedContext, totalSources, extendedMode, agentPrompt, hasPins, isDeepDive) {
  var playbook = extendedMode ? tryLedgerExtendedThoughtPlaybook() : '';
  var personality = agentPrompt || 'You are a knowledgeable assistant for a game development team working on Hogwarts Legacy.';
  var instruction = hasPins
    ? 'Your ONLY allowed sources are: (a) the PINNED SOURCES labeled [P1], [P2], etc. shown above, and (b) the REFERENCE DATA labeled [SOURCE N] below. Use ALL of them. Cite pinned sources as [P1] and RAG sources as [N]. Do NOT supplement with pre-training knowledge. If none of the sources contain the answer, say so explicitly.'
    : 'Cite with [N] notation for every factual claim. Your answer must come ENTIRELY from the provided sources — do NOT supplement with pre-training knowledge. If the sources do not contain the answer, say so explicitly.';
  var depthInstruction = isDeepDive
    ? 'You have been given ' + totalSources + ' sources from an exhaustive deep-dive search. Write a DETAILED, EXHAUSTIVE response:\n' +
      '- Use markdown headers (##) to organize your response by topic/theme\n' +
      '- Cover EVERY relevant detail from the sources — do NOT summarize or skip content\n' +
      '- Each section should fully explain its topic using specific facts, names, and values from the sources\n' +
      '- Do NOT stop early — write until you have covered all meaningful content in the sources\n' +
      '- Aim for a long-form, reference-quality answer\n'
    : 'You have been given ' + totalSources + ' sources from an extended multi-round search. Write a THOROUGH, DETAILED response:\n' +
      '- Cover all key information from every source, including specifics and context\n' +
      '- Use markdown headers or bullet points to organize when the topic has multiple aspects\n' +
      '- Do not truncate — provide full explanations, not one-liners\n';
  var core = personality + '\n\n' +
    depthInstruction +
    instruction + '\n\n' +
    '=== SOURCES ===\n\n' + numberedContext;
  return playbook ? playbook + '\n\n' + core : core;
}

var LLM_CALL_TIMEOUT_MS = 90000;

/** Persisted chat threads — restored across restarts */
var AI_CHAT_SESSIONS_KEY = 'producerTrackerAiChatSessions_v1';
var MAX_LLM_HISTORY_MSGS = 24;
var MAX_RAG_HISTORY_MSGS = 6;
var MAX_MSG_CHARS_FOR_HISTORY = 8000;

function generateSessionId() {
  return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function deriveSessionTitle(msgs, fallback) {
  var u = msgs && msgs.find(function (m) { return m.role === 'user' && m.content; });
  if (!u) return fallback || 'New chat';
  var t = String(u.content).trim().replace(/\s+/g, ' ');
  return t.length > 52 ? t.slice(0, 49) + '\u2026' : t;
}

function loadSessionsFromStorage() {
  try {
    var raw = localStorage.getItem(AI_CHAT_SESSIONS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.sessions) && data.sessions.length > 0) {
        return { sessions: data.sessions, activeId: data.activeId || data.sessions[0].id };
      }
    }
  } catch (e) {}
  var id = generateSessionId();
  return {
    sessions: [{ id: id, title: 'New chat', updatedAt: Date.now(), messages: [], costCalls: [], selectedAgent: '' }],
    activeId: id,
  };
}

function persistSessions(sessions, activeId) {
  try {
    localStorage.setItem(AI_CHAT_SESSIONS_KEY, JSON.stringify({ sessions: sessions, activeId: activeId }));
  } catch (e) {}
}

function truncateForHistory(text, max) {
  var s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

/** User + assistant turns only — for LLM and RAG context.
 *  Board-patch and mission-kernel code blocks are replaced with a short summary
 *  so the raw JSON doesn't confuse the LLM on subsequent turns. */
function messagesForConversationContext(msgs) {
  if (!msgs || !msgs.length) return [];
  return msgs
    .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
    .map(function (m) {
      var content = truncateForHistory(m.content, MAX_MSG_CHARS_FOR_HISTORY);
      if (m.boardPatch) {
        content = content.replace(/```board-patch[\s\S]*?(?:```|$)/g, '[Board structure generated — ' + (m.boardPatch.nodes ? m.boardPatch.nodes.length : '?') + ' nodes]');
      }
      if (m.missionKernelPatch) {
        content = content.replace(/```mission-kernel[\s\S]*?(?:```|$)/g, '[Mission kernel generated: ' + (m.missionKernelPatch.headerName || m.missionKernelPatch.missionId || 'untitled') + ']');
      }
      return { role: m.role, content: content };
    });
}


function buildRagQueryFromConversation(prior, currentUserMsg) {
  if (!prior.length) return currentUserMsg;
  var slice = prior.slice(-MAX_RAG_HISTORY_MSGS);
  var lines = slice.map(function (m) {
    return (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content.slice(0, 2000);
  });
  return 'Conversation so far:\n' + lines.join('\n\n') + '\n\nCurrent question:\n' + currentUserMsg;
}

function formatSeconds(ms) {
  return Math.max(0, Math.round(ms / 1000));
}

async function runWithTimeout(task, timeoutMs, timeoutMessage) {
  var timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error(timeoutMessage || ('Request timed out after ' + formatSeconds(timeoutMs) + 's')));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ─── Pipeline log (collapsible debug panel per assistant message) ─── */

var STEP_CONFIG = {
  'initial-results':    { icon: '\u{1F50D}', color: '#0d9488', label: function(s) { return 'Pass 0 \u2014 Initial search: ' + s.resultCount + ' result' + (s.resultCount === 1 ? '' : 's') + ' found'; } },
  'gaps-found':         { icon: '\u{1F4A1}', color: '#b45309', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Gap analysis \u2192 missing: ' + (s.gaps || []).join(', '); } },
  'new-results':        { icon: '\u{2795}',  color: '#0d9488', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Gap search \u2192 +' + s.newCount + ' new result' + (s.newCount === 1 ? '' : 's'); } },
  'merged':             { icon: '\u{21A9}',  color: '#6366f1', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Merged: ' + s.totalSources + ' source' + (s.totalSources === 1 ? '' : 's') + (s.initialTopK && s.totalSources > s.initialTopK ? ' \u2191 (was ' + s.initialTopK + ')' : ''); } },
  'coverage-complete':  { icon: '\u{2713}',  color: '#16a34a', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Coverage complete \u2014 no gaps remaining'; } },
  'no-new-results':     { icon: '\u{26A0}',  color: '#b45309', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Gap search returned nothing new \u2014 stopping'; } },
  'max-passes-reached': { icon: '\u{23F9}',  color: '#6b7280', label: function(s) { return 'Pass ' + s.pass + ' \u2014 Max passes reached \u2014 ' + s.totalSources + ' sources'; } },
};

function StepRow({ step }) {
  var [srcOpen, setSrcOpen] = useState(false);
  var cfg = STEP_CONFIG[step.type] || { icon: '\u25AA', color: '#6b7280', label: function(s) { return s.type; } };
  var hasSources = (step.topSources && step.topSources.length > 0) || (step.newSources && step.newSources.length > 0) || (step.allSources && step.allSources.length > 0);
  var sourcesArr = step.allSources || step.newSources || step.topSources || [];
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', paddingBottom: '4px' }}>
      <span style={{ color: cfg.color, fontSize: '11px', lineHeight: '16px', flexShrink: 0, minWidth: '14px' }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: cfg.color, fontSize: '10px', fontFamily: 'monospace' }}>{cfg.label(step)}</span>
        {hasSources && (
          <button type="button" onClick={function () { setSrcOpen(function(o) { return !o; }); }}
            style={{ marginLeft: '6px', fontSize: '9px', color: 'var(--hp-muted,#8B6B5B)', fontFamily: 'monospace', opacity: 0.8 }}>
            {srcOpen ? '[\u2212 sources]' : '[+ sources]'}
          </button>
        )}
        {srcOpen && sourcesArr.length > 0 && (
          <div style={{ marginTop: '3px', paddingLeft: '4px', borderLeft: '2px solid rgba(0,0,0,0.1)' }}>
            {sourcesArr.map(function (s, i) {
              return (
                <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '9px', fontFamily: 'monospace', lineHeight: '15px' }}>
                  <span style={{ color: '#5a8a5a', minWidth: '3rem', flexShrink: 0 }}>{(s.score || 0).toFixed(3)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--hp-text,#3B1010)' }}>{s.title || 'Untitled'}</span>
                  <span style={{ color: 'var(--hp-muted,#8B6B5B)', flexShrink: 0 }}>[{s.kind || '?'}]</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineLog({ debug, pipeline, sources, recursiveSteps }) {
  var [open, setOpen] = useState(false);
  if (!debug && !pipeline && (!recursiveSteps || recursiveSteps.length === 0)) return null;
  return (
    <div className="px-1 mt-0.5">
      <button
        type="button"
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className="flex items-center gap-1.5 text-[9px] font-mono"
        style={{ color: 'var(--hp-muted,#8B6B5B)', opacity: 0.75 }}
      >
        <span style={{ fontSize: '7px' }}>{open ? '\u25BC' : '\u25B6'}</span>
        <span>Pipeline</span>
        {pipeline && pipeline.engine && (
          <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(211,166,37,0.12)', color: 'var(--hp-accent,#D3A625)', border: '1px solid rgba(211,166,37,0.25)' }}>
            {pipeline.engine === 'extended'
              ? 'EXTENDED' + (pipeline.extendedRounds ? ' \u00B7 ' + pipeline.extendedRounds + 'R' : '')
              : pipeline.engine.toUpperCase()}
          </span>
        )}
        {pipeline && pipeline.queryExpansionUsed && (
          <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(147,51,234,0.1)', color: '#9333ea' }}>Expanded</span>
        )}
        {pipeline && pipeline.rerankingUsed && (
          <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c' }}>Reranked</span>
        )}
        {(pipeline && pipeline.recursiveUsed || (recursiveSteps && recursiveSteps.length > 0)) && (
          <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488' }}>
            {pipeline && pipeline.recursiveUsed ? 'Recursive' : 'Recursive \u2713'}
          </span>
        )}
        {pipeline && pipeline.neighborsAdded > 0 && (
          <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
            {'Expanded \xb1' + (pipeline.neighborExpansion || 1)}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1.5 p-2.5 rounded-lg text-[10px] font-mono space-y-1" style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>

          {/* Recursive search trace — shown first when present */}
          {recursiveSteps && recursiveSteps.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: 'var(--hp-muted,#8B6B5B)', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Recursive Search Trace
              </div>
              {recursiveSteps.map(function (step, i) {
                return <StepRow key={i} step={step} />;
              })}
            </div>
          )}

          {/* Standard pipeline debug info */}
          {pipeline && pipeline.agentName && (
            <div><span style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Agent  </span><span style={{ color: 'var(--hp-text,#3B1010)' }}>{pipeline.agentName}</span></div>
          )}
          {debug && debug.categories && debug.categories.length > 0 && (
            <div><span style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Class  </span><span style={{ color: 'var(--hp-text,#3B1010)' }}>{debug.categories.join(', ')}</span></div>
          )}
          {debug && debug.keywordGroups && debug.keywordGroups.length > 0 && (
            <div><span style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Terms  </span><span style={{ color: 'var(--hp-text,#3B1010)' }}>{debug.keywordGroups.map(function (g) { return g.core + (g.synonyms && g.synonyms.length ? ' (+' + g.synonyms.length + ')' : ''); }).join(', ')}</span></div>
          )}
          {debug && debug.entityMatches && debug.entityMatches.length > 0 && (
            <div><span style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Entity </span><span style={{ color: 'var(--hp-text,#3B1010)' }}>{debug.entityMatches.join(', ')}</span></div>
          )}
          {debug && debug.templateExpansion && debug.templateExpansion.length > 0 && (
            <div><span style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Facets </span><span style={{ color: 'var(--hp-text,#3B1010)' }}>{debug.templateExpansion.join(', ')}</span></div>
          )}
          {debug && (debug.ringReached != null || debug.totalCandidates != null) && (
            <div style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
              {debug.ringReached != null ? 'Ring ' + debug.ringReached : ''}
              {debug.ringReached != null && debug.totalCandidates != null ? '  \u00B7  ' : ''}
              {debug.totalCandidates != null ? debug.totalCandidates + ' candidates' : ''}
            </div>
          )}

          {/* Final source scores */}
          {sources && sources.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '6px', marginTop: '6px' }}>
              <div style={{ color: 'var(--hp-muted,#8B6B5B)', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Final Sources</div>
              {sources.slice(0, 10).map(function (s, i) {
                return (
                  <div key={i} className="flex gap-2 items-baseline leading-5">
                    <span style={{ color: '#5a8a5a', minWidth: '3rem', flexShrink: 0 }}>{(s.relevance || 0).toFixed(3)}</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--hp-text,#3B1010)' }}>{s.title || 'Untitled'}</span>
                    <span style={{ color: 'var(--hp-muted,#8B6B5B)', flexShrink: 0 }}>[{s.sourceKind || '?'}]</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Chat bubble ─── */
var ChatBubble = memo(function ChatBubble({ msg, onSendToBoard, onSendMissionToBoard, onFormatAs, isBoardSent, isMissionSent, onOpenBoard }) {
  if (msg.type === 'meta') {
    return (
      <div className="text-center my-1">
        <span
          className="text-[10px] px-2.5 py-0.5 rounded-full font-mono"
          style={{ background: 'rgba(211,166,37,0.12)', color: 'var(--hp-accent,#D3A625)', border: '1px solid rgba(211,166,37,0.25)' }}
        >{msg.content}</span>
      </div>
    );
  }
  if (msg.role === 'error') {
    return (
      <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(180,40,40,0.12)', border: '1px solid rgba(180,40,40,0.3)' }}>
        <p className="text-xs" style={{ color: '#E05555' }}>{msg.content}</p>
      </div>
    );
  }
  var isUser = msg.role === 'user';
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] space-y-1.5">
        {isUser ? (
          <div
            className="px-3.5 py-2.5 rounded-xl rounded-br-sm text-sm leading-relaxed"
            style={{ background: 'var(--hp-accent,#D3A625)', color: '#fff' }}
          >
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        ) : (
          <div
            className="px-3.5 py-2.5 rounded-xl rounded-bl-sm text-sm leading-relaxed"
            style={{
              background: 'var(--hp-card,#FFFBF0)',
              border: '1px solid var(--hp-border,#D4A574)',
              color: 'var(--hp-text,#3B1010)',
            }}
          >
            <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatAnswer(msg.content) }} />
          </div>
        )}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.sources.slice(0, 8).map(function (s, i) {
              var clickable = canOpenSourceUrl(s);
              var label = '[' + (i + 1) + '] ' + ((s.title || '').slice(0, 20) || 'Source');
              var tip = (s.title || 'Source') + ' (' + (s.sourceKind || 'unknown') + ')' + (clickable ? ' - Click to open' : '');
              return (
                <button
                  key={i}
                  type="button"
                  onClick={clickable ? function () { openSourceUrl(s); } : undefined}
                  title={tip}
                  className="text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors"
                  style={{
                    background: clickable ? 'rgba(211,166,37,0.15)' : 'rgba(211,166,37,0.08)',
                    color: 'var(--hp-accent,#D3A625)',
                    border: '1px solid rgba(211,166,37,0.3)',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {!isUser && (msg.ragDebug || msg.ragPipeline || msg.recursiveSteps) && (
          <PipelineLog debug={msg.ragDebug} pipeline={msg.ragPipeline} sources={msg.sources} recursiveSteps={msg.recursiveSteps} />
        )}
        {!isUser && msg.content && msg.content.length > 80 && (
          <div className="flex gap-2 px-1 mt-1">
            <button
              type="button"
              onClick={function () { if (onFormatAs) onFormatAs(msg, 'board'); }}
              className="text-[9px] px-2 py-0.5 rounded font-mono transition-opacity hover:opacity-100"
              style={{ background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.22)', color: 'rgba(129,140,248,0.75)', opacity: 0.6 }}
              title="Reformat this response as Game Design Board nodes"
            >Format as Board</button>
            <button
              type="button"
              onClick={function () { if (onFormatAs) onFormatAs(msg, 'mission'); }}
              className="text-[9px] px-2 py-0.5 rounded font-mono transition-opacity hover:opacity-100"
              style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.22)', color: 'rgba(94,234,212,0.75)', opacity: 0.6 }}
              title="Reformat this response as a Mission Kernel"
            >Format as Mission</button>
          </div>
        )}
        {!isUser && msg.elapsed && (
          <p className="text-[9px] px-1" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
            {(msg.model || '') + ' \u00B7 ' + (msg.elapsed / 1000).toFixed(1) + 's' + (msg.usage && msg.usage.total_tokens ? ' \u00B7 ' + msg.usage.total_tokens.toLocaleString() + ' tokens' : '')}
          </p>
        )}
        {!isUser && msg.boardPatch && msg.boardPatch.nodes && msg.boardPatch.nodes.length > 0 && (
          <div className="px-1 pt-1 flex items-center gap-2 flex-wrap">
            {isBoardSent ? (
              <>
                <span
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}
                >
                  {'\u2713 Sent to Board'}
                </span>
                <button
                  type="button"
                  onClick={function () { if (onOpenBoard) onOpenBoard(); }}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-90"
                  style={{ background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.3)', color: '#818cf8' }}
                  title="Navigate to the Game Design Board"
                >{'Open Board \u2192'}</button>
              </>
            ) : (
              <button
                type="button"
                onClick={function () { if (onSendToBoard) onSendToBoard(msg.boardPatch, msg.ts); }}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(79,70,229,0.12)', border: '1px solid rgba(79,70,229,0.4)', color: '#818cf8' }}
                title={'Add ' + msg.boardPatch.nodes.length + ' node' + (msg.boardPatch.nodes.length === 1 ? '' : 's') + ' to the Game Design Board'}
              >
                <span aria-hidden>{String.fromCodePoint(0x1F5FA)}</span>
                {'Send ' + msg.boardPatch.nodes.length + ' node' + (msg.boardPatch.nodes.length === 1 ? '' : 's') + ' to Board'}
              </button>
            )}
          </div>
        )}
        {!isUser && msg.missionKernelPatch && msg.missionKernelPatch.missionId && (
          <div className="px-1 pt-1 flex items-center gap-2 flex-wrap">
            {isMissionSent ? (
              <>
                <span
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}
                >
                  {'\u2713 Sent to Board'}
                </span>
                <button
                  type="button"
                  onClick={function () { if (onOpenBoard) onOpenBoard(); }}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-90"
                  style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)', color: '#5eead4' }}
                  title="Navigate to the Game Design Board"
                >{'Open Board \u2192'}</button>
              </>
            ) : (
              <button
                type="button"
                onClick={function () { if (onSendMissionToBoard) onSendMissionToBoard(msg.missionKernelPatch, msg.ts); }}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.4)', color: '#5eead4' }}
                title={'Send mission kernel ' + msg.missionKernelPatch.missionId + ' to Narrative Board'}
              >
                <span aria-hidden>{String.fromCodePoint(0x1F4DC)}</span>
                {'Send ' + (msg.missionKernelPatch.missionId || 'Mission') + ' to Board'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function agentDetailText(a) {
  if (!a) return '';
  var d = (a.description && String(a.description).trim()) || AGENT_DESCRIPTIONS[a.id] || '';
  return d;
}

function AgentMenuDropdown({ agents, value, onChange }) {
  var rootRef = useRef(null);
  var st = useState(false);
  var open = st[0];
  var setOpen = st[1];

  useEffect(function () {
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return function () { document.removeEventListener('mousedown', onDoc); };
  }, []);

  var selected = agents.find(function (x) { return x.id === value; });
  var labelBtn = !value
    ? 'Auto (best agent for your query)'
    : ((AGENT_ICONS[value] || '\u2728') + ' ' + ((selected && (selected.name || selected.id)) || value));

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={function () { setOpen(!open); }}
        className="text-xs rounded px-2 py-1.5 text-left flex items-center gap-2 max-w-[min(280px,70vw)] transition-colors"
        style={{
          background: 'var(--hp-card,#FFFBF0)',
          border: '1px solid var(--hp-border,#D4A574)',
          color: 'var(--hp-text,#3B1010)',
        }}
      >
        <span className="truncate">{labelBtn}</span>
        <span className="opacity-50 shrink-0 text-[10px]">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-[100] mt-1 w-[min(100vw-2rem,380px)] max-h-[min(70vh,28rem)] overflow-y-auto rounded-lg shadow-2xl py-1"
          style={{ background: 'var(--hp-card,#FFFBF0)', border: '1px solid var(--hp-border,#D4A574)' }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2.5 text-xs transition-colors"
            style={{
              background: !value ? 'rgba(211,166,37,0.08)' : 'transparent',
              color: 'var(--hp-text,#3B1010)',
            }}
            onClick={function () { onChange(''); setOpen(false); }}
          >
            <div className="font-semibold">Auto (best agent for your query)</div>
            <div className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
              Picks the best professor based on your query: lore/story → Fig, technical/UE → Ronen, bugs/Jira → Sharp, tasks/workflow → Weasley, broad → Hecat. The chosen professor is shown in the "Routed via" line after each response.
            </div>
          </button>
          {agents.map(function (a) {
            var desc = agentDetailText(a);
            var sub = [a.title, a.domain].filter(Boolean).join(' \u2014 ');
            return (
              <button
                key={a.id}
                type="button"
                className="w-full text-left px-3 py-2.5 text-xs transition-colors"
                style={{
                  borderTop: '1px solid var(--hp-border,#D4A574)',
                  background: value === a.id ? 'rgba(211,166,37,0.08)' : 'transparent',
                  color: 'var(--hp-text,#3B1010)',
                }}
                onClick={function () { onChange(a.id); setOpen(false); }}
              >
                <div className="font-semibold">{(AGENT_ICONS[a.id] || '\u2728') + ' ' + (a.name || a.id)}</div>
                {sub ? <div className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--hp-accent,#D3A625)' }}>{sub}</div> : null}
                {desc ? <div className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>{desc}</div> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Chat sessions menu
   ═══════════════════════════════════════ */
function ChatSessionsMenu({ sessions, activeId, onSelect, onNewChat, onDelete, onOpenFreshWindow, canOpenFresh }) {
  var rootRef = useRef(null);
  var st = useState(false);
  var open = st[0];
  var setOpen = st[1];

  useEffect(function () {
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return function () { document.removeEventListener('mousedown', onDoc); };
  }, []);

  var sorted = useMemo(function () {
    return (sessions || []).slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }, [sessions]);

  return (
    <div className="relative shrink-0 flex items-center gap-1.5" ref={rootRef}>
      <button
        type="button"
        onClick={function () { onNewChat(); setOpen(false); }}
        className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
        style={{
          background: 'rgba(211,166,37,0.15)',
          border: '1px solid rgba(211,166,37,0.4)',
          color: 'var(--hp-accent,#D3A625)',
        }}
        title="Save this thread and start a new empty chat (fresh context)"
      >
        + New chat
      </button>
      {canOpenFresh && (
        <button
          type="button"
          onClick={function () { onOpenFreshWindow(); setOpen(false); }}
          className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid var(--hp-border,#D4A574)',
            color: 'var(--hp-muted,#8B6B5B)',
          }}
          title="Open a new app window for AI (if supported)"
        >
          New window
        </button>
      )}
      <button
        type="button"
        onClick={function () { setOpen(!open); }}
        className="text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid var(--hp-border,#D4A574)',
          color: 'var(--hp-muted,#8B6B5B)',
        }}
      >
        Chats {'\u25BC'}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-[100] mt-1 w-[min(100vw-2rem,320px)] max-h-[min(60vh,20rem)] overflow-y-auto rounded-lg shadow-2xl py-1"
          style={{ background: 'var(--hp-card,#FFFBF0)', border: '1px solid var(--hp-border,#D4A574)' }}
        >
          {sorted.length === 0 && (
            <div className="px-3 py-2 text-[10px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>No saved chats yet</div>
          )}
          {sorted.map(function (s) {
            var isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                className="flex items-center gap-1 px-2 py-1.5"
                style={{
                  borderBottom: '1px solid rgba(212,165,116,0.3)',
                  background: isActive ? 'rgba(211,166,37,0.1)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  className="flex-1 text-left text-[11px] truncate hover:underline"
                  style={{ color: 'var(--hp-text,#3B1010)' }}
                  onClick={function () { onSelect(s.id); setOpen(false); }}
                >
                  {s.title || 'Chat'}
                </button>
                <button
                  type="button"
                  className="shrink-0 text-[9px] px-1 hover:opacity-80"
                  style={{ color: '#C04040' }}
                  title="Delete chat"
                  onClick={function (e) { onDelete(s.id, e); }}
                >
                  {'\u2715'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Main AI Chat View
   ═══════════════════════════════════════ */
export default function AiChatView() {
  var boot = useMemo(function () { return loadSessionsFromStorage(); }, []);
  var [sessions, setSessions] = useState(boot.sessions);
  var [activeSessionId, setActiveSessionId] = useState(boot.activeId);
  var bootActive = boot.sessions.find(function (s) { return s.id === boot.activeId; });

  var [config, setConfig] = useState(null);
  var [loading, setLoading] = useState(true);
  var [chatInput, setChatInput] = useState('');
  var [sending, setSending] = useState(false);
  var [messages, setMessages] = useState(bootActive ? bootActive.messages || [] : []);
  var [agents, setAgents] = useState([]);
  var [selectedAgent, setSelectedAgent] = useState(bootActive ? bootActive.selectedAgent || '' : '');
  var [useRAG, setUseRAG] = useState(bootActive && bootActive.useRAG !== undefined ? bootActive.useRAG : true);
  var [costCalls, setCostCalls] = useState(bootActive ? bootActive.costCalls || [] : []);
  var [sentBoardTimes, setSentBoardTimes] = useState(new Set());
  var [sentMissionTimes, setSentMissionTimes] = useState(new Set());
  var chatEndRef = useRef(null);
  var [liveStatus, setLiveStatus] = useState('');

  var [hasRAG, setHasRAG] = useState(false);
  var [ragConfig, setRagConfig] = useState(null);
  var [ragSources, setRagSources] = useState([]);
  var [pendingDeepDive, setPendingDeepDive] = useState(null);
  // pendingDeepDive shape: { estimate, clarifyingQuestions (null while loading), resolveFn }
  var [ddUserContext, setDdUserContext] = useState('');

  // ── Citation picker state ─────────────────────────────────────────────────
  // pinnedCitations: sources the user has explicitly pinned with the / picker.
  // Their chunks are fetched and injected as high-priority context before the LLM call.
  var [pinnedCitations, setPinnedCitations] = useState([]);
  // citeMode: null=closed | 'kind'=pick source type | 'source'=pick page/shard | 'section'=pick section within a shard
  var [citeMode, setCiteMode] = useState(null);
  var [citeKindFilter, setCiteKindFilter] = useState('');    // stage 1 filter text
  var [citeSelectedKind, setCiteSelectedKind] = useState(null); // confirmed kind (stage 2+)
  var [citeSearch, setCiteSearch] = useState('');             // stage 2 filter text
  var [citeSelectedSource, setCiteSelectedSource] = useState(null); // source being sectioned (stage 3)
  var [citeSectionFilter, setCiteSectionFilter] = useState('');     // stage 3 section search
  var [citePickerIdx, setCitePickerIdx] = useState(0);
  var citeInputRef = useRef(null);
  var citeSectionInputRef = useRef(null);

  var reload = useCallback(async function () {
    var api = getApi();
    try {
      var cfg = await (api?.aiGetConfig?.() || Promise.resolve(null));
      setConfig(cfg || {});

      var ragAvailable = typeof api?.ragSearch === 'function';
      setHasRAG(ragAvailable);

      if (ragAvailable) {
        var [agt, ragCfg, ragSrc] = await Promise.all([
          api?.ragGetAgents?.() || Promise.resolve([]),
          api?.ragGetConfig?.() || Promise.resolve({}),
          api?.ragCustomSources?.() || Promise.resolve([]),
        ]);
        if (agt && agt.length > 0) setAgents(agt);
        setRagConfig(ragCfg || {});
        setRagSources(ragSrc || []);
      }
    } catch (e) {
      console.error('[AiChat] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () {
    reload();
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var api = getApi();
      if (api?.aiCallLLM || api?.aiChat) {
        clearInterval(timer);
        reload();
      } else if (tries > 20) {
        clearInterval(timer);
      }
    }, 500);
    return function () { clearInterval(timer); };
  }, [reload]);

  // RAG sources are loaded on a 6-second deferred timer inside ragService.
  // reload() fires when the AI service is ready — often before that timer fires —
  // so ragSources can be empty even though RAG is functional.
  // Poll every 3s (up to 18s) to pick up sources as they stream in.
  useEffect(function () {
    if (!hasRAG || ragSources.length > 0) return;
    var attempts = 0;
    var t = setInterval(function () {
      attempts++;
      var api = getApi();
      if (!api || typeof api.ragCustomSources !== 'function') { clearInterval(t); return; }
      var srcs = api.ragCustomSources();
      if (srcs && srcs.length > 0) {
        setRagSources(srcs);
        clearInterval(t);
      } else if (attempts >= 6) {
        clearInterval(t);
      }
    }, 3000);
    return function () { clearInterval(t); };
  }, [hasRAG, ragSources.length]);

  useEffect(function () { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(function () {
    if (loading) return;
    setSessions(function (prev) {
      var now = Date.now();
      var next = prev.map(function (s) {
        if (s.id !== activeSessionId) return s;
        return Object.assign({}, s, {
          messages: messages,
          costCalls: costCalls,
          selectedAgent: selectedAgent,
          useRAG: useRAG,
          updatedAt: now,
          title: deriveSessionTitle(messages, s.title),
        });
      });
      persistSessions(next, activeSessionId);
      return next;
    });
  }, [messages, costCalls, selectedAgent, useRAG, activeSessionId, loading]);

  function startNewChat() {
    var newId = generateSessionId();
    var newSess = { id: newId, title: 'New chat', updatedAt: Date.now(), messages: [], costCalls: [], selectedAgent: '', useRAG: true };
    setSessions(function (prev) {
      var now = Date.now();
      var merged = prev.map(function (s) {
        if (s.id !== activeSessionId) return s;
        return Object.assign({}, s, {
          messages: messages,
          costCalls: costCalls,
          selectedAgent: selectedAgent,
          useRAG: useRAG,
          updatedAt: now,
          title: deriveSessionTitle(messages, s.title),
        });
      });
      var combined = merged.concat([newSess]);
      persistSessions(combined, newId);
      return combined;
    });
    setActiveSessionId(newId);
    setMessages([]);
    setCostCalls([]);
    setSelectedAgent('');
    setUseRAG(true);
  }

  function switchSession(id) {
    if (id === activeSessionId) return;
    var tgt = sessions.find(function (x) { return x.id === id; });
    if (!tgt) return;
    var now = Date.now();
    var merged = sessions.map(function (s) {
      if (s.id !== activeSessionId) return s;
      return Object.assign({}, s, {
        messages: messages,
        costCalls: costCalls,
        selectedAgent: selectedAgent,
        useRAG: useRAG,
        updatedAt: now,
        title: deriveSessionTitle(messages, s.title),
      });
    });
    setSessions(merged);
    setMessages(tgt.messages ? tgt.messages.slice() : []);
    setCostCalls(tgt.costCalls ? tgt.costCalls.slice() : []);
    setSelectedAgent(tgt.selectedAgent || '');
    setUseRAG(tgt.useRAG !== undefined ? tgt.useRAG : true);
    setActiveSessionId(id);
    persistSessions(merged, id);
  }

  function deleteSession(id, e) {
    if (e) e.stopPropagation();
    setSessions(function (prev) {
      if (prev.length <= 1) return prev;
      var next = prev.filter(function (s) { return s.id !== id; });
      if (id === activeSessionId) {
        var first = next[0];
        queueMicrotask(function () {
          setMessages(first.messages || []);
          setCostCalls(first.costCalls || []);
          setSelectedAgent(first.selectedAgent || '');
          setUseRAG(first.useRAG !== undefined ? first.useRAG : true);
          setActiveSessionId(first.id);
        });
        persistSessions(next, first.id);
      } else {
        persistSessions(next, activeSessionId);
      }
      return next;
    });
  }

  function tryOpenFreshWindow() {
    var api = getApi();
    if (api && typeof api.openAiAssistantWindow === 'function') {
      api.openAiAssistantWindow();
      return;
    }
    if (api && typeof api.openExtensionView === 'function') {
      api.openExtensionView({ extension: 'ai', view: 'AiChatView' });
    }
  }

  async function updateConfig(partial) {
    var api = getApi();
    var fresh = api?.aiSetConfig ? await api.aiSetConfig(partial) : null;
    setConfig(fresh || Object.assign({}, config, partial));
  }

  function handleSendToBoard(patch, msgTs) {
    var api = getApi();
    if (!api || typeof api.interopPublish !== 'function') {
      alert('Board integration not available — make sure the Game Design extension is enabled.');
      return;
    }
    // Safety flush: write current session to localStorage before any possible navigation
    persistSessions(sessions, activeSessionId);
    api.interopPublish({ channel: 'gameDesign/ai/board-patch', payload: patch, source: 'ai' });
    if (msgTs) setSentBoardTimes(function (prev) { var next = new Set(prev); next.add(msgTs); return next; });
  }

  function handleSendMissionToBoard(kernel, msgTs) {
    var api = getApi();
    if (!api || typeof api.interopPublish !== 'function') {
      alert('Board integration not available — make sure the Game Design extension is enabled.');
      return;
    }
    persistSessions(sessions, activeSessionId);
    api.interopPublish({ channel: 'gameDesign/ai/mission-kernel', payload: kernel, source: 'ai' });
    if (msgTs) setSentMissionTimes(function (prev) { var next = new Set(prev); next.add(msgTs); return next; });
  }

  function handleOpenBoard() {
    var api = getApi();
    persistSessions(sessions, activeSessionId);
    if (api && typeof api.navigateToView === 'function') {
      api.navigateToView('gameDesign');
    }
  }

  async function handleFormatAs(sourceMsg, type) {
    if (sending) return;
    var api = getApi();
    if (!api) return;
    setSending(true);
    var fStarted = Date.now();
    var label = type === 'mission' ? 'Mission Kernel' : 'Board Nodes';
    setLiveStatus('Converting response to ' + label + '...');
    setMessages(function (prev) {
      return prev.concat([{ role: 'system', type: 'meta', ts: Date.now(), content: 'Converting response to ' + label + '...' }]);
    });
    var convSystemPrompt = type === 'mission' ? MISSION_KERNEL_SYSTEM_PROMPT : BOARD_PATCH_SYSTEM_PROMPT;
    // Build a full conversation transcript so the AI has all context, not just one message.
    // Include all non-meta messages up to a reasonable token budget (~6000 chars per turn).
    var _allMsgs = messages.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; });
    var _transcript = _allMsgs.map(function (m) {
      var prefix = m.role === 'user' ? 'USER: ' : 'ASSISTANT: ';
      return prefix + (m.content || '').slice(0, 3000);
    }).join('\n\n');
    var convInstruction = type === 'mission'
      ? 'Convert the following full conversation into a Mission Kernel. Use ONLY the information present — do NOT invent NPC names, locations, or technical details not mentioned. If a field has no information, leave it blank or omit it — never write placeholder text.'
      : 'Convert the following FULL CONVERSATION into Game Design Board nodes. You must cover EVERY distinct system, mechanic, concept, quest, risk, and design decision that was discussed — do not summarise or collapse topics. Use ONLY information present — do NOT invent system names, IDs, or technical details not mentioned. If something is uncertain, omit that node rather than writing placeholder text.';
    var _contextBlock = _transcript.length > 200
      ? '\n\n=== FULL CONVERSATION ===\n' + _transcript + '\n\n=== HIGHLIGHTED RESPONSE ===\n' + sourceMsg.content
      : '\n\n=== CONTENT ===\n' + sourceMsg.content;
    var convMessages = [
      { role: 'system', content: convSystemPrompt },
      { role: 'user', content: convInstruction + _contextBlock },
    ];
    try {
      var convResult = null;
      var convHb = setInterval(function () {
        setLiveStatus('Converting to ' + label + '... ' + formatSeconds(Date.now() - fStarted) + 's');
      }, 8000);
      try {
        var _convParams = { messages: convMessages };
        if (type === 'board') _convParams.max_tokens = 4096;
        if (api.aiChat) {
          var cr = await runWithTimeout(
            function () { return api.aiChat(_convParams); },
            LLM_CALL_TIMEOUT_MS,
            label + ' conversion timed out'
          );
          if (cr) convResult = { ok: cr.ok, content: cr.content || cr.response || '', error: cr.error, usage: cr.usage, model: cr.model };
        } else if (api.aiCallLLM) {
          convResult = await runWithTimeout(
            function () { return api.aiCallLLM(_convParams); },
            LLM_CALL_TIMEOUT_MS,
            label + ' conversion timed out'
          );
        }
      } finally { clearInterval(convHb); }
      if (!convResult) convResult = { ok: false, error: 'AI service not loaded' };
      if (convResult.ok) {
        var convElapsed = Date.now() - fStarted;
        var bPatch = type === 'board' ? (parseBoardPatch(convResult.content) || undefined) : undefined;
        var mPatch = type === 'mission' ? (parseMissionKernelPatch(convResult.content) || undefined) : undefined;
        setCostCalls(function (prev) { return prev.concat([{ usage: convResult.usage, elapsed: convElapsed, model: convResult.model }]); });
        setMessages(function (prev) {
          return prev.concat([{
            role: 'assistant', content: convResult.content, ts: Date.now(),
            usage: convResult.usage, elapsed: convElapsed, model: convResult.model,
            boardPatch: bPatch,
            missionKernelPatch: mPatch,
          }]);
        });
      } else {
        setMessages(function (prev) { return prev.concat([{ role: 'error', content: convResult.error || (label + ' conversion failed'), ts: Date.now() }]); });
      }
    } catch (e) {
      setMessages(function (prev) { return prev.concat([{ role: 'error', content: label + ' conversion failed: ' + (e && e.message ? e.message : 'Unknown error'), ts: Date.now() }]); });
    } finally {
      setLiveStatus('');
      setSending(false);
    }
  }

  // ── Citation picker helpers ───────────────────────────────────────────────
  // Three-stage: stage 1 picks source type, stage 2 picks specific source,
  //              stage 3 drills into sections (chunk titles) within that source.

  var KIND_ICONS = { confluence: '\u{1F4D8}', pdf: '\u{1F4C4}', web: '\u{1F517}', ue: '\u{1F3AE}', text: '\u{1F4DD}', default: '\u{1F4E6}' };
  var KIND_LABELS = { confluence: 'Confluence pages', pdf: 'PDF documents', web: 'Web pages', ue: 'UE shards', text: 'Text files', default: 'Sources' };
  // Sources with more chunks than this threshold show a drill-in button for section browsing.
  var SECTION_DRILL_THRESHOLD = 8;

  // pickerItems shapes:
  //   kind mode    → [{ _type:'kind',    kind, chunkCount, sourceCount }]
  //   source mode  → [{ _type:'source',  sourceId, sourceLabel, sourceKind, chunkCount, registry }]
  //   section mode → [{ _type:'pin-all', source }, { _type:'section', title, source }, …]
  var pickerItems = useMemo(function () {
    if (!citeMode || !ragSources || ragSources.length === 0) return [];

    if (citeMode === 'kind') {
      var kindMap = {};
      ragSources.forEach(function (s) {
        var k = (s.sourceKind || 'other').toLowerCase();
        if (!kindMap[k]) kindMap[k] = { chunkCount: 0, sourceCount: 0 };
        kindMap[k].chunkCount += (s.chunkCount || 0);
        kindMap[k].sourceCount += 1;
      });
      var q = (citeKindFilter || '').toLowerCase();
      return Object.keys(kindMap)
        .filter(function (k) { return !q || k.includes(q); })
        .map(function (k) { return Object.assign({ _type: 'kind', kind: k }, kindMap[k]); });
    }

    if (citeMode === 'source') {
      var q2 = (citeSearch || '').toLowerCase().trim();
      var pinnedIds = new Set(pinnedCitations.map(function (p) { return p.sourceId + (p.sectionTitle ? ':' + p.sectionTitle : ''); }));
      return ragSources
        .filter(function (s) {
          if ((s.sourceKind || '').toLowerCase() !== citeSelectedKind) return false;
          if (!q2) return true;
          return (s.sourceLabel || s.sourceId || '').toLowerCase().includes(q2);
        })
        .slice(0, 12)
        .map(function (s) { return Object.assign({ _type: 'source' }, s); });
    }

    if (citeMode === 'section' && citeSelectedSource) {
      var sections = citeSelectedSource._sections || [];
      var q3 = (citeSectionFilter || '').toLowerCase().trim();
      var filtered = q3 ? sections.filter(function (t) { return t.toLowerCase().includes(q3); }) : sections;
      // First item always allows pinning the whole source (all chunks)
      var items = [{ _type: 'pin-all', source: citeSelectedSource }];
      filtered.slice(0, 25).forEach(function (title) {
        items.push({ _type: 'section', title: title, source: citeSelectedSource });
      });
      return items;
    }

    return [];
  }, [citeMode, citeKindFilter, citeSelectedKind, citeSearch, citeSectionFilter, citeSelectedSource, ragSources, pinnedCitations]);

  function closeCitePicker() {
    setCiteMode(null);
    setCiteKindFilter('');
    setCiteSelectedKind(null);
    setCiteSearch('');
    setCiteSelectedSource(null);
    setCiteSectionFilter('');
    setCitePickerIdx(0);
  }

  // Stage 1 → Stage 2: confirmed a kind.
  function selectKind(kind) {
    setChatInput(function (prev) {
      return prev.replace(/\/([\w\-._]*)$/, '/' + kind + ' ');
    });
    setCiteMode('source');
    setCiteSelectedKind(kind);
    setCiteKindFilter('');
    setCiteSearch('');
    setCiteSelectedSource(null);
    setCiteSectionFilter('');
    setCitePickerIdx(0);
    if (citeInputRef.current) citeInputRef.current.focus();
  }

  // Stage 2 → Stage 3: drill into a source's sections.
  // Calls ragGetSourceSections synchronously (the registry is in-memory).
  function enterSectionMode(source) {
    var api = getApi();
    var sections = [];
    if (api && typeof api.ragGetSourceSections === 'function') {
      try {
        var r = api.ragGetSourceSections({ sourceId: source.sourceId });
        sections = (r && r.sections) || [];
      } catch (e) {}
    }
    setCiteMode('section');
    setCiteSelectedSource(Object.assign({}, source, { _sections: sections }));
    setCiteSectionFilter('');
    setCitePickerIdx(0);
    // Focus the inline section search box after a tick
    setTimeout(function () { if (citeSectionInputRef.current) citeSectionInputRef.current.focus(); }, 30);
  }

  // Stage 2: pin the entire source (all chunks).
  function selectCitation(source) {
    setChatInput(function (prev) {
      return prev.replace(/\/[\w\-._]+\s+[\w\-._\s]*$/, '').replace(/\/[\w\-._]*$/, '').replace(/\s+$/, '');
    });
    setPinnedCitations(function (prev) {
      if (prev.some(function (p) { return p.sourceId === source.sourceId && !p.sectionTitle; })) return prev;
      return prev.concat([{ sourceId: source.sourceId, sourceLabel: source.sourceLabel, sourceKind: source.sourceKind, sectionTitle: null }]);
    });
    closeCitePicker();
    if (citeInputRef.current) citeInputRef.current.focus();
  }

  // Stage 3: pin a specific section (or pin-all from section mode).
  function selectSection(item) {
    setChatInput(function (prev) {
      return prev.replace(/\/[\w\-._]+\s+[\w\-._\s]*$/, '').replace(/\/[\w\-._]*$/, '').replace(/\s+$/, '');
    });
    var src = item.source;
    var sectionTitle = item._type === 'section' ? item.title : null;
    setPinnedCitations(function (prev) {
      var key = src.sourceId + (sectionTitle ? ':' + sectionTitle : '');
      if (prev.some(function (p) { return (p.sourceId + (p.sectionTitle ? ':' + p.sectionTitle : '')) === key; })) return prev;
      return prev.concat([{ sourceId: src.sourceId, sourceLabel: src.sourceLabel, sourceKind: src.sourceKind, sectionTitle: sectionTitle }]);
    });
    closeCitePicker();
    if (citeInputRef.current) citeInputRef.current.focus();
  }

  function removeCitation(pin) {
    var key = pin.sourceId + (pin.sectionTitle ? ':' + pin.sectionTitle : '');
    setPinnedCitations(function (prev) {
      return prev.filter(function (p) { return (p.sourceId + (p.sectionTitle ? ':' + p.sectionTitle : '')) !== key; });
    });
  }

  async function handleSend() {
    var api = getApi();
    if (!chatInput.trim() && pinnedCitations.length === 0) return;
    if (sending) return;
    // If the user pinned sources but left the text field empty, synthesise a
    // default display message and search query from the pinned source labels.
    var userMsg = chatInput.trim() || (pinnedCitations.length > 0
      ? 'Tell me about: ' + pinnedCitations.map(function (p) {
          return p.sectionTitle ? (p.sourceLabel || p.sourceId) + ' / ' + p.sectionTitle : (p.sourceLabel || p.sourceId);
        }).join(', ')
      : '');
    var priorForLlm = messagesForConversationContext(messages);
    var ragQuery = buildRagQueryFromConversation(priorForLlm, userMsg);
    setChatInput('');
    setSending(true);
    setLiveStatus('Preparing request...');
    var started = Date.now();
    var phase = 'prepare';
    setMessages(prev => prev.concat([{ role: 'user', content: userMsg, ts: started }]));

    // ── /board and /mission redirects (commands replaced by Format buttons) ──
    var boardCmdMatch = userMsg.match(/^\/board\s+([\s\S]+)/i);
    if (boardCmdMatch) {
      setMessages(function (prev) { return prev.concat([{ role: 'system', type: 'meta', ts: Date.now(), content: '/board command removed — ask your question normally, then use the \u201CFormat as Board\u201D button below the response.' }]); });
      setLiveStatus('');
      setSending(false);
      return;
    }
    var missionCmdMatch = userMsg.match(/^\/mission\s+([\s\S]+)/i);
    if (missionCmdMatch) {
      setMessages(function (prev) { return prev.concat([{ role: 'system', type: 'meta', ts: Date.now(), content: '/mission command removed — ask your question normally, then use the \u201CFormat as Mission\u201D button below the response.' }]); });
      setLiveStatus('');
      setSending(false);
      return;
    }
    // ── End /board and /mission redirects ───────────────────────────────────

    try {
      var cfg = config || {};
      var systemPrompt = '';
      var ragResults = [];
      var agentPrompt = '';
      var agentName = '';
      var ragDebug = null;
      var ragPipelineInfo = null;
      var ragRecursiveSteps = [];

      // ── Pinned citation pre-fetch ─────────────────────────────────────────────
      // Fetch chunks for each source the user pinned with / before any RAG search.
      // These are injected as highest-priority context regardless of BM25 relevance.
      var pinnedRagResults = [];
      var activePins = pinnedCitations.slice(); // snapshot in case state changes mid-send
      if (activePins.length > 0 && hasRAG && typeof api?.ragFetchPinnedChunks === 'function') {
        setLiveStatus('Fetching pinned source' + (activePins.length > 1 ? 's' : '') + '...');
        for (var _pi = 0; _pi < activePins.length; _pi++) {
          try {
            var _pinResult = api.ragFetchPinnedChunks({
              sourceId: activePins[_pi].sourceId,
              topN: activePins[_pi].sectionTitle ? 50 : 20, // more chunks for whole-source pins
              sectionTitle: activePins[_pi].sectionTitle || undefined,
            });
            if (_pinResult && _pinResult.ok && Array.isArray(_pinResult.chunks)) {
              _pinResult.chunks.forEach(function (ch) {
                pinnedRagResults.push({
                  id: ch.id, title: ch.title, text: ch.text,
                  sourceId: ch.sourceId, sourceLabel: ch.sourceLabel, sourceKind: ch.sourceKind,
                  relevance: 1.0, similarity: 1.0,
                });
              });
            }
          } catch (_pe) {
            console.warn('[AiChat] Pinned source fetch failed for', activePins[_pi].sourceId, _pe);
          }
        }
        if (pinnedRagResults.length > 0) {
          setMessages(function (prev) {
            return prev.concat([{
              role: 'system', type: 'meta', ts: Date.now(),
              content: '\u{1F4CC} Pinned: ' + activePins.map(function (p) { return p.sourceLabel || p.sourceId; }).join(', ') + ' \u2014 ' + pinnedRagResults.length + ' chunks injected',
            }]);
          });
        }
      }
      // ── End pinned citation pre-fetch ─────────────────────────────────────────

      // Subscribe to step-by-step recursive search events so liveStatus updates
      // at each hop while the search is in progress.
      var _recursiveStepUnsub = null;
      if ((ragConfig?.recursiveRetrieval || cfg.recursiveRetrieval) && hasRAG && useRAG && api && typeof api.interopSubscribe === 'function') {
        _recursiveStepUnsub = api.interopSubscribe('rag/search-step', function (evt) {
          var step = evt && evt.payload;
          if (!step) return;
          ragRecursiveSteps.push(step);
          var label = '';
          if (step.type === 'initial-results')    label = 'Pass 0 \u2014 Initial: ' + step.resultCount + ' results';
          else if (step.type === 'gaps-found')    label = 'Pass ' + step.pass + ' \u2014 Gaps: ' + (step.gaps || []).join(', ');
          else if (step.type === 'new-results')   label = 'Pass ' + step.pass + ' \u2014 +' + step.newCount + ' new results found';
          else if (step.type === 'merged')        label = 'Pass ' + step.pass + ' \u2014 Merged: ' + step.totalSources + ' total';
          else if (step.type === 'coverage-complete') label = 'Pass ' + step.pass + ' \u2014 Coverage complete \u2713';
          else if (step.type === 'no-new-results')    label = 'Pass ' + step.pass + ' \u2014 No new results, stopping';
          else if (step.type === 'max-passes-reached') label = 'Pass ' + step.pass + ' \u2014 Max passes reached';
          if (label) setLiveStatus('[Recursive] ' + label);
        });
      }

      // ── Deep Dive pre-flight ─────────────────────────────────────────────────
      var deepDiveMode = cfg.deepDiveMode || false;
      var deepDiveContext = null; // will hold { numberedContext, sources, agentName, agentPrompt, rounds, totalFound }
      if (deepDiveMode && hasRAG && useRAG && typeof api?.ragEstimateDeepDive === 'function') {
        setLiveStatus('Running preliminary search...');
        var estimate = api.ragEstimateDeepDive({ query: ragQuery, agentId: selectedAgent || undefined });
        // Always show the confirmation dialog when Deep Dive is explicitly enabled —
        // don't rely on isHeavy (which uses BM25 and may report 0 even for real queries).
        if (estimate) {
          setDdUserContext('');
          // Show card immediately with preliminary sources; clarifying questions load async
          var resolveDeepDive;
          var deepDivePromise = new Promise(function (resolve) { resolveDeepDive = resolve; });
          setPendingDeepDive({ estimate: estimate, clarifyingQuestions: null, resolveFn: resolveDeepDive });

          // Fire clarifying questions in background — updates card when ready
          if (typeof api?.ragGenerateClarifyingQuestions === 'function') {
            api.ragGenerateClarifyingQuestions({
              query: ragQuery,
              sampleSources: estimate.sampleSources || [],
            }).then(function (r) {
              if (r && r.questions && r.questions.length > 0) {
                setPendingDeepDive(function (prev) {
                  return prev ? Object.assign({}, prev, { clarifyingQuestions: r.questions }) : prev;
                });
              }
            }).catch(function () {});
          }

          // Wait for user decision — resolveFn receives { accepted, userContext }
          var decision = await deepDivePromise;
          setPendingDeepDive(null);
          setDdUserContext('');

          if (decision && decision.accepted) {
            // Append any user-provided context to the search query
            var refinedQuery = decision.userContext
              ? ragQuery + '\n\nAdditional context: ' + decision.userContext
              : ragQuery;

            phase = 'rag';
            setLiveStatus('Deep Dive — starting...');
            var _progressUnsub = null;
            if (typeof api.onRagProgress === 'function') {
              _progressUnsub = api.onRagProgress;
              api.onRagProgress = function (prog) {
                if (prog.done) {
                  setLiveStatus('Deep Dive — complete: ' + prog.totalFound + ' chunks collected.');
                } else {
                  setLiveStatus('Deep Dive — Round ' + prog.round + ': ' + prog.totalFound + ' chunks so far...');
                }
              };
            }
            try {
              var ddResult = await api.ragDeepDiveSearch({
                query: refinedQuery,
                agentId: selectedAgent || undefined,
                neighborExpansion: 2,
              });
              if (ddResult && ddResult.ok && ddResult.results && ddResult.results.length > 0) {
                deepDiveContext = {
                  numberedContext: ddResult.numberedContext,
                  sources: ddResult.results,
                  agentName: ddResult.agentName || '',
                  agentPrompt: ddResult.agentPrompt || '',
                  rounds: ddResult.rounds || '?',
                  totalFound: ddResult.totalFound || ddResult.results.length,
                };
              }
            } finally {
              if (_progressUnsub !== null) api.onRagProgress = _progressUnsub;
            }
          }
        }
      }
      // ── End deep dive pre-flight ─────────────────────────────────────────────

      // Token budget per mode: undefined = model default (standard), 4096 = extended, 8192 = deep dive.
      var llmMaxTokens;

      if (hasRAG && useRAG) {
        phase = 'rag';
        setLiveStatus('Searching RAG sources...');
        var ragStarted = Date.now();

        // If deep dive already ran, skip standard retrieval
        if (deepDiveContext) {
          ragResults = deepDiveContext.sources;
          agentPrompt = deepDiveContext.agentPrompt;
          agentName = deepDiveContext.agentName;
          llmMaxTokens = 8192;
          systemPrompt = buildExtendedPrompt(deepDiveContext.numberedContext, ragResults.length, true, agentPrompt, activePins.length > 0, true);
          setMessages(prev => prev.concat([{
            role: 'system', type: 'meta', ts: Date.now(),
            content: 'Deep Dive: ' + deepDiveContext.totalFound + ' sources across ' + deepDiveContext.rounds + ' rounds',
          }]));
        }

        if (!deepDiveContext && cfg.extendedMode && api?.aiExtendedSearch) {
          try {
            setLiveStatus('Running extended search...');
            var ext = await api.aiExtendedSearch({ query: ragQuery, topK: ragConfig?.topK || cfg.topK || 5, minRelevance: ragConfig?.minRelevance || cfg.minRelevance || 0.10 });
            if (ext?.sources?.length > 0) {
              ragResults = ext.sources;
              llmMaxTokens = 4096;
              systemPrompt = buildExtendedPrompt(ext.numberedContext, ext.sources.length, !!cfg.extendedMode, agentPrompt, activePins.length > 0, false);
              // Populate pipeline info for extended search so the Pipeline log still appears
              ragDebug = ext.debug || { categories: [], keywordGroups: [], ringReached: null, totalCandidates: null };
              ragPipelineInfo = {
                engine: 'extended',
                agentName: ext.agentName || null,
                queryExpansionUsed: false,
                rerankingUsed: false,
                recursiveUsed: false,
                extendedRounds: ext.rounds || null,
              };
              setMessages(prev => prev.concat([{
                role: 'system', type: 'meta', ts: Date.now(),
                content: 'Extended search: ' + ext.sources.length + ' sources across ' + (ext.rounds || '?') + ' rounds',
              }]));
            }
          } catch (extErr) {
            console.warn('[AiChat] Extended search failed, falling back to standard RAG:', extErr);
          }
        }

        if (ragResults.length === 0) {
          setLiveStatus('Running standard RAG search...');
          // Neighbor expansion: pulls adjacent chunks from the same page for context.
          // This is the standard search path (deep dive is handled separately above).
          // Extended mode: ±1 chunk, standard: off.
          var _isExtended = !!(ragConfig?.extendedMode || cfg.extendedMode);
          var _neighborExpansion = _isExtended ? 1 : 0;
          var _searchOpts = {
            query: ragQuery,
            topK: ragConfig?.topK || cfg.topK || 10,
            minRelevance: ragConfig?.minRelevance || cfg.minRelevance || undefined,
            maxRing: _isExtended ? 3 : 2,
            agentId: selectedAgent || undefined,
            engine: ragConfig?.searchEngine || undefined,
            queryExpansion: ragConfig?.queryExpansion != null ? !!ragConfig.queryExpansion : undefined,
            reranking: ragConfig?.reranking != null ? !!ragConfig.reranking : undefined,
            recursiveRetrieval: !!(ragConfig?.recursiveRetrieval || cfg.recursiveRetrieval),
            neighborExpansion: _neighborExpansion,
          };
          var ragResult = await api.ragSearch(_searchOpts);

          // When BM25 returns 0 candidates, automatically retry with classic ring search
          if (ragResult?.ok && !(ragResult.results?.length > 0) && (ragConfig?.searchEngine !== 'classic')) {
            setLiveStatus('BM25: 0 results \u2014 retrying with classic search\u2026');
            try {
              var classicResult = await api.ragSearch(Object.assign({}, _searchOpts, { engine: 'classic' }));
              if (classicResult?.ok && classicResult.results?.length > 0) {
                ragResult = classicResult; // use classic result going forward
              }
            } catch (fallbackErr) {
              console.warn('[AiChat] Classic fallback failed:', fallbackErr);
            }
          }

          // Last-resort broadened pass: if BOTH BM25 and classic returned 0 results,
          // retry BM25 with a near-floor relevance threshold (0.02) so that any chunk
          // that contains even a weak signal for the query is returned.
          // Capped at topK:5 to avoid flooding the context with low-quality results.
          // This catches short/identifier-style queries (e.g. "mff_01") where the top
          // BM25 score is real but just below the agent's minRelevance cutoff.
          if (ragResult?.ok && !(ragResult.results?.length > 0)) {
            setLiveStatus('0 results \u2014 trying broadened search\u2026');
            try {
              var broadResult = await api.ragSearch(Object.assign({}, _searchOpts, {
                engine: 'bm25',
                minRelevance: 0.02,
                topK: 5,
                queryExpansion: false,
                reranking: false,
                recursiveRetrieval: false,
              }));
              if (broadResult?.ok && broadResult.results?.length > 0) {
                ragResult = broadResult;
                console.info('[AiChat] Broadened search found ' + broadResult.results.length + ' result(s) with lowered threshold.');
              }
            } catch (broadErr) {
              console.warn('[AiChat] Broadened search failed:', broadErr);
            }
          }

          if (ragResult?.ok) {
            // Always capture debug and pipeline info — even 0-result searches must show the log
            ragDebug = ragResult.debug || { categories: [], keywordGroups: [], ringReached: null, totalCandidates: 0 };
            ragPipelineInfo = {
              engine: ragResult.engine || null,
              agentName: ragResult.agentName || null,
              autoRouted: !!ragResult.autoRouted,
              queryExpansionUsed: !!ragResult.queryExpansionUsed,
              rerankingUsed: !!ragResult.rerankingUsed,
              recursiveUsed: !!ragResult.recursiveUsed,
              neighborsAdded: ragResult.neighborsAdded || 0,
              neighborExpansion: ragResult.neighborExpansion || 0,
            };
            agentName = ragResult.agentName || '';
            agentPrompt = ragResult.agentPrompt || '';
            // Prefer steps captured via interop (real-time); fall back to API result
            if (ragRecursiveSteps.length === 0 && ragResult.recursiveSteps) {
              ragRecursiveSteps = ragResult.recursiveSteps;
            }
            if (ragResult.results?.length > 0) {
              ragResults = ragResult.results;
              systemPrompt = buildPromptFromRAG(ragResult.numberedContext, ragResults.length, agentPrompt, !!cfg.extendedMode, activePins.length > 0);
              // Detect the case where chunks exist but their text is empty (data quality issue).
              // The numberedContext would be truthy but contain only headers with no body.
              var _hasRealCtx = ragResult.numberedContext && /\[SOURCE \d+\][^\n]*\n[^\n\[]+/.test(ragResult.numberedContext);
              if (!_hasRealCtx) {
                console.warn('[AiChat] RAG returned ' + ragResults.length + ' sources but numberedContext appears to have no body text. Chunks may be empty.');
              }
            }
          }
        }
        setLiveStatus('RAG complete in ' + formatSeconds(Date.now() - ragStarted) + 's (' + ragResults.length + ' sources).');
        if (_recursiveStepUnsub) { try { _recursiveStepUnsub(); _recursiveStepUnsub = null; } catch (e) {} }

        // Ensure pipeline info always exists when RAG ran (catches extended/deep-dive paths too)
        if (!ragPipelineInfo) {
          ragPipelineInfo = { engine: 'rag', agentName: agentName || null, queryExpansionUsed: false, rerankingUsed: false, recursiveUsed: !!(ragConfig?.recursiveRetrieval || cfg.recursiveRetrieval) };
          if (!ragDebug) ragDebug = { categories: [], keywordGroups: [], ringReached: null, totalCandidates: ragResults.length };
        }

        // Warn the user when RAG ran but found nothing (both BM25 and classic fallback tried)
        if (ragResults.length === 0) {
          setMessages(function (prev) {
            return prev.concat([{ role: 'system', type: 'meta', ts: Date.now(), content: '\u26A0 0 sources found (BM25 + classic tried) \u2014 answering from model knowledge only' }]);
          });
        }
      }

      if (!systemPrompt) {
        // Always use the domain-aware prompt even with no sources — this ensures
        // the AI knows ARK/station context and refuses to invent facts.
        systemPrompt = buildPromptFromRAG('', 0, agentPrompt || '', false, activePins.length > 0);
      }

      // ── Prepend pinned citation context ──────────────────────────────────────
      // Pinned chunks go first in the context window so the LLM treats them as
      // the primary reference. They are labeled [P1], [P2], … to distinguish from
      // the normal RAG [SOURCE N] labels. The instruction forbids citing sources
      // not present in the context to prevent hallucination on top of pinned data.
      if (pinnedRagResults.length > 0) {
        var pinnedContext = pinnedRagResults.slice(0, 30).map(function (c, i) {
          return '[P' + (i + 1) + '] ' + (c.title || 'Untitled') + ' (' + (c.sourceLabel || c.sourceId) + ')\n' + c.text;
        }).join('\n\n---\n\n');
        var pinnedHeader = [
          '=== PINNED SOURCES (user-specified primary references) ===',
          'The user explicitly pinned these sources. Cite them as [P1], [P2], etc.',
          'Treat them as the highest-priority references — read them before the regular REFERENCE DATA.',
          'See the INSTRUCTIONS section below for the complete source usage rules.',
          '',
          pinnedContext,
          '',
          '=== END PINNED SOURCES ===',
          '',
        ].join('\n');
        systemPrompt = pinnedHeader + systemPrompt;
        // Merge pinned results into ragResults so they appear in the sources accordion.
        // Pinned sources go first; de-duplicate by chunk id.
        var _pinnedIds = new Set(pinnedRagResults.map(function (r) { return r.id; }));
        ragResults = pinnedRagResults.concat(ragResults.filter(function (r) { return !_pinnedIds.has(r.id); }));
      }
      // ── End pinned context injection ──────────────────────────────────────────

      var historySlice = priorForLlm.slice(-MAX_LLM_HISTORY_MSGS);
      if (historySlice.length > 0) {
        systemPrompt +=
          "\n\n=== MULTI-TURN ===\nPrior user/assistant messages are included below. Use them to interpret follow-ups and clarifications. For facts, still rely on this turn's reference data (when present) and cite with [N].";
      }

      if (agentName) {
        var _autoTag = (ragPipelineInfo && ragPipelineInfo.autoRouted) ? ' (auto)' : '';
        setMessages(prev => prev.concat([{
          role: 'system', type: 'meta', ts: Date.now(),
          content: 'Routed via ' + agentName + _autoTag + (ragDebug ? ' | ' + ragResults.length + ' sources' + (ragDebug.ringReached != null ? ' | Ring ' + ragDebug.ringReached : '') : ''),
        }]));
      }

      var result = null;
      phase = 'llm';
      var modelName = (cfg.provider || 'provider') + ' \u00B7 ' + (cfg.model || 'model');
      setLiveStatus('Calling AI model (' + modelName + ')...');
      var llmStarted = Date.now();
      var heartbeat = setInterval(function () {
        var secs = formatSeconds(Date.now() - llmStarted);
        setLiveStatus('Waiting on AI model... ' + secs + 's elapsed');
      }, 10000);
      var llmMessages = [{ role: 'system', content: systemPrompt }]
        .concat(historySlice)
        .concat([{ role: 'user', content: userMsg }]);

      try {
        if (api?.aiChat) {
          var _chatParams = { messages: llmMessages };
          if (llmMaxTokens != null) _chatParams.max_tokens = llmMaxTokens;
          var chatResult = await runWithTimeout(
            function () { return api.aiChat(_chatParams); },
            LLM_CALL_TIMEOUT_MS,
            'AI request timed out after ' + formatSeconds(LLM_CALL_TIMEOUT_MS) + 's',
          );
          if (chatResult) {
            result = {
              ok: chatResult.ok,
              content: chatResult.content || chatResult.response || '',
              error: chatResult.error,
              usage: chatResult.usage || null,
              elapsed: Date.now() - started,
              model: chatResult.model || cfg.model || '',
            };
          }
        } else if (api?.aiCallLLM) {
          result = await runWithTimeout(
            function () { return api.aiCallLLM({ messages: llmMessages }); },
            LLM_CALL_TIMEOUT_MS,
            'AI request timed out after ' + formatSeconds(LLM_CALL_TIMEOUT_MS) + 's',
          );
        }
      } finally {
        clearInterval(heartbeat);
      }
      if (!result) result = { ok: false, error: 'AI service not loaded' };

      if (result.ok) {
        var elapsed = result.elapsed || (Date.now() - started);
        // Detect a board-patch block in any response — not just /board commands.
        var inlineBoardPatch = parseBoardPatch(result.content) || undefined;
        setCostCalls(prev => prev.concat([{ usage: result.usage, elapsed: elapsed, model: result.model }]));
        setMessages(prev => prev.concat([{
          role: 'assistant', content: result.content, ts: Date.now(),
          sources: ragResults.length > 0 ? ragResults : undefined,
          usage: result.usage, elapsed: elapsed, model: result.model,
          ragDebug: ragDebug || undefined,
          ragPipeline: ragPipelineInfo || undefined,
          recursiveSteps: ragRecursiveSteps.length > 0 ? ragRecursiveSteps.slice() : undefined,
          boardPatch: inlineBoardPatch,
        }]));
        // Clear pinned citations after a successful send so the next question starts fresh.
        setPinnedCitations([]);
      } else {
        setMessages(prev => prev.concat([{ role: 'error', content: result.error || 'LLM call failed', ts: Date.now() }]));
      }
    } catch (e) {
      var details = e?.message || 'Request failed';
      setMessages(prev => prev.concat([{ role: 'error', content: 'Failed during ' + phase + ': ' + details, ts: Date.now() }]));
    }
    setLiveStatus('');
    setSending(false);
  }

  var canOpenFresh = !!(function () {
    var a = getApi();
    return a && (typeof a.openAiAssistantWindow === 'function' || typeof a.openExtensionView === 'function');
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[120px]">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--hp-accent,#D3A625)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  var api = getApi();
  if (!config || !(api?.aiCallLLM || api?.aiChat)) {
    return (
      <div className="p-8 text-center min-h-[120px]">
        <p className="text-sm" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>AI Assistant is not available. Make sure the AI extension is enabled in Extensions.</p>
      </div>
    );
  }

  var totalTokens = costCalls.reduce((s, c) => s + ((c.usage?.total_tokens) || 0), 0);
  var totalTime = costCalls.reduce((s, c) => s + (c.elapsed || 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ color: 'var(--hp-text,#3B1010)' }}>
      {/* ─── Header (sticky) ─── */}
      <div
        className="shrink-0 px-4 py-2.5 sticky top-0 z-20"
        style={{ background: 'var(--hp-card,#FFFBF0)', borderBottom: '1px solid var(--hp-border,#D4A574)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold font-display tracking-tight shrink-0" style={{ color: 'var(--hp-accent,#D3A625)' }}>
            {'\u2728'} AI Assistant
          </h2>
          {hasRAG && useRAG && agents.length > 0 && (
            <AgentMenuDropdown agents={agents} value={selectedAgent} onChange={setSelectedAgent} />
          )}
          {hasRAG && (
            <button
              type="button"
              onClick={function () { setUseRAG(!useRAG); }}
              className="text-[10px] px-2 py-1 rounded-full font-mono shrink-0 transition-colors cursor-pointer"
              style={useRAG
                ? { background: 'rgba(40,167,69,0.15)', color: '#2EA043', border: '1px solid rgba(40,167,69,0.35)' }
                : { background: 'rgba(211,166,37,0.1)', color: 'var(--hp-accent,#D3A625)', border: '1px solid rgba(211,166,37,0.3)' }
              }
              title={useRAG ? 'RAG enabled — click to switch to direct LLM (no source search)' : 'Direct LLM mode — click to enable RAG source search'}
            >{useRAG ? 'RAG On' : 'RAG Off'}</button>
          )}
          <div className="flex-1 min-w-[40px]" />
          <ChatSessionsMenu
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={switchSession}
            onNewChat={startNewChat}
            onDelete={deleteSession}
            onOpenFreshWindow={tryOpenFreshWindow}
            canOpenFresh={canOpenFresh}
          />
        </div>
      </div>

      {/* ─── Chat area ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4">
            <div className="text-4xl mb-4 opacity-80" aria-hidden>{'\u2728'}</div>
            <p className="text-base font-semibold font-display" style={{ color: 'var(--hp-accent,#D3A625)' }}>
              {hasRAG && useRAG ? 'Ask anything about the project' : 'Ask the AI anything'}
            </p>
            <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
              {!hasRAG
                ? 'Your question is sent directly to the configured LLM. Enable the RAG extension for source-grounded answers. Use /board [description] to generate Board nodes, or /mission [description] to generate a full Mission Kernel.'
                : useRAG
                  ? 'Your question is searched through RAG sources, routed to a professor agent, then sent to the LLM with full context. Use /board [description] to generate Board nodes, or /mission [description] to auto-generate a Mission Kernel from project data.'
                  : 'Direct LLM mode — your question goes straight to the AI without searching project sources. Use /board [description] to generate Board nodes, or /mission [description] to generate a Mission Kernel.'}
            </p>
            {hasRAG && useRAG && agents.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {agents.slice(0, 5).map(function (a) {
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="text-[10px] px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: 'rgba(211,166,37,0.08)',
                        border: '1px solid rgba(211,166,37,0.2)',
                        color: 'var(--hp-accent,#D3A625)',
                      }}
                      onClick={function () { setSelectedAgent(a.id); }}
                      title={agentDetailText(a)}
                    >
                      {(AGENT_ICONS[a.id] || '\u2728') + ' ' + (a.name || a.id)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            msg={msg}
            onSendToBoard={handleSendToBoard}
            onSendMissionToBoard={handleSendMissionToBoard}
            onFormatAs={handleFormatAs}
            isBoardSent={sentBoardTimes.has(msg.ts)}
            isMissionSent={sentMissionTimes.has(msg.ts)}
            onOpenBoard={handleOpenBoard}
          />
        ))}
        {sending && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--hp-accent,#D3A625)' }} />
            <span className="text-xs" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>{liveStatus || (hasRAG && useRAG ? 'Searching & thinking...' : 'Thinking...')}</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ─── Deep Dive confirmation card ─── */}
      {pendingDeepDive && (
        <div
          className="shrink-0 mx-3 mb-2 rounded-xl p-4"
          style={{ background: 'rgba(211,166,37,0.08)', border: '2px solid rgba(211,166,37,0.45)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="text-lg shrink-0" aria-hidden>{'\u{1F50D}'}</div>
            <div>
              <p className="text-sm font-semibold font-display leading-tight" style={{ color: 'var(--hp-accent,#D3A625)' }}>
                Deep Dive — Preliminary Search Complete
              </p>
              <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                {pendingDeepDive.estimate.reason}
              </p>
            </div>
          </div>

          {/* Cost estimate pills */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              '~' + pendingDeepDive.estimate.estimatedChunks + ' chunks',
              '~' + pendingDeepDive.estimate.estimatedRounds + ' rounds',
              '~' + (pendingDeepDive.estimate.estimatedTokens >= 1000
                ? (pendingDeepDive.estimate.estimatedTokens / 1000).toFixed(0) + 'k'
                : pendingDeepDive.estimate.estimatedTokens) + ' tokens',
            ].map(function (label) {
              return (
                <span key={label} className="text-[11px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(211,166,37,0.15)', color: 'var(--hp-text,#3B2A1A)' }}>
                  {label}
                </span>
              );
            })}
          </div>

          {/* Preliminary sources found */}
          {pendingDeepDive.estimate.sampleSources && pendingDeepDive.estimate.sampleSources.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                Preliminary sources found
              </p>
              <div className="space-y-0.5">
                {pendingDeepDive.estimate.sampleSources.slice(0, 6).map(function (s, i) {
                  return (
                    <div key={i} className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--hp-accent,#D3A625)' }}>{(s.relevance * 100).toFixed(0) + '%'}</span>
                      <span className="text-[11px] truncate" style={{ color: 'var(--hp-text,#3B2A1A)' }}>{s.title}</span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>{s.sourceLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clarifying questions */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
              Clarifying questions
            </p>
            {pendingDeepDive.clarifyingQuestions === null ? (
              <p className="text-[11px] italic" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Generating questions...</p>
            ) : pendingDeepDive.clarifyingQuestions.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>No clarifications needed — query is specific enough.</p>
            ) : (
              <ul className="space-y-1">
                {pendingDeepDive.clarifyingQuestions.map(function (q, i) {
                  return (
                    <li key={i} className="text-[11px] flex gap-1.5" style={{ color: 'var(--hp-text,#3B2A1A)' }}>
                      <span style={{ color: 'var(--hp-accent,#D3A625)' }}>{'\u2022'}</span>
                      {q}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Optional user context input */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
              Additional context or focus (optional)
            </p>
            <input
              type="text"
              value={ddUserContext}
              onChange={function (e) { setDdUserContext(e.target.value); }}
              placeholder="e.g. focus on AI-driven behaviors, or only station behaviors in Hogwarts castle..."
              className="w-full px-3 py-2 text-xs rounded-lg focus:outline-none"
              style={{ background: 'var(--hp-surface,#FDF6E3)', border: '1px solid var(--hp-border,#D4A574)', color: 'var(--hp-text,#3B2A1A)' }}
              onKeyDown={function (e) { if (e.key === 'Enter') { e.preventDefault(); pendingDeepDive.resolveFn({ accepted: true, userContext: ddUserContext }); } }}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={function () { pendingDeepDive.resolveFn({ accepted: true, userContext: ddUserContext }); }}
              className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors"
              style={{ background: 'var(--hp-accent,#D3A625)', color: '#fff' }}
            >
              Accept — Run Deep Dive
            </button>
            <button
              type="button"
              onClick={function () { pendingDeepDive.resolveFn({ accepted: false, userContext: '' }); }}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--hp-muted,#8B6B5B)', border: '1px solid var(--hp-border,#D4A574)' }}
            >
              Cancel — Standard Search
            </button>
          </div>
        </div>
      )}

      {/* ─── Cost bar ─── */}
      {costCalls.length > 0 && (
        <div
          className="shrink-0 px-4 py-1.5"
          style={{ borderTop: '1px solid var(--hp-border,#D4A574)', background: 'var(--hp-card,#FFFBF0)' }}
        >
          <p className="text-[10px] font-mono" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
            {costCalls.length + ' call(s)' + (totalTokens > 0 ? ' | ' + totalTokens.toLocaleString() + ' tokens' : '') + ' | ' + (totalTime / 1000).toFixed(1) + 's total'}
          </p>
        </div>
      )}

      {/* ─── Input bar ─── */}
      <div
        className="shrink-0 p-3 relative"
        style={{ borderTop: '1px solid var(--hp-border,#D4A574)', background: 'var(--hp-card,#FFFBF0)' }}
      >
        {/* ── Citation picker dropdown (floats above input bar) ── */}
        {citeMode && hasRAG && useRAG && (
          <div
            className="absolute left-3 right-3 bottom-full mb-1 rounded-lg shadow-2xl z-[200] flex flex-col"
            style={{ background: 'var(--hp-card,#FFFBF0)', border: '1px solid var(--hp-accent,#D3A625)', maxHeight: '280px' }}
          >
            {/* ── Picker header ── */}
            <div className="px-3 py-1.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--hp-border,#D4A574)', background: 'rgba(211,166,37,0.06)' }}>
              <div className="flex items-center gap-1.5 min-w-0">
                {citeMode !== 'kind' && (
                  <button
                    type="button"
                    onClick={function () {
                      if (citeMode === 'section') { setCiteMode('source'); setCiteSelectedSource(null); setCiteSectionFilter(''); setCitePickerIdx(0); }
                      else { setCiteMode('kind'); setCiteSelectedKind(null); setCiteSearch(''); setCitePickerIdx(0); }
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: 'rgba(211,166,37,0.2)', color: 'var(--hp-accent,#D3A625)' }}
                  >{'\u2190'}</button>
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--hp-accent,#D3A625)' }}>
                  {citeMode === 'kind' ? 'Source type' :
                   citeMode === 'source' ? (KIND_ICONS[citeSelectedKind] || '') + ' ' + (citeSelectedKind || '') :
                   (KIND_ICONS[citeSelectedSource && citeSelectedSource.sourceKind] || '') + ' ' + ((citeSelectedSource && citeSelectedSource.sourceLabel) || '') + ' \u2014 sections'}
                </span>
              </div>
              <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                {citeMode === 'kind' ? '\u2191\u2193 · Tab/\u2192 drill in' : citeMode === 'source' ? 'Enter pin · \u2192 sections · Esc back' : 'Enter pin section · Esc back'}
              </span>
            </div>

            {/* ── Section mode: inline search + section list ── */}
            {citeMode === 'section' && (
              <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(212,165,116,0.3)' }}>
                <input
                  ref={citeSectionInputRef}
                  type="text"
                  value={citeSectionFilter}
                  onChange={function (e) { setCiteSectionFilter(e.target.value); setCitePickerIdx(0); }}
                  onKeyDown={function (e) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setCitePickerIdx(function (i) { return Math.min(i + 1, pickerItems.length - 1); }); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setCitePickerIdx(function (i) { return Math.max(i - 1, 0); }); }
                    else if (e.key === 'Enter') { e.preventDefault(); var it = pickerItems[citePickerIdx]; if (it) selectSection(it); }
                    else if (e.key === 'Escape') { e.preventDefault(); setCiteMode('source'); setCiteSelectedSource(null); setCiteSectionFilter(''); setCitePickerIdx(0); }
                  }}
                  placeholder={'Filter ' + ((citeSelectedSource && citeSelectedSource._sections && citeSelectedSource._sections.length) || 0) + ' sections...'}
                  className="w-full px-2 py-1 text-xs rounded focus:outline-none"
                  style={{ background: 'var(--hp-surface,#FDF6E3)', border: '1px solid var(--hp-border,#D4A574)', color: 'var(--hp-text,#3B1010)' }}
                />
              </div>
            )}

            {/* ── Scrollable item list ── */}
            <div style={{ overflowY: 'auto', flex: 1 }}>

              {/* Kind mode */}
              {citeMode === 'kind' && (
                pickerItems.length === 0 ? (
                  <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[11px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                      {ragSources.length === 0 ? 'Sources still loading — RAG registry takes ~6s.' : 'No types match.'}
                    </span>
                    {ragSources.length === 0 && (
                      <button type="button"
                        className="text-[10px] px-2 py-0.5 rounded shrink-0 font-medium"
                        style={{ background: 'rgba(211,166,37,0.2)', color: 'var(--hp-accent,#D3A625)', border: '1px solid rgba(211,166,37,0.4)' }}
                        onClick={function () { var api = getApi(); if (!api) return; var s = api.ragCustomSources ? api.ragCustomSources() : []; if (s && s.length > 0) setRagSources(s); }}
                      >Refresh</button>
                    )}
                  </div>
                ) : pickerItems.map(function (item, idx) {
                  var icon = KIND_ICONS[item.kind] || KIND_ICONS.default;
                  var isActive = idx === citePickerIdx;
                  return (
                    <button key={item.kind} type="button"
                      className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                      style={{ background: isActive ? 'rgba(211,166,37,0.12)' : 'transparent', borderTop: idx > 0 ? '1px solid rgba(212,165,116,0.2)' : 'none' }}
                      onMouseEnter={function () { setCitePickerIdx(idx); }}
                      onClick={function () { selectKind(item.kind); }}
                    >
                      <span className="text-base shrink-0">{icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold block" style={{ color: 'var(--hp-text,#3B1010)' }}>{'/' + item.kind}</span>
                        <span className="text-[9px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                          {(KIND_LABELS[item.kind] || 'sources') + ' \u00B7 ' + item.sourceCount + ' source' + (item.sourceCount !== 1 ? 's' : '') + ' \u00B7 ' + item.chunkCount + ' chunks'}
                        </span>
                      </span>
                      <span className="text-[9px] shrink-0" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>{'\u21B5'}</span>
                    </button>
                  );
                })
              )}

              {/* Source mode */}
              {citeMode === 'source' && (
                pickerItems.length === 0 ? (
                  <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                    {citeSearch ? 'No match for "' + citeSearch + '".' : 'No ' + citeSelectedKind + ' sources loaded.'}
                  </div>
                ) : pickerItems.map(function (item, idx) {
                  var isActive = idx === citePickerIdx;
                  var canDrill = (item.chunkCount || 0) > SECTION_DRILL_THRESHOLD;
                  return (
                    <div key={item.sourceId}
                      className="flex items-center transition-colors"
                      style={{ background: isActive ? 'rgba(211,166,37,0.12)' : 'transparent', borderTop: idx > 0 ? '1px solid rgba(212,165,116,0.2)' : 'none' }}
                      onMouseEnter={function () { setCitePickerIdx(idx); }}
                    >
                      {/* Main click: pin whole source */}
                      <button type="button" className="flex-1 min-w-0 text-left px-3 py-2"
                        onClick={function () { selectCitation(item); }}
                      >
                        <span className="text-[12px] font-medium truncate block" style={{ color: 'var(--hp-text,#3B1010)' }}>{item.sourceLabel || item.sourceId}</span>
                        <span className="text-[9px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
                          {(item.chunkCount ? item.chunkCount + ' chunks' : '') + (item.registry === 'shared' ? ' \u00B7 shared' : '')}
                          {canDrill ? ' \u00B7 has sections' : ''}
                        </span>
                      </button>
                      {/* Drill button: browse sections */}
                      {canDrill && (
                        <button type="button"
                          className="shrink-0 px-2.5 py-2 text-[10px] font-semibold transition-opacity hover:opacity-80"
                          style={{ color: 'var(--hp-accent,#D3A625)', borderLeft: '1px solid rgba(212,165,116,0.3)' }}
                          title="Browse sections within this source"
                          onClick={function (e) { e.stopPropagation(); enterSectionMode(item); }}
                        >
                          {'\u25B6 sections'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}

              {/* Section mode */}
              {citeMode === 'section' && (
                pickerItems.length === 0 ? (
                  <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>No sections found.</div>
                ) : pickerItems.map(function (item, idx) {
                  var isActive = idx === citePickerIdx;
                  var isPinAll = item._type === 'pin-all';
                  return (
                    <button key={isPinAll ? '__all__' : item.title} type="button"
                      className="w-full text-left px-3 py-2 transition-colors"
                      style={{
                        background: isActive ? 'rgba(211,166,37,0.12)' : isPinAll ? 'rgba(211,166,37,0.04)' : 'transparent',
                        borderTop: idx > 0 ? '1px solid rgba(212,165,116,0.2)' : 'none',
                      }}
                      onMouseEnter={function () { setCitePickerIdx(idx); }}
                      onClick={function () { selectSection(item); }}
                    >
                      {isPinAll ? (
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--hp-accent,#D3A625)' }}>
                          {'\u{1F4CC} Pin all ' + ((item.source && item.source.chunkCount) || '') + ' chunks from this source'}
                        </span>
                      ) : (
                        <span className="text-[11px] truncate block" style={{ color: 'var(--hp-text,#3B1010)' }}>{item.title}</span>
                      )}
                    </button>
                  );
                })
              )}

            </div>
          </div>
        )}

        {/* ── Pinned citation pills ── */}
        {pinnedCitations.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {pinnedCitations.map(function (pin) {
              var kind = (pin.sourceKind || '').toLowerCase();
              var icon = KIND_ICONS[kind] || KIND_ICONS.default;
              var label = pin.sectionTitle
                ? (pin.sourceLabel || pin.sourceId) + ' / ' + pin.sectionTitle
                : (pin.sourceLabel || pin.sourceId);
              var pillKey = pin.sourceId + (pin.sectionTitle ? ':' + pin.sectionTitle : '');
              return (
                <span
                  key={pillKey}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: 'rgba(211,166,37,0.15)', border: '1px solid rgba(211,166,37,0.5)', color: 'var(--hp-text,#3B1010)' }}
                >
                  <span>{icon}</span>
                  <span className="max-w-[200px] truncate">{label}</span>
                  <button
                    type="button"
                    onClick={function () { removeCitation(pin); }}
                    className="ml-0.5 hover:opacity-70 shrink-0"
                    style={{ color: 'var(--hp-muted,#8B6B5B)' }}
                    title="Remove pinned source"
                  >
                    {'\u00D7'}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* ── Text input row ── */}
        <div className="flex gap-2">
          <input
            ref={citeInputRef}
            type="text"
            value={chatInput}
            onChange={function (e) {
              var val = e.target.value;
              setChatInput(val);
              if (!hasRAG || !useRAG) return;
              var cursorPos = e.target.selectionStart != null ? e.target.selectionStart : val.length;
              var before = val.slice(0, cursorPos);

              // Stage 2: /kind<space>search — kind must exist in loaded sources
              var s2 = before.match(/\/([\w\-._]+)\s+([\w\-._\s]*)$/);
              if (s2) {
                var kindToken = s2[1].toLowerCase();
                var kindExists = (ragSources || []).some(function (s) { return (s.sourceKind || '').toLowerCase() === kindToken; });
                if (kindExists) {
                  setCiteMode('source');
                  setCiteSelectedKind(kindToken);
                  setCiteSearch((s2[2] || '').trim());
                  setCiteKindFilter('');
                  setCitePickerIdx(0);
                  return;
                }
              }

              // Stage 1: /partialKind (no confirmed space yet)
              var s1 = before.match(/\/([\w\-._]*)$/);
              if (s1) {
                setCiteMode('kind');
                setCiteKindFilter((s1[1] || '').toLowerCase());
                setCiteSelectedKind(null);
                setCiteSearch('');
                setCitePickerIdx(0);
                return;
              }

              // Nothing active
              closeCitePicker();
            }}
            onKeyDown={function (e) {
              if (citeMode) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setCitePickerIdx(function (i) { return Math.min(i + 1, pickerItems.length - 1); }); return; }
                if (e.key === 'ArrowUp')   { e.preventDefault(); setCitePickerIdx(function (i) { return Math.max(i - 1, 0); }); return; }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  var item = pickerItems[citePickerIdx];
                  if (item) {
                    if (item._type === 'kind')    selectKind(item.kind);
                    else if (item._type === 'source') selectCitation(item);
                    else if (item._type === 'section' || item._type === 'pin-all') selectSection(item);
                  }
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  // Stage 3 → back to stage 2; otherwise close fully
                  if (citeMode === 'section') { setCiteMode('source'); setCiteSelectedSource(null); setCiteSectionFilter(''); setCitePickerIdx(0); }
                  else closeCitePicker();
                  return;
                }
                // Tab/→ in kind or source mode: drill in
                if ((e.key === 'Tab' || e.key === 'ArrowRight') && (citeMode === 'kind' || citeMode === 'source')) {
                  e.preventDefault();
                  var di = pickerItems[citePickerIdx];
                  if (di) {
                    if (di._type === 'kind') selectKind(di.kind);
                    else if (di._type === 'source' && (di.chunkCount || 0) > SECTION_DRILL_THRESHOLD) enterSectionMode(di);
                  }
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={hasRAG && useRAG ? 'Ask a question... (type /confluence, /pdf, /ue… to pin a source)' : 'Ask a question...'}
            disabled={sending}
            className="flex-1 min-w-0 px-3 py-2.5 text-sm rounded-lg disabled:opacity-50 focus:outline-none"
            style={{
              background: 'var(--hp-surface,#FDF6E3)',
              border: '1px solid var(--hp-border,#D4A574)',
              color: 'var(--hp-text,#3B1010)',
            }}
          />
          <button onClick={handleSend} disabled={sending || (!chatInput.trim() && pinnedCitations.length === 0)}
            className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-lg transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--hp-accent,#D3A625)', color: '#fff' }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <div className="flex items-start gap-4 mt-2 flex-wrap">
          {hasRAG && useRAG && (
            <label className="flex items-start gap-1.5 cursor-pointer select-none group">
              <input type="checkbox" checked={config.extendedMode || false} onChange={e => updateConfig({ extendedMode: e.target.checked })} className="w-3.5 h-3.5 rounded mt-0.5 shrink-0" style={{ accentColor: 'var(--hp-accent,#D3A625)' }} />
              <div>
                <span className="text-[10px] font-medium block" style={{ color: config.extendedMode ? 'var(--hp-accent,#D3A625)' : 'var(--hp-muted,#8B6B5B)' }}>Extended Search</span>
                <span className="text-[9px] leading-tight block" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Wider rings, deeper retrieval</span>
              </div>
            </label>
          )}
          {hasRAG && useRAG && (
            <label className="flex items-start gap-1.5 cursor-pointer select-none group">
              <input type="checkbox" checked={config.deepDiveMode || false} onChange={e => updateConfig({ deepDiveMode: e.target.checked })} className="w-3.5 h-3.5 rounded mt-0.5 shrink-0" style={{ accentColor: 'var(--hp-accent,#D3A625)' }} />
              <div>
                <span className="text-[10px] font-medium block" style={{ color: config.deepDiveMode ? 'var(--hp-accent,#D3A625)' : 'var(--hp-muted,#8B6B5B)' }}>Deep Dive</span>
                <span className="text-[9px] leading-tight block" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Multi-round exhaustive search</span>
              </div>
            </label>
          )}
          {hasRAG && useRAG && (
            <label className="flex items-start gap-1.5 cursor-pointer select-none group">
              <input type="checkbox" checked={config.recursiveRetrieval || false} onChange={e => updateConfig({ recursiveRetrieval: e.target.checked })} className="w-3.5 h-3.5 rounded mt-0.5 shrink-0" style={{ accentColor: 'var(--hp-accent,#D3A625)' }} />
              <div>
                <span className="text-[10px] font-medium block" style={{ color: config.recursiveRetrieval ? 'var(--hp-accent,#D3A625)' : 'var(--hp-muted,#8B6B5B)' }}>Recursive</span>
                <span className="text-[9px] leading-tight block" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>Gap-fill second pass · steep cost</span>
              </div>
            </label>
          )}
          <span className="text-[10px] truncate self-center ml-auto" style={{ color: 'var(--hp-muted,#8B6B5B)' }}>
            {(config.provider || 'luna') + ' \u00B7 ' + (config.model || '')}
          </span>
        </div>
      </div>
    </div>
  );
}
