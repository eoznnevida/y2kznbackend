// index.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Importação dos módulos de segurança e estado compartilhado
const securitySetup = require('./security');
const shared = require('./shared');

const app = express();
const server = http.createServer(app);

const DB_FILE = path.join(__dirname, 'database.json');
const PORT = process.env.PORT || 3000;

// Configuração dos Parsers essenciais antes das rotas
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 1. Inicializa o ecossistema de segurança (Helmet, Sanitize, Rate Limit, etc.)
securitySetup(app);

// 2. Injeta o estado 'shared' em todas as requisições (fácil acesso se necessário)
app.use((req, res, next) => {
    req.shared = shared;
    next();
});

function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ tournaments: [], users: {} }));
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '{"tournaments":[],"users":{}}');
    } catch (err) {
        return { tournaments: [], users: {} };
    }
}

function writeDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ====================================================================
// ROTA DOS TORNEIOS (RETORNA PARA O JOGO APARECER NO "CLASSIC")
// ====================================================================
app.get(['/api/tournament/list', '/tournament/v2/list'], (req, res) => {
    const db = readDatabase();
    const tournamentsList = db.tournaments || [];

    // Mapeia os torneios cadastrados no JSON para o formato que o cliente do jogo reconhece
    const responseTournaments = tournamentsList.map(tour => {
        const createdDate = new Date(tour.createdAt || new Date());
        const durationMs = tour.durationDays * 24 * 60 * 60 * 1000;
        const endTime = new Date(createdDate.getTime() + durationMs);

        return {
            Id: tour.id,
            Title: tour.title,
            Type: "Tournaments", // Garante que cai na aba Classic do exemplo
            Status: "Active",
            TargetVersion: "0.50-0.64",
            MaxPlayers: parseInt(tour.maxPlayers) || 2,
            RoundsCount: parseInt(tour.roundsCount) || 1,
            MapLoop: [tour.map || "level19_block"],
            AllowedEmotes: tour.emotes || ["punch"],
            Rewards: {
                Xp: 200,
                RewardText: "1ST PRIZE"
            },
            StartTime: createdDate.toISOString(),
            EndTime: endTime.toISOString(),
            SecondsLeft: Math.max(0, Math.floor((endTime - new Date()) / 1000))
        };
    });

    res.json({
        success: true,
        Tournaments: responseTournaments
    });
});

// ====================================================================
// ROTA DE LOGIN PADRÃO
// ====================================================================
app.post('/api/login', (req, res) => {
    // Bloqueia se o estado global do shared apontar manutenção
    if (shared.isMaintenance) {
        return res.status(503).json({ success: false, message: "Servidor em manutenção." });
    }

    const db = readDatabase();
    if (!db.users) db.users = {};
    
    const userId = req.body.userId || req.body.id || "unknown_user";

    if (db.users[userId] && db.users[userId].isBanned) {
        return res.status(403).json({ success: false, message: "Sua conta foi banida." });
    }

    if (!db.users[userId]) {
        db.users[userId] = {
            userId: userId,
            currentNick: `.gg/sgboxer ${userId}`,
            originalNick: "Player",
            isBanned: false
        };
        writeDatabase(db);
    }

    // Registra a sessão do player na memória do arquivo shared
    shared.activePlayers.set(userId, {
        username: db.users[userId].currentNick,
        loginTime: Date.now()
    });

    res.json({
        success: true,
        User: {
            Id: db.users[userId].userId,
            Username: db.users[userId].currentNick,
            Crowns: 9999,
            Gems: 77777,
            Tokens: 8888
        }
    });
});

// Rota opcional para acompanhar sincronização rápida do shared
app.get('/api/sync', (req, res) => {
    res.json({
        onlinePlayers: shared.getOnlineCount(),
        maintenance: shared.isMaintenance,
        version: shared.GAME_VERSION
    });
});

