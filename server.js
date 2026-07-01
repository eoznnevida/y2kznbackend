const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const PORT = process.env.PORT || 3000;

// Função auxiliar para ler o banco de dados JSON
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({}));
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '{}');
    } catch (err) {
        console.error("Erro ao ler banco de dados:", err);
        return {};
    }
}

// Função auxiliar para salvar no banco de dados JSON
function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Erro ao salvar banco de dados:", err);
    }
}

// ====================================================================
// ROTAS DO JOGO (SUPORTE PARA VERSÕES 0.50 A 0.64)
// ====================================================================

// Rota de Login / Inicialização do Usuário
app.post('/api/login', (req, res) => {
    const db = readDatabase();
    // O jogo costuma enviar o ID do usuário no corpo da requisição (ex: userId ou id)
    const userId = req.body.userId || req.body.id || "unknown_user";

    // Se o usuário estiver banido, bloqueia o acesso imediatamente
    if (db[userId] && db[userId].isBanned) {
        return res.status(403).json({ 
            success: false, 
            message: "Sua conta foi banida deste servidor." 
        });
    }

    // Se o usuário não existir no JSON, cria um perfil padrão
    if (!db[userId]) {
        db[userId] = {
            userId: userId,
            // Nick inicial padrão exigido: .gg/y2kzn junto com o ID do usuário
            currentNick: `.gg/y2kzn ${userId}`,
            originalNick: "Player",
            isBanned: false
        };
        writeDatabase(db);
    }

    // Retorna os dados que o jogo precisa para carregar o perfil
    res.json({
        success: true,
        User: {
            Id: db[userId].userId,
            Username: db[userId].currentNick,
            // Você pode adicionar mais propriedades simuladas aqui se o seu mod pedir (ex: coroas, gemas)
            Crowns: 0,
            Gems: 1000,
            Tokens: 1000
        }
    });
});

// ====================================================================
// PAINEL / ROTAS DE ADMINISTRAÇÃO (SISTEMA DE NICK E BAN)
// ====================================================================

// Página simples em HTML para gerenciar os nicks e banimentos via navegador
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Painel de Controle - SG Backend</title>
            <style>
                body { font-family: sans-serif; background: #222; color: #fff; max-width: 600px; margin: 40px auto; padding: 20px; }
                h2 { color: #00ffcc; border-bottom: 1px solid #444; padding-bottom: 10px; }
                .box { background: #333; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
                input, button { width: 100%; padding: 10px; margin: 8px 0; border-radius: 4px; border: none; box-sizing: border-box; }
                input { background: #444; color: #fff; }
                button { background: #00ffcc; color: #222; font-weight: bold; cursor: pointer; }
                button.ban { background: #ff4d4d; color: #fff; }
            </style>
        </head>
        <body>
            <h2>Alterar Nickname do Jogador</h2>
            <div class="box">
                <form action="/admin/set-nick" method="POST" onsubmit="setTimeout(() => location.reload(), 500)">
                    <label>ID do Usuário (Original do Jogo):</label>
                    <input type="text" name="userId" placeholder="Ex: 83383338" required />
                    
                    <label>Novo Nickname no Jogo:</label>
                    <input type="text" name="newNick" placeholder="Ex: MeuNickTop" required />
                    
                    <button type="submit">Atualizar Nickname</button>
                </form>
            </div>

            <h2>Sistema de Banimento</h2>
            <div class="box">
                <form action="/admin/ban" method="POST" onsubmit="setTimeout(() => location.reload(), 500)">
                    <label>ID do Usuário para Banir:</label>
                    <input type="text" name="userId" placeholder="Digite o ID da pessoa" required />
                    
                    <button type="submit" class="ban">Aplicar Banimento por ID</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// Endpoint para processar a mudança de nick
app.post('/admin/set-nick', express.urlencoded({ extended: true }), (req, res) => {
    const { userId, newNick } = req.body;
    const db = readDatabase();

    if (!db[userId]) {
        // Se o usuário ainda não logou no jogo, criamos a base dele aqui
        db[userId] = { userId: userId, originalNick: "Player", isBanned: false };
    }

    // Regra solicitada: se o novo nick for exatamente "y2kzn", ele ganha as cores e a tag [DEV]
    if (newNick === "y2kzn") {
        db[userId].currentNick = "<color=blue>y2kzn<color=yellow><sup>[DEV]";
    } else {
        db[userId].currentNick = newNick;
    }

    writeDatabase(db);
    res.send("<h3>Nick atualizado com sucesso! Pode fechar esta página ou voltar.</h3>");
});

// Endpoint para processar o banimento por ID
app.post('/admin/ban', express.urlencoded({ extended: true }), (req, res) => {
    const { userId } = req.body;
    const db = readDatabase();

    if (!db[userId]) {
        db[userId] = { userId: userId, currentNick: "Banned", originalNick: "Player" };
    }

    db[userId].isBanned = true;
    writeDatabase(db);
    
    res.send(`<h3>Usuário com ID ${userId} foi devidamente BANIDO.</h3>`);
});

// Inicia o Servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
