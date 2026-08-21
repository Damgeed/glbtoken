(function () {
  'use strict';

  var state = {
    models: [],
    presets: [],
    conversations: [],
    messages: [],
    currentId: null,
    processing: false,
    dirty: false,
    error: '',
    codeTab: 'python'
  };

  function byId(id) { return document.getElementById(id); }
  function value(id) { var el = byId(id); return el ? el.value : ''; }
  function numberValue(id, fallback) {
    var n = Number(value(id));
    return Number.isFinite(n) ? n : fallback;
  }
  function setText(id, text) { var el = byId(id); if (el) el.textContent = text; }

  function cleanMessage(message) {
    return {
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message && message.content != null ? message.content : '')
    };
  }

  function selectedModel() {
    return value('modelSelect');
  }

  function selectedFallbacks() {
    var values = [value('pgFallbackOne'), value('pgFallbackTwo')];
    var primary = selectedModel();
    var seen = {};
    var result = [];
    values.forEach(function (model) {
      if (model && model !== primary && !seen[model]) {
        seen[model] = true;
        result.push(model);
      }
    });
    return result;
  }

  function modelById(modelId) {
    for (var i = 0; i < state.models.length; i++) {
      if (state.models[i].model_id === modelId) return state.models[i];
    }
    return null;
  }

  function modelLabel(model) {
    if (!model) return 'Unknown model';
    var name = model.name || model.model_id;
    return name + (model.provider ? ' · ' + model.provider : '');
  }

  function compactNumber(n) {
    n = Number(n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return n ? n.toLocaleString() : '—';
  }

  function money(n) {
    n = Number(n || 0);
    if (!n) return '$0.00';
    return '$' + n.toLocaleString(undefined, {
      minimumFractionDigits: n < 0.01 ? 6 : 2,
      maximumFractionDigits: n < 0.01 ? 6 : 4
    });
  }

  function relativeTime(iso) {
    if (!iso) return 'Saved run';
    var time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return 'Saved run';
    var seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function addModelOptions(select, includeEmpty) {
    if (!select) return;
    var previous = select.value;
    select.textContent = '';
    if (includeEmpty) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = includeEmpty;
      select.appendChild(none);
    }
    var groups = {};
    state.models.forEach(function (model) {
      var provider = model.provider || 'Other';
      if (!groups[provider]) {
        groups[provider] = document.createElement('optgroup');
        groups[provider].label = provider;
        select.appendChild(groups[provider]);
      }
      var option = document.createElement('option');
      option.value = model.model_id;
      option.textContent = model.name || model.model_id;
      option.title = model.model_id;
      groups[provider].appendChild(option);
    });
    if (previous && modelById(previous)) select.value = previous;
  }

  async function loadModels() {
    var status = byId('pgCatalogStatus');
    try {
      var models = await api('GET', '/api/playground/models');
      state.models = Array.isArray(models) ? models : [];
      var primary = byId('modelSelect');
      addModelOptions(primary, '');
      primary.disabled = !state.models.length;
      addModelOptions(byId('pgFallbackOne'), 'No fallback');
      addModelOptions(byId('pgFallbackTwo'), 'No second fallback');
      if (state.models.length) {
        status.textContent = state.models.length.toLocaleString() + ' live models';
        status.className = 'pg-status ready';
      } else {
        status.textContent = 'No active models';
        status.className = 'pg-status error';
      }
    } catch (error) {
      state.models = [];
      status.textContent = 'Catalog unavailable';
      status.className = 'pg-status error';
      showToast(error.message || 'Could not load the model catalog', 'error');
    }
  }

  async function loadPresets() {
    try {
      var presets = await api('GET', '/api/presets');
      state.presets = Array.isArray(presets) ? presets : [];
      var select = byId('pgPresetSelect');
      select.textContent = '';
      var custom = document.createElement('option');
      custom.value = '';
      custom.textContent = 'Custom configuration';
      select.appendChild(custom);
      state.presets.forEach(function (preset) {
        var option = document.createElement('option');
        option.value = String(preset.id);
        option.textContent = preset.name + ' · ' + preset.model;
        select.appendChild(option);
      });
    } catch (error) {
      state.presets = [];
    }
  }

  async function loadConversations() {
    try {
      var conversations = await api('GET', '/api/playground/conversations');
      state.conversations = Array.isArray(conversations) ? conversations : [];
    } catch (error) {
      state.conversations = [];
    }
    renderConversationList();
  }

  function renderConversationList() {
    var list = byId('pgConversationList');
    if (!list) return;
    list.textContent = '';
    if (!state.conversations.length) {
      var empty = document.createElement('div');
      empty.className = 'pg-history-empty';
      empty.textContent = 'No saved runs yet. Your first successful response will appear here.';
      list.appendChild(empty);
      return;
    }
    state.conversations.forEach(function (conversation) {
      var item = document.createElement('div');
      item.className = 'pg-history-item' + (Number(conversation.id) === Number(state.currentId) ? ' active' : '');

      var main = document.createElement('div');
      main.className = 'pg-history-main';
      main.tabIndex = 0;
      main.setAttribute('role', 'button');
      var title = document.createElement('span');
      title.className = 'pg-history-title';
      title.textContent = conversation.title || 'Untitled run';
      var meta = document.createElement('span');
      meta.className = 'pg-history-meta';
      meta.textContent = (conversation.message_count || 0) + ' messages · ' + relativeTime(conversation.updated_at);
      main.appendChild(title);
      main.appendChild(meta);
      main.addEventListener('click', function () { openConversation(conversation.id); });
      main.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openConversation(conversation.id);
        }
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'pg-history-delete';
      remove.textContent = '×';
      remove.title = 'Delete run';
      remove.setAttribute('aria-label', 'Delete ' + (conversation.title || 'run'));
      remove.addEventListener('click', function () { deleteConversation(conversation.id); });

      item.appendChild(main);
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  function starter(title, description, prompt) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'pg-starter';
    var strong = document.createElement('strong');
    strong.textContent = title;
    var span = document.createElement('span');
    span.textContent = description;
    button.appendChild(strong);
    button.appendChild(span);
    button.addEventListener('click', function () {
      var input = byId('chatInput');
      input.value = prompt;
      resizeInput();
      updateWorkbench();
      input.focus();
    });
    return button;
  }

  function renderEmpty(chat) {
    var shell = document.createElement('div');
    shell.className = 'pg-empty';
    var inner = document.createElement('div');
    inner.className = 'pg-empty-inner';
    var badge = document.createElement('span');
    badge.className = 'pg-empty-badge';
    badge.textContent = 'Live gateway request';
    var heading = document.createElement('h2');
    heading.textContent = 'Test the route before you ship it.';
    var copy = document.createElement('p');
    copy.textContent = 'Choose any active model, tune the request, and add ordered fallbacks. Successful runs use your real balance and appear in account-scoped logs.';
    var starters = document.createElement('div');
    starters.className = 'pg-starters';
    starters.appendChild(starter('Extract structured data', 'Turn unstructured text into a clean JSON object.', 'Extract the key entities from this text and return valid JSON with no markdown.\n\nText: '));
    starters.appendChild(starter('Review a function', 'Find correctness, security, and performance issues.', 'Review this function. Prioritize correctness and security, then suggest a minimal patch:\n\n'));
    starters.appendChild(starter('Compare a decision', 'Build a concise trade-off table with a recommendation.', 'Compare these options in a concise table, state your assumptions, and recommend one:\n\n'));
    starters.appendChild(starter('Draft an API response', 'Create an OpenAI-compatible response contract.', 'Design a JSON response contract for this API endpoint, including success and error examples:\n\n'));
    inner.appendChild(badge);
    inner.appendChild(heading);
    inner.appendChild(copy);
    inner.appendChild(starters);
    shell.appendChild(inner);
    chat.appendChild(shell);
  }

  function appendMessage(chat, message, index) {
    var role = message.role === 'assistant' ? 'assistant' : 'user';
    var row = document.createElement('article');
    row.className = 'pg-message ' + role;
    var avatar = document.createElement('div');
    avatar.className = 'pg-message-avatar';
    avatar.textContent = role === 'assistant' ? 'GT' : 'YOU';
    var body = document.createElement('div');
    body.className = 'pg-message-body';
    var label = document.createElement('div');
    label.className = 'pg-message-label';
    var labelText = document.createElement('span');
    labelText.textContent = role === 'assistant' ? (message._meta && message._meta.model || 'Assistant') : 'You';
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'pg-message-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', function () { copyText(message.content, copy); });
    label.appendChild(labelText);
    label.appendChild(copy);
    var content = document.createElement('div');
    content.className = 'pg-message-content';
    content.textContent = message.content;
    body.appendChild(label);
    body.appendChild(content);

    if (role === 'assistant' && message._meta) {
      var meta = document.createElement('div');
      meta.className = 'pg-message-meta';
      var values = [];
      if (message._meta.tokens != null) values.push(Number(message._meta.tokens).toLocaleString() + ' charged tokens');
      if (message._meta.seconds != null) values.push(message._meta.seconds + 's');
      if (message._meta.balance != null) values.push(Number(message._meta.balance).toLocaleString() + ' GT left');
      values.forEach(function (item) {
        var chip = document.createElement('span');
        chip.textContent = item;
        meta.appendChild(chip);
      });
      if (message._meta.fallback) {
        var fallback = document.createElement('span');
        fallback.className = 'fallback';
        fallback.textContent = 'Fallback used';
        meta.appendChild(fallback);
      }
      body.appendChild(meta);
    }

    row.appendChild(avatar);
    row.appendChild(body);
    row.dataset.index = String(index);
    chat.appendChild(row);
  }

  function renderChat() {
    var chat = byId('chatMessages');
    chat.textContent = '';
    if (!state.messages.length && !state.processing && !state.error) renderEmpty(chat);
    state.messages.forEach(function (message, index) { appendMessage(chat, message, index); });
    if (state.processing) {
      var pending = document.createElement('article');
      pending.className = 'pg-message assistant pg-pending';
      var avatar = document.createElement('div');
      avatar.className = 'pg-message-avatar';
      avatar.textContent = 'GT';
      var body = document.createElement('div');
      body.className = 'pg-message-body';
      var label = document.createElement('div');
      label.className = 'pg-message-label';
      label.textContent = 'Routing request…';
      var content = document.createElement('div');
      content.className = 'pg-message-content';
      content.innerHTML = '<i></i><i></i><i></i>';
      body.appendChild(label);
      body.appendChild(content);
      pending.appendChild(avatar);
      pending.appendChild(body);
      chat.appendChild(pending);
    }
    if (state.error) {
      var error = document.createElement('div');
      error.className = 'pg-error';
      error.textContent = state.error;
      chat.appendChild(error);
    }
    requestAnimationFrame(function () { chat.scrollTop = chat.scrollHeight; });
  }

  function buildMessages(includeDraft) {
    var messages = [];
    var system = value('pgSystemPrompt').trim();
    if (system) messages.push({ role: 'system', content: system });
    state.messages.forEach(function (message) { messages.push(cleanMessage(message)); });
    var draft = value('chatInput').trim();
    if (includeDraft && draft) messages.push({ role: 'user', content: draft });
    return messages;
  }

  function buildPayload(includeDraft) {
    return {
      model: selectedModel(),
      models: selectedFallbacks(),
      messages: buildMessages(includeDraft),
      temperature: numberValue('pgTemperature', 0.7),
      max_tokens: Math.max(1, Math.min(4096, Math.round(numberValue('pgMaxTokens', 2048)))),
      top_p: numberValue('pgTopP', 1),
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: false
    };
  }

  function extractResponseText(data) {
    var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (Array.isArray(content)) {
      return content.map(function (part) { return typeof part === 'string' ? part : (part && part.text) || ''; }).join('\n');
    }
    if (content != null) return String(content);
    if (data && data.response != null) return String(data.response);
    return 'The gateway returned an empty response.';
  }

  async function sendMessage() {
    var input = byId('chatInput');
    var prompt = input.value.trim();
    if (!prompt || state.processing || !selectedModel()) return;
    state.messages.push({ role: 'user', content: prompt });
    state.error = '';
    state.processing = true;
    state.dirty = true;
    input.value = '';
    resizeInput();
    updateWorkbench();
    renderChat();
    var payload = buildPayload(false);
    var started = Date.now();
    try {
      var data = await api('POST', '/api/playground/chat', payload, 120000);
      var selected = data.selected_model || data.model || payload.model;
      state.messages.push({
        role: 'assistant',
        content: extractResponseText(data),
        _meta: {
          model: selected,
          tokens: data.tokens_used,
          balance: data.balance_remaining,
          seconds: ((Date.now() - started) / 1000).toFixed(2),
          fallback: !!data.fallback_used
        }
      });
      state.processing = false;
      state.dirty = true;
      renderChat();
      updateWorkbench();
      await saveConversation(true);
    } catch (error) {
      state.processing = false;
      state.error = error && error.message ? error.message : 'The request could not be completed.';
      renderChat();
      updateWorkbench();
    }
    if (window.innerWidth > 780) input.focus();
  }

  function conversationTitle() {
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].role === 'user' && state.messages[i].content) {
        var title = state.messages[i].content.replace(/\s+/g, ' ').trim();
        return title.length > 58 ? title.slice(0, 57) + '…' : title;
      }
    }
    return 'New run';
  }

  function conversationBody() {
    return {
      title: conversationTitle(),
      messages: buildMessages(false),
      model: selectedModel()
    };
  }

  async function saveConversation(silent) {
    if (!state.messages.length || state.processing) {
      if (!silent) showToast('Run a prompt before saving this workspace.', 'info');
      return;
    }
    var button = byId('pgSaveButton');
    var oldText = button.textContent;
    button.textContent = 'Saving…';
    button.disabled = true;
    try {
      var method = state.currentId ? 'PUT' : 'POST';
      var path = '/api/playground/conversations' + (state.currentId ? '/' + state.currentId : '');
      var saved = await api(method, path, conversationBody());
      state.currentId = saved.id;
      state.dirty = false;
      var found = false;
      state.conversations = state.conversations.map(function (conversation) {
        if (Number(conversation.id) === Number(saved.id)) { found = true; return saved; }
        return conversation;
      });
      if (!found) state.conversations.unshift(saved);
      state.conversations.sort(function (a, b) {
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      });
      renderConversationList();
      if (!silent) showToast('Run saved', 'success');
      button.textContent = 'Saved';
      setTimeout(function () { button.textContent = 'Save run'; }, 1200);
    } catch (error) {
      button.textContent = oldText;
      if (!silent) showToast(error.message || 'Could not save this run', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function openConversation(id) {
    if (state.processing) return;
    if (state.dirty && !window.confirm('Open another run and discard unsaved changes?')) return;
    try {
      var conversation = await api('GET', '/api/playground/conversations/' + id);
      state.currentId = conversation.id;
      state.error = '';
      state.dirty = false;
      var messages = Array.isArray(conversation.messages) ? conversation.messages.slice() : [];
      var system = '';
      if (messages.length && messages[0] && messages[0].role === 'system') {
        system = String(messages.shift().content || '');
      }
      byId('pgSystemPrompt').value = system;
      state.messages = messages.filter(function (message) {
        return message && (message.role === 'user' || message.role === 'assistant');
      }).map(cleanMessage);
      if (conversation.model && modelById(conversation.model)) byId('modelSelect').value = conversation.model;
      renderConversationList();
      renderChat();
      updateWorkbench();
    } catch (error) {
      showToast(error.message || 'Could not open this run', 'error');
    }
  }

  async function deleteConversation(id) {
    if (!window.confirm('Delete this saved run? This cannot be undone.')) return;
    try {
      await api('DELETE', '/api/playground/conversations/' + id);
      state.conversations = state.conversations.filter(function (conversation) { return Number(conversation.id) !== Number(id); });
      if (Number(state.currentId) === Number(id)) resetConversation(false);
      renderConversationList();
      showToast('Run deleted', 'success');
    } catch (error) {
      showToast(error.message || 'Could not delete this run', 'error');
    }
  }

  function resetConversation(checkDirty) {
    if (state.processing) return;
    if (checkDirty && state.dirty && !window.confirm('Start a new run and discard unsaved changes?')) return;
    state.currentId = null;
    state.messages = [];
    state.error = '';
    state.dirty = false;
    byId('chatInput').value = '';
    renderConversationList();
    renderChat();
    resizeInput();
    updateWorkbench();
    byId('chatInput').focus();
  }

  function clearMessages() {
    if (!state.messages.length || state.processing) return;
    if (!window.confirm('Clear the messages in this run?')) return;
    state.messages = [];
    state.error = '';
    state.dirty = true;
    renderChat();
    updateWorkbench();
  }

  function applyPreset(id, announce) {
    var preset = null;
    state.presets.forEach(function (candidate) { if (String(candidate.id) === String(id)) preset = candidate; });
    if (!preset) {
      if (announce) showToast('Choose a preset first', 'info');
      return;
    }
    if (preset.model && modelById(preset.model)) byId('modelSelect').value = preset.model;
    byId('pgSystemPrompt').value = preset.system_prompt || '';
    byId('pgTemperature').value = preset.temperature != null ? preset.temperature : 0.7;
    byId('pgTopP').value = preset.top_p != null ? preset.top_p : 1;
    byId('pgMaxTokens').value = preset.max_tokens || 2048;
    state.dirty = true;
    populateFallbacks();
    updateWorkbench();
    if (announce) showToast('Preset applied', 'success');
  }

  async function savePreset() {
    if (!selectedModel()) {
      showToast('Choose a model first', 'error');
      return;
    }
    var name = window.prompt('Name this preset');
    if (!name || !name.trim()) return;
    try {
      var preset = await api('POST', '/api/presets', {
        name: name.trim(),
        model: selectedModel(),
        system_prompt: value('pgSystemPrompt').trim() || null,
        temperature: numberValue('pgTemperature', 0.7),
        max_tokens: Math.max(1, Math.min(4096, Math.round(numberValue('pgMaxTokens', 2048)))),
        top_p: numberValue('pgTopP', 1)
      });
      state.presets.unshift(preset);
      await loadPresets();
      byId('pgPresetSelect').value = String(preset.id);
      showToast('Preset saved', 'success');
    } catch (error) {
      showToast(error.message || 'Could not save this preset', 'error');
    }
  }

  function populateFallbacks() {
    var one = byId('pgFallbackOne');
    var two = byId('pgFallbackTwo');
    var oneValue = one.value;
    var twoValue = two.value;
    addModelOptions(one, 'No fallback');
    addModelOptions(two, 'No second fallback');
    if (oneValue && oneValue !== selectedModel() && modelById(oneValue)) one.value = oneValue;
    if (twoValue && twoValue !== selectedModel() && twoValue !== one.value && modelById(twoValue)) two.value = twoValue;
  }

  function normalizeFallbacks(changed) {
    var primary = selectedModel();
    var one = byId('pgFallbackOne');
    var two = byId('pgFallbackTwo');
    if (one.value === primary) one.value = '';
    if (two.value === primary || (two.value && two.value === one.value)) {
      if (changed === two) showToast('Fallback models must be unique', 'info');
      two.value = '';
    }
    updateWorkbench();
  }

  function estimatedTokens(includeDraft) {
    var chars = 0;
    buildMessages(includeDraft).forEach(function (message) { chars += String(message.content || '').length; });
    return chars ? Math.max(1, Math.ceil(chars / 4)) : 0;
  }

  function updateModelCard() {
    var model = modelById(selectedModel());
    if (!model) {
      setText('pgModelProvider', '—');
      setText('pgModelName', 'Choose a model');
      return;
    }
    var inputTokens = estimatedTokens(true);
    var maxTokens = Math.max(1, Math.min(4096, Math.round(numberValue('pgMaxTokens', 2048))));
    var context = Number(model.context_length || 0);
    var percentage = context ? Math.min(100, ((inputTokens + maxTokens) / context) * 100) : 0;
    setText('pgModelProvider', model.provider || 'Other');
    setText('pgModelName', model.name || model.model_id);
    setText('pgModelContext', compactNumber(context));
    setText('pgModelInputPrice', money(Number(model.prompt_price || 0) * 1000000));
    setText('pgModelOutputPrice', money(Number(model.completion_price || 0) * 1000000));
    byId('pgContextFill').style.width = percentage.toFixed(2) + '%';
    setText('pgContextLabel', (inputTokens + maxTokens).toLocaleString() + ' / ' + (context ? context.toLocaleString() : 'unknown') + ' tokens at the configured ceiling');
  }

  function updateRoute() {
    var route = [selectedModel()].concat(selectedFallbacks()).filter(Boolean);
    var map = byId('pgRouteMap');
    map.textContent = '';
    route.forEach(function (model, index) {
      if (index) {
        var arrow = document.createElement('span');
        arrow.className = 'pg-route-arrow';
        arrow.textContent = '→';
        map.appendChild(arrow);
      }
      var chip = document.createElement('span');
      chip.className = 'pg-route-chip' + (index === 0 ? ' primary' : '');
      chip.textContent = model;
      chip.title = model;
      map.appendChild(chip);
    });
    setText('pgRouteSummary', route.length > 1 ? route.length + '-model fallback route' : 'Direct route');
  }

  function updateEstimates() {
    var inputTokens = estimatedTokens(true);
    setText('pgInputEstimate', '~' + inputTokens.toLocaleString() + ' input tokens');
    var model = modelById(selectedModel());
    if (!model) {
      setText('pgCostEstimate', 'Select a model for a cost ceiling');
      return;
    }
    var maxTokens = Math.max(1, Math.min(4096, Math.round(numberValue('pgMaxTokens', 2048))));
    var ceiling = inputTokens * Number(model.prompt_price || 0) + maxTokens * Number(model.completion_price || 0);
    setText('pgCostEstimate', 'Up to ' + money(ceiling) + ' catalog cost');
  }

  function updateWorkbench() {
    setText('pgTemperatureValue', numberValue('pgTemperature', 0.7).toFixed(1));
    setText('pgTopPValue', numberValue('pgTopP', 1).toFixed(2));
    setText('pgSystemCount', value('pgSystemPrompt').length.toLocaleString());
    byId('sendBtn').disabled = state.processing || !value('chatInput').trim() || !selectedModel();
    byId('pgSaveButton').textContent = state.dirty ? 'Save run' : (state.currentId ? 'Saved' : 'Save run');
    updateRoute();
    updateEstimates();
    updateModelCard();
    renderCode();
  }

  function codePayload() {
    var payload = buildPayload(true);
    if (!payload.messages.length) payload.messages = [{ role: 'user', content: 'Hello!' }];
    return payload;
  }

  function renderCode() {
    var output = byId('pgCodeOutput');
    if (!output) return;
    var payload = codePayload();
    var json = JSON.stringify(payload, null, 2);
    if (state.codeTab === 'json') {
      output.textContent = json;
      return;
    }
    if (state.codeTab === 'curl') {
      output.textContent = 'curl https://api.glbtoken.com/v1/chat/completions \\\n' +
        '  -H "Authorization: Bearer YOUR_GLBTOKEN_API_KEY" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        "  --data-binary @- <<'JSON'\n" + json + '\nJSON';
      return;
    }
    var pythonMessages = JSON.stringify(payload.messages, null, 4).replace(/^/gm, '    ');
    var fallbackLine = payload.models.length ? '    extra_body={"models": ' + JSON.stringify(payload.models) + '},\n' : '';
    output.textContent = 'from openai import OpenAI\n\n' +
      'client = OpenAI(\n' +
      '    base_url="https://api.glbtoken.com/v1",\n' +
      '    api_key="YOUR_GLBTOKEN_API_KEY",\n' +
      ')\n\n' +
      'response = client.chat.completions.create(\n' +
      '    model=' + JSON.stringify(payload.model) + ',\n' +
      '    messages=' + pythonMessages.trimStart() + ',\n' +
      '    temperature=' + payload.temperature + ',\n' +
      '    max_tokens=' + payload.max_tokens + ',\n' +
      '    top_p=' + payload.top_p + ',\n' +
      fallbackLine +
      '    stream=False,\n' +
      ')\n\n' +
      'print(response.choices[0].message.content)';
  }

  function toggleCode(open) {
    var drawer = byId('pgCodeDrawer');
    drawer.classList.toggle('open', typeof open === 'boolean' ? open : !drawer.classList.contains('open'));
    renderCode();
  }

  function toggleConfig(open) {
    var panel = byId('pgConfigPanel');
    var backdrop = byId('pgConfigBackdrop');
    var next = typeof open === 'boolean' ? open : !panel.classList.contains('open');
    panel.classList.toggle('open', next);
    backdrop.classList.toggle('open', next);
  }

  function copyText(text, button) {
    function done() {
      var original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = original; }, 1000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(text)).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var textarea = document.createElement('textarea');
    textarea.value = String(text);
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); done(); } catch (error) { showToast('Could not copy', 'error'); }
    textarea.remove();
  }

  function resizeInput() {
    var input = byId('chatInput');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  }

  function bindEvents() {
    byId('sendBtn').addEventListener('click', sendMessage);
    byId('chatInput').addEventListener('input', function () {
      if (this.value.trim()) state.dirty = true;
      resizeInput();
      updateWorkbench();
    });
    byId('chatInput').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    byId('modelSelect').addEventListener('change', function () {
      state.dirty = true;
      populateFallbacks();
      updateWorkbench();
    });
    ['pgTemperature', 'pgTopP', 'pgMaxTokens', 'pgSystemPrompt'].forEach(function (id) {
      byId(id).addEventListener('input', function () { updateWorkbench(); });
    });
    byId('pgFallbackOne').addEventListener('change', function () { normalizeFallbacks(this); });
    byId('pgFallbackTwo').addEventListener('change', function () { normalizeFallbacks(this); });
    byId('pgNewButton').addEventListener('click', function () { resetConversation(true); });
    byId('pgNewIcon').addEventListener('click', function () { resetConversation(true); });
    byId('pgSaveButton').addEventListener('click', function () { saveConversation(false); });
    byId('pgClearButton').addEventListener('click', clearMessages);
    byId('pgCodeButton').addEventListener('click', function () { toggleCode(true); });
    byId('pgCodeClose').addEventListener('click', function () { toggleCode(false); });
    byId('pgCopyCode').addEventListener('click', function () { copyText(byId('pgCodeOutput').textContent, this); });
    byId('pgCodeTabs').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-tab]');
      if (!button) return;
      state.codeTab = button.dataset.tab;
      this.querySelectorAll('button').forEach(function (candidate) { candidate.classList.toggle('active', candidate === button); });
      renderCode();
    });
    byId('pgApplyPreset').addEventListener('click', function () { applyPreset(value('pgPresetSelect'), true); });
    byId('pgSavePreset').addEventListener('click', savePreset);
    byId('pgConfigToggle').addEventListener('click', function () { toggleConfig(true); });
    byId('pgConfigClose').addEventListener('click', function () { toggleConfig(false); });
    byId('pgConfigBackdrop').addEventListener('click', function () { toggleConfig(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { toggleConfig(false); toggleCode(false); }
    });
  }

  async function init() {
    bindEvents();
    renderChat();
    await Promise.all([loadModels(), loadPresets(), loadConversations()]);
    populateFallbacks();
    var presetId = new URLSearchParams(window.location.search).get('preset');
    if (presetId) {
      byId('pgPresetSelect').value = presetId;
      applyPreset(presetId, false);
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', 'playground.html');
    }
    updateWorkbench();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
