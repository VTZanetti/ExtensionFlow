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
        
        try {
            const response = await fetch(checkUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.ok) {
                serverUrl = checkUrl;
                updateServerStatus('online', 'Servidor local conectado');
                return true;
            }
        } catch (error) {
        }
        
        updateServerStatus('offline', 'Servidor não encontrado');
        return false;
    }

    function updateServerStatus(status, message) {
        serverStatusText.textContent = message;
        statusIndicator.className = `status-indicator ${status}`;
        
        const serverInfoRow = document.getElementById('serverInfoRow');
        if (status === 'online') {
            serverInfo.textContent = `${serverUrl || 'localhost:3000'}`;
            serverInfoRow.style.display = 'flex';
        } else {
            serverInfo.textContent = '';
            serverInfoRow.style.display = 'none';
        }
    }

    function updateVideoInfo(videoData) {
        if (videoData && videoData.videoId) {
            currentVideoInfo = videoData;
            videoTitle.textContent = videoData.title;
            videoId.textContent = `ID: ${videoData.videoId}`;
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
