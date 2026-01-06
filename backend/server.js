const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 1. Conexão MySQL (ATUALIZADO COM PORTA CUSTOMIZADA)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT, // <--- ADICIONADO: Importante para porta 3336
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Teste de conexão ao iniciar
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ ERRO AO CONECTAR NO BANCO REMOTO:');
        console.error(`Host: ${process.env.DB_HOST}`);
        console.error(`Porta: ${process.env.DB_PORT}`);
        console.error(`Erro: ${err.message}`);
        console.log('Dica: Verifique se o IP do seu computador está liberado no Firewall do servidor remoto.');
    } else {
        console.log(`✅ Conectado ao MySQL Remoto! (${process.env.DB_HOST}:${process.env.DB_PORT})`);
        connection.release();
    }
});

// 2. Configuração Email
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- ROTAS ---

// Registro
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    
    db.query('SELECT email FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ msg: "Erro no Banco de Dados" }); }
        if (results.length > 0) return res.status(400).json({ msg: 'Email já cadastrado.' });

        const hashedPassword = await bcrypt.hash(password, 8);

        db.query('INSERT INTO users SET ?', { name, email, password: hashedPassword }, (err) => {
            if (err) { console.error(err); return res.status(500).json({ msg: "Erro ao salvar usuário" }); }
            res.status(201).json({ msg: 'Usuário cadastrado com sucesso!' });
        });
    });
});

// Login
app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ msg: "Erro interno do servidor" }); }
        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.status(401).json({ msg: 'Email ou senha incorretos.' });
        }

        const id = results[0].id;
        const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ msg: 'Logado!', token, user: { name: results[0].name, email } });
    });
});

// Esqueci a Senha
app.post('/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "Email obrigatório" });

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ msg: "Erro no banco" });
        if (results.length === 0) return res.status(404).json({ msg: "Email não encontrado" });

        const token = Math.floor(100000 + Math.random() * 900000).toString();
        // 8 horas
        const expireDate = new Date(Date.now() + 28800000); 

        db.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?', [token, expireDate, email], (err) => {
            if (err) return res.status(500).json({ msg: "Erro ao salvar token" });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Recuperação de Senha - DietCMS',
                text: `Seu código de recuperação é: ${token}\n\nEste código expira em 8 horas.`
            };

            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.log("Erro email:", error);
                    return res.status(500).json({ msg: "Erro ao enviar email." });
                }
                res.status(200).json({ msg: "Código enviado para seu email!" });
            });
        });
    });
});

// Resetar Senha
app.post('/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    db.query('SELECT * FROM users WHERE email = ? AND reset_token = ?', [email, code], async (err, results) => {
        if (err) return res.status(500).json({ msg: "Erro interno" });
        if (results.length === 0) return res.status(400).json({ msg: "Código inválido ou email incorreto." });
        
        const user = results[0];
        if (new Date() > new Date(user.reset_expires)) return res.status(400).json({ msg: "Código expirado." });

        const hashedPassword = await bcrypt.hash(newPassword, 8);

        db.query('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashedPassword, user.id], (err) => {
            if (err) return res.status(500).json({ msg: "Erro ao atualizar senha" });
            res.status(200).json({ msg: "Senha alterada com sucesso!" });
        });
    });
});

app.listen(3000, () => console.log('🚀 Backend rodando na porta 3000'));