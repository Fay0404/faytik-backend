const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// 1) Ambil info video (judul, author, url video/audio) dari tikwm
app.get('/api/video', async (req, res) => {
  const link = req.query.url;
  if (!link) return res.status(400).json({ error: 'Parameter "url" wajib diisi.' });

  try {
    const apiUrl = 'https://www.tikwm.com/api/?url=' + encodeURIComponent(link);
    const r = await fetch(apiUrl);
    if (!r.ok) throw new Error('Gagal menghubungi server tikwm (status ' + r.status + ')');
    const json = await r.json();

    if (json.code !== 0 || !json.data) {
      return res.status(404).json({ error: json.msg || 'Video tidak ditemukan atau link tidak valid.' });
    }

    const d = json.data;
    res.json({
      title: d.title || '',
      author: d.author?.nickname || '',
      noWatermark: d.play,
      watermark: d.wmplay,
      audio: d.music
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
  }
});

// 2) Proxy download: server yang ambil file dari CDN TikTok (server-to-server,
//    jadi tidak kena CORS), lalu dikirim ke browser dengan header attachment
//    supaya browser PASTI langsung menyimpan file, bukan membuka/menavigasi.
app.get('/api/download', async (req, res) => {
  const src = req.query.src;
  let filename = req.query.filename || 'download';

  if (!src) return res.status(400).send('Parameter "src" wajib diisi.');

  // Sanitasi nama file
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  try {
    const upstream = await fetch(src, {
      headers: {
        // Beberapa CDN TikTok mengecek User-Agent/Referer, kita samarkan seperti browser biasa
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send('Gagal mengambil file dari sumber (status ' + upstream.status + ').');
    }

    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    // Stream langsung dari upstream ke response, tanpa buffer penuh di memory
    const reader = upstream.body.getReader();
    res.on('close', () => { try { reader.cancel(); } catch (e) {} });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Gagal mengunduh: ' + (err.message || 'error tidak diketahui.'));
    else res.end();
  }
});

app.listen(PORT, () => {
  console.log(`FayTik backend jalan di http://localhost:${PORT}`);
});
