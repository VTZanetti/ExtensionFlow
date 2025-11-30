importScripts('config.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadMP3') {
        handleDownload(request.videoInfo, sendResponse);
        return true;
    } else if (request.action === 'cancelDownload') {
        cancelDownload(request.videoId, sendResponse);
        return true;
    }
});

let activeDownloads = new Set();
let downloadIds = new Map();
let abortControllers = new Map();
let cancelledDownloads = new Set();

async function handleDownload(videoInfo, sendResponse) {
    try {
        if (!videoInfo || !videoInfo.videoId) {
            sendResponse({success: false, error: 'Informações do vídeo inválidas'});
            return;
        }

        if (activeDownloads.has(videoInfo.videoId)) {
            sendResponse({success: false, error: 'Download já em andamento para este vídeo'});
            return;
        }

        activeDownloads.add(videoInfo.videoId);
        
        chrome.storage.local.set({
            downloadingVideoId: videoInfo.videoId,
            downloadStatus: 'processing',
            downloadStartTime: Date.now()
        });

        notifyPopup('downloadProgress', {progress: 0, videoId: videoInfo.videoId});

        const serverUrl = await findLocalServer();
        
        if (!serverUrl) {
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            sendResponse({success: false, error: 'Servidor local não encontrado na rede'});
            return;
        }
        
        if (cancelledDownloads.has(videoInfo.videoId)) {
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
            notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
            return;
        }

        notifyPopup('downloadProgress', {progress: 25, videoId: videoInfo.videoId});

        const abortController = new AbortController();
        abortControllers.set(videoInfo.videoId, abortController);

        const downloadBlob = await convertWithLocalServer(videoInfo, serverUrl, abortController.signal);
        
        if (!downloadBlob) {
            if (cancelledDownloads.has(videoInfo.videoId)) {
                activeDownloads.delete(videoInfo.videoId);
                downloadIds.delete(videoInfo.videoId);
                abortControllers.delete(videoInfo.videoId);
                chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
                notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
                return;
            }
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            sendResponse({success: false, error: 'Falha na conversão'});
            return;
        }
        
        if (cancelledDownloads.has(videoInfo.videoId)) {
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
            notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
            return;
        }
        
        abortControllers.delete(videoInfo.videoId);

        notifyPopup('downloadProgress', {progress: 75, videoId: videoInfo.videoId});

        const filename = sanitizeFilename(videoInfo.title) + '.' + downloadBlob.extension;
        
        const dataUrl = await blobToDataURL(downloadBlob.blob);
        
        if (cancelledDownloads.has(videoInfo.videoId)) {
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
            notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
            return;
        }
        
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false
        }, (downloadId) => {
            if (cancelledDownloads.has(videoInfo.videoId)) {
                if (downloadId && !chrome.runtime.lastError) {
                    chrome.downloads.cancel(downloadId, () => {});
                }
                activeDownloads.delete(videoInfo.videoId);
                downloadIds.delete(videoInfo.videoId);
                abortControllers.delete(videoInfo.videoId);
                chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
                notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
                return;
            }
            
            if (chrome.runtime.lastError) {
                activeDownloads.delete(videoInfo.videoId);
                downloadIds.delete(videoInfo.videoId);
                notifyPopup('downloadError', {error: chrome.runtime.lastError.message, videoId: videoInfo.videoId});
                sendResponse({success: false, error: chrome.runtime.lastError.message});
            } else {
                downloadIds.set(videoInfo.videoId, downloadId);
                setTimeout(() => {
                    if (!cancelledDownloads.has(videoInfo.videoId)) {
                        activeDownloads.delete(videoInfo.videoId);
                        downloadIds.delete(videoInfo.videoId);
                        abortControllers.delete(videoInfo.videoId);
                        chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
                        notifyPopup('downloadComplete', {videoId: videoInfo.videoId});
                    }
                }, 2000);
                sendResponse({success: true, downloadId: downloadId});
            }
        });

    } catch (error) {
        if (error.name === 'AbortError' || cancelledDownloads.has(videoInfo.videoId)) {
            activeDownloads.delete(videoInfo.videoId);
            downloadIds.delete(videoInfo.videoId);
            abortControllers.delete(videoInfo.videoId);
            chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
            notifyPopup('downloadCancelled', {videoId: videoInfo.videoId});
            return;
        }
        console.error('Erro no download:', error);
        activeDownloads.delete(videoInfo.videoId);
        downloadIds.delete(videoInfo.videoId);
        abortControllers.delete(videoInfo.videoId);
        chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
        notifyPopup('downloadError', {error: error.message, videoId: videoInfo.videoId});
        sendResponse({success: false, error: error.message});
    }
}

function cancelDownload(videoId, sendResponse) {
    try {
        if (!videoId || !activeDownloads.has(videoId)) {
            sendResponse({success: false, error: 'Download não encontrado'});
            return;
        }

        cancelledDownloads.add(videoId);

        const abortController = abortControllers.get(videoId);
        if (abortController) {
            abortController.abort();
        }

        const downloadId = downloadIds.get(videoId);
        if (downloadId) {
            chrome.downloads.cancel(downloadId, () => {
                if (chrome.runtime.lastError) {
                    console.error('Erro ao cancelar download:', chrome.runtime.lastError);
                }
            });
        }

        activeDownloads.delete(videoId);
        downloadIds.delete(videoId);
        abortControllers.delete(videoId);
        chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
        notifyPopup('downloadCancelled', {videoId: videoId});
        
        setTimeout(() => {
            cancelledDownloads.delete(videoId);
        }, 5000);
        
        sendResponse({success: true});
    } catch (error) {
        console.error('Erro ao cancelar download:', error);
        sendResponse({success: false, error: error.message});
    }
}

