# RJ-45 Çakma Atölyesi — Kurulum ve Kullanım

Ağ Temelleri dersi için Cat6 kablo hazırlama ve test deneyi simülasyonu. Öğrenci kılıfı soyar, ayırıcıyı keser, çiftleri açar, renkleri dizer, telleri keser, konnektörü takar, görsel kontrol yapar ve penseyle çakar. Sonra kabloyu test cihazına bağlar, LED'leri yorumlar ve hatanın sebebini yazar.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` (GitHub sürümünde) | Simülasyonun tamamı, tek dosya. İnternetsiz de çalışır. |
| `apps-script/Code.gs` | İsteğe bağlı Google E-Tablo arka ucu: notları toplar, ayarları dağıtır, yapay zekâ ile değerlendirir. |
| `KURULUM.md` | Bu belge. |

## 1. En basit kullanım (internetsiz)

1. `index.html` (GitHub sürümünde) dosyasını laboratuvardaki her bilgisayara kopyalayın (USB bellek ya da ağ paylaşımı ile).
2. Dosyayı Chrome, Edge, Firefox ya da Safari ile açın. Pardus ETAP etkileşimli tahtalarda da çalışır.
3. **Öğretmen** düğmesine basın, ilk girişte bir PIN belirleyin, **Deney ayarları** sekmesinden görevi seçin.
4. Öğrenciler adını, numarasını ve sınıfını girip deneye başlar.

Bu modda notlar o bilgisayarın tarayıcısında saklanır. Her öğrencinin sonuç ekranında bir **sonuç kodu** çıkar. Öğrenciler bu kodu size iletir (EBA, e-posta, mesaj). Siz de **Öğretmen > Sonuç kodu içe aktar** sekmesine yapıştırırsınız. Değerlendirme kural tabanlıdır, internet gerekmez.

> Not: Ayarlar bu modda her bilgisayarda ayrı ayrı yapılmalıdır. Tek merkezden yönetmek için 2. adıma geçin.

## 2. Notları tek tabloda toplamak (Google E-Tablo, önerilir)

Öğrencilerin hesap açması gerekmez. Notlar sizin Google Drive'ınızdaki bir tabloya düşer.

