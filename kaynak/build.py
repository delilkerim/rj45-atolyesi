# index.html dosyasını kaynak dosyalardan üretir:  cd kaynak && python3 build.py
import pathlib
here = pathlib.Path(__file__).parent
page = (here / 'page.html').read_text(encoding='utf-8')
js = '\n'.join((here / f).read_text(encoding='utf-8') for f in ['data.js', 'sim.js', 'app.js'])
body = page + '\n<script>\n' + js + '\n</script>\n'
preset = '<script>\n/* Öğretmen: Google Apps Script adresini buraya yazarsanız tüm öğrenciler otomatik bağlanır. */\nwindow.RJ45_PRESET = { gasUrl: "" };\n</script>\n'
full = ('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + preset + '</head>\n<body>\n' + body + '</body>\n</html>\n')
(here.parent / 'index.html').write_text(full, encoding='utf-8')
print('index.html yazıldı:', len(full), 'karakter')
