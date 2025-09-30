import { settings } from './state.js';
import { rendererEvents } from './events.js';

let audioEl;
let playlist = [];
let currentIndex = 0;
let isPlaying = false;
let audioContext, analyser, sourceNode, dataArray, visualizerFrameId;

const dom = {
    playerContainer: document.getElementById('music-player-container'),
    nowPlayingTitle: document.getElementById('now-playing-title'),
    visualizerCanvas: document.getElementById('audio-visualizer'),
    playPauseBtn: document.getElementById('music-play-pause-btn'),
    playPauseIcon: document.getElementById('music-play-pause-icon'),
    prevBtn: document.getElementById('music-prev-btn'),
    nextBtn: document.getElementById('music-next-btn'),
    playlistContainer: document.getElementById('music-playlist'),
};

function cleanTrackName(uri) {
    try {
        const decodedUri = decodeURIComponent(uri);
        const fileName = decodedUri.split('/').pop();
        return fileName.replace(/\.(mp3|wav)$/i, '').trim();
    } catch (e) {
        return "Unknown Track";
    }
}

function updateUI() {
    // Update play/pause button
    dom.playPauseIcon.classList.toggle('fa-play', !isPlaying);
    dom.playPauseIcon.classList.toggle('fa-pause', isPlaying);
    dom.playPauseBtn.title = isPlaying ? 'Pause' : 'Play';

    // Update now playing title
    dom.nowPlayingTitle.textContent = cleanTrackName(playlist[currentIndex]);
    dom.nowPlayingTitle.title = cleanTrackName(playlist[currentIndex]);

    // Update active playlist item
    const items = dom.playlistContainer.querySelectorAll('.playlist-item');
    items.forEach((item, index) => {
        item.classList.toggle('active', index === currentIndex);
    });
}

function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    audioEl.src = playlist[currentIndex];
    
    // The visualizer requires a user interaction to start the AudioContext.
    // We attempt to play, and if successful, we know we can init the visualizer.
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            isPlaying = true;
            updateUI();
            if (!audioContext) {
                setupVisualizer();
            }
        }).catch(error => {
            console.error("Audio playback failed:", error);
            isPlaying = false;
            updateUI();
        });
    }
}

function togglePlayPause() {
    if (isPlaying) {
        audioEl.pause();
    } else {
        audioEl.play().catch(e => console.error("Could not resume playback:", e));
    }
    isPlaying = !isPlaying;
    updateUI();
}

function playNext() {
    const nextIndex = (currentIndex + 1) % playlist.length;
    playTrack(nextIndex);
}

function playPrev() {
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playTrack(prevIndex);
}

function renderPlaylist() {
    dom.playlistContainer.innerHTML = '';
    playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.textContent = cleanTrackName(track);
        item.title = cleanTrackName(track);
        item.dataset.index = index;
        item.addEventListener('click', () => playTrack(index));
        dom.playlistContainer.appendChild(item);
    });
}

function drawVisualizer() {
    if (!analyser || !isPlaying) {
        // Clear canvas when paused
        const ctx = dom.visualizerCanvas.getContext('2d');
        ctx.clearRect(0, 0, dom.visualizerCanvas.width, dom.visualizerCanvas.height);
        return;
    }

    visualizerFrameId = requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    const ctx = dom.visualizerCanvas.getContext('2d');
    const { width, height } = dom.visualizerCanvas;
    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / analyser.frequencyBinCount) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
        barHeight = dataArray[i] * (height / 255);
        
        ctx.fillStyle = `rgba(0, 255, 127, ${0.4 + (barHeight / height) * 0.6})`;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
    }
}

function setupVisualizer() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        // Check if sourceNode already exists for this element
        if (!audioEl.sourceNode) {
            sourceNode = audioContext.createMediaElementSource(audioEl);
            audioEl.sourceNode = sourceNode;
        } else {
            sourceNode = audioEl.sourceNode;
        }

        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        drawVisualizer();
    } catch (e) {
        console.error("Failed to initialize audio visualizer:", e);
    }
}

export function init(bgmPaths) {
    if (!bgmPaths || bgmPaths.length === 0) return;
    
    audioEl = document.getElementById('bgm');
    playlist = bgmPaths;
    dom.playerContainer.classList.remove('hidden');

    renderPlaylist();
    updateUI();

    dom.playPauseBtn.addEventListener('click', togglePlayPause);
    dom.nextBtn.addEventListener('click', playNext);
    dom.prevBtn.addEventListener('click', playPrev);
    
    audioEl.addEventListener('ended', playNext);
    audioEl.addEventListener('play', () => {
        isPlaying = true;
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        updateUI();
        if (!visualizerFrameId) {
            drawVisualizer();
        }
    });
    audioEl.addEventListener('pause', () => {
        isPlaying = false;
        updateUI();
        cancelAnimationFrame(visualizerFrameId);
        visualizerFrameId = null;
        // Also call drawVisualizer once to clear the canvas
        drawVisualizer();
    });

    rendererEvents.on('music:set-play-state', (shouldPlay) => {
        if (shouldPlay && !isPlaying) {
            togglePlayPause();
        } else if (!shouldPlay && isPlaying) {
            togglePlayPause();
        }
    });

    // Initial play based on settings
    if (settings.playMusic) {
        playTrack(0);
    } else {
        // Load the first track but don't play it
        currentIndex = 0;
        audioEl.src = playlist[currentIndex];
        updateUI();
    }
}