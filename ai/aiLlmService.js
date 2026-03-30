/* =========================================================================
 *  AI LLM Service — Marketplace Extension Service Module
 *  Multi-format LLM client (Ollama + OpenAI), cost estimation,
 *  extended RAG mode, connection management, presets.
 * ========================================================================= */

var AI_CONFIG_KEY = 'producerTrackerAiConfig';

var DEFAULT_CONFIG = {
  provider: 'ollama',
  apiUrl: 'http://localhost:11434/api/chat',
  model: 'llama3.2',
  temperature: 0.3,
  apiKey: '',
  format: 'ollama',
  topK: 5,
  minRelevance: 0.10,
  extendedMode: false,
};

var PRESETS = {
  ollama: { apiUrl: 'http://localhost:11434/api/chat', model: 'llama3.2', format: 'ollama', provider: 'ollama' },
  luna: { apiUrl: '/proxy/luna/api/chat/completions', model: 'gpt-5-chat-latest', format: 'openai', provider: 'luna' },
  openai: { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', format: 'openai', provider: 'openai' },
  custom: { provider: 'custom' },
};

// === CONFIG ====================================================================

var _config = null;

function loadConfig() {
  if (_config) return _config;
  try {
    var raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) _config = Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
    else _config = Object.assign({}, DEFAULT_CONFIG);
  } catch (e) {
    _config = Object.assign({}, DEFAULT_CONFIG);
  }
  return _config;
}

function saveConfig(partial) {
  _config = Object.assign(loadConfig(), partial);
  try { localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(_config)); } catch (e) {}
  return _config;
}

// === TAURI HTTP BRIDGE =========================================================

function callTauri(cmd, args) {
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return window.__TAURI__.core.invoke(cmd, args || {});
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    return window.__TAURI__.invoke(cmd, args || {});
  }
  return null;
}

function httpViaFetch(url, method, headers, body) {
  return fetch(url, { method: method, headers: headers, body: body }).then(function (res) {
    return res.text().then(function (text) {
      return { ok: res.ok, status: res.status, body: text };
    });
  });
}

function httpViaTauri(url, method, headers, body) {
  return callTauri('http_request', { url: url, method: method, headers: headers, body: body })
    .then(function (res) { return { ok: res.status >= 200 && res.status < 300, status: res.status, body: res.body || '' }; });
}

function httpRequest(url, method, headers, body) {
  var isLocal = url.indexOf('localhost') !== -1 || url.indexOf('127.0.0.1') !== -1 || url.startsWith('/');
  if (isLocal) return httpViaFetch(url, method, headers, body);
  var tauriResult = callTauri('http_request', { url: url, method: method, headers: headers, body: body });
  if (tauriResult) return tauriResult.then(function (res) { return { ok: res.status >= 200 && res.status < 300, status: res.status, body: res.body || '' }; });
  return httpViaFetch(url, method, headers, body);
}

// === LLM CLIENT ================================================================