1. Google Drive'da yeni bir **Google E-Tablo** oluşturun (ör. "RJ-45 Notları").
2. **Uzantılar > Apps Script** menüsünü açın. Açılan düzenleyicideki kodu silin, `apps-script/Code.gs` dosyasının içeriğini yapıştırın ve kaydedin.
3. Sol menüden **Proje Ayarları** (dişli simgesi) > **Komut dosyası özellikleri** > **Komut dosyası özelliği ekle**:
   - `OGRETMEN_SIFRESI` → öğretmen paneli için bir şifre (zorunlu)
   - `ANTHROPIC_API_KEY` → yapay zekâ değerlendirmesi isteniyorsa Anthropic API anahtarınız (isteğe bağlı; [console.anthropic.com](https://console.anthropic.com) adresinden alınır)
   - `GUNLUK_AI_SINIRI` → isteğe bağlı, günlük en fazla yapay zekâ değerlendirmesi (varsayılan 400)
4. Sağ üstte **Dağıt > Yeni dağıtım** > tür olarak **Web uygulaması** seçin:
   - *Şu kullanıcı olarak çalıştır:* **Ben**
   - *Erişimi olan kişiler:* **Herkes**
   - **Dağıt**'a basın, izinleri onaylayın ve verilen **web uygulaması URL'sini** (`https://script.google.com/macros/s/.../exec`) kopyalayın.
5. Adresi simülasyona tanıtmanın iki yolu var:
   - **Tüm öğrenciler için (önerilir):** `index.html` (GitHub sürümünde) dosyasını Not Defteri ile açın, en üstteki `window.RJ45_PRESET = { gasUrl: "" };` satırında tırnakların arasına adresi yapıştırıp kaydedin. Sonra dosyayı dağıtın.
   - **Tek bilgisayar için:** Öğretmen > Bağlantı ve kurulum sekmesine adresi yapıştırıp **Bu cihazda kullan**'a basın.
6. Öğretmen paneline girerken artık `OGRETMEN_SIFRESI` sorulur. Kaydettiğiniz ayarlar tüm öğrencilere uygulanır, notlar E-Tablonun **Notlar** sayfasına satır satır düşer.

> Dosyayı bir web sunucusunda (ör. okul sitesi, GitHub Pages) yayımlıyorsanız öğrencilere `.../rj45-atolyesi.html?gas=WEB_UYGULAMASI_ADRESI` bağlantısını da verebilirsiniz.

**Güvenlik notları:** Yapay zekâ istemi sunucuda kurulur. Bu yüzden API anahtarınız genel bir sohbet aracı olarak kullanılamaz. Günlük çağrı sınırı da harcamayı korur. Öğrenci adları ve notları yalnızca sizin E-Tablonuzda tutulur.

## 3. claude.ai üzerinden kullanım

Simülasyon claude.ai'de yayımlanmış bir sayfa olarak da çalışır. Sayfa oradan açıldığında notlar sayfanın kendi veritabanında toplanır. Yapay zekâ değerlendirmesi de görüntüleyen kişinin Claude hesabıyla yapılır. Bunun için öğrencilerin claude.ai hesabıyla sayfaya erişimi olmalı. Hesabı olmayan öğrenciler sayfayı yine kullanabilir; o zaman notları cihazda kalır ve sonuç kodu ile iletilir.

## Öğretmen ayarları

| Ayar | Seçenekler |
|---|---|
| Kablo türü | Düz (T568B–T568B), Çapraz (T568A–T568B), Konsol/rollover |
| Standart | T568B (varsayılan) ya da T568A; istenirse her öğrenciye rastgele |
| 2. uç | Öğrenci çakar ya da hazır verilir (kısa ders saatleri için) |
| Mod | Alıştırma: sıralamayı anında kontrol, görsel kontrolde açıklama. Sınav: geri bildirim sadece sonda. |
| Renk kartı | Görünür ya da gizli (ipucu ile 6 sn açılır, puan düşer) |
| Cat6 ara parça | Load bar adımını ekler |
| Ek görev | Rastgele arızalı bir kabloyu teşhis etme (+20 puan) |
| Süre sınırı | Dakika cinsinden; dolunca deney teslim edilir |
| Yapay zekâ değerlendirme | Açık/Kapalı. Kapalıyken ya da internet yokken kural tabanlı değerlendirme kullanılır. |

## Puanlama (100 puan)

| Bölüm | Puan |
|---|---|
| Kılıf soyma (iki uç) | 6 |
| Ayırıcıyı kesme | 4 |
| Renk sıralaması | 26 |
| Kesme uzunluğu (11,5–14,5 mm) | 8 |
| Konnektör yönü, tam itme, kılıfın içeride olması | 12 |
| Görsel kontrolde doğru karar | 6 |
| Pense ile tam çakma | 8 |
| Test cihazına doğru bağlama (RJ-11 girişine takma denemesi puan düşürür) | 4 |
| Test sonucunu yorumlama: sağlam/hatalı kararı, hata türü, sebep ve çözüm | 14 |
| Malzeme ve ipucu verimliliği (fazladan konnektör, baştan başlama, ipucu) | 8 |
| Teslim edilen kablonun çalışması | 4 |

2. uç hazır verildiğinde birinci ucun puanı iki uç için ölçeklenir. Ek görev açıksa sonuç (atölye + teşhis) / 120 × 100 olarak hesaplanır.

## Test cihazının gösterdiği hatalar

| Hata | Cihazda görünüş | Simülasyonda oluşan tipik sebep |
|---|---|---|
| Açık devre | Uzak ünitede ilgili LED yanmaz | Teller kısa kesildi, sonuna kadar itilmedi, pense tam sıkılmadı |
| Kısa devre | Birden fazla LED aynı anda yanar | (Teşhis görevinde) hasarlı konnektör/kablo |
| Ters çift | Örn. 1→2, 2→1 | Bir çiftin iki teli yer değiştirdi |
| Çapraz çift | 1,2 ↔ 3,6 | Düz kabloda bir uç T568A, diğeri T568B çakıldı |
| Yanlış bağlantı | Sıra karışık; konnektör ters takılırsa 1→8, 2→7… | Renk sırası hatası ya da konnektörün klips üstte tutulması |
| Bölünmüş çift | Basit test cihazı **göremez** | Pin eşleri aynı bükümlü çiftten değil. Simülasyon bunu ayrıca açıklar. |
