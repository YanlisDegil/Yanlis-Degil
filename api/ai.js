module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY tanımlı değil" });
  const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"].filter(Boolean))];
  const b = req.body || {};
  const ders = `${b.grade}. sınıf ${b.subject} dersi, "${b.topic}" konusu (MEB lise müfredatı)`;
  const kural = "Türkçe yaz. Düz metin kullan, LaTeX veya markdown kullanma (x², √, ½ gibi karakterler olur). Sadece geçerli JSON döndür.";
  let prompt;
  if (b.mode === "q") {
    prompt = `Sen MEB lise müfredatına hakim deneyimli bir öğretmensin. ${ders} için 1 adet 4 şıklı çoktan seçmeli soru üret. Soru yaygın bir kavram yanılgısını yakalasın, orta-zor düzeyde olsun, şıklar mantıklı çeldiriciler içersin. Doğru şıkkın konumu rastgele olsun. Daha önce sorulanlar, tekrar etme: ${JSON.stringify((b.asked || []).slice(-15))}. ${kural} Biçim: {"soru":"...","secenekler":["...","...","...","..."],"dogru":0}`;
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
  let lastErr = "API hatası";
  for (const model of models) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const j = await r.json();
        if (!r.ok) {
          lastErr = (j.error && j.error.message) || "API hatası";
          if (r.status === 503 || r.status === 429) { await new Promise(s => setTimeout(s, 800)); continue; }
          break;
        }
        const out = JSON.parse(j.candidates[0].content.parts[0].text);
        if (b.mode === "q" && !(out.soru && Array.isArray(out.secenekler) && out.secenekler.length === 4 && out.dogru >= 0 && out.dogru <= 3)) { lastErr = "bozuk soru"; continue; }
        return res.status(200).json(out);
      } catch (e) { lastErr = "Üretim başarısız"; }
    }
  }
  return res.status(502).json({ error: lastErr });
};