function callLLM(config, systemPrompt, userMessage, onLog) {
  var apiUrl = config.apiUrl || loadConfig().apiUrl;
  var model = config.model || loadConfig().model;
  var temperature = config.temperature != null ? config.temperature : loadConfig().temperature;
  var apiKey = config.apiKey || loadConfig().apiKey;
  var format = config.format || loadConfig().format;
  var isOpenAI = format === 'openai';

  var messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  var requestBody = isOpenAI
    ? JSON.stringify({ model: model, messages: messages, stream: false })
    : JSON.stringify({ model: model, messages: messages, stream: false, options: { temperature: temperature } });

  var headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  if (onLog) onLog('api', 'LLM API REQUEST', formatRequestLog(apiUrl, model, temperature, isOpenAI, !!apiKey, systemPrompt, userMessage));

  var startTime = Date.now();

  return httpRequest(apiUrl, 'POST', headers, requestBody).then(function (res) {
    var elapsed = Date.now() - startTime;
    if (!res.ok) {
      if (onLog) onLog('error', 'LLM API ERROR (' + res.status + ')', (res.body || '').slice(0, 1000));
      throw new Error('LLM API returned ' + res.status + ': ' + (res.body || '').slice(0, 200));
    }

    var data = JSON.parse(res.body);

    var content = isOpenAI
      ? (data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : JSON.stringify(data))
      : (data.message ? data.message.content : (data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : JSON.stringify(data)));

    var usage = {
      prompt_tokens: isOpenAI ? (data.usage ? data.usage.prompt_tokens || 0 : 0) : 0,
      completion_tokens: isOpenAI ? (data.usage ? data.usage.completion_tokens || 0 : 0) : (data.eval_count || 0),
      total_tokens: isOpenAI ? (data.usage ? data.usage.total_tokens || 0 : 0) : (data.eval_count || 0),
    };

    if (onLog) {
      var meta = ['Status: ' + res.status + ' OK', 'Time: ' + elapsed + 'ms'];
      if (isOpenAI && data.usage) {
        meta.push('Prompt tokens: ' + data.usage.prompt_tokens);
        meta.push('Completion tokens: ' + data.usage.completion_tokens);
        meta.push('Total tokens: ' + data.usage.total_tokens);
      }
      if (!isOpenAI && data.eval_count) meta.push('Tokens: ' + data.eval_count);
      if (data.model) meta.push('Model: ' + data.model);
      onLog('response', 'LLM RESPONSE (' + elapsed + 'ms)', meta.join('  |  ') + '\n\n' + content);
    }

    return { ok: true, content: content, usage: usage, elapsed: elapsed, model: data.model || model };
  }).catch(function (err) {
    if (onLog && !err.message.startsWith('LLM API returned')) onLog('error', 'LLM API FAILED', err.message);
    return { ok: false, error: err.message };
  });
}

function chatWithMessages(messages, config) {
  var cfg = config || loadConfig();
  var apiUrl = cfg.apiUrl;
  var model = cfg.model;
  var apiKey = cfg.apiKey;
  var format = cfg.format;
  var temperature = cfg.temperature;
  var isOpenAI = format === 'openai';

  var requestBody = isOpenAI
    ? JSON.stringify({ model: model, messages: messages, stream: false })
    : JSON.stringify({ model: model, messages: messages, stream: false, options: { temperature: temperature } });

  var headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  return httpRequest(apiUrl, 'POST', headers, requestBody).then(function (res) {
    if (!res.ok) return { ok: false, error: 'API returned ' + res.status + ': ' + (res.body || '').slice(0, 200) };
    var data = JSON.parse(res.body);
    var content = isOpenAI
      ? (data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '')
      : (data.message ? data.message.content : (data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : ''));
    var usage = {
      prompt_tokens: isOpenAI && data.usage ? data.usage.prompt_tokens || 0 : 0,
      completion_tokens: isOpenAI && data.usage ? data.usage.completion_tokens || 0 : (data.eval_count || 0),
      total_tokens: isOpenAI && data.usage ? data.usage.total_tokens || 0 : (data.eval_count || 0),
    };
    return { ok: true, response: content, content: content, usage: usage, model: data.model || model };
  }).catch(function (err) {
    return { ok: false, error: err.message || 'Chat failed' };
  });
}

function testConnection(config) {
  var cfg = config || loadConfig();
  var isOpenAI = cfg.format === 'openai';
  var body = isOpenAI
    ? JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Reply with just the word "connected".' }], stream: false, max_tokens: 10 })
    : JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Reply with just the word "connected".' }], stream: false, options: { temperature: 0 } });

  var headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;

  return httpRequest(cfg.apiUrl, 'POST', headers, body).then(function (res) {
    if (!res.ok) throw new Error(res.status + ': ' + (res.body || '').slice(0, 200));
    var data = JSON.parse(res.body);
    var reply = isOpenAI
      ? (data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'OK')
      : (data.message ? data.message.content : 'OK');
    return { ok: true, reply: reply.slice(0, 100), model: data.model || cfg.model };
  }).catch(function (err) {
    return { ok: false, error: err.message || 'Connection failed' };
  });
}

