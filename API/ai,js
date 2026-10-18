const cache = { list: null, t: 0, good: null, tv: {} };
const SUBJ = ["Fizik", "Kimya", "Biyoloji", "Matematik", "Türk Dili ve Edebiyatı", "Tarih", "Coğrafya"];
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const L = x => String.fromCharCode(65 + x);

// Hızlı yol: sabit model listesi (Vercel'de GEMINI_MODELS ile değiştirilebilir).
function models() {
  const env = (process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-flash-latest").split(",").map(s => s.trim()).filter(Boolean);
  return cache.good ? [cache.good, ...env.filter(m => m !== cache.good)] : env;
}

// Yedek yol: sadece sabit modeller başarısız olursa modelleri keşfeder.
async function discover(key) {
  if (!cache.list || Date.now() - cache.t > 3600e3) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      const bad = /image|live|audio|tts|native|cyber|robot|computer|embed|vision|thinking|gemma|learnlm|veo|imagen/;
      const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
      const score = n => (/preview|exp/.test(n) ? 0 : 100) + (/lite/.test(n) ? 50 : 0) + ver(n);
      const arr = (j.models || [])
        .filter(m => /flash/.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent") && !bad.test(m.name))
        .map(m => m.name.replace("models/", ""))
        .sort((a, b) => score(b) - score(a));
      if (arr.length) { cache.list = arr; cache.t = Date.now(); }
    } catch (e) {}
  }
  return cache.list || [];
}

