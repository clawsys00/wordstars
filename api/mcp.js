export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SSE transport — Claude.ai GETs first to get the POST endpoint URL
  if (req.method === 'GET') {
    const postUrl = `https://${req.headers.host}/api/mcp`;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`event: endpoint\ndata: ${postUrl}\n\n`);
    res.end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { method, id, params } = req.body;

  // Notifications have no id — just acknowledge
  if (id === undefined || id === null) return res.status(202).end();

  const ok  = result => res.status(200).json({ jsonrpc: '2.0', id, result });
  const err = (code, message) => res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });

  // ── initialize ────────────────────────────────────────────────────────────
  if (method === 'initialize') {
    return ok({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'wordstars-images', version: '1.0.0' }
    });
  }

  if (method === 'ping') return ok({});

  // ── tools/list ────────────────────────────────────────────────────────────
  if (method === 'tools/list') {
    return ok({
      tools: [
        {
          name: 'upload_word_image',
          description:
            'Upload an image for a vocabulary word to the Wordstars GitHub repo and update Notion. ' +
            'Provide either image_url (to download) or image_base64 (raw data). ' +
            'Returns the permanent raw.githubusercontent.com URL.',
          inputSchema: {
            type: 'object',
            properties: {
              word_name: {
                type: 'string',
                description: 'The vocabulary word, e.g. "apple". Used as the filename.'
              },
              word_page_id: {
                type: 'string',
                description: 'Notion page ID for this word. If provided, the Image URL property is updated automatically.'
              },
              image_url: {
                type: 'string',
                description: 'URL of an image to download and store on GitHub.'
              },
              image_base64: {
                type: 'string',
                description: 'Base64-encoded image data. May include a data: URI prefix — it will be stripped.'
              },
              image_format: {
                type: 'string',
                enum: ['jpg', 'png', 'webp'],
                description: 'File extension / format. Defaults to jpg.'
              }
            },
            required: ['word_name']
          }
        },
        {
          name: 'list_words_needing_images',
          description:
            'Return all vocabulary words that do not yet have an image. ' +
            'Call this first to get the list, then generate and upload an image for each word.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    });
  }

  // ── tools/call ────────────────────────────────────────────────────────────
  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    // ── upload_word_image ──────────────────────────────────────────────────
    if (name === 'upload_word_image') {
      const {
        word_name,
        word_page_id,
        image_url,
        image_base64,
        image_format = 'jpg'
      } = args;

      try {
        let base64Content;

        if (image_url) {
          const imgRes = await fetch(image_url);
          if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
          const buf = await imgRes.arrayBuffer();
          base64Content = Buffer.from(buf).toString('base64');
        } else if (image_base64) {
          base64Content = image_base64.replace(/^data:[^;]+;base64,/, '');
        } else {
          throw new Error('Provide either image_url or image_base64');
        }

        const filename    = `${word_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${image_format}`;
        const githubPath  = `images/${filename}`;
        const githubApiUrl = `https://api.github.com/repos/clawsys00/wordstars/contents/${githubPath}`;
        const rawUrl      = `https://raw.githubusercontent.com/clawsys00/wordstars/main/${githubPath}`;

        const ghHeaders = {
          'Authorization': `Bearer ${process.env.GITHUB_WRITE_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        };

        // Get existing SHA if file already exists (required for updates)
        let sha;
        const checkRes = await fetch(githubApiUrl, { headers: ghHeaders });
        if (checkRes.ok) sha = (await checkRes.json()).sha;

        // Commit to GitHub
        const putRes = await fetch(githubApiUrl, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Add image: ${word_name}`,
            content: base64Content,
            branch: 'main',
            ...(sha && { sha })
          })
        });

        const putBody = await putRes.json();
        if (!putRes.ok) {
          throw new Error(`GitHub ${putRes.status}: ${putBody.message}`);
        }

        // Update Notion Image URL if page ID supplied
        if (word_page_id) {
          const notionRes = await fetch(`https://api.notion.com/v1/pages/${word_page_id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${process.env.NOTION_KEY}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ properties: { 'Image URL': { url: rawUrl } } })
          });
          if (!notionRes.ok) {
            const nErr = await notionRes.json();
            throw new Error(`Notion: ${nErr.message}`);
          }
        }

        return ok({
          content: [{
            type: 'text',
            text: [
              `✅ Image saved!`,
              `Word: ${word_name}`,
              `URL: ${rawUrl}`,
              word_page_id ? `Notion: updated` : `Notion: skipped (no word_page_id)`
            ].join('\n')
          }]
        });

      } catch (e) {
        return ok({ content: [{ type: 'text', text: `❌ ${e.message}` }], isError: true });
      }
    }

    // ── list_words_needing_images ──────────────────────────────────────────
    if (name === 'list_words_needing_images') {
      const database_id = 'e8409cb3-c415-4101-bd74-0b92646e58ec';
      try {
        const results = [];
        let cursor;
        do {
          const body = { page_size: 100 };
          if (cursor) body.start_cursor = cursor;
          const r = await fetch(`https://api.notion.com/v1/databases/${database_id}/query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.NOTION_KEY}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
          if (!r.ok) throw new Error(`Notion query failed: ${r.status}`);
          const data = await r.json();
          for (const page of data.results) {
            const wordProp = page.properties['Word'] || page.properties['Name'];
            const imgProp  = page.properties['Image URL'];
            const word = wordProp?.title?.[0]?.plain_text || wordProp?.rich_text?.[0]?.plain_text || '?';
            const imgUrl = imgProp?.url || '';
            const hasGithubImg = imgUrl.startsWith('https://raw.githubusercontent.com/clawsys00/wordstars/');
            if (!hasGithubImg) results.push({ word, word_page_id: page.id, current_url: imgUrl || null });
          }
          cursor = data.next_cursor;
        } while (cursor);

        return ok({
          content: [{
            type: 'text',
            text: results.length === 0
              ? '✅ All words already have GitHub-hosted images!'
              : `${results.length} words need GitHub images:\n\n` +
                results.map(r =>
                  `• ${r.word}  (page_id: ${r.word_page_id})${r.current_url ? '  ⚠️ has expiring URL' : '  ❌ no image'}`
                ).join('\n')
          }]
        });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `❌ ${e.message}` }], isError: true });
      }
    }

    return err(-32601, `Unknown tool: ${name}`);
  }

  return err(-32601, `Unknown method: ${method}`);
}
