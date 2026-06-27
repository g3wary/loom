const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static('.')); // ← ДОБАВЬ ЭТУ СТРОЧКУ!
app.use(express.static('.'));
const db = new sqlite3.Database('./loom.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        display_name TEXT,
        created_at INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        text TEXT,
        timestamp INTEGER,
        is_read INTEGER DEFAULT 0
    )`);
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    db.run(
        `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
        [username, hash, Date.now()],
        function(err) {
            if (err) {
                return res.status(400).json({ error: 'Пользователь уже существует' });
            }
            res.json({ success: true, username });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    db.get(
        `SELECT * FROM users WHERE username = ? AND password_hash = ?`,
        [username, hash],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Неверные данные' });
            }
            res.json({ success: true, username: user.username });
        }
    );
});

app.get('/api/users', (req, res) => {
    db.all(`SELECT id, username, display_name FROM users`, (err, users) => {
        res.json(users || []);
    });
});

app.post('/api/messages', (req, res) => {
    const { receiver_id, text } = req.body;
    if (!receiver_id || !text) {
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    db.run(
        `INSERT INTO messages (sender_id, receiver_id, text, timestamp) VALUES (?, ?, ?, ?)`,
        [1, receiver_id, text, Date.now()],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Ошибка отправки' });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/api/messages/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all(
        `SELECT * FROM messages WHERE receiver_id = ? OR sender_id = ? ORDER BY timestamp DESC LIMIT 50`,
        [userId, userId],
        (err, messages) => {
            res.json(messages || []);
        }
    );
});

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (e) {}
    });
});

server.listen(PORT, () => {
    console.log(`✅ LOOM запущен на порту ${PORT}`);
});
