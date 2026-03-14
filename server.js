const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conditions (
      tag              TEXT PRIMARY KEY,
      type             TEXT,
      status           TEXT DEFAULT 'Normal',
      visual_level     TEXT,
      visual_notes     TEXT,
      corrosion_level  TEXT,
      corrosion_rate   NUMERIC(10,4) DEFAULT 0,
      thickness        NUMERIC(10,2) DEFAULT 0,
      rl_value         NUMERIC(10,2) DEFAULT 0,
      rl_level         TEXT,
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tags (
      uid        TEXT PRIMARY KEY,
      tag        TEXT NOT NULL,
      type       TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ DB ready');
}

// ── CONDITIONS ─────────────────────────────────────────────────────────────
app.get('/api/conditions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM conditions ORDER BY tag ASC');
    const cond = {};
    result.rows.forEach(row => { cond[row.tag] = row; });
    res.json(cond);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conditions', async (req, res) => {
  try {
    const { tag, type, status, visual_level, visual_notes,
            corrosion_level, corrosion_rate, thickness, rl_value, rl_level } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag is required' });
    const result = await pool.query(`
      INSERT INTO conditions
        (tag, type, status, visual_level, visual_notes,
         corrosion_level, corrosion_rate, thickness, rl_value, rl_level, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
      ON CONFLICT (tag) DO UPDATE SET
        type=EXCLUDED.type, status=EXCLUDED.status,
        visual_level=EXCLUDED.visual_level, visual_notes=EXCLUDED.visual_notes,
        corrosion_level=EXCLUDED.corrosion_level, corrosion_rate=EXCLUDED.corrosion_rate,
        thickness=EXCLUDED.thickness, rl_value=EXCLUDED.rl_value,
        rl_level=EXCLUDED.rl_level, updated_at=NOW()
      RETURNING *
    `, [tag, type||null, status||'Normal', visual_level||null, visual_notes||null,
        corrosion_level||null, parseFloat(corrosion_rate)||0,
        parseFloat(thickness)||0, parseFloat(rl_value)||0, rl_level||null]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.delete('/api/conditions/:tag', async (req, res) => {
  try {
    await pool.query('DELETE FROM conditions WHERE tag=$1', [req.params.tag]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── COLOR SCALES ──────────────────────────────────────────────────────────

app.get('/api/scales', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key='color_scales'");
    if (!result.rows.length) return res.json(null);
    res.json(JSON.parse(result.rows[0].value));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/scales', async (req, res) => {
  try {
    const { scales } = req.body;
    if (!scales) return res.status(400).json({ error: 'scales required' });
    await pool.query(`
      INSERT INTO settings (key, value, updated_at) VALUES ('color_scales', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
    `, [JSON.stringify(scales)]);
    res.json({ saved: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TAGS ───────────────────────────────────────────────────────────────────

// GET all tags keyed by uid
app.get('/api/tags', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tags ORDER BY uid ASC');
    const tags = {};
    result.rows.forEach(row => { tags[row.uid] = row; });
    res.json(tags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upsert single tag
app.post('/api/tags', async (req, res) => {
  try {
    const { uid, tag, type } = req.body;
    if (!uid || !tag) return res.status(400).json({ error: 'uid and tag required' });
    const result = await pool.query(`
      INSERT INTO tags (uid, tag, type, updated_at) VALUES ($1,$2,$3,NOW())
      ON CONFLICT (uid) DO UPDATE SET tag=EXCLUDED.tag, type=EXCLUDED.type, updated_at=NOW()
      RETURNING *
    `, [uid, tag, type||null]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST bulk upsert tags (for first-time push all tags)
app.post('/api/tags/bulk', async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags) || !tags.length) return res.status(400).json({ error: 'tags array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { uid, tag, type } of tags) {
        await client.query(`
          INSERT INTO tags (uid, tag, type, updated_at) VALUES ($1,$2,$3,NOW())
          ON CONFLICT (uid) DO UPDATE SET tag=EXCLUDED.tag, type=EXCLUDED.type, updated_at=NOW()
        `, [uid, tag||'', type||null]);
      }
      await client.query('COMMIT');
      res.json({ saved: tags.length });
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server, connect DB with retry ───────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 CAIS Server running on port ${PORT}`);
});

async function connectDB(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try { await initDB(); return; }
    catch (err) {
      console.error(`DB attempt ${i+1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) { console.log('Retrying in 3s...'); await new Promise(r => setTimeout(r, 3000)); }
    }
  }
  console.error('❌ DB unavailable — API will error until DB is ready');
}
connectDB();
