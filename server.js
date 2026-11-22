const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Supports both custom .env names and Railway's automatic/service MySQL variables
const pool = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// Automatically verify or create the scores table when the server starts
pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        game VARCHAR(255) NOT NULL,
        score FLOAT NOT NULL
    )
`, (err) => {
    if (err) console.error('Error creating scores table:', err.message);
    else console.log('Scores table verified/created successfully.');
});

// Automatically verify or create the staff_logs table for stamps, fastest goal/stats & shift comments
pool.query(`
    CREATE TABLE IF NOT EXISTS staff_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        journal_no VARCHAR(100) DEFAULT '',
        gamertag VARCHAR(255) NOT NULL,
        stamp_1 TINYINT(1) DEFAULT 0,
        stamp_2 TINYINT(1) DEFAULT 0,
        stamp_3 TINYINT(1) DEFAULT 0,
        valid_for_draw VARCHAR(10) DEFAULT 'NO',
        specialised_mode VARCHAR(255) DEFAULT '',
        specialised_mode_extra VARCHAR(255) DEFAULT '',
        fc_goals FLOAT DEFAULT NULL,
        fc_fastest FLOAT DEFAULT NULL,
        rl_goals FLOAT DEFAULT NULL,
        rl_fastest FLOAT DEFAULT NULL,
        player_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error('Error creating staff_logs table:', err.message);
    else console.log('Staff logs table verified/created successfully.');
});

// Get all scores
app.get('/api/scores', (req, res) => {
    pool.query('SELECT id, name, game, score FROM scores ORDER BY score DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Add a new score
app.post('/api/scores', (req, res) => {
    const { name, game, score } = req.body;
    pool.query('INSERT INTO scores (name, game, score) VALUES (?, ?, ?)', [name, game, score], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, name, game, score });
    });
});

// Edit an existing score
app.put('/api/scores/:id', (req, res) => {
    const { name, game, score } = req.body;
    pool.query('UPDATE scores SET name = ?, game = ?, score = ? WHERE id = ?', [name, game, score, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated' });
    });
});

// Delete a score
app.delete('/api/scores/:id', (req, res) => {
    pool.query('DELETE FROM scores WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

// Helper: 3 stamps checked = valid for draw ('YES'), otherwise 'NO'
function computeValidForDraw(s1, s2, s3) {
    return (Boolean(s1) && Boolean(s2) && Boolean(s3)) ? 'YES' : 'NO';
}

// Get all staff logs
app.get('/api/staff-logs', (req, res) => {
    pool.query('SELECT * FROM staff_logs ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Create or update a staff log by id (or upsert by gamertag if requested)
app.post('/api/staff-logs', (req, res) => {
    const {
        id,
        journal_no,
        gamertag,
        stamp_1,
        stamp_2,
        stamp_3,
        specialised_mode,
        specialised_mode_extra,
        fc_goals,
        fc_fastest,
        rl_goals,
        rl_fastest,
        player_comment
    } = req.body;

    if (!gamertag || !String(gamertag).trim()) {
        return res.status(400).json({ error: 'Gamertag is required.' });
    }

    const s1 = stamp_1 ? 1 : 0;
    const s2 = stamp_2 ? 1 : 0;
    const s3 = stamp_3 ? 1 : 0;
    const validForDraw = computeValidForDraw(s1, s2, s3);

    const cleanFcGoals = (fc_goals === '' || fc_goals === null || fc_goals === undefined) ? null : parseFloat(fc_goals);
    const cleanFcFastest = (fc_fastest === '' || fc_fastest === null || fc_fastest === undefined) ? null : parseFloat(fc_fastest);
    const cleanRlGoals = (rl_goals === '' || rl_goals === null || rl_goals === undefined) ? null : parseFloat(rl_goals);
    const cleanRlFastest = (rl_fastest === '' || rl_fastest === null || rl_fastest === undefined) ? null : parseFloat(rl_fastest);

    if (id) {
        const updateSql = `
            UPDATE staff_logs SET
                journal_no = ?, gamertag = ?, stamp_1 = ?, stamp_2 = ?, stamp_3 = ?,
                valid_for_draw = ?, specialised_mode = ?, specialised_mode_extra = ?,
                fc_goals = ?, fc_fastest = ?, rl_goals = ?, rl_fastest = ?, player_comment = ?
            WHERE id = ?
        `;
        const updateParams = [
            journal_no || '', String(gamertag).trim(), s1, s2, s3,
            validForDraw, specialised_mode || '', specialised_mode_extra || '',
            cleanFcGoals, cleanFcFastest, cleanRlGoals, cleanRlFastest, player_comment || '',
            id
        ];
        return pool.query(updateSql, updateParams, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id, valid_for_draw: validForDraw, message: 'Staff log updated' });
        });
    }

    const insertSql = `
        INSERT INTO staff_logs (
            journal_no, gamertag, stamp_1, stamp_2, stamp_3,
            valid_for_draw, specialised_mode, specialised_mode_extra,
            fc_goals, fc_fastest, rl_goals, rl_fastest, player_comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const insertParams = [
        journal_no || '', String(gamertag).trim(), s1, s2, s3,
        validForDraw, specialised_mode || '', specialised_mode_extra || '',
        cleanFcGoals, cleanFcFastest, cleanRlGoals, cleanRlFastest, player_comment || ''
    ];

    pool.query(insertSql, insertParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, valid_for_draw: validForDraw, message: 'Staff log saved' });
    });
});

// Delete a staff log entry
app.delete('/api/staff-logs/:id', (req, res) => {
    pool.query('DELETE FROM staff_logs WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Staff log deleted' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
