const { humanizeLlmOrJsonError } = require('ledger/humanizeLlmError');

function getApi() {
  return window.appAPI || window.electronAPI || null;
}

function mapAiFailure(res) {
  if (!res || res.ok || res.error == null) return res;
  return Object.assign({}, res, { error: humanizeLlmOrJsonError(res.error) });
}

function sourceTypeInfo(source) {
  const st = source.sourceType || source.type || source.extra?.type || 'unknown';
  const extra = source.extra || {};
  if (st === 'confluence' || extra.type === 'confluence') return { key: 'confluence', label: 'Confluence' };
  if (st === 'kb' || extra.type === 'knowledge-base') return { key: 'kb', label: 'Knowledge Base' };
  if (st === 'potterdb' || extra.type === 'potterdb') return { key: 'potterdb', label: 'Potter DB' };
  if (st === 'slack' || extra.type === 'slack') return { key: 'slack', label: 'Slack' };
  if (source.sourceDisplayName) return { key: 'custom', label: source.sourceDisplayName };
  return { key: 'unknown', label: st };
}

export async function aiCheck() {
  const api = getApi();
  if (api?.aiCheck) return mapAiFailure(await api.aiCheck());
  return { ok: false, error: 'AI bridge unavailable — run inside The Marauder\'s Ledger (Tauri).' };
}

export async function aiGenerate(prompt) {
  const api = getApi();
  if (api?.aiGenerate) return mapAiFailure(await api.aiGenerate({ prompt }));
  return { ok: false, error: 'No AI provider — configure Extensions -> AI (Luna GPT).' };
}

export async function aiChat(messages) {
  const api = getApi();
  if (api?.aiChat) return mapAiFailure(await api.aiChat({ messages }));
  return { ok: false, error: 'No AI provider — configure Extensions -> AI (Luna GPT).' };
}

function classifyQuery(question) {
  const q = question.toLowerCase();
  if (/who is|tell me about|what do we know about|describe\s/.test(q)) return 'character';
  if (/how (do|to|does|should)|steps|process|workflow|guideline|procedure/.test(q)) return 'process';
  if (/\.uasset|\.xml|unreal|blueprint|asset|animation|station|ark\b/i.test(q)) return 'technical';
  if (/how many|count|list all|what are the/.test(q)) return 'inventory';
  return 'general';
}

const EXTRACTION_GUIDES = {
  character: `This is a CHARACTER question about someone from Hogwarts Legacy (the game).
IMPORTANT: If multiple characters share a name (e.g. "Poppy Sweeting" vs "Poppy Caxton" vs "Poppy Pomfrey"), focus on the one who is a companion/main character in Hogwarts Legacy — they will have more data in Confluence pages, bios, quests, and game files. The broader Potterverse characters are secondary context only.

For the PRIMARY character, extract every detail you can find:
- Full name, house, year, blood status, species
- Family (parents, siblings, grandparents) and upbringing — how did they get here?
- Personality: what drives them? What do they believe? What are they passionate about?
- Relationships: friends, rivals, romantic interests, mentors
- Quests and storylines: what happens when the player interacts with them?
- Skills, abilities, areas of expertise
- Notable moments, quotes, or character development
- Associated game files (animations, models, XML data) and what they tell us

For SECONDARY characters with the same name, note them briefly for disambiguation.`,

  process: `This is a PROCESS/WORKFLOW question. The user wants to know how something is done.
For each relevant source, extract:
- Step-by-step procedures
- Tools, systems, or software involved
- Guidelines, rules, or best practices
- Common issues and solutions
- Who is responsible for each step`,

  technical: `This is a TECHNICAL/ASSET question about game files, Unreal Engine, or development systems.
For each relevant source, extract:
- Filenames, paths, and asset types
- What each asset does or represents
- Technical specifications and parameters
- Relationships between assets
- Naming conventions and what they encode`,

  inventory: `This is a COUNT/INVENTORY question. The user wants a list or count.
For each relevant source, extract:
- Every item, filename, or entity that matches
- Categories and groupings
- Counts and totals
- Key attributes of each item`,

  general: `For each relevant source, extract every fact, detail, name, date, or description that could help answer the question.`,
};