function checkOllama() {
  return httpViaFetch('http://localhost:11434/api/tags', 'GET', {}, null).then(function (res) {
    if (!res.ok) return { ok: false, error: 'Ollama returned ' + res.status };
    var data = JSON.parse(res.body);
    var allModels = (data.models || []).map(function (m) { return m.name; });
    var chatModels = allModels.filter(function (n) { return n.indexOf('embed') === -1; });
    return { ok: true, models: chatModels.length > 0 ? chatModels : allModels, provider: 'ollama' };
  }).catch(function () {
    return { ok: false, error: 'Ollama is not running' };
  });
}

// === COST ESTIMATOR ============================================================

var PRICING = {
  'gpt-5-chat-latest':   { input: 3.00,  output: 12.00 },
  'gpt-5.1-chat-latest': { input: 3.00,  output: 12.00 },
  'gpt-5.2-chat-latest': { input: 3.00,  output: 12.00 },
  'gpt-4o':              { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':         { input: 0.15,  output: 0.60 },
  'gpt-4.1':             { input: 2.00,  output: 8.00 },
  'gpt-4.1-mini':        { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano':        { input: 0.10,  output: 0.40 },
  'claude-3.5-sonnet':   { input: 3.00,  output: 15.00 },
  'claude-3-opus':       { input: 15.00, output: 75.00 },
  'claude-3-haiku':      { input: 0.25,  output: 1.25 },
  'llama3.2':            { input: 0,     output: 0 },
  'llama3.1':            { input: 0,     output: 0 },
  'mistral':             { input: 0,     output: 0 },
};

function findPricing(model) {
  var lower = (model || '').toLowerCase();
  if (PRICING[lower]) return PRICING[lower];
  var keys = Object.keys(PRICING);
  for (var i = 0; i < keys.length; i++) {
    if (lower.indexOf(keys[i]) !== -1 || keys[i].indexOf(lower) !== -1) return PRICING[keys[i]];
  }
  return null;
}

function formatCostSummary(calls) {
  if (!calls || calls.length === 0) return 'No API calls made.';
  var totalPrompt = 0, totalCompletion = 0, totalTokens = 0, totalTime = 0;
  var model = calls[0].model || 'unknown';
  for (var i = 0; i < calls.length; i++) {
    var c = calls[i];
    totalPrompt += (c.usage ? c.usage.prompt_tokens : 0) || 0;
    totalCompletion += (c.usage ? c.usage.completion_tokens : 0) || 0;
    totalTokens += (c.usage ? c.usage.total_tokens : 0) || 0;
    totalTime += c.elapsed || 0;
    if (c.model) model = c.model;
  }
  var pricing = findPricing(model);
  var lines = [
    'Model: ' + model,
    'API calls: ' + calls.length,
    'Total time: ' + (totalTime / 1000).toFixed(1) + 's',
    '',
    'Prompt tokens: ' + totalPrompt.toLocaleString(),
    'Completion tokens: ' + totalCompletion.toLocaleString(),
    'Total tokens: ' + totalTokens.toLocaleString(),
  ];
  if (pricing) {
    if (pricing.input === 0 && pricing.output === 0) {
      lines.push('', 'Cost: FREE (local model)');
    } else {
      var inputCost = (totalPrompt / 1000000) * pricing.input;
      var outputCost = (totalCompletion / 1000000) * pricing.output;
      var totalCost = inputCost + outputCost;
      lines.push('', 'Estimated Cost:');
      lines.push('  Input:  ' + totalPrompt.toLocaleString() + ' tokens \u00D7 $' + pricing.input + '/1M = $' + inputCost.toFixed(6));
      lines.push('  Output: ' + totalCompletion.toLocaleString() + ' tokens \u00D7 $' + pricing.output + '/1M = $' + outputCost.toFixed(6));
      lines.push('  Total:  $' + totalCost.toFixed(6));
      var perDollar = totalCost > 0 ? Math.floor(1 / totalCost) : Infinity;
      if (perDollar !== Infinity) lines.push('  ~' + perDollar.toLocaleString() + ' queries per $1.00');
    }
  }
  return lines.join('\n');
}

// === EXTENDED MODE =============================================================

function extractFollowUpTerms(sources, originalQuery) {
  var originalLower = originalQuery.toLowerCase();
  var terms = new Set();
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    var cleanTitle = (src.title || '')
      .replace(/\s*[\u2014\u2013-]\s*(character bible|questline design|technical design|workflow guide|design|overview|profile)$/i, '')
      .trim();
    if (cleanTitle.length > 2 && originalLower.indexOf(cleanTitle.toLowerCase()) === -1) {
      terms.add(cleanTitle);
    }
  }
  return Array.from(terms).slice(0, 5);
}

function normalizeRagResults(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.results)) return result.results;
  return [];
}

