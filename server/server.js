const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const HOST = process.env.SERVER_HOST || process.env.HOST || 'localhost';
const AUDIO_QUALITY = process.env.AUDIO_QUALITY || '0';
const CLEANUP_INTERVAL_HOURS = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '1');

// Configurar CORS para permitir todas as origens (extensões Chrome)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: false
}));

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
    next();
});

app.use(express.json());
app.use(express.static('public'));

// Usar TEMP_DIR diretamente se for caminho absoluto, senão relativo ao __dirname
const tempDirEnv = process.env.TEMP_DIR || 'temp';
const tempDir = tempDirEnv.startsWith('/') 
    ? tempDirEnv 
    : path.join(__dirname, tempDirEnv);
fs.ensureDirSync(tempDir);

console.log('Configuracoes do servidor:');
console.log(`  Host: ${HOST}`);
console.log(`  Porta: ${PORT}`);
console.log(`  Qualidade de audio: ${AUDIO_QUALITY}`);
console.log(`  Diretorio temporario: ${tempDir}`);

async function checkYtDlp() {
    try {
        // Tentar diferentes comandos para yt-dlp (Alpine usa python3, pode ter yt-dlp direto)
        try {
            const result = await execAsync('yt-dlp --version');
            console.log('yt-dlp encontrado via comando direto:', result.stdout.trim());
            return true;
        } catch {
            try {
                const result = await execAsync('python3 -m yt_dlp --version');
                console.log('yt-dlp encontrado via python3:', result.stdout.trim());
                return true;
            } catch {
                const result = await execAsync('python -m yt_dlp --version');
                console.log('yt-dlp encontrado via python:', result.stdout.trim());
                return true;
            }
        }
    } catch (error) {
        console.log('yt-dlp não encontrado em nenhum formato:', error.message);
        return false;
    }
}

async function installYtDlp() {
    try {
        console.log('Instalando yt-dlp...');
        // Tentar pip3 primeiro (Alpine), depois pip
        try {
            await execAsync('pip3 install --break-system-packages yt-dlp');
        } catch {
            await execAsync('pip install yt-dlp');
        }
        console.log('yt-dlp instalado com sucesso!');
        return true;
    } catch (error) {
        console.error('Erro ao instalar yt-dlp:', error);
        return false;
    }
}

function sanitizeFilenameForHeader(filename) {
    let sanitized = filename
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/["']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    if (!sanitized || sanitized.length === 0) {
        sanitized = 'youtube_video';
    }
    
    return sanitized.substring(0, 200);
}

app.get('/', (req, res) => {
    console.log('GET / - Health check');
    res.json({
        message: 'AudioFlow Server',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date().toISOString(),
        host: HOST,
        port: PORT
    });
});

