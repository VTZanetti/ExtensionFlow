(function() {
    'use strict';

    function getVideoId() {
        const url = window.location.href;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
        if (match && match[1]) {
            return match[1];
        }
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    function getVideoTitle() {
        const selectors = [
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-video-primary-info-renderer',
            'h1.title.style-scope.ytd-video-primary-info-renderer',
            'h1.ytd-video-primary-info-renderer',
            'h1[class*="title"]',
            'ytd-watch-metadata h1',
            'title'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                const title = element.textContent.trim();
                if (title && title !== 'YouTube') {
                    return title.replace(' - YouTube', '').trim();
                }
            }
        }
        
        return 'YouTube Video';
    }

    function getVideoInfo() {
        const videoId = getVideoId();
        const title = getVideoTitle();
        
        if (!videoId) {
            return null;
        }

        return {
            videoId: videoId,
            title: title,
            url: window.location.href
        };
    }

    function sendVideoInfo() {
        const videoInfo = getVideoInfo();
        if (videoInfo) {
            chrome.runtime.sendMessage({
                action: 'videoDetected',
                videoInfo: videoInfo
            }).catch(() => {});
        }
    }

    let currentUrl = window.location.href;
    let checkInterval = null;

    function checkUrlChange() {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(() => {
                sendVideoInfo();
            }, 1500);
        }
    }

    function startMonitoring() {
        if (checkInterval) {
            clearInterval(checkInterval);
        }
        
        checkInterval = setInterval(checkUrlChange, 1000);
        
        const observer = new MutationObserver(() => {
            checkUrlChange();
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        window.addEventListener('popstate', () => {
            setTimeout(() => {
                checkUrlChange();
            }, 500);
        });

        if (getVideoId()) {
            setTimeout(sendVideoInfo, 1500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startMonitoring);
    } else {
        startMonitoring();
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getVideoInfo') {
            const videoInfo = getVideoInfo();
            sendResponse(videoInfo);
        } else if (request.action === 'pageUpdated') {
            setTimeout(() => {
                sendVideoInfo();
            }, 1000);
        }
        return true;
    });

})();
