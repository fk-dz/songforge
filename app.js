/* SONGFORGE AI 2.0 · Design & development: FATYAK
   Real cloud inference only. Native audio playback includes the generated vocals.
   No browser speech synthesis, no procedural drums, no hidden fallback. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => { n = Math.max(0, Math.floor(n || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
const safeName = s => (s || 'song').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_').slice(0, 45) || 'song';
const uid = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ICONS = {
  epic: '<path d="m4 3 17 17m-6-17L4 20m-1-4 5 5m8-5 5 5M3 3l1 5 4-4-5-1Zm18 0-5 1 4 4 1-5Z"/>',
  cine: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16m10-16v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
  rock: '<path d="m15 6 3-3 3 3-3 3m-2-1-6 6m1-3c-5-3-10 2-7 7s10 2 7-3l2-2-2-2Z"/>',
  metal: '<path d="M4 17V8a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v2m0-1a2 2 0 0 1 4 0v1-7a2 2 0 0 1 4 0v11c0 4-3 6-7 6-5 0-9-1-9-5Z"/>',
  trap: '<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18"/>',
  phonk: '<path d="m4 11 2-6h12l2 6M3 11h18v7H3v-7Zm3 7v3m12-3v3M6 14h2m8 0h2"/>',
  lofi: '<path d="M20 14a9 9 0 0 1-10-11A9 9 0 1 0 20 14Z"/><path d="M17 3v4m-2-2h4"/>',
  pop: '<path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2Zm8 14v5m-2.5-2.5h5"/>',
  edm: '<path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/>',
  house: '<path d="M3 12 12 4l9 8M6 10v11h12V10M10 21v-6h4v6"/>',
  oriental: '<path d="M15 3 9 12c-5-1-8 6-4 9s11-2 8-6l5-10m-4-1 5 3m-1-6 3 2M5 17l4 3"/>',
  rap: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8M8 6h4m-4 3h4"/>',
  man: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="M8 12h8m-4-4v8"/>',
  woman: '<circle cx="12" cy="8" r="5"/><path d="M12 13v9m-4-4h8"/>',
  kid: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15c2 2 4 2 6 0M12 4c-3-4 3-4 1 0"/>',
  duet: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m0-7c5-1 8 1 8 5v2"/>',
  choir: '<circle cx="12" cy="5" r="3"/><circle cx="4" cy="10" r="2"/><circle cx="20" cy="10" r="2"/><path d="M7 22v-5a5 5 0 0 1 10 0v5M1 21v-4a3 3 0 0 1 4-3m18 7v-4a3 3 0 0 0-4-3"/>'
};
const icon = k => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.rap}</svg>`;
const GENRES = [
  { id: 'epic', name: 'ملحمي / فايكنغ', en: 'EPIC NORDIC', bpm: 92, prompt: 'Epic Nordic folk cinematic rock, huge organic war drums, deep resonant percussion, dramatic orchestral strings, ancient horns, spacious heroic atmosphere, a soaring memorable chorus and a powerful dynamic arrangement' },
  { id: 'cine', name: 'سينمائي', en: 'CINEMATIC', bpm: 84, prompt: 'Emotional cinematic orchestral song, expressive strings, warm piano, dramatic brass, deep cinematic percussion, intimate verses rising to an expansive melodic chorus' },
  { id: 'rock', name: 'هارد روك', en: 'HARD ROCK', bpm: 142, prompt: 'Anthemic hard rock, organic live drum kit, crunchy distorted electric guitars, driving electric bass, tight powerful groove, catchy melodic chorus, energetic full band performance' },
  { id: 'metal', name: 'ميتال', en: 'HEAVY METAL', bpm: 170, prompt: 'Epic heavy metal, precise palm-muted guitar riffs, thick distorted rhythm guitars, fast double-kick acoustic drums, powerful bass, dramatic melodic hooks, clean punchy production' },
  { id: 'trap', name: 'تراب', en: 'MELODIC TRAP', bpm: 142, prompt: 'Modern melodic trap, deep warm 808 bass, crisp syncopated hi-hats, tight kick and snare, atmospheric dark synths, melodic hook, clear spacious contemporary hip-hop mix' },
  { id: 'phonk', name: 'فونك', en: 'DRIFT PHONK', bpm: 158, prompt: 'Dark energetic drift phonk, punchy distorted bass, gritty cowbell melody, hard syncopated drums, driving groove, atmospheric textures, clear foreground vocals' },
  { id: 'lofi', name: 'لوفي', en: 'LO-FI CHILL', bpm: 82, prompt: 'Warm lo-fi soul song, mellow jazzy piano chords, relaxed swung drums, soft round bass, intimate nostalgic atmosphere, gentle electric guitar, understated warm analog mix' },
  { id: 'pop', name: 'بوب', en: 'MODERN POP', bpm: 118, prompt: 'Polished contemporary melodic pop, catchy memorable chorus, warm bass, crisp acoustic and electronic drums, sparkling synths, acoustic guitar accents, expressive vocal performance' },
  { id: 'edm', name: 'إلكتروني', en: 'MELODIC EDM', bpm: 128, prompt: 'Uplifting melodic EDM song, wide lush synth chords, a memorable vocal topline, deep clean bass, tight dance drums, emotional build-up into a euphoric melodic drop' },
  { id: 'house', name: 'هاوس', en: 'DEEP HOUSE', bpm: 124, prompt: 'Warm soulful deep house, tight four-on-the-floor kick, groovy bassline, smooth jazzy chord stabs, airy pads, tasteful dance percussion, memorable soulful hook' },
  { id: 'oriental', name: 'شرقي', en: 'ARABIC FUSION', bpm: 104, prompt: 'Expressive Arabic oriental song, rich oud and qanun melodies, authentic darbuka and riq percussion, acoustic Arabic strings, tasteful maqam-inspired phrasing, warm melodic arrangement' },
  { id: 'rap', name: 'راب قديم', en: 'BOOM BAP', bpm: 92, prompt: 'Old-school boom bap hip-hop, punchy organic sampled drums, warm deep bass, soulful piano and horn phrases, confident rhythmic rap delivery with a memorable sung chorus' }
];
const G = Object.fromEntries(GENRES.map(g => [g.id, g]));
const VOICES = {
  man: { name: 'رجل فايكنغي', hint: 'جهوري · قوي · عميق', icon: 'man', prompt: 'One powerful deep bass-baritone male singer, rich chest resonance, a commanding Nordic Viking-like delivery, expressive sustained low notes and confident melodic phrasing' },
  woman: { name: 'امرأة', hint: 'دافئ · تعبيري', icon: 'woman', prompt: 'One expressive warm female singer, clear natural melodic phrasing, emotional sustained notes, rich vocal presence' },
  kid: { name: 'طفل', hint: 'طابع طفولي · مشرق', icon: 'kid', prompt: 'A bright youthful high-register childlike singing timbre, gentle playful melodic phrasing and clear cheerful notes' },
  mw: { name: 'رجل + امرأة', hint: 'ثنائي متباين', icon: 'duet', prompt: 'A male and female vocal duet, contrasting deep resonant male baritone and warm expressive female voice, alternating melodic phrases and harmonizing together in the chorus' },
  mk: { name: 'رجل + طفل', hint: 'جهوري + طبقة عالية', icon: 'duet', prompt: 'A vocal duet contrasting a powerful deep male bass-baritone and a bright youthful childlike high-register singing timbre, call-and-response verses and a harmonious chorus' },
  wk: { name: 'امرأة + طفل', hint: 'دافئ + مشرق', icon: 'duet', prompt: 'A warm female singer and a bright youthful childlike high-register singing timbre, gentle alternating melodic phrases with a harmonious shared chorus' },
  all: { name: 'الجميع / كورال', hint: 'رجالي · نسائي · طفولي', icon: 'choir', prompt: 'A rich mixed vocal ensemble combining deep male voices, expressive female voices and bright youthful high-register choir timbres, call-and-response verses and a large harmonious choral refrain' }
};
const DEMOS = {
  epic: 'قُومُوا يَا أَبْطَالَ الشَّمَالِ\nفِي قُلُوبِنَا نَارٌ لَا تَنَامُ\nفَوْقَ الْجِبَالِ يَعْلُو نِدَاؤُنَا\nوَالْمَجْدُ يَحْمِلُ اسْمَنَا\nيَا رِيحُ خُذِي أَحْلَامَنَا\nنَحْنُ أَبْنَاءُ الْعَاصِفَةِ',
  rock: 'صوت الجيتار يكسر السكوت\nوالحلم في القلب ما يموت\nارفع صوتك وغنّيها\nهذي الدنيا لينا نحييها\nنار في العروق\nحرية وطموح',
  love: 'يا ساكن في القلب من زمان\nكل ما غابت شمس تذكرتك\nأكتب اسمك في كل مكان\nوبكل لحن غنيت لك\nارجع لي يا نور عيني\nقلبي بعدك ما نسي',
  rap: 'نبدأ من الصفر وما نوقف\nكل يوم تجربة وكل ليلة درس\nالكلمة سلاحي والقلم رفيقي\nنكتب حلمي ونرسم طريقي\nاسمعني مليح هذي قصتي\nواللي جاي أجمل من بدايتي',
  kids: 'طَلَعَ الْقَمَرُ وَنَامَتِ النُّجُومُ\nوَالطَّيْرُ غَنَّى لِلْحَمَامِ\nنَلْعَبُ وَنَضْحَكُ كُلَّ يَوْمٍ\nوَنَمْلَأُ الدُّنْيَا سَلَامًا\nيَا أَطْفَالُ غَنُّوا مَعِي\nيَا شَمْسُ نَوِّرِي أَيَّامَنَا'
};
const PREFS_KEY = 'songforge-ai-v2';
const state = { genre: 'epic', voice: 'man', tempo: 92, duration: 60, language: 'auto', quality: 'best', structure: 'auto', instrumental: false, harmony: false, thinking: false, seed: '', lyrics: DEMOS.epic, styleNote: '', consent: false };
let busy = false, controller = null, job = null, current = null, objectURL = null;
let statusTimer = null, startTime = 0, waveRAF = 0, memoryTracks = [], dbPromise = null, waveToken = 0;
const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
function toast(message) {
  const box = $('#toast'); box.textContent = message; box.classList.add('on');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove('on'), 4500);
}
function persist() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(state)); } catch (_) {} }
function loadPrefs() {
  try {
    let d = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (!d) {
      const old = JSON.parse(localStorage.getItem('songforge') || 'null');
      if (old) d = { genre: old.g, voice: old.v, tempo: old.t, lyrics: old.lyrics, consent: false };
    }
    if (!d) return;
    if (G[d.genre]) state.genre = d.genre;
    if (VOICES[d.voice]) state.voice = d.voice;
    state.tempo = clamp(+d.tempo || G[state.genre].bpm, 60, 190);
    if ([30, 60, 90, 120].includes(d.duration)) state.duration = d.duration;
    if (['auto', 'ar', 'fr', 'en'].includes(d.language)) state.language = d.language;
    if (['best', 'fast'].includes(d.quality)) state.quality = d.quality;
    if (['auto', 'keep'].includes(d.structure)) state.structure = d.structure;
    for (const k of ['instrumental', 'harmony', 'thinking', 'consent']) state[k] = d[k] === true;
    for (const k of ['lyrics', 'styleNote', 'seed']) if (typeof d[k] === 'string') state[k] = d[k].slice(0, k === 'lyrics' ? 3000 : k === 'styleNote' ? 500 : 10);
  } catch (_) {}
}
function inferLanguage(text) { return /[\u0600-\u06ff]/.test(text) ? 'ar' : /[àâçéèêëîïôûùüÿœ]/i.test(text) ? 'fr' : 'en'; }
function arrangeLyrics(text, duration, keep, instrumental) {
  if (instrumental) return '[Instrumental]';
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (keep || /^\s*\[[^\]\n]+\]/m.test(raw)) return raw;
  const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
  if (lines.length < 4) return '[Verse]\n' + lines.join('\n');
  const cut = Math.min(4, Math.ceil(lines.length / 2));
  const hookEnd = Math.min(lines.length, cut + 4);
  let out = '[Verse]\n' + lines.slice(0, cut).join('\n') + '\n\n[Chorus]\n' + lines.slice(cut, hookEnd).join('\n');
  if (lines.length > hookEnd) out += '\n\n[Verse 2]\n' + lines.slice(hookEnd).join('\n');
  if (duration >= 90) out += '\n\n[Chorus]\n' + lines.slice(cut, hookEnd).join('\n');
  return out;
}
function makeConfig() {
  const lang = state.language === 'auto' ? inferLanguage(state.lyrics) : state.language;
  const languageName = { ar: 'Arabic', fr: 'French', en: 'English' }[lang];
  const vocalPrompt = state.instrumental ? 'Instrumental music only, a full instrumental arrangement with no lead vocals or choir' : VOICES[state.voice].prompt + ', ' + languageName + '-language lyrics';
  const prompt = [G[state.genre].prompt, vocalPrompt, !state.instrumental && state.harmony ? 'Tasteful layered backing vocal harmonies in the chorus' : '', state.tempo + ' BPM', 'Coherent memorable melody, balanced dynamic arrangement, detailed natural instrument textures and clear well-balanced studio production', state.styleNote.trim()].filter(Boolean).join('. ') + '.';
  const lines = state.lyrics.split('\n').map(x => x.trim()).filter(x => x && !/^\[.+\]$/.test(x));
  return { ...state, lang, title: (lines[0] || (state.instrumental ? 'مقطوعة ' + G[state.genre].name : 'أغنية جديدة')).slice(0, 60), prompt, lyrics: arrangeLyrics(state.lyrics, state.duration, state.structure === 'keep', state.instrumental) };
}
function syncUI() {
  $('#genres').innerHTML = GENRES.map(g => `<button class="g${g.id === state.genre ? ' on' : ''}" type="button" data-g="${g.id}" aria-pressed="${g.id === state.genre}">${icon(g.id)}${g.name}<small>${g.en}</small></button>`).join('');
  $('#voices').innerHTML = Object.entries(VOICES).map(([id, v]) => `<button class="v${id === state.voice ? ' on' : ''}" type="button" data-v="${id}" aria-pressed="${id === state.voice}"${state.instrumental ? ' disabled' : ''}>${icon(v.icon)}${v.name}<small>${v.hint}</small></button>`).join('');
  $('#voices').classList.toggle('muted', state.instrumental);
  for (const k of ['duration', 'language', 'quality', 'structure', 'tempo', 'seed', 'styleNote', 'lyrics']) $('#' + k).value = state[k];
  $('#thinking').checked = state.thinking; $('#cloudConsent').checked = state.consent;
  for (const k of ['instrumental', 'harmony']) { $('#' + k).classList.toggle('on', state[k]); $('#' + k).setAttribute('aria-pressed', String(state[k])); }
  $('#harmony').disabled = state.instrumental;
  updatePreview();
}
function updatePreview() {
  $('#charCount').textContent = state.lyrics.length + ' / 3000';
  $('#tempoV').textContent = state.tempo + ' BPM';
  const cfg = makeConfig();
  $('#promptView').textContent = cfg.prompt + '\n\n' + cfg.lyrics;
  const count = cfg.lyrics.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).filter(Boolean).length;
  const warn = !state.instrumental && count > state.duration * 1.55;
  $('#lengthTip').classList.toggle('warn', warn);
  $('#lengthTip').textContent = state.instrumental ? 'سيُطلب مقطع موسيقي بلا غناء. شخصيات الصوت والهارموني غير مفعّلة.' : warn ? 'الكلمات كثيرة مقارنة بالمدة؛ قد يتسارع الغناء أو لا تُغنّى كل الأسطر. قلّل الكلمات أو زِد المدة.' : 'المدة والسرعة وتفضيل الصوت إرشادات للنموذج، وليست ضمانًا لالتزام حرفي.';
}
function setStatus(phase, title, detail = '') {
  const box = $('#generationStatus'); box.hidden = false;
  box.className = 'generation-status' + (phase === 'error' ? ' error' : phase === 'success' ? ' success' : '');
  box.dataset.phase = phase; $('#statusTitle').textContent = title; $('#statusDetail').textContent = detail;
  const active = !['error', 'success', 'cancelled'].includes(phase);
  $('#statusSpin').hidden = !active; $('#statusBar').hidden = !active;
}
async function checkConnection() {
  const button = $('#checkCloud'); button.disabled = true; $('#cloudText').textContent = 'جارٍ فحص الخدمة…';
  try {
    await SongCloud.inspect(undefined, true);
    $('#cloudText').textContent = 'الخدمة متاحة · الحصة عند التوليد'; $('#cloudDot').className = 'status-dot ok';
    toast('يمكن الوصول لواجهة المزود. هذا الفحص لا يستهلك توليدًا، ولا يضمن توفر الحصة.');
  } catch (e) {
    const err = SongCloud.friendly(e); $('#cloudText').textContent = 'تعذر الاتصال · أعد الفحص'; $('#cloudDot').className = 'status-dot bad'; toast(err.message);
  } finally { button.disabled = false; }
}
async function generateSong() {
  if (busy) return;
  if (!state.instrumental && state.lyrics.trim().length < 3) { toast('اكتب كلماتك أولًا أو اختر «موسيقى فقط».'); $('#lyrics').focus(); return; }
  if (!state.consent) { toast('وافق على إرسال الكلمات لخدمة التوليد أولًا.'); $('#cloudConsent').focus(); return; }
  if (!navigator.onLine) { setStatus('error', 'لا يوجد اتصال بالإنترنت.', 'التوليد السحابي يحتاج اتصالًا؛ ما زالت نتائجك المحفوظة قابلة للتشغيل.'); return; }
  busy = true; controller = new AbortController(); job = null; const cfg = makeConfig();
  $('#make').disabled = true; $('#makeLabel').textContent = 'طلبك قيد المتابعة…'; $('#cancel').hidden = false;
  $('#errorDetail').hidden = true; $('#fallback').hidden = true;
  startTime = Date.now(); $('#elapsed').textContent = '00:00';
  statusTimer = setInterval(() => { $('#elapsed').textContent = fmt((Date.now() - startTime) / 1000); }, 1000);
  setStatus('connecting', 'الاتصال بمحرك الذكاء الاصطناعي…', 'أبقِ الصفحة مفتوحة. الزمن يعتمد على الطابور والحوسبة لدى المزود، وليس على سرعة هاتفك فقط.');
  $('#generationStatus').scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  try {
    const output = await SongCloud.generate(cfg, {
      signal: controller.signal,
      onJob: x => { job = x; },
      onStatus: s => setStatus(s.phase, s.text, s.detail || (s.model ? s.model + ' · نتيجة واحدة لتقليل استهلاك الحصة.' : 'لا نعرض نسبة اكتمال تقديرية وهمية. الانتظار لا يعني وجود ملف مكتمل بعد.'))
    });
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    setStatus('validating', 'فحص الملف الصوتي المستلَم…');
    const duration = await validateAudio(output.blob);
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const track = { id: uid(), blob: output.blob, ext: output.ext, model: output.model, provider: output.provider, seed: output.seed, cfg, duration, created: Date.now(), peaks: null, source: 'generated' };
    await activateTrack(track);
    const saved = await storeTrack(track);
    setStatus('success', 'وصلت أغنيتك — الغناء والموسيقى في ملف واحد.', saved ? 'يمكنك تشغيلها وتنزيلها. حُفظت نسخة في مكتبتك على هذا الجهاز.' : 'يمكنك تشغيلها وتنزيلها، لكن المتصفح لم يسمح بالحفظ الدائم في المكتبة.');
    $('#cloudDot').className = 'status-dot ok'; $('#cloudText').textContent = 'آخر توليد اكتمل';
    toast('وصلت نتيجة حقيقية من المزود. اضغط تشغيل للاستماع.');
    $('#player').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  } catch (e) {
    if (e.name === 'AbortError') setStatus('cancelled', 'توقفت متابعة الطلب.', 'أرسلنا إلغاءً قدر الإمكان؛ قد يستمر التنفيذ عند المزود. لم تُنتج نتيجة جديدة هنا.');
    else {
      const error = SongCloud.friendly(e);
      setStatus('error', error.message, 'لم تصل أغنية جديدة مكتملة. إن كانت لديك نتيجة سابقة، فهي ما زالت في المشغّل ولم تُستبدل.');
      if (error.detail) { $('#errorDetail').hidden = false; $('#errorRaw').textContent = error.detail; }
      $('#fallback').hidden = false;
      if (['quota', 'auth'].includes(error.code)) $('#accountOptions').open = true;
      $('#cloudDot').className = 'status-dot bad'; $('#cloudText').textContent = 'تعذّر آخر توليد · فحص الاتصال';
    }
  } finally {
    clearInterval(statusTimer); statusTimer = null; busy = false; controller = null; job = null;
    $('#make').disabled = false; $('#makeLabel').textContent = 'ولّد أغنيتي بالذكاء الاصطناعي'; $('#cancel').hidden = true;
  }
}
function validateAudio(blob) {
  return new Promise((resolve, reject) => {
    const probe = new Audio(), url = URL.createObjectURL(blob);
    const timer = setTimeout(() => done(new SongCloud.CloudError('وصل ملف، لكن متصفحك لم يتمكن من قراءة مدته. افتح نتيجة المزود في الموقع الرسمي.', 'audio')), 20000);
    function done(error, duration) {
      clearTimeout(timer); probe.onloadedmetadata = null; probe.onerror = null; probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url);
      error ? reject(error) : resolve(duration);
    }
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => Number.isFinite(probe.duration) && probe.duration > 0 ? done(null, probe.duration) : done(new SongCloud.CloudError('الملف المستلَم لا يحمل مدة صوتية صالحة.', 'audio'));
    probe.onerror = () => done(new SongCloud.CloudError('لم يتمكن المتصفح من تشغيل صيغة الملف المستلَم. لم نعرضها كأغنية ناجحة.', 'audio'));
    probe.src = url;
  });
}
async function activateTrack(track) {
  const audio = $('#audio'); audio.pause();
  if (objectURL) URL.revokeObjectURL(objectURL);
  current = track; objectURL = URL.createObjectURL(track.blob); audio.src = objectURL; audio.load();
  $('#trackTitle').textContent = track.cfg.title;
  $('#trackSubtitle').textContent = G[track.cfg.genre].name + ' · ' + (track.cfg.instrumental ? 'موسيقى فقط' : VOICES[track.cfg.voice].name);
  $('#songMeta').textContent = [track.source === 'imported' ? 'ملف مستورد — المحرك غير متحقق منه' : track.model, fmt(track.duration), track.ext.toUpperCase(), (track.blob.size / 1048576).toFixed(1) + ' MB'].join(' · ');
  $('#resultBadge').textContent = track.source === 'imported' ? 'مستورد محليًا' : 'نتيجة مولّدة';
  $('#resultLyrics').textContent = track.cfg.lyrics || 'لم تُرفق كلمات بهذا الملف.';
  $('#resultNote').textContent = track.source === 'imported' ? 'ملف من جهازك. لا نفترض أنه مولّد بالذكاء الاصطناعي، ولا أن الكلمات الحالية تطابق تسجيله.' : 'هذه نتيجة نموذج ACE-Step كما وصلت من المزود؛ تحتوي الغناء والموسيقى معًا، ولا يُضاف أي نطق آلي.';
  $('#download').textContent = '↓ تنزيل الأغنية ' + track.ext.toUpperCase();
  for (const id of ['download', 'downloadWav', 'downloadLyrics']) $('#' + id).disabled = false;
  drawWave(track.peaks, 0); const token = ++waveToken;
  if (!track.peaks && track.duration <= 125 && track.blob.size <= 24 * 1048576) {
    void extractPeaks(track.blob).then(peaks => {
      if (current?.id === track.id && token === waveToken) { track.peaks = peaks; drawWave(peaks, 0); }
    }).catch(() => { /* Playback does not depend on waveform decoding. */ });
  }
}
async function extractPeaks(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0), n = 96, result = [];
    for (let b = 0; b < n; b++) {
      const from = Math.floor(b * samples.length / n), to = Math.floor((b + 1) * samples.length / n);
      const step = Math.max(1, Math.floor((to - from) / 600)); let peak = 0;
      for (let i = from; i < to; i += step) peak = Math.max(peak, Math.abs(samples[i]));
      result.push(peak);
    }
    return result;
  } finally { if (ctx.close) await ctx.close().catch(() => {}); }
}
function drawWave(peaks, progress) {
  const canvas = $('#viz'), ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const gradient = ctx.createLinearGradient(0, 0, W, 0); gradient.addColorStop(0, '#ffb020'); gradient.addColorStop(.5, '#ff2d6f'); gradient.addColorStop(1, '#9b51ff');
  const n = peaks?.length || 96, step = W / n, max = peaks ? Math.max(.01, ...peaks) : 1;
  for (let i = 0; i < n; i++) {
    const height = peaks ? Math.max(3, peaks[i] / max * H * .77) : 3;
    ctx.fillStyle = gradient; ctx.globalAlpha = peaks ? (i / n <= progress ? 1 : .35) : .22;
    const x = i * step + step * .2, y = (H - height) / 2, w = step * .6;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, height, 3) : ctx.rect(x, y, w, height); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function animateWave() {
  cancelAnimationFrame(waveRAF); const audio = $('#audio');
  const tick = () => { drawWave(current?.peaks, audio.duration ? audio.currentTime / audio.duration : 0); if (!audio.paused) waveRAF = requestAnimationFrame(tick); };
  tick();
}
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Storage unavailable')); return; }
    let request;
    try { request = indexedDB.open('songforge-ai-library', 1); } catch (e) { reject(e); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('tracks')) request.result.createObjectStore('tracks', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Storage blocked'));
  });
  return dbPromise;
}
async function getTracks() {
  try {
    const db = await openDB();
    const tracks = await new Promise((resolve, reject) => { const req = db.transaction('tracks', 'readonly').objectStore('tracks').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    return tracks.sort((a, b) => b.created - a.created).slice(0, 5);
  } catch (_) { return [...memoryTracks].sort((a, b) => b.created - a.created); }
}
async function storeTrack(track) {
  memoryTracks = [track, ...memoryTracks.filter(x => x.id !== track.id)].slice(0, 5);
  let saved = true;
  try {
    const db = await openDB(), old = await getTracks();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite'), store = tx.objectStore('tracks'); store.put(track);
      [...old.filter(x => x.id !== track.id), track].sort((a, b) => b.created - a.created).slice(5).forEach(x => store.delete(x.id));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } catch (_) { saved = false; }
  await paintHistory(); return saved;
}
async function deleteTrack(id) {
  memoryTracks = memoryTracks.filter(x => x.id !== id);
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => { const tx = db.transaction('tracks', 'readwrite'); tx.objectStore('tracks').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  } catch (_) {}
  await paintHistory();
}
async function paintHistory() {
  const tracks = await getTracks(), box = $('#historyList');
  box.innerHTML = tracks.length ? tracks.map(t => `<div class="history-item"><button class="history-play" data-load="${escapeHTML(t.id)}" type="button" aria-label="فتح ${escapeHTML(t.cfg.title)}">▶</button><div class="history-copy"><b>${escapeHTML(t.cfg.title)}</b><small>${escapeHTML(G[t.cfg.genre]?.name || '')} · ${fmt(t.duration)} · ${t.ext.toUpperCase()} · ${t.source === 'imported' ? 'مستورد' : 'ACE-Step'}</small></div><button class="history-delete" type="button" data-delete="${escapeHTML(t.id)}" aria-label="حذف من المكتبة">×</button></div>`).join('') : '<p class="empty-library">أول أغنية لك ستكون هنا.</p>';
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function lyricDocument(track) {
  const c = track.cfg;
  return ['SONGFORGE AI · Developed by FATYAK', '==================================', c.title, 'Style: ' + G[c.genre].name, 'Voice preference: ' + (c.instrumental ? 'Instrumental' : VOICES[c.voice].name), 'Source: ' + (track.source === 'imported' ? 'Imported file; source unverified; lyrics may not match.' : track.provider), 'Model: ' + track.model, 'Duration: ' + fmt(track.duration), '', 'LYRICS', c.lyrics, '', 'STYLE PROMPT', c.prompt, '', 'Voice, language and BPM are generation guidance, not guarantees.'].join('\n');
}
async function encodeWAV(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels), frames = buffer.length, bytes = frames * channels * 2;
  const array = new ArrayBuffer(44 + bytes), view = new DataView(array);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i)); let offset = 44;
  for (let from = 0; from < frames; from += 131072) {
    const end = Math.min(frames, from + 131072);
    for (let i = from; i < end; i++) for (let c = 0; c < channels; c++) { const v = clamp(data[c][i], -1, 1); view.setInt16(offset, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true); offset += 2; }
    await new Promise(r => setTimeout(r, 0));
  }
  return new Blob([array], { type: 'audio/wav' });
}
async function downloadWAV() {
  if (!current) return;
  const track = current; if (track.ext === 'wav') { download(track.blob, safeName(track.cfg.title) + '_FATYAK.wav'); return; }
  if (track.duration > 125) { toast('للحفاظ على ذاكرة الهاتف، حوّل المقاطع حتى دقيقتين فقط. يمكنك تنزيل الملف الأصلي.'); return; }
  const button = $('#downloadWav'); button.disabled = true; button.textContent = 'جارٍ التحويل محليًا…'; let ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) throw new Error('هذا المتصفح لا يدعم التحويل الصوتي.');
    ctx = new Ctx({ sampleRate: 44100 }); const buffer = await ctx.decodeAudioData(await track.blob.arrayBuffer());
    const blob = await encodeWAV(buffer); download(blob, safeName(track.cfg.title) + '_FATYAK.wav'); toast('تم تحويل ملف الأغنية كاملًا. WAV أكبر حجمًا ولا يضيف جودة للمصدر.');
  } catch (e) { toast('تعذّر التحويل: ' + e.message + ' يمكنك تنزيل الأصل.'); }
  finally { if (ctx?.close) await ctx.close().catch(() => {}); button.disabled = !current; button.textContent = 'تحويل وتنزيل WAV'; }
}
async function importAudio(file) {
  if (!file) return;
  if (file.size > SongCloud.MAX_BYTES) { toast('اختر ملفًا أصغر من 64 MB لحماية ذاكرة الهاتف.'); return; }
  try {
    const duration = await validateAudio(file), cfg = makeConfig();
    cfg.title = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
    const ext = (/\.(mp3|wav|flac|m4a|ogg|aac|webm)$/i.exec(file.name) || [])[1]?.toLowerCase();
    if (!ext) { toast('استخدم صيغة MP3 أو WAV أو FLAC أو M4A أو OGG.'); return; }
    const track = { id: uid(), blob: file, ext, cfg, duration, created: Date.now(), model: 'Imported audio', provider: 'Local import; not verified', source: 'imported', peaks: null };
    await activateTrack(track); const saved = await storeTrack(track); toast(saved ? 'تم استيراد الملف محليًا وحفظه في المكتبة.' : 'الملف جاهز للتشغيل؛ تعذّر حفظه في المكتبة.');
    $('#player').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  } catch (e) { toast(e.message || 'تعذر تشغيل هذا الملف.'); }
  finally { $('#importAudio').value = ''; }
}
async function copyRequest() {
  const cfg = makeConfig(); const text = ['Model: ACE-Step 1.5 / Custom mode', 'Duration: ' + cfg.duration + ' seconds', 'Language: ' + cfg.lang, 'BPM: ' + cfg.tempo, 'Batch size: 1', '', 'PROMPT', cfg.prompt, '', 'LYRICS', cfg.lyrics].join('\n');
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); const ok = document.execCommand('copy'); el.remove(); if (!ok) throw new Error('Copy unavailable'); }
    toast('نُسخ الوصف والكلمات والإعدادات. اختر Custom في الخدمة الرسمية.');
  } catch (_) { download(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'SONGFORGE_request.txt'); toast('تعذّر النسخ؛ نُزّل الطلب كملف نصي.'); }
}
function boot() {
  loadPrefs(); syncUI(); drawWave(null, 0); void paintHistory();
  $('#genres').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; state.genre = b.dataset.g; state.tempo = G[state.genre].bpm; syncUI(); persist(); });
  $('#voices').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b || state.instrumental) return; state.voice = b.dataset.v; syncUI(); persist(); });
  $('#demos').addEventListener('click', e => {
    const b = e.target.closest('[data-demo]'); if (!b) return; const key = b.dataset.demo;
    state.lyrics = key === 'clear' ? '' : DEMOS[key];
    const map = { epic: 'epic', rock: 'rock', love: 'pop', rap: 'rap', kids: 'pop' };
    if (map[key]) { state.genre = map[key]; state.tempo = G[state.genre].bpm; }
    if (key === 'kids') state.voice = 'kid';
    syncUI(); persist();
  });
  for (const k of ['instrumental', 'harmony']) $('#' + k).addEventListener('click', () => { state[k] = !state[k]; syncUI(); persist(); });
  for (const k of ['lyrics', 'styleNote', 'tempo', 'seed', 'duration', 'language', 'quality', 'structure']) {
    $('#' + k).addEventListener(['lyrics', 'styleNote', 'tempo', 'seed'].includes(k) ? 'input' : 'change', e => {
      state[k] = ['tempo', 'duration'].includes(k) ? +e.target.value : e.target.value; updatePreview(); persist();
    });
  }
  $('#thinking').addEventListener('change', e => { state.thinking = e.target.checked; persist(); });
  $('#cloudConsent').addEventListener('change', e => { state.consent = e.target.checked; persist(); });
  $('#make').addEventListener('click', generateSong); $('#cancel').addEventListener('click', () => { controller?.abort(); });
  $('#hfToken').addEventListener('input', e => {
    const active = SongCloud.setToken(e.target.value);
    $('#authMessage').textContent = active ? 'أُضيف رمز للجلسة الحالية فقط. صلاحية الحساب والحصة يُتحقق منهما عند طلب المزود.' : e.target.value ? 'أكمل رمزًا صالحًا يبدأ بـ hf_. لم يُفعّل رمز بعد.' : 'لا يوجد رمز. سيُجرَّب الاتصال المجهول بحصته المحدودة.';
  });
  $('#clearToken').addEventListener('click', () => { $('#hfToken').value = ''; SongCloud.setToken(''); $('#authMessage').textContent = 'مُسح الرمز من هذه الصفحة. لا توجد نسخة مخزّنة منه.'; });
  window.addEventListener('pagehide', () => { SongCloud.setToken(''); $('#hfToken').value = ''; });
  $('#checkCloud').addEventListener('click', checkConnection); $('#copyRequest').addEventListener('click', copyRequest);
  $('#download').addEventListener('click', () => { if (current) download(current.blob, safeName(current.cfg.title) + '_FATYAK.' + current.ext); });
  $('#downloadWav').addEventListener('click', downloadWAV);
  $('#downloadLyrics').addEventListener('click', () => { if (current) download(new Blob([lyricDocument(current)], { type: 'text/plain;charset=utf-8' }), safeName(current.cfg.title) + '_FATYAK_lyrics.txt'); });
  $('#importAudio').addEventListener('change', e => { void importAudio(e.target.files[0]); });
  $('#historyList').addEventListener('click', async e => {
    const del = e.target.closest('[data-delete]'); if (del) { await deleteTrack(del.dataset.delete); return; }
    const load = e.target.closest('[data-load]'); if (!load) return;
    const track = (await getTracks()).find(t => t.id === load.dataset.load);
    if (track) { await activateTrack(track); $('#player').scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }
  });
  $('#audio').addEventListener('play', animateWave);
  $('#audio').addEventListener('pause', () => { cancelAnimationFrame(waveRAF); });
  $('#audio').addEventListener('timeupdate', () => { const a = $('#audio'); drawWave(current?.peaks, a.duration ? a.currentTime / a.duration : 0); });
  $('#audio').addEventListener('error', () => { if (current) toast('تعذر تشغيل الملف. جرّب تنزيله أو فتحه بمشغّل آخر.'); });
  window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('offline', () => toast('انقطع الإنترنت. التوليد يحتاج اتصالًا؛ الملفات الموجودة على جهازك تبقى قابلة للتشغيل.'));
}
window.SongForge = { state, makeConfig, arrangeLyrics, generateSong, validateAudio, encodeWAV, importAudio, getTracks, get current() { return current; }, get busy() { return busy; } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
