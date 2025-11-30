document.addEventListener('DOMContentLoaded', function() {
    const downloadBtn = document.getElementById('downloadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const videoInfo = document.getElementById('videoInfo');
    const noVideo = document.getElementById('noVideo');
    const videoTitle = document.getElementById('videoTitle');
    const videoId = document.getElementById('videoId');
    const serverStatusCard = document.getElementById('serverStatus');
    const serverStatusText = document.getElementById('serverStatusText');
    const statusIndicator = document.getElementById('statusIndicator');
    const serverInfo = document.getElementById('serverInfo');

    let currentVideoInfo = null;
    let serverUrl = null;
    let isDownloading = false;
    let currentDownloadVideoId = null;

    const downloadIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15V3M12 15L8 11M12 15L16 11M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const processingIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416"><animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/><animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/></circle></svg>';

    async function checkServerStatus() {
        const host = typeof AUDIOFLOW_CONFIG !== 'undefined' ? AUDIOFLOW_CONFIG.SERVER_HOST : 'localhost';
        const port = typeof AUDIOFLOW_CONFIG !== 'undefined' ? AUDIOFLOW_CONFIG.SERVER_PORT : 3000;
        const checkUrl = `http://${host}:${port}`;
        
        console.log(`[checkServerStatus] Verificando: ${checkUrl}`);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log(`[checkServerStatus] Timeout após 5 segundos`);
                controller.abort();
            }, 5000);
            
            const response = await fetch(checkUrl, {
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
            
            console.log(`[checkServerStatus] Resposta: status=${response.status}, ok=${response.ok}`);
            
            if (response.ok) {
                const data = await response.json().catch(() => null);
                serverUrl = checkUrl;
                updateServerStatus('online', `Servidor conectado em ${host}:${port}`);
                console.log(`[checkServerStatus] Servidor online:`, data);
                return true;
            } else {
                const errorMsg = `Servidor respondeu com erro: ${response.status}`;
                updateServerStatus('offline', errorMsg);
                console.error(`[checkServerStatus] ${errorMsg}`);
                return false;
            }
        } catch (error) {
            let errorMsg = 'Servidor não encontrado';
            if (error.name === 'AbortError') {
                errorMsg = `Timeout ao conectar (5s) - Verifique se o servidor está rodando em ${host}:${port}`;
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMsg = `Erro de rede - Verifique se o servidor está acessível em ${host}:${port}`;
            } else {
                errorMsg = `Erro: ${error.message}`;
            }
            
            updateServerStatus('offline', errorMsg);
            console.error(`[checkServerStatus] ${errorMsg}:`, error);
            return false;
        }
    }

    function updateServerStatus(status, message) {
        // Truncar mensagem se muito longa
        const maxMessageLength = 50;
        const truncatedMessage = message.length > maxMessageLength 
            ? message.substring(0, maxMessageLength) + '...' 
            : message;
        serverStatusText.textContent = truncatedMessage;
        serverStatusText.title = message; // Tooltip com texto completo
        statusIndicator.className = `status-indicator ${status}`;
        
        const serverInfoRow = document.getElementById('serverInfoRow');
        if (status === 'online') {
            const serverUrlText = serverUrl || 'localhost:3000';
            // Truncar URL se muito longa
            const maxUrlLength = 30;
            const displayUrl = serverUrlText.length > maxUrlLength 
                ? '...' + serverUrlText.substring(serverUrlText.length - maxUrlLength)
                : serverUrlText;
            serverInfo.textContent = displayUrl;
            serverInfo.title = serverUrlText; // Tooltip com URL completa
            serverInfoRow.style.display = 'flex';
        } else {
            serverInfo.textContent = '';
            serverInfo.title = '';
            serverInfoRow.style.display = 'none';
        }
    }

    function updateVideoInfo(videoData) {
        if (videoData && videoData.videoId) {
            currentVideoInfo = videoData;
            // Título já será truncado pelo CSS com -webkit-line-clamp
            videoTitle.textContent = videoData.title;
            videoTitle.title = videoData.title; // Tooltip com título completo
            
            // Video ID pode ser longo, mas CSS já trata com word-break
            videoId.textContent = `ID: ${videoData.videoId}`;
            videoId.title = `ID: ${videoData.videoId}`; // Tooltip com ID completo
            
            videoInfo.classList.remove('hidden');
            noVideo.classList.add('hidden');
            downloadBtn.disabled = false;
        } else {
            currentVideoInfo = null;
            videoInfo.classList.add('hidden');
            noVideo.classList.remove('hidden');
            downloadBtn.disabled = true;
        }
    }

    function startDownload() {
        if (!currentVideoInfo) {
            return;
        }

        if (isDownloading) {
            return;
        }

        isDownloading = true;
        currentDownloadVideoId = currentVideoInfo.videoId;
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span class="btn-icon">' + processingIcon + '</span><span class="btn-text">Processando...</span>';
        cancelBtn.classList.remove('hidden');

        chrome.runtime.sendMessage({
            action: 'downloadMP3',
            videoInfo: currentVideoInfo
        }, (response) => {
            if (chrome.runtime.lastError) {
                isDownloading = false;
                currentDownloadVideoId = null;
                cancelBtn.classList.add('hidden');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
                return;
            }

            if (!response || !response.success) {
                isDownloading = false;
                currentDownloadVideoId = null;
                cancelBtn.classList.add('hidden');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
                
                // Mostrar erro ao usuário
                if (response && response.error) {
                    alert('Erro no download: ' + response.error);
                } else {
                    alert('Erro desconhecido no download');
                }
            }
        });
    }

    downloadBtn.addEventListener('click', startDownload);

    function cancelDownload() {
        if (!isDownloading || !currentDownloadVideoId) {
            return;
        }

        chrome.runtime.sendMessage({
            action: 'cancelDownload',
            videoId: currentDownloadVideoId
        }, (response) => {
            isDownloading = false;
            currentDownloadVideoId = null;
            cancelBtn.classList.add('hidden');
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
        });
    }

    cancelBtn.addEventListener('click', cancelDownload);

    checkServerStatus().then(serverOnline => {
        if (!serverOnline) {
            downloadBtn.disabled = true;
        }
    });

    function checkDownloadState() {
        chrome.storage.local.get(['downloadingVideoId', 'downloadStatus', 'downloadStartTime'], (result) => {
            if (result.downloadingVideoId && result.downloadStatus === 'processing') {
                const now = Date.now();
                const startTime = result.downloadStartTime || now;
                const timeDiff = now - startTime;
                
                if (timeDiff < 10 * 60 * 1000) {
                    isDownloading = true;
                    currentDownloadVideoId = result.downloadingVideoId;
                    downloadBtn.disabled = true;
                    downloadBtn.innerHTML = '<span class="btn-icon">' + processingIcon + '</span><span class="btn-text">Processando...</span>';
                    cancelBtn.classList.remove('hidden');
                    console.log('Estado de download restaurado no popup');
                } else {
                    chrome.storage.local.remove(['downloadingVideoId', 'downloadStatus', 'downloadStartTime']);
                    console.log('Estado de download antigo removido do popup');
                }
            }
        });
    }

    checkDownloadState();

    const stateCheckInterval = setInterval(checkDownloadState, 2000);

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getVideoInfo'}, function(response) {
                if (chrome.runtime.lastError) {
                    console.log('Erro ao obter informações do vídeo:', chrome.runtime.lastError);
                    updateVideoInfo(null);
                } else {
                    updateVideoInfo(response);
                }
            });
        } else {
            updateVideoInfo(null);
        }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'videoDetected') {
            updateVideoInfo(request.videoInfo);
        } else if (request.action === 'downloadComplete') {
            if (request.videoId === currentDownloadVideoId) {
                isDownloading = false;
                currentDownloadVideoId = null;
                cancelBtn.classList.add('hidden');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
            }
        } else if (request.action === 'downloadError') {
            if (request.videoId === currentDownloadVideoId) {
                isDownloading = false;
                currentDownloadVideoId = null;
                cancelBtn.classList.add('hidden');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
                
                // Mostrar erro ao usuário
                if (request.error) {
                    alert('Erro no download: ' + request.error);
                }
            }
        } else if (request.action === 'downloadCancelled') {
            if (request.videoId === currentDownloadVideoId) {
                isDownloading = false;
                currentDownloadVideoId = null;
                cancelBtn.classList.add('hidden');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<span class="btn-icon">' + downloadIcon + '</span><span class="btn-text">Download MP3</span>';
            }
        }
    });
});
