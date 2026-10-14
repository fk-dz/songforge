/* SONGFORGE · FATYAK · Public ACE-Step 1.5 adapter.
   No paid keys, optional session-only HF identity token, no synthetic fallback.
   The provider controls availability, authentication and GPU quotas. */
(function (root) {
  'use strict';
  const HOST = 'https://ace-step-ace-step-v1-5.hf.space';
  const PAGE = 'https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5';
  const MAX_BYTES = 64 * 1024 * 1024;
  let cached = null;
  let sessionToken = ''; // Memory only. Never included in URLs, preferences, history or logs.
  function setToken(value) {
    const token = String(value || '').trim();
    sessionToken = /^hf_[A-Za-z0-9]{10,180}$/.test(token) ? token : '';
    return !!sessionToken;
  }
  function authHeaders(input) {
    const headers = new Headers(input || {});
    if (sessionToken) headers.set('Authorization', 'Bearer ' + sessionToken);
    return headers;
  }

  class CloudError extends Error {
    constructor(message, code = 'provider', detail = '') {
      super(message); this.name = 'CloudError'; this.code = code; this.detail = String(detail).replace(/hf_[A-Za-z0-9]{10,180}/g, '[redacted]').slice(0, 1800);
    }
  }
  const aborted = () => new DOMException('Aborted', 'AbortError');
  const textOf = x => typeof x === 'string' ? x : x ? JSON.stringify(x) : '';
  function friendly(error) {
    if (error?.name === 'AbortError') return { code: 'cancelled', message: 'توقفت متابعة الطلب.', detail: '' };
    if (error instanceof CloudError) return error;
    const d = textOf(error?.message || error);
    if (/quota|exceed|rate.?limit|too many|429/i.test(d)) return new CloudError('الحصة المجانية غير متاحة الآن. انتظر تجددها، أو افتح الخدمة الرسمية لمعرفة حصة حسابك.', 'quota', d);
    if (/sign.?in|log.?in|authenticat|unauthoriz|forbidden|\b401\b|\b403\b/i.test(d)) return new CloudError('طلب المزود تسجيل الدخول أو رفض التوليد المجهول. استخدم الاستوديو الرسمي أو رمزًا محدودًا في خيار حسابك. لا نطلب كلمة مرورك.', 'auth', d);
    if (/queue.*full|queue is full/i.test(d)) return new CloudError('طابور الخدمة ممتلئ. حاول لاحقًا بدل إرسال طلبات متكررة.', 'queue', d);
    if (/failed to fetch|network|load failed|fetch failed|cors/i.test(d)) return new CloudError('تعذر الاتصال بخدمة التوليد. تحقق من الإنترنت، أو افتح الموقع الرسمي إن كان المتصفح يحجب الاتصال.', 'network', d);
    if (/GPU|CUDA|resource|capacity|sleep|unavailable|503|502|504/i.test(d)) return new CloudError('حوسبة المزود غير متاحة حاليًا أو حدث عطل لديه. لا توجد نتيجة صوتية مكتملة؛ جرّب لاحقًا.', 'unavailable', d);
    return new CloudError('لم يكتمل التوليد لدى المزود. لم نبدّل النتيجة بصوت آلي أو موسيقى مبرمجة.', 'provider', d);
  }
  async function http(path, options = {}, timeout = 25000) {
    const controller = new AbortController();
    const parent = options.signal;
    const onAbort = () => controller.abort();
    if (parent?.aborted) throw aborted();
    parent?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = timeout ? setTimeout(() => { timedOut = true; controller.abort(); }, timeout) : null;
    try {
      const response = await fetch(HOST + path, { ...options, headers: authHeaders(options.headers), signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw friendly(new Error('HTTP ' + response.status + ': ' + (await response.text()).slice(0, 1000)));
      return response;
    } catch (e) {
      if (timedOut) throw new CloudError('خدمة التوليد لا تستجيب في الوقت المتوقع. جرّب فحص الاتصال أو افتح الموقع الرسمي.', 'network');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    }
  }
  function choiceValues(c) {
    return (c?.props?.choices || []).map(x => Array.isArray(x) ? x[1] : x);
  }
  async function inspect(signal, force = false) {
    if (!force && cached && Date.now() - cached.time < 300000) return cached;
    const config = await (await http('/config', { signal })).json();
    const components = new Map(config.components.map(c => [c.id, c]));
    const dep = config.dependencies.find(d => d.api_name === 'generation_wrapper' && d.backend_fn);
    if (!dep) throw new CloudError('تغيّرت واجهة المزود. افتح الاستوديو الرسمي إلى حين تحديث الربط.', 'schema');
    const inputs = dep.inputs.map(id => components.get(id));
    if (inputs.some(x => !x) || !inputs.some(c => /^lyrics$/i.test(c.props?.label || '')) || !inputs.some(c => /^(prompt|caption)$/i.test(c.props?.label || ''))) {
      throw new CloudError('بنية خدمة التوليد غير متوافقة مع هذا الإصدار. لن نرسل طلبًا بمعاملات خاطئة.', 'schema');
    }
    cached = { config, components, dep, inputs, prefix: config.api_prefix || '/gradio_api', time: Date.now() };
    return cached;
  }
  function prepare(spec, cfg) {
    let selectedModel = '';
    // Official 6.2 UI has three unlabeled CoT toggles immediately after LM Negative Prompt.
    // Validate this shape before changing them; Thinking=false alone does NOT disable the LM.
    const negativeAt = spec.inputs.findIndex(c => /^lm negative prompt$/i.test(c.props?.label || ''));
    const cotAt = negativeAt + 1;
    const cotShape = negativeAt >= 0 && [0, 1, 2].every(i => spec.inputs[cotAt + i]?.type === 'checkbox' && spec.inputs[cotAt + i]?.props?.visible === false && !spec.inputs[cotAt + i]?.props?.label) && spec.inputs[cotAt + 3]?.type === 'state';
    const data = spec.inputs.map((c, index) => {
      if (c.type === 'state') return null; // Server-owned Gradio session state.
      if (cotShape && index >= cotAt && index < cotAt + 3) return !!cfg.thinking;
      const p = c.props || {}, label = (p.label || '').trim().toLowerCase();
      const choices = choiceValues(c);
      if (label === 'models' || label === 'model') {
        selectedModel = choices.find(x => cfg.quality === 'fast' ? x === 'acestep-v15-turbo' : x === 'acestep-v15-xl-turbo') || p.value;
        if (!selectedModel || !choices.includes(selectedModel)) throw new CloudError('النموذج المطلوب غير متاح لدى المزود.', 'schema');
        return selectedModel;
      }
      if (c.type === 'radio' && choices.includes('custom')) return 'custom';
      if (label === 'song description') return '';
      if (label === 'prompt' || label === 'caption') return cfg.prompt;
      if (label === 'lyrics') return cfg.lyrics;
      if (/^vocal language/.test(label)) return cfg.lang || 'ar';
      if (/^bpm/.test(label)) return cfg.tempo;
      if (/^audio duration/.test(label)) {
        if (p.maximum && cfg.duration > p.maximum) throw new CloudError('مدة الأغنية تتجاوز حد المزود الحالي: ' + p.maximum + ' ثانية.', 'duration');
        return cfg.duration;
      }
      if (label === 'batch size') return 1;
      if (label === 'audio format') return choices.includes('mp3') ? 'mp3' : (p.value || choices[0]);
      if (label === 'dit inference steps') return 8;
      if (label === 'thinking') return !!cfg.thinking;
      if (label === 'get scores' || label === 'get lrc') return false; // Optional secondary tasks consume extra compute.
      if (label === 'random seed') return !cfg.seed;
      if (label === 'seed') return cfg.seed ? String(cfg.seed) : '-1';
      if (/reference audio|source audio/.test(label)) return null;
      if (label === 'audio codes') return '';
      return p.value ?? null;
    });
    return { data, model: selectedModel || 'ACE-Step 1.5' };
  }
  async function readEvents(body, handle, signal) {
    if (!body?.getReader) throw new CloudError('متصفحك لا يدعم اتصال التوليد المتدفق. افتح الصفحة في Chrome أو افتح الاستوديو الرسمي.', 'browser');
    const reader = body.getReader(), decoder = new TextDecoder();
    let pending = '';
    const cancel = () => reader.cancel().catch(() => {});
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        if (signal?.aborted) throw aborted();
        const { value, done } = await reader.read();
        if (signal?.aborted) throw aborted();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        pending = pending.replace(/\r\n/g, '\n');
        let end;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, end); pending = pending.slice(end + 2);
          const payload = event.split('\n').filter(s => s.startsWith('data:')).map(s => s.slice(5).trimStart()).join('\n');
          if (payload) {
            let item;
            try { item = JSON.parse(payload); } catch (_) { continue; }
            if (handle(item) === true) { await reader.cancel(); return; }
          }
        }
        if (done) break;
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      reader.releaseLock();
    }
  }
  function unwrap(x) { return x && x.__type__ === 'update' ? x.value : x; }
  function audioFile(spec, values) {
    for (let i = 0; i < spec.dep.outputs.length; i++) {
      if (spec.components.get(spec.dep.outputs[i])?.type !== 'audio') continue;
      const f = unwrap(values[i]);
      if (f?.url || f?.path) return f;
    }
    return null;
  }
  function audioURL(file, prefix) {
    if (file.url) {
      const u = new URL(file.url, HOST);
      if (u.origin === HOST && /^https:$/.test(u.protocol)) return u.href;
    }
    if (file.path && !/^https?:/i.test(file.path)) return HOST + prefix + '/file=' + encodeURIComponent(file.path);
    throw new CloudError('أعاد المزود رابط صوت غير متوقع؛ لم نقم بفتحه.', 'schema');
  }
  async function cancelRemote(job) {
    if (!job?.eventId) return;
    try {
      await http(job.prefix + '/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: job.eventId, session_hash: job.session, fn_index: job.fn })
      }, 8000);
    } catch (_) { /* Provider cancellation is best effort. Never claim the remote GPU stopped. */ }
  }
  async function generate(cfg, { signal: parent, onStatus = () => {}, onJob = () => {}, timeout = 480000 } = {}) {
    const controller = new AbortController();
    const relay = () => controller.abort();
    if (parent?.aborted) throw aborted();
    parent?.addEventListener('abort', relay, { once: true });
    let expired = false, job = null;
    const timer = setTimeout(() => { expired = true; controller.abort(); }, timeout);
    const signal = controller.signal;
    try {
      onStatus({ phase: 'connecting', text: 'الاتصال بمحرك الذكاء الاصطناعي…' });
      const spec = await inspect(signal);
      const args = prepare(spec, cfg);
      const session = (root.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()).replace(/-/g, '').slice(0, 20);
      onStatus({ phase: 'sending', text: 'إرسال الكلمات والوصف إلى المزود…', model: args.model });
      const response = await (await http(spec.prefix + '/queue/join', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: args.data, fn_index: spec.dep.id, session_hash: session, trigger_id: null })
      })).json();
      if (!response.event_id) throw friendly(new Error(textOf(response.detail || response.error || response)));
      job = { eventId: response.event_id, session, fn: spec.dep.id, prefix: spec.prefix };
      onJob(job);
      const stream = await http(spec.prefix + '/queue/data?session_hash=' + encodeURIComponent(session), { signal }, 0);
      let completed = null, remoteError = null, lastLog = '';
      await readEvents(stream.body, msg => {
        if (msg.event_id && msg.event_id !== job.eventId) return false;
        switch (msg.msg) {
          case 'estimation':
            onStatus({ phase: 'queued', rank: msg.rank, text: Number.isFinite(msg.rank) ? 'في طابور المزود — ترتيبك ' + (msg.rank + 1) : 'في انتظار حوسبة مجانية…', eta: msg.rank_eta }); break;
          case 'process_starts':
            onStatus({ phase: 'generating', text: 'بدأ المزود توليد الغناء والموسيقى معًا…' }); break;
          case 'progress': {
            const p = msg.progress_data?.find(x => x.desc) || msg.progress_data?.[0];
            onStatus({ phase: 'generating', text: 'التوليد جارٍ لدى المزود…', detail: p?.desc || '' }); break;
          }
          case 'log': lastLog = textOf(msg.log || msg.message); break;
          case 'process_completed':
            if (msg.success && msg.output?.data) completed = msg.output.data;
            else remoteError = friendly(new Error(textOf(msg.output?.error || msg.error || lastLog || 'Provider returned no completed audio.')));
            return true;
          case 'queue_full': remoteError = new CloudError('طابور الخدمة ممتلئ. حاول لاحقًا.', 'queue'); return true;
          case 'unexpected_error': case 'server_stopped':
            remoteError = friendly(new Error(textOf(msg.message || msg.error || 'GPU unavailable'))); return true;
          case 'close_stream': return true;
        }
        return false;
      }, signal);
      if (remoteError) throw remoteError;
      if (!completed) throw new CloudError('انقطع الاتصال قبل وصول نتيجة مكتملة. قد يستمر الطلب عند المزود؛ لا تكرر الإرسال مباشرة.', 'incomplete');
      const file = audioFile(spec, completed);
      if (!file) {
        const notices = completed.filter(v => typeof v === 'string' && /error|quota|fail|GPU|invalid/i.test(v)).join('\n');
        throw friendly(new Error(notices || 'Provider completed without an audio file.'));
      }
      const url = audioURL(file, spec.prefix);
      onStatus({ phase: 'downloading', text: 'وصلت النتيجة — تنزيل ملف الغناء والموسيقى…' });
      const res = await fetch(url, { signal, headers: authHeaders(), credentials: 'omit' });
      if (!res.ok) throw friendly(new Error('HTTP ' + res.status + ' while downloading audio'));
      if (+res.headers.get('content-length') > MAX_BYTES) throw new CloudError('الملف أكبر من حد الأمان للهاتف (64 MB). اختر مدة أقصر.', 'size');
      const blob = await res.blob();
      if (blob.size < 128 || blob.size > MAX_BYTES || /text\/|application\/json/.test(blob.type)) throw new CloudError('لم يُعد المزود ملفًا صوتيًا صالحًا بالحجم المتوقع.', 'audio');
      const ext = (/\.(mp3|wav|flac|ogg|m4a)(?:$|\?)/i.exec(file.orig_name || file.path || url) || [])[1]?.toLowerCase() || 'mp3';
      return { blob, ext, model: args.model, seed: String(unwrap(completed[11]) || ''), provider: 'ACE-Step 1.5', url };
    } catch (e) {
      if (signal.aborted) {
        void cancelRemote(job);
        if (expired) throw new CloudError('انتهت مهلة الانتظار (8 دقائق). قد يستمر الطلب لدى المزود. افتح الاستوديو الرسمي أو حاول لاحقًا، ولا تُرسل طلبات متكررة.', 'timeout');
        throw aborted();
      }
      throw friendly(e);
    } finally {
      clearTimeout(timer); parent?.removeEventListener('abort', relay);
    }
  }
  root.SongCloud = { HOST, PAGE, MAX_BYTES, inspect, prepare, generate, cancelRemote, friendly, readEvents, setToken, CloudError };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SongCloud;
})(globalThis);