// Düşünme (thinking) yavaşlığın ana sebebi: Gemini 2.5 -> thinkingBudget, Gemini 3+ -> thinkingLevel.
// İkisi aynı istekte olamaz, desteklenmeyen 400 verirse sıradaki seçenek denenir.
function variants(m) {
  if (cache.tv[m] !== undefined) return [cache.tv[m]];
  const v = parseFloat((m.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const lv = x => ({ thinkingLevel: x }), bd = { thinkingBudget: 0 };
  return v >= 3 ? [lv("minimal"), lv("low"), null] : v > 0 ? [bd, null] : [lv("minimal"), bd, null];
}

module.exports = async (req, res) => {
  if (req.method === "GET") return res.status(200).json({ ok: 1 }); // ısınma (cold start) isteği
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY tanımlı değil" });
  const b = req.body || {};
  const grade = +b.grade;
  if (![9, 10, 11, 12].includes(grade) || !SUBJ.includes(b.subject)) return res.status(400).json({ error: "geçersiz istek" });
  const konu = b.topic === "Karışık" ? "dersin müfredattaki herhangi bir konusu" : `"${clip(b.topic, 80)}" konusu`;
  const ders = `${grade}. sınıf ${b.subject} dersi, ${konu} (MEB lise müfredatı)`;
  const kural = "Türkçe yaz. Düz metin kullan, LaTeX veya markdown kullanma (x², √, ½ gibi karakterler olur). Sadece geçerli JSON döndür.";
  const qq = b.question || {};
  const bilgi = `Soru: ${clip(qq.soru, 800)}\nŞıklar: ${(qq.secenekler || []).slice(0, 4).map((s, i) => L(i) + ") " + clip(s, 300)).join(" | ")}\nDoğru cevap: ${L(qq.dogru | 0)}`;
  const mode = b.mode;
  let prompt, max = 14000;

  if (mode === "q") {
    max = 10000;
    prompt = `Sen MEB lise müfredatına hakim deneyimli bir öğretmensin. ${ders} için 1 adet 4 şıklı çoktan seçmeli soru üret. Soru yaygın bir kavram yanılgısını yakalasın, orta-zor düzeyde olsun, şıklar mantıklı çeldiriciler içersin. Doğru şıkkın konumu rastgele olsun. Daha önce sorulanlar, tekrar etme: ${JSON.stringify((b.asked || []).slice(-15).map(x => clip(x, 200)))}. ${kural} Biçim: {"soru":"...","secenekler":["...","...","...","..."],"dogru":0}`;
  } else if (mode === "extras") {
    prompt = `${ders}.\n${bilgi}\nBu soru için şunları hazırla: "kisa": 4 elemanlı dizi; her yanlış şık için o şıkkı seçen öğrencinin mantık hatasını en fazla 2 cümleyle nokta atışı söylesin ve doğru cevabı SÖYLEMESİN, doğru şıkkın yerine boş metin "" yazılsın. "ipucu": soruyu anlamayan öğrenci için kavramı en fazla 3 cümlede açıklasın, doğru cevabı söylemesin. "uzun": öğrenci tekrar yanlış yaparsa gösterilecek 8-12 cümlelik geniş anlatım (kavramı sıfırdan anlat, yanlış şıkların nedenini söyle, doğru cevabı ve nedenini adım adım ver, kısa örnek ekle), paragrafları \\n ile ayır. ${kural} Biçim: {"kisa":["...","...","...","..."],"ipucu":"...","uzun":"..."}`;
  } else if (mode === "explain") {
    const secim = (Array.isArray(b.chosen) ? b.chosen : []).slice(0, 4).map(i => L(i | 0)).join(", ");
    if (b.attempt === 1 && !secim) {
      prompt = `${ders}.\n${bilgi}\nÖğrenci soruyu anlamadı. İlgili kavramı en fazla 3 cümlede açıkla, doğru cevabı SÖYLEME, düşünmesi için ipucu ver. ${kural} Biçim: {"aciklama":"..."}`;
    } else if (b.attempt === 1) {
      prompt = `${ders}.\n${bilgi}\nÖğrenci ${secim} şıkkını seçti ve yanlış yaptı. En fazla 3 cümleyle, nokta atışı olarak SEÇTİĞİ şıktaki mantık hatasını veya kavram yanılgısını söyle. Doğru cevabı SÖYLEME, doğru düşünceye yönlendiren tek bir ipucu ver. ${kural} Biçim: {"aciklama":"..."}`;
    } else {
      prompt = `${ders}.\n${bilgi}\nÖğrenci tekrar yanlış yaptı (seçtikleri: ${secim || "yok"}). Geniş ve öğretici anlat: 1) ilgili kavramı sıfırdan, sade dille 2) seçtiği şıkların neden yanlış olduğunu 3) doğru cevabı ve nedenini adım adım 4) akılda kalacak kısa bir örnek veya kural. 8-12 cümle, paragrafları \\n ile ayır. ${kural} Biçim: {"aciklama":"..."}`;
    }
  } else return res.status(400).json({ error: "geçersiz mod" });

  const valid = o => {
    if (!o || typeof o !== "object") return false;
    if (mode === "q") return !!(o.soru && Array.isArray(o.secenekler) && o.secenekler.length === 4 && Number.isInteger(o.dogru) && o.dogru >= 0 && o.dogru <= 3);
    if (mode === "extras") return !!(Array.isArray(o.kisa) && o.kisa.length === 4 && o.ipucu && o.uzun);
    return !!o.aciklama;
  };

  const start = Date.now();
  let lastErr = "API hatası";
  const run = async list => {
    for (const model of list) {
      for (const tc of variants(model)) {
        const left = 28000 - (Date.now() - start);
        if (left < 1500) return null;
        const gc = { responseMimeType: "application/json", temperature: 0.8 };
        if (tc) gc.thinkingConfig = tc;
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gc }),
            signal: AbortSignal.timeout(Math.min(max, left))
          });
          const j = await r.json();
          if (!r.ok) {
            lastErr = model + ": " + ((j.error && j.error.message) || "API hatası");
            if (r.status === 400 && /thinking/i.test(lastErr)) continue; // sıradaki düşünme ayarını dene
            break;
          }
          const out = JSON.parse(j.candidates[0].content.parts[0].text);
          if (!valid(out)) { lastErr = "eksik üretim"; break; }
          if (mode === "extras") out.kisa[qq.dogru | 0] = ""; // doğru şıkkın açıklaması asla sızmasın
          cache.good = model; cache.tv[model] = tc;
          out.model = model;
          return out;
        } catch (e) {
          lastErr = model + ": " + (e.name === "TimeoutError" ? "zaman aşımı" : e.message);
          break;
        }
      }
    }
    return null;
  };

  let out = await run(models());
  if (!out && Date.now() - start < 18000) {
    const tried = models();
    out = await run((await discover(key)).filter(m => !tried.includes(m)).slice(0, 3));
  }
  if (out) return res.status(200).json(out);
  return res.status(502).json({ error: lastErr });
};