export async function ollamaRAGAnswer(question, systemPrompt, chatHistory, onPhase) {
  const queryType = classifyQuery(question);
  console.log('Ollama RAG: query classified as', queryType);

  onPhase?.('analyzing');

  const extractMessages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Question: "${question}"

Everything in this app relates to Hogwarts Legacy game development — lore, characters, assets, processes, and team workflows.

${EXTRACTION_GUIDES[queryType]}

Go through each [SOURCE] above. For each one:
- If it helps answer the question, write: [source number] RELEVANT — "title" → then list every useful fact you found
- If it does NOT help (e.g. a raw animation file for a character identity question, or an unrelated Confluence page), write: [source number] SKIP — "title" — reason

Use the actual source number (1, 2, 3, etc.), not the letter N. Be thorough with relevant sources.`,
    },
  ];

  const extraction = await aiChat(extractMessages);
  if (!extraction.ok) return extraction;

  const extractedFacts = extraction.response;
  console.log('Ollama RAG: extraction complete,', extractedFacts.length, 'chars');

  onPhase?.('composing');

  const SYNTHESIS_GUIDES = {
    character: `This is about a Hogwarts Legacy character. Focus on the one actually in the game (most Confluence/bio data). Mention other characters with the same name only as a brief note at the end if relevant.

Use these sections as a guide (skip any that have no info — don't mention them at all):
**Who They Are** — introduce them naturally: name, house, year, blood status, what their role is
**Background** — their story: family, upbringing, what shaped who they are today
**Personality & Beliefs** — what they're like, what drives them, what they care about
**Relationships** — who they're connected to and how (friends, family, mentors)
**Quests & Events** — what happens in their storylines, key moments with the player
**Skills & Expertise** — what they bring to the table`,

    process: `Structure your answer as a clear guide:
**Overview** — what this process is and when to use it
**Steps** — numbered walkthrough
**Tools & Systems** — what's involved
**Tips & Gotchas** — common issues, best practices`,

    technical: `Structure your answer with:
**Overview** — what this system/asset is
**Files & Assets** — filenames, types, locations
**How It Works** — technical details, parameters
**Naming Conventions** — what the filenames encode
**Relationships** — how assets connect to each other`,

    inventory: `Structure your answer with:
**Summary** — total count and overview
**Breakdown** — organized list by category
**Details** — key attributes of notable items`,

    general: `Organize your answer with clear topic headers and bullet points under each.`,
  };

  const synthesizeMessages = [
    {
      role: 'system',
      content: `You are a knowledgeable colleague on the Hogwarts Legacy dev team. Write the way a helpful teammate would explain things — warm, clear, confident. Use the extracted research notes as your source material.

Style rules:
- Write naturally, like you're briefing a teammate — not an essay or academic paper
- State facts confidently. Don't hedge with "suggests that" or "may play a role" or "likely" — if the source says it, just say it
- SKIP sections entirely if there's no info. Never write "no information is available" or "there are no files" — just leave it out
- Weave facts into flowing sentences and short paragraphs, not just bullet lists
- Cite inline with [number] right after the fact, e.g. "She's a fifth-year Hufflepuff [2] raised by her grandmother [4]"
- Only use facts from sources marked RELEVANT. Skip anything marked SKIP
- Don't speculate or add information that isn't in the research notes`,
    },
    ...chatHistory.map(m => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `Question: ${question}

Research notes:
${extractedFacts}

${SYNTHESIS_GUIDES[queryType]}

Write the answer now. Include every relevant fact — don't leave anything out. End with 2-3 follow-up questions.`,
    },
  ];

  return aiChat(synthesizeMessages);
}

export async function ragSearch(query, topK = 10, onPhase) {
  const api = getApi();
  if (!api?.ragSearch) return [];
  try {
    const progressId = Date.now().toString(36);

    let cleanupListener;
    if (onPhase && api?.onRagSearchProgress) {
      cleanupListener = api.onRagSearchProgress((data) => {
        if (data.progressId === progressId) onPhase(data.phase);
      });
    }

    const res = await api.ragSearch({ query, topK, progressId });
    cleanupListener?.();
    return res.ok ? res.results : [];
  } catch { return []; }
}

