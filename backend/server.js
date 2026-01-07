const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' })); // Aumentado para aceitar JSONs maiores
app.use(cors());

// --- CONEXÃO BANCO ---
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
// Isso garante que só usuários logados mexam nos dados
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.status(401).json({ msg: "Acesso negado." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ msg: "Token inválido." });
        req.user = user; // Salva o ID do usuário na requisição
        next();
    });
}

// --- ROTAS DE AUTH (MANTIDAS) ---
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    db.query('SELECT email FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: "Erro Banco" });
        if (results.length > 0) return res.status(400).json({ msg: 'Email já existe.' });
        const hashed = await bcrypt.hash(password, 8);
        db.query('INSERT INTO users SET ?', { name, email, password: hashed }, (err) => {
            if (err) return res.status(500).json({ msg: "Erro ao salvar" });
            res.status(201).json({ msg: 'Sucesso!' });
        });
    });
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err || results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.status(401).json({ msg: 'Login inválido.' });
        }
        const token = jwt.sign({ id: results[0].id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        res.json({ msg: 'Logado', token, user: { name: results[0].name, email } });
    });
});

// --- NOVAS ROTAS: PERSISTÊNCIA DE DADOS ---

// 1. Salvar Plano
app.post('/api/save-plan', authenticateToken, (req, res) => {
    const { name, data, is_active } = req.body;
    const userId = req.user.id;
    const jsonData = JSON.stringify(data);

    // Se for ativo, desativa os outros primeiro
    if (is_active) {
        db.query('UPDATE diet_plans SET is_active = 0 WHERE user_id = ?', [userId]);
    }

    // Verifica se já existe um plano com esse nome para atualizar, ou cria novo
    db.query('SELECT id FROM diet_plans WHERE user_id = ? AND plan_name = ?', [userId, name], (err, results) => {
        if (results.length > 0) {
            // Atualiza
            db.query('UPDATE diet_plans SET plan_data = ?, is_active = ? WHERE id = ?', [jsonData, is_active, results[0].id], (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({ msg: "Plano atualizado!" });
            });
        } else {
            // Cria
            db.query('INSERT INTO diet_plans (user_id, plan_name, plan_data, is_active) VALUES (?, ?, ?, ?)', 
            [userId, name, jsonData, is_active], (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({ msg: "Plano salvo!" });
            });
        }
    });
});

// 2. Carregar Planos (Lista)
app.get('/api/get-plans', authenticateToken, (req, res) => {
    db.query('SELECT id, plan_name, is_active, updated_at FROM diet_plans WHERE user_id = ?', [req.user.id], (err, results) => {
        if(err) return res.status(500).json({error: err});
        res.json(results);
    });
});

// 3. Carregar UM Plano Específico
app.get('/api/get-plan/:id', authenticateToken, (req, res) => {
    db.query('SELECT plan_data FROM diet_plans WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, results) => {
        if(err || results.length === 0) return res.status(404).json({msg: "Não encontrado"});
        res.json(results[0].plan_data); // Retorna o JSON direto
    });
});

// 4. Carregar Plano ATIVO (Para o App)
app.get('/api/get-active-plan', authenticateToken, (req, res) => {
    db.query('SELECT plan_data FROM diet_plans WHERE user_id = ? AND is_active = 1 LIMIT 1', [req.user.id], (err, results) => {
        if(err) return res.status(500).json({error: err});
        if(results.length === 0) return res.json(null); // Nenhum plano ativo
        res.json(results[0].plan_data);
    });
});

app.listen(3000, () => console.log('🚀 Backend rodando na porta 3000'));const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' })); // Aumentado para aceitar JSONs maiores
app.use(cors());

// --- CONEXÃO BANCO ---
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
// Isso garante que só usuários logados mexam nos dados
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.status(401).json({ msg: "Acesso negado." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ msg: "Token inválido." });
        req.user = user; // Salva o ID do usuário na requisição
        next();
    });
}

// --- ROTAS DE AUTH (MANTIDAS) ---
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    db.query('SELECT email FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: "Erro Banco" });
        if (results.length > 0) return res.status(400).json({ msg: 'Email já existe.' });
        const hashed = await bcrypt.hash(password, 8);
        db.query('INSERT INTO users SET ?', { name, email, password: hashed }, (err) => {
            if (err) return res.status(500).json({ msg: "Erro ao salvar" });
            res.status(201).json({ msg: 'Sucesso!' });
        });
    });
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err || results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.status(401).json({ msg: 'Login inválido.' });
        }
        const token = jwt.sign({ id: results[0].id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        res.json({ msg: 'Logado', token, user: { name: results[0].name, email } });
    });
});

// --- NOVAS ROTAS: PERSISTÊNCIA DE DADOS ---

// 1. Salvar Plano
app.post('/api/save-plan', authenticateToken, (req, res) => {
    const { name, data, is_active } = req.body;
    const userId = req.user.id;
    const jsonData = JSON.stringify(data);

    // Se for ativo, desativa os outros primeiro
    if (is_active) {
        db.query('UPDATE diet_plans SET is_active = 0 WHERE user_id = ?', [userId]);
    }

    // Verifica se já existe um plano com esse nome para atualizar, ou cria novo
    db.query('SELECT id FROM diet_plans WHERE user_id = ? AND plan_name = ?', [userId, name], (err, results) => {
        if (results.length > 0) {
            // Atualiza
            db.query('UPDATE diet_plans SET plan_data = ?, is_active = ? WHERE id = ?', [jsonData, is_active, results[0].id], (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({ msg: "Plano atualizado!" });
            });
        } else {
            // Cria
            db.query('INSERT INTO diet_plans (user_id, plan_name, plan_data, is_active) VALUES (?, ?, ?, ?)', 
            [userId, name, jsonData, is_active], (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({ msg: "Plano salvo!" });
            });
        }
    });
});

// 2. Carregar Planos (Lista)
app.get('/api/get-plans', authenticateToken, (req, res) => {
    db.query('SELECT id, plan_name, is_active, updated_at FROM diet_plans WHERE user_id = ?', [req.user.id], (err, results) => {
        if(err) return res.status(500).json({error: err});
        res.json(results);
    });
});

// 3. Carregar UM Plano Específico
app.get('/api/get-plan/:id', authenticateToken, (req, res) => {
    db.query('SELECT plan_data FROM diet_plans WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, results) => {
        if(err || results.length === 0) return res.status(404).json({msg: "Não encontrado"});
        res.json(results[0].plan_data); // Retorna o JSON direto
    });
});

// 4. Carregar Plano ATIVO (Para o App)
app.get('/api/get-active-plan', authenticateToken, (req, res) => {
    db.query('SELECT plan_data FROM diet_plans WHERE user_id = ? AND is_active = 1 LIMIT 1', [req.user.id], (err, results) => {
        if(err) return res.status(500).json({error: err});
        if(results.length === 0) return res.json(null); // Nenhum plano ativo
        res.json(results[0].plan_data);
    });
});

app.listen(3000, () => console.log('🚀 Backend rodando na porta 3000'));
