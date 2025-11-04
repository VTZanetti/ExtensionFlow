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

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const tempDir = path.join(__dirname, process.env.TEMP_DIR || 'temp');
fs.ensureDirSync(tempDir);

console.log('Configuracoes do servidor:');
console.log(`  Host: ${HOST}`);
console.log(`  Porta: ${PORT}`);
console.log(`  Qualidade de audio: ${AUDIO_QUALITY}`);
console.log(`  Diretorio temporario: ${tempDir}`);

async function checkYtDlp() {
    try {
        await execAsync('python -m yt_dlp --version');
        return true;
    } catch (error) {
        return false;
    }
}

async function installYtDlp() {
    try {
        console.log('Instalando yt-dlp...');
        await execAsync('pip install yt-dlp');
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
    res.json({
        message: 'AudioFlow Server',
        version: '1.0.0',
        status: 'online'
    });
});

app.post('/convert', async (req, res) => {
    let tempFilePath = null;
    
    try {
        const { videoId, title } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ error: 'Video ID é obrigatório' });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
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
        let command = `python -m yt_dlp --user-agent "${userAgent}" --extractor-args "youtube:player_client=android" -x --audio-format mp3 --audio-quality ${AUDIO_QUALITY} -o "${tempFilePath}" "${videoUrl}"`;
        let fileExtension = '.mp3';
        
        try {
            await execAsync('ffmpeg -version');
            console.log('ffmpeg encontrado, usando conversão MP3');
        } catch (error) {
            console.log('ffmpeg não encontrado, usando formato nativo');
            tempFilePath = path.join(tempDir, `${tempFileName}.webm`);
            command = `python -m yt_dlp --user-agent "${userAgent}" --extractor-args "youtube:player_client=android" -f "bestaudio[ext=webm]/bestaudio" -o "${tempFilePath}" "${videoUrl}"`;
            fileExtension = '.webm';
        }
        
        console.log(`Executando: ${command}`);
        
        await execAsync(command);
        
        if (!await fs.pathExists(tempFilePath)) {
            throw new Error('Arquivo não foi criado após a conversão');
        }
        
        const finalFileName = `${headerSafeTitle}${fileExtension}`;
        const encodedFileName = encodeURIComponent(finalFileName);
        
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
        res.setHeader('Content-Type', fileExtension === '.mp3' ? 'audio/mpeg' : 'audio/webm');
        
        const fileStream = fs.createReadStream(tempFilePath);
        
        fileStream.pipe(res);
        
        fileStream.on('end', async () => {
            try {
                await fs.remove(tempFilePath);
            } catch (error) {
                console.error('Erro ao remover arquivo temporário:', error);
            }
        });
        
        fileStream.on('error', async (error) => {
            console.error('Erro ao enviar arquivo:', error);
            try {
                await fs.remove(tempFilePath);
            } catch (err) {
                console.error('Erro ao remover arquivo temporário:', err);
            }
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao enviar arquivo' });
            }
        });

    } catch (error) {
        console.error('Erro na conversão:', error);
        
        if (tempFilePath && await fs.pathExists(tempFilePath)) {
            try {
                await fs.remove(tempFilePath);
            } catch (err) {
                console.error('Erro ao remover arquivo temporário:', err);
            }
        }
        
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Erro na conversão: ' + error.message
            });
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
    console.log(`yt-dlp será instalado automaticamente se necessário`);
});

checkYtDlp().then(installed => {
    if (installed) {
        console.log('yt-dlp está instalado');
    } else {
        console.log('yt-dlp não está instalado, será instalado automaticamente no primeiro uso');
    }
});
