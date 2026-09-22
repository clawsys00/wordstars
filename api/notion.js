import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, type, page } = req.query;

  // ── Cloudinary permanent upload ────────────────────────────────────
  if (type === 'upload') {
    try {
      const { imageUrl } = req.body || {};
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = 'wordstars';
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex');

      const form = new URLSearchParams();
      form.set('file', imageUrl);
      form.set('api_key', apiKey);
      form.set('timestamp', String(timestamp));
      form.set('folder', folder);
      form.set('signature', signature);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok || !data.secure_url) {
        return res.status(500).json({ error: (data && data.error && data.error.message) || 'Cloudinary upload failed' });
      }
      return res.status(200).json({ url: data.secure_url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Pixabay image search ──────────────────────────────────────────
  if (type === 'images') {
    const query = req.query.q || '';
    const pageNum = parseInt(page) || 1;
    const perPage = 9;
    const pixabayKey = process.env.PIXABAY_KEY;
    const url = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=${perPage}&page=${pageNum}&orientation=horizontal&min_width=200`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const images = (data.hits || []).map(h => ({ url: h.largeImageURL || h.previewURL || h.webformatURL }));
      const totalHits = data.totalHits || 0;
      const hasMore = pageNum * perPage < totalHits;
      return res.status(200).json({ images, hasMore, totalHits });
    } catch(e) {
      return res.status(500).json({ images: [], hasMore: false });
    }
  }

  // ── Notion proxy ──────────────────────────────────────────────────
  if (!path) return res.status(400).json({ error: 'Missing path' });
  const notionUrl = `https://api.notion.com/v1${path}`;
  try {
    const response = await fetch(notionUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