function sourceKey(source, fallback) {
  if (source && source.id != null) return String(source.id);
  if (source && source.sourceId != null) return String(source.sourceId);
  return 'source-' + fallback;
}

async function runExtendedSearch(query, appAPI, searchOptions) {
  var topK = searchOptions.topK || 5;
  var minRelevance = searchOptions.minRelevance || 0.10;

  var initial = appAPI.ragSearch ? await appAPI.ragSearch({ query: query, topK: topK }) : null;
  var initialResults = normalizeRagResults(initial);
  if (initialResults.length === 0) {
    return { sources: [], numberedContext: '', rounds: 1 };
  }

  var allSources = initialResults.slice();
  var seenIds = new Set(allSources.map(function (s, idx) { return sourceKey(s, idx); }));

  var followUpTerms = extractFollowUpTerms(allSources, query);
  for (var i = 0; i < followUpTerms.length; i++) {
    var expanded = await appAPI.ragSearch({ query: followUpTerms[i], topK: topK });
    var expandedResults = normalizeRagResults(expanded);
    if (expandedResults.length > 0) {
      for (var j = 0; j < expandedResults.length; j++) {
        var exp = expandedResults[j];
        var expKey = sourceKey(exp, allSources.length + j);
        if (!seenIds.has(expKey)) {
          seenIds.add(expKey);
          allSources.push(exp);
        }
      }
    }
  }

  var wide = await appAPI.ragSearch({ query: query, topK: topK * 2 });
  var wideResults = normalizeRagResults(wide);
  if (wideResults.length > 0) {
    for (var k = 0; k < wideResults.length; k++) {
      var wideRes = wideResults[k];
      var wideKey = sourceKey(wideRes, allSources.length + k);
      if (!seenIds.has(wideKey)) {
        seenIds.add(wideKey);
        allSources.push(wideRes);
      }
    }
  }

  if (minRelevance > 0) {
    allSources = allSources.filter(function (s) {
      var sim = Number(s && s.similarity);
      return !Number.isFinite(sim) || sim >= minRelevance;
    });
  }

  var numberedContext = allSources.map(function (s, idx) {
    var contextText = s.contextText || s.parentText || s.text || '';
    return '[SOURCE ' + (idx + 1) + '] ' + (s.title || 'Untitled') + ' (' + (s.sourceLabel || s.sourceKind || 'unknown') + ')\n' + contextText;
  }).join('\n\n');

  return { sources: allSources, numberedContext: numberedContext, rounds: 3, followUpTerms: followUpTerms };
}

// === HELPERS ===================================================================

function formatRequestLog(url, model, temperature, isOpenAI, hasAuth, systemPrompt, userMessage) {
  var sp = systemPrompt.length > 600 ? systemPrompt.slice(0, 600) + '\n... (' + systemPrompt.length + ' chars total)' : systemPrompt;
  return [
    'POST ' + url, 'Format: ' + (isOpenAI ? 'OpenAI' : 'Ollama'), 'Model: ' + model,
    'Temperature: ' + temperature, 'Auth: ' + (hasAuth ? 'Bearer ****' : 'none'), '',
    'System Prompt:', sp, '', 'User Message:', userMessage,
  ].join('\n');
}

// === SERVICE INIT / DESTROY ====================================================

var _previousApiBindings = null;

