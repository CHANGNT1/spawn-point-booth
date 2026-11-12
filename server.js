const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Supports both your custom .env names and Railway's automatic environment variables
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));