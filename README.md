# RJ-45 Çakma Atölyesi

Meslek lisesi **Ağ Temelleri** dersi için Cat6 kabloyu RJ-45 konnektöre pense ile çakma ve test etme simülasyonu.

**Canlı sürüm:** https://delilkerim.github.io/rj45-atolyesi/

Öğrenci kılıfı soyar, Cat6 ayırıcısını keser, çiftleri açar, renkleri T568B/T568A'ya göre dizer, telleri keser, konnektörü takar, görsel kontrol yapar ve penseyle çakar. Ardından kabloyu test cihazına bağlar, LED'leri yorumlar ve hatanın sebebini yazar. Cevap kural tabanlı ya da yapay zekâ ile değerlendirilir; öğretmen öğrenci bazlı notları görür.

## Kullanım

- Tarayıcıda yukarıdaki adresi açın ya da `index.html` dosyasını indirip çift tıklayın (internetsiz çalışır).
- **Öğretmen** düğmesinden PIN belirleyip deney ayarlarını yapın.
- Notları tek bir Google E-Tabloda toplamak ve yapay zekâ değerlendirmesi için [KURULUM.md](KURULUM.md) dosyasındaki adımları izleyin. Apps Script adresini öğrencilere şöyle verebilirsiniz:
  `https://delilkerim.github.io/rj45-atolyesi/?gas=WEB_UYGULAMASI_ADRESI`

## Dosyalar

| Yol | Açıklama |
|---|---|
| `index.html` | Simülasyonun tamamı (tek dosya) |
| `apps-script/Code.gs` | İsteğe bağlı Google Apps Script arka ucu |
| `kaynak/` | Düzenlenebilir kaynak kod. `cd kaynak && python3 build.py` ile `index.html` yeniden üretilir. |
| `KURULUM.md` | Kurulum, ayarlar, puanlama ve hata türleri |

Öğrenci adları ve notları bu repoya yazılmaz; tarayıcıda ya da öğretmenin kendi E-Tablosunda tutulur.