export function buildRAGNumberedContext(ragChunks) {
  const sourceIndex = [];
  let numberedContent = '';

  for (const chunk of (ragChunks || [])) {
    if (chunk.similarity < 0.15) continue;
    const info = sourceTypeInfo(chunk);
    sourceIndex.push({ ...chunk, type: info.key, similarity: chunk.similarity });
    const num = sourceIndex.length;
    const contextText = chunk.contextText || chunk.parentText || chunk.text;
    const updated = chunk.lastModified ? ` (updated ${new Date(chunk.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : '';
    numberedContent += `\n[SOURCE ${num}] "${chunk.title}" — ${info.label}${updated}\n${contextText}\n`;
  }

  const sourceList = sourceIndex.map((src, i) => {
    const num = i + 1;
    const info = sourceTypeInfo(src);
    return `[${num}] "${src.title}" — ${info.label}`;
  }).join('\n');

  return { sourceIndex, numberedContent, sourceList };
}

export async function buildAIContext(question, departments, onSearchPhase) {
  console.log('AI context: Advanced RAG search for:', question);
  const api = getApi();

  // Fetch compiled knowledge (Tier 1)
  let compiledKB = null;
  try {
    if (api?.ragGetCompiledKnowledge) {
      compiledKB = await api.ragGetCompiledKnowledge();
    }
  } catch {}

  const ragResults = await ragSearch(question, 10, onSearchPhase);
  console.log('AI context: RAG returned', ragResults.length, 'chunks');

  const sourceIndex = [];
  let numberedContent = '';
  const seenTitles = new Set();

  for (const chunk of ragResults) {
    if (chunk.similarity < 0.15) continue;

    const info = sourceTypeInfo(chunk);
    const title = chunk.title || 'Untitled';
    // Use expanded context (neighbor chunks stitched together) when available
    const rawContext = chunk.contextText || chunk.parentText || chunk.text || '';
    const contextText = rawContext.slice(0, 5000);

    const dedupeKey = `${info.key}:${title}`;
    const isDuplicate = seenTitles.has(dedupeKey);
    if (isDuplicate && info.key === 'confluence') {
      const existingIdx = sourceIndex.findIndex(s => `${sourceTypeInfo(s).key}:${s.title}` === dedupeKey);
      if (existingIdx >= 0) {
        numberedContent += `\n(continued from [SOURCE ${existingIdx + 1}])\n${contextText}\n`;
        continue;
      }
    }
    seenTitles.add(dedupeKey);

    sourceIndex.push({
      ...chunk,
      type: info.key,
      similarity: chunk.similarity,
    });
    const num = sourceIndex.length;
    const updated = chunk.lastModified ? ` (updated ${new Date(chunk.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : '';
    numberedContent += `\n[SOURCE ${num}] "${title}" — ${info.label}${updated}\n${contextText}\n`;
  }

  const taskData = departments.map(d => {
    const tasks = d.tasks.map(t => `  - "${t.title}" status=${t.status} priority=${t.priority} assignee=${t.assignee || 'none'}`).join('\n');
    return `${d.name}:\n${tasks || '  (no tasks)'}`;
  }).join('\n');

  const sourceCount = sourceIndex.length;

  const systemPrompt = `You are the Hogwarts Legacy dev team's knowledge assistant — a warm, knowledgeable colleague who gives thorough answers.

DOMAIN TERMS (game dev systems, not lore):
- "ARK" = animation station system (NPC/player interactions: sit, lean, stand). Not a creature.
- "station" = ARK interaction point. "stage" = game level or dev phase.
- Asset filenames encode meaning: "Station_SIT_LowChair" = sitting station. "TrIn/TrOut" = transition. "ATT" = attentive. "v01/v02" = idle variants. "F/M" = female/male.
${compiledKB ? `
=== DOMAIN KNOWLEDGE ===
${compiledKB}
` : ''}${numberedContent ? `
=== REFERENCE DATA (${sourceCount} sources retrieved for this query) ===
${numberedContent}
` : ''}${taskData ? `=== TASKS ===
${taskData}
` : ''}
=== YOUR INSTRUCTIONS ===
Read ALL sources above. Extract every relevant fact and cite it with the source number in brackets — e.g. "Poppy is a Hufflepuff [2]".
Be thorough: cover every detail from every source. Organize with clear headers and bullet points.
If sources don't contain the answer, say so and suggest a better search. Do not invent facts.`;

  console.log('AI context: sources =', sourceIndex.length, 'prompt length =', systemPrompt.length, 'chars');
  return { systemPrompt, sourceIndex };
}

export function rebuildSystemPrompt(mergedSources, departments) {
  let numberedContent = '';
  for (let i = 0; i < mergedSources.length; i++) {
    const chunk = mergedSources[i];
    const info = sourceTypeInfo(chunk);
    const title = chunk.title || 'Untitled';
    const rawContext = chunk.contextText || chunk.parentText || chunk.text || '';
    const contextText = rawContext.slice(0, 5000);
    const updated = chunk.lastModified ? ` (updated ${new Date(chunk.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : '';
    numberedContent += `\n[SOURCE ${i + 1}] "${title}" — ${info.label}${updated}\n${contextText}\n`;
  }

  const taskData = departments.map(d => {
    const tasks = d.tasks.map(t => `  - "${t.title}" status=${t.status} priority=${t.priority} assignee=${t.assignee || 'none'}`).join('\n');
    return `${d.name}:\n${tasks || '  (no tasks)'}`;
  }).join('\n');

  const sc = mergedSources.length;
  return `You are the Hogwarts Legacy dev team's knowledge assistant — a warm, knowledgeable colleague who gives thorough answers.

DOMAIN TERMS (game dev systems, not lore):
- "ARK" = animation station system (NPC/player interactions: sit, lean, stand). Not a creature.
- "station" = ARK interaction point. "stage" = game level or dev phase.
- Asset filenames encode meaning: "Station_SIT_LowChair" = sitting station. "TrIn/TrOut" = transition. "ATT" = attentive. "v01/v02" = idle variants. "F/M" = female/male.
${numberedContent ? `
=== REFERENCE DATA (${sc} sources) ===
${numberedContent}
` : ''}${taskData ? `=== TASKS ===
${taskData}
` : ''}
=== YOUR INSTRUCTIONS ===
Read ALL sources above. Extract every relevant fact and cite with the source number in brackets — e.g. "Poppy is a Hufflepuff [2]".
Be thorough: cover every detail from every source. Organize with clear headers and bullet points.
If sources don't contain the answer, say so and suggest a better search. Do not invent facts.`;
}