// ====================================================================
// PAINEL DE CONTROLE ATUALIZADO (ADMIN)
// ====================================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Painel Tour X & Admin</title>
            <style>
                body { font-family: sans-serif; background: #1a1a1a; color: #fff; max-width: 700px; margin: 40px auto; padding: 20px; }
                h2 { color: #00ffcc; border-bottom: 2px solid #333; padding-bottom: 8px; }
                .box { background: #262626; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
                label { font-weight: bold; display: block; margin-top: 10px; color: #bbb; }
                input, select, button { width: 100%; padding: 12px; margin: 6px 0 15px 0; border-radius: 4px; border: none; box-sizing: border-box; }
                input, select { background: #333; color: #fff; }
                button { background: #00ffcc; color: #111; font-weight: bold; cursor: pointer; font-size: 16px; }
                button:hover { background: #00e6b8; }
                .checkbox-group { display: flex; gap: 15px; margin: 10px 0; }
                .checkbox-group label { display: inline; cursor: pointer; }
            </style>
        </head>
        <body>

            <h2>Criar Novo Torneio (Tour X - Classic)</h2>
            <div class="box">
                <form action="/admin/create-tournament" method="POST" onsubmit="setTimeout(() => location.reload(), 500)">
                    <label>Título do Torneio:</label>
                    <input type="text" name="title" value="(.gg/sgboxer)1v1 BD Only Punch" required />

                    <label>Código do Mapa (ID interno):</label>
                    <input type="text" name="map" value="level19_block" required />

                    <label>Emotes Permitidos:</label>
                    <div class="checkbox-group">
                        <input type="checkbox" name="emotes" value="punch" checked style="width:auto;"> Soco
                        <input type="checkbox" name="emotes" value="fire_punch" checked style="width:auto;"> Soco de Fogo
                        <input type="checkbox" name="emotes" value="kick" style="width:auto;"> Rasteira
                    </div>

                    <label>Quantidade de Players:</label>
                    <input type="number" name="maxPlayers" value="2" required />

                    <label>Quantidade de Rounds:</label>
                    <input type="number" name="roundsCount" value="1" required />

                    <label>Duração (em Dias):</label>
                    <input type="number" name="durationDays" value="365" required />

                    <button type="submit">Lançar Torneio no Jogo</button>
                </form>
            </div>

            <h2>Gerenciamento de Jogadores</h2>
            <div class="box">
                <form action="/admin/set-nick" method="POST" onsubmit="setTimeout(() => location.reload(), 500)">
                    <label>ID do Usuário para Mudar Nick:</label>
                    <input type="text" name="userId" placeholder="Ex: 83383338" required />
                    <label>Novo Nick:</label>
                    <input type="text" name="newNick" placeholder="Ex: sgboxer" required />
                    <button type="submit">Setar Nickname</button>
                </form>

                <form action="/admin/ban" method="POST" onsubmit="setTimeout(() => location.reload(), 500)" style="margin-top: 20px;">
                    <label>ID para Banir:</label>
                    <input type="text" name="userId" placeholder="ID Alvo" required />
                    <button type="submit" style="background:#ff4d4d; color:#fff;">Banir por ID</button>
                </form>
            </div>

        </body>
        </html>
    `);
});

// Processa a criação do torneio vindo do painel
app.post('/admin/create-tournament', (req, res) => {
    const db = readDatabase();
    if (!db.tournaments) db.tournaments = [];

    let emotesSelected = req.body.emotes;
    if (!Array.isArray(emotesSelected)) {
        emotesSelected = emotesSelected ? [emotesSelected] : [];
    }

    const newTour = {
        id: "tour_" + Date.now(),
        title: req.body.title,
        map: req.body.map,
        emotes: emotesSelected,
        maxPlayers: req.body.maxPlayers,
        roundsCount: req.body.roundsCount,
        durationDays: req.body.durationDays,
        createdAt: new Date().toISOString()
    };

    db.tournaments.push(newTour);
    writeDatabase(db);
    res.send("<h3>Torneio adicionado ao painel do Classic com sucesso!</h3>");
});

// Rotas de Nick/Ban adaptadas para a nova estrutura do JSON
app.post('/admin/set-nick', (req, res) => {
    const { userId, newNick } = req.body;
    const db = readDatabase();
    if (!db.users) db.users = {};
    if (!db.users[userId]) db.users[userId] = { userId, originalNick: "Player", isBanned: false };

    // Substituído os nicks automáticos de desenvolvedor para a nova tag
    db.users[userId].currentNick = (newNick === "sgboxer" || newNick === "y2kzn") 
        ? "<color=blue>sgboxer<color=yellow><sup>[DEV]" 
        : newNick;
        
    writeDatabase(db);
    res.send("<h3>Nick atualizado!</h3>");
});

app.post('/admin/ban', (req, res) => {
    const { userId } = req.body;
    const db = readDatabase();
    if (!db.users) db.users = {};
    if (!db.users[userId]) db.users[userId] = { userId, currentNick: "Banned", originalNick: "Player" };

    db.users[userId].isBanned = true;
    writeDatabase(db);
    res.send("<h3>Usuário Banido!</h3>");
});

// Rota genérica para 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Rota não encontrada." });
});

// Inicialização do Servidor utilizando a instância HTTP estruturada para o shared
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`[SERVER] Rodando perfeitamente na porta ${PORT}`);
    console.log(`[SHARED] Versão mapeada do cliente: ${shared.GAME_VERSION}`);
    console.log(`==================================================`);
});
