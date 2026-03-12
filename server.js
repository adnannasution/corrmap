const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database connection ────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Init DB: create table if not exists ───────────────────────────────────
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
  `);
  console.log('✅ DB ready');
}

// ── API ROUTES ─────────────────────────────────────────────────────────────

// GET all conditions
app.get('/api/conditions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM conditions ORDER BY tag ASC'
    );
    // Return as object keyed by tag (same format as COND in frontend)
    const cond = {};
    result.rows.forEach(row => { cond[row.tag] = row; });
    res.json(cond);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single condition by tag
app.get('/api/conditions/:tag', async (req, res) => {
  try {
    const { tag } = req.params;
    const result = await pool.query(
      'SELECT * FROM conditions WHERE tag = $1',
      [tag]
    );
    if (result.rows.length === 0) return res.json(null);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / upsert a condition (insert or update)
app.post('/api/conditions', async (req, res) => {
  try {
    const {
      tag, type, status,
      visual_level, visual_notes,
      corrosion_level, corrosion_rate, thickness,
      rl_value, rl_level
    } = req.body;

    if (!tag) return res.status(400).json({ error: 'tag is required' });

    const result = await pool.query(`
      INSERT INTO conditions
        (tag, type, status, visual_level, visual_notes,
         corrosion_level, corrosion_rate, thickness,
         rl_value, rl_level, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
      ON CONFLICT (tag) DO UPDATE SET
        type             = EXCLUDED.type,
        status           = EXCLUDED.status,
        visual_level     = EXCLUDED.visual_level,
        visual_notes     = EXCLUDED.visual_notes,
        corrosion_level  = EXCLUDED.corrosion_level,
        corrosion_rate   = EXCLUDED.corrosion_rate,
        thickness        = EXCLUDED.thickness,
        rl_value         = EXCLUDED.rl_value,
        rl_level         = EXCLUDED.rl_level,
        updated_at       = NOW()
      RETURNING *
    `, [
      tag,
      type            || null,
      status          || 'Normal',
      visual_level    || null,
      visual_notes    || null,
      corrosion_level || null,
      parseFloat(corrosion_rate) || 0,
      parseFloat(thickness)      || 0,
      parseFloat(rl_value)       || 0,
      rl_level        || null
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a condition
app.delete('/api/conditions/:tag', async (req, res) => {
  try {
    await pool.query('DELETE FROM conditions WHERE tag = $1', [req.params.tag]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve frontend HTML ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ──────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 CAIS Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