function init(appAPI) {
  var cfg = loadConfig();
  console.log('[AI] Service initializing... provider=' + cfg.provider + ' model=' + cfg.model);

  var existing = {
    aiCheck: appAPI.aiCheck,
    aiChat: appAPI.aiChat,
    aiGenerate: appAPI.aiGenerate,
    aiCallLLM: appAPI.aiCallLLM,
    aiTestConnection: appAPI.aiTestConnection,
    aiGetConfig: appAPI.aiGetConfig,
    aiSetConfig: appAPI.aiSetConfig,
    aiGetPresets: appAPI.aiGetPresets,
    aiExtendedSearch: appAPI.aiExtendedSearch,
    aiGetCostSummary: appAPI.aiGetCostSummary,
    aiIsAgentic: appAPI.aiIsAgentic,
    ollamaCheck: appAPI.ollamaCheck,
    ollamaGenerate: appAPI.ollamaGenerate,
  };
  _previousApiBindings = existing;

  appAPI.aiGetConfig = typeof existing.aiGetConfig === 'function'
    ? function () { return existing.aiGetConfig(); }
    : function () { return loadConfig(); };

  appAPI.aiSetConfig = typeof existing.aiSetConfig === 'function'
    ? function (partial) { return existing.aiSetConfig(partial); }
    : function (partial) { return saveConfig(partial); };

  appAPI.aiGetPresets = function () {
    if (typeof existing.aiGetPresets !== 'function') return PRESETS;
    return Promise.resolve(existing.aiGetPresets()).then(function (base) {
      return Object.assign({}, PRESETS, base || {});
    }).catch(function () {
      return PRESETS;
    });
  };

  appAPI.aiCheck = typeof existing.aiCheck === 'function'
    ? function () { return existing.aiCheck(); }
    : function () {
      var c = loadConfig();
      if (c.format === 'ollama' || c.provider === 'ollama') {
        return checkOllama().then(function (res) {
          return res.ok ? Object.assign({}, res, { provider: 'ollama', model: c.model || (res.models && res.models[0]) }) : res;
        });
      }
      return testConnection(c).then(function (res) {
        return res.ok ? { ok: true, provider: c.provider, model: res.model || c.model, models: [c.model] } : { ok: false, error: res.error };
      });
    };

  appAPI.aiTestConnection = typeof existing.aiTestConnection === 'function'
    ? function (overrideConfig) { return existing.aiTestConnection(overrideConfig); }
    : function (overrideConfig) { return testConnection(overrideConfig || loadConfig()); };

  appAPI.aiChat = typeof existing.aiChat === 'function'
    ? function (params) { return existing.aiChat(params); }
    : function (params) {
      var msgs = params.messages || params;
      return chatWithMessages(Array.isArray(msgs) ? msgs : [msgs], loadConfig());
    };

  appAPI.aiGenerate = typeof existing.aiGenerate === 'function'
    ? function (params) { return existing.aiGenerate(params); }
    : function (params) {
      var prompt = params.prompt || params;
      return chatWithMessages([{ role: 'user', content: prompt }], loadConfig());
    };

  appAPI.aiCallLLM = function (params) {
    var p = params || {};
    var useMessages = Array.isArray(p.messages) && p.messages.length > 0;
    if (useMessages && typeof existing.aiChat === 'function' && !p.onLog) {
      var startedMulti = Date.now();
      var cfgPromiseM = typeof appAPI.aiGetConfig === 'function' ? appAPI.aiGetConfig() : loadConfig();
      return Promise.resolve(cfgPromiseM).then(function (cfgNow) {
        return Promise.resolve(existing.aiChat({ messages: p.messages })).then(function (res) {
          if (!res || !res.ok) return res || { ok: false, error: 'LLM call failed' };
          return {
            ok: true,
            content: res.content || res.response || '',
            usage: res.usage || null,
            elapsed: Date.now() - startedMulti,
            model: res.model || cfgNow?.model || '',
          };
        });
      });
    }
    if (typeof existing.aiCallLLM === 'function') {
      return existing.aiCallLLM(p);
    }
    if (typeof existing.aiChat === 'function' && !p.onLog) {
      var started = Date.now();
      var cfgPromise = typeof appAPI.aiGetConfig === 'function' ? appAPI.aiGetConfig() : loadConfig();
      return Promise.resolve(cfgPromise).then(function (cfgNow) {
        var messages = [
          { role: 'system', content: p.systemPrompt || '' },
          { role: 'user', content: p.userMessage || p.query || '' },
        ];
        return Promise.resolve(existing.aiChat({ messages: messages })).then(function (res) {
          if (!res || !res.ok) return res || { ok: false, error: 'LLM call failed' };
          return {
            ok: true,
            content: res.content || res.response || '',
            usage: res.usage || null,
            elapsed: Date.now() - started,
            model: res.model || cfgNow?.model || '',
          };
        });
      });
    }
    return callLLM(
      p.config || loadConfig(),
      p.systemPrompt || '',
      p.userMessage || p.query || '',
      p.onLog || null
    );
  };

  appAPI.aiExtendedSearch = function (params) {
    var p = params || {};
    if (typeof existing.aiExtendedSearch === 'function') {
      return existing.aiExtendedSearch(p);
    }
    return runExtendedSearch(p.query || '', appAPI, {
      topK: p.topK || loadConfig().topK,
      minRelevance: p.minRelevance || loadConfig().minRelevance,
    });
  };

  appAPI.aiGetCostSummary = typeof existing.aiGetCostSummary === 'function'
    ? function (calls) { return existing.aiGetCostSummary(calls); }
    : function (calls) { return formatCostSummary(calls); };

  appAPI.ollamaCheck = typeof existing.ollamaCheck === 'function'
    ? function () { return existing.ollamaCheck(); }
    : function () { return checkOllama(); };

  appAPI.ollamaGenerate = typeof existing.ollamaGenerate === 'function'
    ? function (params) { return existing.ollamaGenerate(params); }
    : function (params) {
      var c = loadConfig();
      var model = params.model || c.model || 'llama3.2';
      return httpViaFetch('http://localhost:11434/api/generate', 'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ model: model, prompt: params.prompt || '', stream: false })
      ).then(function (res) {
        if (!res.ok) return { ok: false, error: 'Ollama returned ' + res.status };
        var data = JSON.parse(res.body);
        return { ok: true, response: data.response || '' };
      }).catch(function (err) {
        return { ok: false, error: err.message || 'Generation failed' };
      });
    };

  appAPI.aiIsAgentic = typeof existing.aiIsAgentic === 'function'
    ? function () { return existing.aiIsAgentic(); }
    : function () { return false; };

  if (window.electronAPI && window.electronAPI !== appAPI) {
    var aiKeys = ['aiCheck', 'aiChat', 'aiGenerate', 'aiCallLLM', 'aiTestConnection',
      'aiGetConfig', 'aiSetConfig', 'aiGetPresets', 'aiExtendedSearch', 'aiGetCostSummary',
      'aiIsAgentic', 'ollamaCheck', 'ollamaGenerate'];
    aiKeys.forEach(function (key) { window.electronAPI[key] = appAPI[key]; });
  }

  console.log('[AI] Service ready. Provider: ' + cfg.provider + ', Model: ' + cfg.model);
}

function destroy(appAPI) {
  var aiKeys = ['aiCheck', 'aiChat', 'aiGenerate', 'aiCallLLM', 'aiTestConnection',
    'aiGetConfig', 'aiSetConfig', 'aiGetPresets', 'aiExtendedSearch', 'aiGetCostSummary',
    'aiIsAgentic', 'ollamaCheck', 'ollamaGenerate'];
  aiKeys.forEach(function (key) {
    var prev = _previousApiBindings && _previousApiBindings[key];
    if (typeof prev === 'function') {
      appAPI[key] = prev;
      if (window.electronAPI && window.electronAPI !== appAPI) window.electronAPI[key] = prev;
    } else {
      delete appAPI[key];
      if (window.electronAPI && window.electronAPI !== appAPI) delete window.electronAPI[key];
    }
  });
  _previousApiBindings = null;
  _config = null;
  console.log('[AI] Service destroyed.');
}

module.exports = { init: init, destroy: destroy };