app.post('/convert', async (req, res) => {
    let tempFilePath = null;
    
    try {
        console.log('=== Nova requisição de conversão ===');
        console.log('Body recebido:', JSON.stringify(req.body));
        const { videoId, title } = req.body;
        console.log('Video ID:', videoId);
        console.log('Title:', title);
        
        if (!videoId) {
            console.error('ERRO: Video ID não fornecido');
            return res.status(400).json({ error: 'Video ID é obrigatório' });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log('URL do vídeo:', videoUrl);
        const sanitizedTitle = title ? title.replace(/[<>:"/\\|?*]/g, '') : 'youtube_video';
        const headerSafeTitle = sanitizeFilenameForHeader(title || 'youtube_video');
        const tempFileName = `${Date.now()}_${sanitizedTitle}`;
        tempFilePath = path.join(tempDir, `${tempFileName}.mp3`);

        console.log(`Convertendo: ${videoUrl}`);

        const ytDlpInstalled = await checkYtDlp();
        if (!ytDlpInstalled) {
            console.log('yt-dlp não encontrado, tentando instalar...');
            const installed = await installYtDlp();
            if (!installed) {
                return res.status(500).json({ 
                    error: 'yt-dlp não está instalado e não foi possível instalá-lo automaticamente' 
                });
            }
        }

        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Determinar comando yt-dlp (tentar yt-dlp direto, depois python3, depois python)
        let ytDlpCmd = 'yt-dlp';
        try {
            await execAsync('yt-dlp --version');
        } catch {
            try {
                await execAsync('python3 -m yt_dlp --version');
                ytDlpCmd = 'python3 -m yt_dlp';
            } catch {
                ytDlpCmd = 'python -m yt_dlp';
            }
        }
        
        // Verificar ffmpeg primeiro
        let useFfmpeg = false;
        try {
            await execAsync('ffmpeg -version', { timeout: 5000 });
            useFfmpeg = true;
            console.log('ffmpeg encontrado, usando conversão MP3');
        } catch (error) {
            console.log('ffmpeg não encontrado, usando formato nativo');
            tempFilePath = path.join(tempDir, `${tempFileName}.webm`);
        }
        
        // Usar caminho do arquivo diretamente (Node.js execAsync já trata aspas corretamente)
        const fileExtension = useFfmpeg ? '.mp3' : '.webm';
        
        // Construir comando yt-dlp - usar array de argumentos para evitar problemas com aspas
        const ytDlpArgs = [
            '--user-agent', userAgent,
            '--extractor-args', 'youtube:player_client=android',
            '-o', tempFilePath
        ];
        
        if (useFfmpeg) {
            ytDlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', AUDIO_QUALITY);
        } else {
            ytDlpArgs.push('-f', 'bestaudio[ext=webm]/bestaudio');
        }
        
        ytDlpArgs.push(videoUrl);
        
        // Construir comando como string para logging e execução
        const commandStr = `${ytDlpCmd} ${ytDlpArgs.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`;
        console.log(`Executando: ${commandStr}`);
        
        // Timeout de 10 minutos para conversão (vídeos longos podem demorar)
        const CONVERSION_TIMEOUT = 10 * 60 * 1000;
        
        try {
            // Executar comando usando spawn para melhor controle (mas manter compatibilidade com execAsync)
            // Para Alpine, yt-dlp pode estar em /usr/local/bin ou via python
            const { stdout, stderr } = await execAsync(commandStr, { 
                maxBuffer: 10 * 1024 * 1024,
                timeout: CONVERSION_TIMEOUT,
                shell: true
            });
            if (stdout) console.log('yt-dlp stdout:', stdout.substring(0, 500));
            if (stderr && !stderr.includes('WARNING')) console.log('yt-dlp stderr:', stderr.substring(0, 500));
        } catch (execError) {
            console.error('Erro ao executar yt-dlp:', execError.message);
            if (execError.stdout) console.error('stdout:', execError.stdout.substring(0, 1000));
            if (execError.stderr) console.error('stderr:', execError.stderr.substring(0, 1000));
            
            // Verificar se foi timeout
            if (execError.signal === 'SIGTERM' || execError.message.includes('timeout')) {
                throw new Error('Conversão demorou muito tempo (timeout). Tente com um vídeo mais curto.');
            }
            
            throw new Error(`Falha na conversão: ${execError.message || 'Erro desconhecido'}`);
        }
        
        // Aguardar um pouco para garantir que o arquivo foi escrito completamente
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!await fs.pathExists(tempFilePath)) {
            throw new Error('Arquivo não foi criado após a conversão');
        }
        
        const fileStats = await fs.stat(tempFilePath);
        console.log(`Arquivo criado: ${tempFilePath} (${fileStats.size} bytes)`);
        
        // Validar tamanho mínimo do arquivo (1KB)
        if (fileStats.size < 1024) {
            throw new Error(`Arquivo muito pequeno (${fileStats.size} bytes). A conversão pode ter falhado.`);
        }
        
        const finalFileName = `${headerSafeTitle}${fileExtension}`;
        const encodedFileName = encodeURIComponent(finalFileName);
        
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
        res.setHeader('Content-Type', fileExtension === '.mp3' ? 'audio/mpeg' : 'audio/webm');
        
        const fileStream = fs.createReadStream(tempFilePath);
        
        // Tratar erros de conexão do cliente
        req.on('close', () => {
            if (!res.headersSent) {
                console.log('Cliente desconectou antes de receber o arquivo');
                fileStream.destroy();
            }
        });
        
        fileStream.on('error', async (error) => {
            console.error('Erro ao ler arquivo:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao ler arquivo' });
            }
            try {
                await fs.remove(tempFilePath);
            } catch (err) {
                console.error('Erro ao remover arquivo temporário:', err);
            }
        });
        
        res.on('close', async () => {
            // Limpar arquivo após envio completo ou cancelamento
            try {
                if (await fs.pathExists(tempFilePath)) {
                    await fs.remove(tempFilePath);
                    console.log('Arquivo temporário removido após envio');
                }
            } catch (error) {
                console.error('Erro ao remover arquivo temporário:', error);
            }
        });
        
        fileStream.pipe(res);

    } catch (error) {
        console.error('Erro na conversão:', error);
        console.error('Stack trace:', error.stack);
        
        if (tempFilePath && await fs.pathExists(tempFilePath)) {
            try {
                await fs.remove(tempFilePath);
            } catch (err) {
                console.error('Erro ao remover arquivo temporário:', err);
            }
        }
        
        if (!res.headersSent) {
            const errorMessage = error.message || 'Erro desconhecido na conversão';
            console.error(`Retornando erro HTTP 500: ${errorMessage}`);
            res.status(500).json({
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        } else {
            console.error('Headers já enviados, não é possível retornar erro JSON');
        }
    }
});

app.get('/network-info', (req, res) => {
    try {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        const localIPs = [];
        
        Object.keys(interfaces).forEach(interfaceName => {
            const interface = interfaces[interfaceName];
            interface.forEach(alias => {
                if (alias.family === 'IPv4' && !alias.internal) {
                    localIPs.push(alias.address);
                }
            });
        });
        
        res.json({
            hostname: os.hostname(),
            localIPs: localIPs,
            platform: os.platform(),
            arch: os.arch(),
            uptime: os.uptime(),
            serverPort: PORT,
            serverHost: HOST
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao obter informações de rede' });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`Aguardando requisições...`);
});

// Verificar yt-dlp na inicialização
checkYtDlp().then(installed => {
    if (installed) {
        console.log('yt-dlp está instalado e pronto para uso');
    } else {
        console.log('AVISO: yt-dlp não está instalado, será instalado automaticamente no primeiro uso');
    }
}).catch(err => {
    console.log('AVISO: Erro ao verificar yt-dlp:', err.message);
    console.log('yt-dlp será instalado automaticamente no primeiro uso');
});
