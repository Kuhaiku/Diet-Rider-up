const express = require('express');
const mysql = require('mysql2/promise'); // Usando a versão promise para async/await
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- CONEXÃO BANCO (Pool de Conexões) ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware de Autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ msg: "Acesso negado." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ msg: "Token inválido." });
        req.user = user;
        next();
    });
}

// --- ROTAS DE AUTH (Login/Register/Reset) ---
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const [existing] = await pool.query('SELECT email FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ msg: 'Email já existe.' });

        const hashedPassword = await bcrypt.hash(password, 8);
        await pool.query('INSERT INTO users SET ?', { name, email, password: hashedPassword });
        res.status(201).json({ msg: 'Sucesso!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
            return res.status(401).json({ msg: 'Login inválido.' });
        }
        const token = jwt.sign({ id: users[0].id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        res.json({ msg: 'Logado', token, user: { name: users[0].name, email } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTAS DE DADOS (CORE DO SISTEMA) ---

// 1. SALVAR PLANO (Admin)
app.post('/auth/save-plan', authenticateToken, async (req, res) => {
    const { name, data, is_active } = req.body; // data contém { library, planner, themes }
    const userId = req.user.id;
    
    if (!data || !data.library) return res.status(400).json({ error: "Dados incompletos" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // A. Se for para ativar, desativa os anteriores
        if (is_active) {
            await connection.query('UPDATE plans SET is_active = 0 WHERE user_id = ?', [userId]);
        }

        // B. Salva/Atualiza o Plano na tabela 'plans'
        // Verifica se já existe um plano com esse nome para atualizar, ou cria novo
        const [existing] = await connection.query('SELECT id FROM plans WHERE user_id = ? AND plan_name = ?', [userId, name]);
        
        const jsonString = JSON.stringify(data);

        if (existing.length > 0) {
            await connection.query('UPDATE plans SET plan_data = ?, is_active = ? WHERE id = ?', 
                [jsonString, is_active, existing[0].id]);
        } else {
            await connection.query('INSERT INTO plans (user_id, plan_name, plan_data, is_active) VALUES (?, ?, ?, ?)', 
                [userId, name, jsonString, is_active]);
        }

        // C. Salva as Receitas individualmente no Estoque ('recipes')
        // Isso permite reutilizar receitas em outros planos
        for (const rec of data.library) {
            const sqlRecipe = `
                INSERT INTO recipes (recipe_id, user_id, name, category, full_data)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                name = VALUES(name), category = VALUES(category), full_data = VALUES(full_data)
            `;
            await connection.query(sqlRecipe, [
                rec.id, userId, rec.name, rec.cat, JSON.stringify(rec)
            ]);
        }

        await connection.commit();
        res.json({ success: true, msg: "Plano e Receitas salvos com sucesso!" });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: "Erro ao salvar no banco." });
    } finally {
        connection.release();
    }
});

// 2. LISTAR PLANOS SALVOS (Admin)
app.get('/auth/get-plans', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, plan_name, is_active, updated_at FROM plans WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. CARREGAR PLANO PARA EDIÇÃO (Admin)
app.get('/auth/get-plan/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT plan_data FROM plans WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ msg: "Não encontrado" });
        
        let plan = rows[0].plan_data;
        if (typeof plan === 'string') plan = JSON.parse(plan);
        res.json(plan);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. CARREGAR PLANO ATIVO (App Mobile)
app.get('/auth/get-active-plan', authenticateToken, async (req, res) => {
    try {
        // Pega o plano marcado como is_active = 1
        const [rows] = await pool.query('SELECT plan_data FROM plans WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1', [req.user.id]);
        
        if (rows.length > 0) {
            let plan = rows[0].plan_data;
            if (typeof plan === 'string') plan = JSON.parse(plan);
            res.json(plan);
        } else {
            // Retorna vazio mas com estrutura válida para não quebrar o App
            res.status(404).json({ msg: "Nenhum plano ativo." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🔥 Servidor rodando na porta ${PORT}`));