async function findLocalServer() {
    const host = typeof AUDIOFLOW_CONFIG !== 'undefined' ? AUDIOFLOW_CONFIG.SERVER_HOST : 'localhost';
    const port = typeof AUDIOFLOW_CONFIG !== 'undefined' ? AUDIOFLOW_CONFIG.SERVER_PORT : 3000;
    const serverUrl = `http://${host}:${port}`;
    
    console.log(`[findLocalServer] Tentando conectar em: ${serverUrl}`);
    console.log(`[findLocalServer] Config: host=${host}, port=${port}`);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.log(`[findLocalServer] Timeout após 5 segundos`);
            controller.abort();
        }, 5000);
        
        console.log(`[findLocalServer] Iniciando fetch...`);
        const response = await fetch(`${serverUrl}/`, {
            method: 'GET',
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            cache: 'no-cache',
            signal: controller.signal
        }).finally(() => {
            clearTimeout(timeoutId);
        });
        
        console.log(`[findLocalServer] Resposta recebida: status=${response.status}, ok=${response.ok}`);
        
        if (response.ok) {
            const data = await response.json().catch(() => null);
            console.log(`[findLocalServer] Servidor encontrado em: ${serverUrl}`, data);
            return serverUrl;
        } else {
            console.error(`[findLocalServer] Servidor respondeu com erro: ${response.status} ${response.statusText}`);
            const text = await response.text().catch(() => '');
            console.error(`[findLocalServer] Resposta:`, text.substring(0, 200));
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[findLocalServer] Timeout ao conectar em ${serverUrl} (5 segundos)`);
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.error(`[findLocalServer] Erro de rede ao conectar em ${serverUrl}:`, error.message);
            console.error(`[findLocalServer] Possíveis causas:`);
            console.error(`  - Servidor não está rodando`);
            console.error(`  - Firewall bloqueando a conexão`);
            console.error(`  - IP ou porta incorretos`);
        } else if (error.message.includes('CORS')) {
            console.error(`[findLocalServer] Erro CORS ao conectar em ${serverUrl}:`, error.message);
        } else {
            console.error(`[findLocalServer] Erro desconhecido ao conectar em ${serverUrl}:`, error.message);
            console.error(`[findLocalServer] Stack:`, error.stack);
        }
    }
    
    console.error(`[findLocalServer] Servidor não encontrado após todas as tentativas`);
    return null;
}

async function convertWithLocalServer(videoInfo, serverUrl, signal) {
    try {
        const videoTitle = await getVideoTitle(videoInfo.videoId);
        console.log(`Iniciando conversão: ${videoInfo.videoId} - ${videoTitle}`);
        
        // Timeout de 15 minutos para conversão (vídeos longos podem demorar)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);
        
        // Combinar signals (timeout + cancelamento manual)
        if (signal) {
            signal.addEventListener('abort', () => {
                controller.abort();
                clearTimeout(timeoutId);
            });
        }
        
        const response = await fetch(`${serverUrl}/convert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoId: videoInfo.videoId,
                title: videoTitle
            }),
            signal: controller.signal
        }).finally(() => {
            clearTimeout(timeoutId);
        });
        
        if (!response.ok) {
            // Tentar ler erro JSON se disponível
            let errorMessage = `Servidor local error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                console.error('Erro do servidor:', errorData);
            } catch {
                // Se não for JSON, usar mensagem padrão
                const text = await response.text();
                console.error('Resposta de erro do servidor:', text.substring(0, 200));
            }
            throw new Error(errorMessage);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const contentDisposition = response.headers.get('content-disposition') || '';
        
        // Verificar se a resposta é JSON (erro) ou blob (sucesso)
        if (contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro desconhecido do servidor');
        }
        
        let extension = 'mp3';
        if (contentType.includes('webm')) {
            extension = 'webm';
        } else if (contentDisposition.includes('.webm')) {
            extension = 'webm';
        }
        
        const blob = await response.blob();
        
        if (blob.size === 0) {
            throw new Error('Arquivo vazio recebido do servidor');
        }
        
        return {
            blob: blob,
            extension: extension
        };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }
        console.error('Servidor local falhou:', error.message);
        console.error('Stack:', error.stack);
        return null;
    }
}

async function getVideoTitle(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        if (!response.ok) return 'YouTube Video';
        
        const html = await response.text();
        const titleMatch = html.match(/<title>([^<]+)</);
        
        if (titleMatch) {
            return titleMatch[1].replace(' - YouTube', '').trim();
        }
        
        return 'YouTube Video';
    } catch (error) {
        return 'YouTube Video';
    }
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
}

function notifyPopup(action, data) {
    chrome.runtime.sendMessage({
        action: action,
        ...data
    }).catch(() => {});
}

async function restoreActiveDownloads() {
    try {
        const result = await chrome.storage.local.get(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
        
        if (result.downloadingVideoId && result.downloadStatus === 'processing') {
            const now = Date.now();
            const startTime = result.downloadStartTime || now;
            const timeDiff = now - startTime;
            
            if (timeDiff < 10 * 60 * 1000) {
                activeDownloads.add(result.downloadingVideoId);
                console.log('Estado de download restaurado para:', result.downloadingVideoId);
            } else {
                chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
                console.log('Estado de download antigo removido');
            }
        }
    } catch (error) {
        console.error('Erro ao restaurar estado:', error);
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('AudioFlow instalado');
    }
    restoreActiveDownloads();
});

restoreActiveDownloads();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabId, {action: 'pageUpdated'}).catch(() => {});
    }
});
