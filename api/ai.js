const cache = { list: null, t: 0, good: null };

async function candidates(key) {
  if (!cache.list || Date.now() - cache.t > 3600e3) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`);
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
  let l = cache.list || ["gemini-flash-lite-latest", "gemini-flash-latest"];
  if (cache.good && l.includes(cache.good)) l = [cache.good, ...l.filter(x => x !== cache.good)];
  return l.slice(0, 5);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY tanımlı değil" });
  const b = req.body || {};
  const ders = `${b.grade}. sınıf ${b.subject} dersi, "${b.topic}" konusu (MEB lise müfredatı)`;
  const kural = "Türkçe yaz. Düz metin kullan, LaTeX veya markdown kullanma (x², √, ½ gibi karakterler olur). Sadece geçerli JSON döndür.";
  let prompt;
  if (b.mode === "q") {
        prompt = `Sen MEB lise müfredatına hakim deneyimli bir öğretmensin. ${ders} için 1 adet 4 şıklı çoktan seçmeli soru üret. Soru yaygın bir kavram yanılgısını yakalasın, orta-zor düzeyde olsun, şıklar mantıklı çeldiriciler içersin. Doğru şıkkın konumu rastgele olsun. Daha önce sorulanlar, tekrar etme: ${JSON.stringify((b.asked || []).slice(-15))}. Ayrıca şunları da hazırla: "kisa" dizisi 4 elemanlı olsun, her yanlış şık için o şıkkı seçen öğrencinin mantık hatasını en fazla 2 cümleyle nokta atışı söylesin ve doğru cevabı SÖYLEMESİN, doğru şıkkın yerine boş metin "" yazılsın. "ipucu": soruyu anlamayan öğrenci için kavramı en fazla 3 cümlede açıklasın, doğru cevabı söylemesin. "uzun": öğrenci tekrar yanlış yaparsa gösterilecek 8-12 cümlelik geniş anlatım (kavramı sıfırdan anlat, yanlış şıkların nedenini söyle, doğru cevabı ve nedenini adım adım ver, kısa örnek ekle), paragrafları \\n ile ayır. ${kural} Biçim: {"soru":"...","secenekler":["...","...","...","..."],"dogru":0,"kisa":["...","...","...","..."],"ipucu":"...","uzun":"..."}`;
  } else if (b.mode === "explain") {
    const q = b.question || {};
    const bilgi = `Soru: ${q.soru}\nŞıklar: ${(q.secenekler || []).map((s, i) => String.fromCharCode(65 + i) + ") " + s).join(" | ")}\nDoğru cevap: ${String.fromCharCode(65 + q.dogru)}`;
    const secim = (b.chosen || []).map(i => String.fromCharCode(65 + i)).join(", ");
    if (b.attempt === 1 && !(b.chosen || []).length) {
      prompt = `${ders}.\n${bilgi}\nÖğrenci soruyu anlamadı. İlgili kavramı en fazla 3 cümlede açıkla, doğru cevabı SÖYLEME, düşünmesi için ipucu ver. ${kural} Biçim: {"aciklama":"..."}`;
    } else if (b.attempt === 1) {
      prompt = `${ders}.\n${bilgi}\nÖğrenci ${secim} şıkkını seçti ve yanlış yaptı. En fazla 3 cümleyle, nokta atışı olarak SEÇTİĞİ şıktaki mantık hatasını veya kavram yanılgısını söyle. Doğru cevabı SÖYLEME, doğru düşünceye yönlendiren tek bir ipucu ver. ${kural} Biçim: {"aciklama":"..."}`;
    } else {
      prompt = `${ders}.\n${bilgi}\nÖğrenci tekrar yanlış yaptı (seçtikleri: ${secim || "yok"}). Geniş ve öğretici anlat: 1) ilgili kavramı sıfırdan, sade dille 2) seçtiği şıkların neden yanlış olduğunu 3) doğru cevabı ve nedenini adım adım 4) akılda kalacak kısa bir örnek veya kural. 8-12 cümle, paragrafları \\n ile ayır. ${kural} Biçim: {"aciklama":"..."}`;
    }
  } else return res.status(400).json({ error: "geçersiz mod" });

  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8 } });
  const start = Date.now();
  let lastErr = "API hatası";
  for (const model of await candidates(key)) {
    const left = 28000 - (Date.now() - start);
    if (left < 1500) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(Math.min(14000, left))
      });
      const j = await r.json();
      if (!r.ok) { lastErr = (j.error && j.error.message) || "API hatası"; continue; }
      const out = JSON.parse(j.candidates[0].content.parts[0].text);
      if (b.mode === "q" && !(out.soru && Array.isArray(out.secenekler) && out.secenekler.length === 4 && out.dogru >= 0 && out.dogru <= 3)) { lastErr = "bozuk soru"; continue; }
      cache.good = model;
      out.model = model;
      return res.status(200).json(out);
    } catch (e) { lastErr = model + ": " + (e.name === "TimeoutError" ? "zaman aşımı" : e.message); }
  }
  return res.status(502).json({ error: lastErr });
};
