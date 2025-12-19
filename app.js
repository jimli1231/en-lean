// ==========================================
// SpeakSmart - English Pronunciation Practice
// ==========================================

// Global State
let practiceText = '';
let isRecording = false;
let isPaused = false;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let animationId = null;
let pronunciationResults = null;
let selectedVoice = null;
let synth = window.speechSynthesis;

// 新增状态
let isMuted = false;  // 静音状态
let lastRecordingBlob = null;  // 保存最后一次录音
let lastRecordingUrl = null;  // 录音的 URL
let currentAudio = null;  // 当前播放的音频

// 语音转文字相关状态
let isSttRecording = false;
let sttMediaRecorder = null;
let sttAudioChunks = [];
let sttRecordingBlob = null;
let sttRecordingUrl = null;

// DOM Elements
const elements = {
    inputModal: document.getElementById('inputModal'),
    practiceView: document.getElementById('practiceView'),
    settingsModal: document.getElementById('settingsModal'),
    practiceTextInput: document.getElementById('practiceTextInput'),
    practiceTextDisplay: document.getElementById('practiceText'),
    recordBtn: document.getElementById('recordBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    micIcon: document.getElementById('micIcon'),
    stopIcon: document.getElementById('stopIcon'),
    waveformContainer: document.getElementById('waveformContainer'),
    waveformCanvas: document.getElementById('waveformCanvas'),
    recordingHint: document.getElementById('recordingHint'),
    resultsSection: document.getElementById('resultsSection'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    scoreValue: document.getElementById('scoreValue'),
    phonemeScore: document.getElementById('phonemeScore'),
    phonemeProgress: document.getElementById('phonemeProgress'),
    flowScore: document.getElementById('flowScore'),
    flowProgress: document.getElementById('flowProgress'),
    tipText: document.getElementById('tipText'),
    coachNotes: document.getElementById('coachNotes'),
    wordTooltip: document.getElementById('wordTooltip'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    voiceSelect: document.getElementById('voiceSelect'),
    // 新增元素
    muteBtn: document.getElementById('muteBtn'),
    volumeOnIcon: document.getElementById('volumeOnIcon'),
    volumeOffIcon: document.getElementById('volumeOffIcon'),
    playRecordingBtn: document.getElementById('playRecordingBtn'),
    // 语音转文字元素
    sttRecordBtn: document.getElementById('sttRecordBtn'),
    sttMicIcon: document.getElementById('sttMicIcon'),
    sttStopIcon: document.getElementById('sttStopIcon'),
    sttHint: document.getElementById('sttHint'),
    sttResult: document.getElementById('sttResult'),
    sttResultText: document.getElementById('sttResultText')
};

// Sample texts for practice - 日常对话
const sampleTexts = [
    "Hi, how are you doing today? I'm fine, thanks for asking.",
    "Could you tell me how to get to the nearest subway station?",
    "I'd like a cup of coffee, please. With milk and no sugar.",
    "What time does the meeting start? I think it's at three o'clock.",
    "Nice to meet you! My name is Tom. I work as a software engineer.",
    "The weather is really nice today. Would you like to go for a walk?",
    "Excuse me, is this seat taken? No, please go ahead and sit down.",
    "I'm sorry, I didn't catch that. Could you please say it again?",
    "What do you usually do on weekends? I like to watch movies and hang out with friends.",
    "Can I have the check, please? Sure, I'll be right back with it.",
    "How was your trip? It was amazing! I had a great time.",
    "I'm looking for a birthday gift for my friend. Any suggestions?",
    "Let's grab lunch together. There's a new restaurant nearby.",
    "I've been learning English for about two years now.",
    "Could you help me with this? Of course, no problem at all."
];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initVoices();
    loadMuteState();
    
    // Initialize with a sample text
    elements.practiceTextInput.value = sampleTexts[0];
});

// 加载静音状态
function loadMuteState() {
    isMuted = localStorage.getItem('audio_muted') === 'true';
    updateMuteUI();
}

// 切换静音状态
function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('audio_muted', isMuted);
    updateMuteUI();
    
    // 如果正在播放，停止所有音频
    if (isMuted) {
        stopAllAudio();
    }
}

// 更新静音 UI
function updateMuteUI() {
    if (isMuted) {
        elements.muteBtn.classList.add('muted');
        elements.volumeOnIcon.classList.add('hidden');
        elements.volumeOffIcon.classList.remove('hidden');
    } else {
        elements.muteBtn.classList.remove('muted');
        elements.volumeOnIcon.classList.remove('hidden');
        elements.volumeOffIcon.classList.add('hidden');
    }
}

// 停止所有音频
function stopAllAudio() {
    // 停止 TTS
    synth.cancel();
    
    // 停止当前播放的录音
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

// Load saved settings
function loadSettings() {
    // Default API Key (can be overridden in settings)
    const defaultApiKey = 'AIzaSyAdDVr47bGi-rp3dFYaF4mkn_I5APzDj1E';
    
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        apiKey = defaultApiKey;
        localStorage.setItem('gemini_api_key', apiKey);
    }
    elements.apiKeyInput.value = apiKey;
}

// Initialize TTS voices
function initVoices() {
    function populateVoices() {
        const voices = synth.getVoices();
        elements.voiceSelect.innerHTML = '';
        
        // Filter for English voices
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        
        englishVoices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            option.dataset.voice = voice.name;
            elements.voiceSelect.appendChild(option);
        });
        
        // Select saved voice or default
        const savedVoice = localStorage.getItem('selected_voice');
        if (savedVoice) {
            const options = elements.voiceSelect.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].dataset.voice === savedVoice) {
                    elements.voiceSelect.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }
}

// Generate random sample text
function generateSample() {
    const currentText = elements.practiceTextInput.value;
    let newText;
    do {
        newText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    } while (newText === currentText && sampleTexts.length > 1);
    
    elements.practiceTextInput.value = newText;
}

// Start practice
function startPractice() {
    practiceText = elements.practiceTextInput.value.trim();
    
    if (!practiceText) {
        alert('Please enter some text to practice!');
        return;
    }
    
    // Display practice text
    displayPracticeText(practiceText);
    
    // Switch views
    elements.inputModal.classList.remove('active');
    elements.practiceView.classList.remove('hidden');
    elements.resultsSection.classList.add('hidden');
}

// Display practice text with word spans
function displayPracticeText(text, results = null) {
    const words = text.split(/\s+/);
    
    elements.practiceTextDisplay.innerHTML = words.map((word, index) => {
        let className = 'word';
        let pronunciation = '';
        
        if (results && results.wordAnalysis) {
            const analysis = results.wordAnalysis.find(w => 
                w.word.toLowerCase().replace(/[^a-z]/g, '') === word.toLowerCase().replace(/[^a-z]/g, '')
            );
            if (analysis) {
                className += analysis.correct ? ' correct' : ' incorrect';
                pronunciation = analysis.pronunciation || '';
            }
        }
        
        return `<span class="${className}" data-word="${word}" data-pronunciation="${pronunciation}" data-index="${index}">${word}</span>`;
    }).join(' ');
    
    // Add click listeners for incorrect words
    document.querySelectorAll('.word.incorrect').forEach(wordEl => {
        wordEl.addEventListener('click', handleWordClick);
        wordEl.addEventListener('mouseenter', handleWordHover);
        wordEl.addEventListener('mouseleave', hideTooltip);
    });
}

// Handle word click - play pronunciation
function handleWordClick(e) {
    const word = e.target.dataset.word;
    speakWord(word);
}

// Handle word hover - show tooltip
function handleWordHover(e) {
    const word = e.target.dataset.word;
    const pronunciation = e.target.dataset.pronunciation;
    const rect = e.target.getBoundingClientRect();
    const containerRect = elements.practiceTextDisplay.getBoundingClientRect();
    
    elements.wordTooltip.querySelector('.tooltip-text').textContent = 
        pronunciation ? `Pronounced '${pronunciation}'` : `Click to hear '${word}'`;
    
    elements.wordTooltip.style.left = `${rect.left - containerRect.left}px`;
    elements.wordTooltip.style.top = `${rect.top - containerRect.top - 50}px`;
    elements.wordTooltip.classList.remove('hidden');
}

// Hide tooltip
function hideTooltip() {
    elements.wordTooltip.classList.add('hidden');
}

// Edit text
function editText() {
    elements.practiceView.classList.add('hidden');
    elements.inputModal.classList.add('active');
    elements.resultsSection.classList.add('hidden');
}

// Refresh with new text
function refreshText() {
    generateSample();
    startPractice();
}

// Toggle recording
async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup audio context for visualization
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        
        // Setup media recorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // 保存录音以便回放
            lastRecordingBlob = audioBlob;
            if (lastRecordingUrl) {
                URL.revokeObjectURL(lastRecordingUrl);
            }
            lastRecordingUrl = URL.createObjectURL(audioBlob);
            
            await analyzeAudio(audioBlob);
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI
        elements.recordBtn.classList.add('recording');
        elements.micIcon.classList.add('hidden');
        elements.stopIcon.classList.remove('hidden');
        elements.pauseBtn.classList.remove('hidden');
        elements.waveformContainer.classList.remove('hidden');
        elements.recordingHint.textContent = 'Recording... Click to stop';
        elements.resultsSection.classList.add('hidden');
        
        // Start visualization
        drawWaveform();
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please allow microphone access and try again.');
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        isRecording = false;
        isPaused = false;
        
        // Update UI
        elements.recordBtn.classList.remove('recording');
        elements.micIcon.classList.remove('hidden');
        elements.stopIcon.classList.add('hidden');
        elements.pauseBtn.classList.add('hidden');
        elements.waveformContainer.classList.add('hidden');
        elements.recordingHint.textContent = 'Click to start recording';
        
        // Stop visualization
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    }
}

// Pause recording
function pauseRecording() {
    if (mediaRecorder) {
        if (!isPaused) {
            mediaRecorder.pause();
            isPaused = true;
            elements.recordingHint.textContent = 'Paused... Click to resume';
        } else {
            mediaRecorder.resume();
            isPaused = false;
            elements.recordingHint.textContent = 'Recording... Click to stop';
        }
    }
}

// Draw waveform visualization
function drawWaveform() {
    const canvas = elements.waveformCanvas;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.offsetWidth / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.offsetHeight * 0.8;
            
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight);
            gradient.addColorStop(0, '#3b82f6');
            gradient.addColorStop(1, '#8b5cf6');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, (canvas.offsetHeight - barHeight) / 2, barWidth - 1, barHeight);
            
            x += barWidth;
        }
    }
    
    draw();
}

// Analyze audio with Gemini API
async function analyzeAudio(audioBlob) {
    elements.loadingOverlay.classList.remove('hidden');
    
    const apiKey = localStorage.getItem('gemini_api_key');
    
    if (!apiKey) {
        elements.loadingOverlay.classList.add('hidden');
        alert('Please set your Gemini API key in Settings first!');
        openSettings();
        return;
    }
    
    try {
        // Convert audio to base64
        const base64Audio = await blobToBase64(audioBlob);
        
        // Call Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'audio/webm',
                                data: base64Audio
                            }
                        },
                        {
                            text: `You are an expert English pronunciation coach. Analyze this audio recording where the speaker is trying to read the following text:

"${practiceText}"

Please analyze the pronunciation and provide a detailed assessment in the following JSON format only (no other text):
{
    "overallScore": <number 0-100>,
    "phonemeAccuracy": <number 0-100>,
    "flowRhythm": <number 0-100>,
    "wordAnalysis": [
        {
            "word": "<word>",
            "correct": <boolean>,
            "pronunciation": "<how they pronounced it, if wrong>",
            "correctPronunciation": "<IPA or simple phonetic>"
        }
    ],
    "tip": "<用中文给出一个具体可执行的发音改进建议，针对最明显的发音问题>",
    "coachNotes": "<用中文写2-3句话，详细反馈整体发音情况、具体的错误模式，并给予鼓励>"
}

请用中文回复 tip 和 coachNotes 字段。要热情友好、鼓励学习者。如果音频不清晰或静音，给低分并在反馈中用中文说明。`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract the JSON from the response
        let resultText = data.candidates[0].content.parts[0].text;
        
        // Clean up the response - remove markdown code blocks if present
        resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const results = JSON.parse(resultText);
        displayResults(results);
        
    } catch (error) {
        console.error('Error analyzing audio:', error);
        
        // Fallback to mock results for demo
        const mockResults = generateMockResults();
        displayResults(mockResults);
    }
    
    elements.loadingOverlay.classList.add('hidden');
}

// Convert blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Generate mock results for demo/fallback
function generateMockResults() {
    const words = practiceText.split(/\s+/);
    const wordAnalysis = words.map(word => ({
        word: word,
        correct: Math.random() > 0.3,
        pronunciation: Math.random() > 0.5 ? '' : `${word.slice(0, -1)}a`,
        correctPronunciation: word
    }));
    
    const correctCount = wordAnalysis.filter(w => w.correct).length;
    const overallScore = Math.round((correctCount / words.length) * 100);
    
    return {
        overallScore: overallScore,
        phonemeAccuracy: Math.max(30, overallScore - 10 + Math.floor(Math.random() * 20)),
        flowRhythm: Math.max(30, overallScore - 5 + Math.floor(Math.random() * 15)),
        wordAnalysis: wordAnalysis,
        tip: "注意 'th' 的发音 - 把舌头放在上下齿之间，轻轻吹气发出摩擦音。",
        coachNotes: "做得不错！你的发音正在进步。特别注意辅音连读和单词结尾的发音。继续练习，你会越来越好的！加油！"
    };
}

// Display results
function displayResults(results) {
    pronunciationResults = results;
    
    // Update text display with word highlighting
    displayPracticeText(practiceText, results);
    
    // Animate score
    animateScore(results.overallScore);
    
    // Update metrics
    elements.phonemeScore.textContent = `${results.phonemeAccuracy}%`;
    elements.phonemeProgress.style.width = `${results.phonemeAccuracy}%`;
    
    elements.flowScore.textContent = `${results.flowRhythm}%`;
    elements.flowProgress.style.width = `${results.flowRhythm}%`;
    
    // Update tip and coach notes
    elements.tipText.textContent = results.tip;
    elements.coachNotes.textContent = `"${results.coachNotes}"`;
    
    // Apply score color class
    const scoreEl = elements.scoreValue;
    scoreEl.classList.remove('good', 'great');
    if (results.overallScore >= 80) {
        scoreEl.classList.add('great');
    } else if (results.overallScore >= 60) {
        scoreEl.classList.add('good');
    }
    
    // Show results section
    elements.resultsSection.classList.remove('hidden');
}

// Animate score counter
function animateScore(targetScore) {
    let current = 0;
    const duration = 1000;
    const step = targetScore / (duration / 16);
    
    function update() {
        current = Math.min(current + step, targetScore);
        elements.scoreValue.textContent = Math.round(current);
        
        if (current < targetScore) {
            requestAnimationFrame(update);
        }
    }
    
    update();
}

// Hear coach feedback
function hearCoach() {
    if (pronunciationResults) {
        speakText(pronunciationResults.coachNotes);
    }
}

// Retry recording
function retryRecording() {
    elements.resultsSection.classList.add('hidden');
    displayPracticeText(practiceText);
}

// Play native version
function playNativeVersion() {
    speakText(practiceText);
}

// Speak single word
function speakWord(word) {
    speakText(word, 0.8);
}

// Text-to-speech function
function speakText(text, rate = 0.9) {
    // 如果静音，不播放
    if (isMuted) {
        console.log('音频已静音');
        return;
    }
    
    // Cancel any ongoing speech
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = 1;
    
    // Get selected voice
    const voices = synth.getVoices().filter(v => v.lang.startsWith('en'));
    const selectedIndex = elements.voiceSelect.selectedIndex;
    if (voices[selectedIndex]) {
        utterance.voice = voices[selectedIndex];
    }
    
    synth.speak(utterance);
}

// 播放我的录音
function playMyRecording() {
    if (isMuted) {
        alert('请先取消静音以播放录音');
        return;
    }
    
    if (!lastRecordingUrl) {
        alert('还没有录音可以播放');
        return;
    }
    
    // 停止之前的音频
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
    
    currentAudio = new Audio(lastRecordingUrl);
    currentAudio.play();
}

// ==========================================
// 语音转英文功能
// ==========================================

// 切换语音转文字录音
async function toggleSpeechToText() {
    if (!isSttRecording) {
        await startSttRecording();
    } else {
        stopSttRecording();
    }
}

// 开始语音转文字录音
async function startSttRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        sttMediaRecorder = new MediaRecorder(stream);
        sttAudioChunks = [];
        
        sttMediaRecorder.ondataavailable = (event) => {
            sttAudioChunks.push(event.data);
        };
        
        sttMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(sttAudioChunks, { type: 'audio/webm' });
            
            // 保存录音以便回放
            sttRecordingBlob = audioBlob;
            if (sttRecordingUrl) {
                URL.revokeObjectURL(sttRecordingUrl);
            }
            sttRecordingUrl = URL.createObjectURL(audioBlob);
            
            await transcribeAudio(audioBlob);
        };
        
        sttMediaRecorder.start();
        isSttRecording = true;
        
        // 更新 UI
        elements.sttRecordBtn.classList.add('recording');
        elements.sttMicIcon.classList.add('hidden');
        elements.sttStopIcon.classList.remove('hidden');
        elements.sttHint.textContent = '录音中... 点击停止';
        elements.sttResult.classList.add('hidden');
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('无法访问麦克风，请允许麦克风权限后重试。');
    }
}

// 停止语音转文字录音
function stopSttRecording() {
    if (sttMediaRecorder && isSttRecording) {
        sttMediaRecorder.stop();
        sttMediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        isSttRecording = false;
        
        // 更新 UI
        elements.sttRecordBtn.classList.remove('recording');
        elements.sttMicIcon.classList.remove('hidden');
        elements.sttStopIcon.classList.add('hidden');
        elements.sttHint.textContent = '正在翻译...';
    }
}

// 使用 Gemini API 将音频转换为英文
async function transcribeAudio(audioBlob) {
    const apiKey = localStorage.getItem('gemini_api_key');
    
    if (!apiKey) {
        alert('请先在设置中配置 Gemini API Key！');
        elements.sttHint.textContent = '点击开始录音';
        openSettings();
        return;
    }
    
    try {
        const base64Audio = await blobToBase64(audioBlob);
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'audio/webm',
                                data: base64Audio
                            }
                        },
                        {
                            text: `Listen to this audio recording and transcribe what the speaker is saying. 
If the speaker is speaking in a language other than English, translate it to English.
If the speaker is already speaking English, just transcribe it.
If there's no clear speech or the audio is silent, respond with "[No speech detected]".

Only output the transcribed/translated English text, nothing else. Do not add any explanations or notes.`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        const resultText = data.candidates[0].content.parts[0].text.trim();
        
        // 显示结果
        elements.sttResultText.textContent = resultText;
        elements.sttResult.classList.remove('hidden');
        elements.sttHint.textContent = '点击开始新录音';
        
    } catch (error) {
        console.error('Error transcribing audio:', error);
        elements.sttHint.textContent = '翻译失败，请重试';
        alert('语音转换失败：' + error.message);
    }
}

// 播放语音转文字的录音
function playSttRecording() {
    if (isMuted) {
        alert('请先取消静音以播放录音');
        return;
    }
    
    if (!sttRecordingUrl) {
        alert('还没有录音可以播放');
        return;
    }
    
    // 停止之前的音频
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
    
    currentAudio = new Audio(sttRecordingUrl);
    currentAudio.play();
}

// 使用翻译结果作为练习文本
function useSttResult() {
    const text = elements.sttResultText.textContent;
    if (text && text !== '[No speech detected]') {
        elements.practiceTextInput.value = text;
        startPractice();
    } else {
        alert('没有有效的文本可以使用');
    }
}

// Settings functions
function openSettings() {
    elements.settingsModal.classList.add('active');
}

function closeSettings() {
    elements.settingsModal.classList.remove('active');
}

function saveSettings() {
    const apiKey = elements.apiKeyInput.value.trim();
    
    if (apiKey) {
        localStorage.setItem('gemini_api_key', apiKey);
    }
    
    // Save selected voice
    const selectedOption = elements.voiceSelect.options[elements.voiceSelect.selectedIndex];
    if (selectedOption) {
        localStorage.setItem('selected_voice', selectedOption.dataset.voice);
    }
    
    closeSettings();
    alert('Settings saved!');
}

// Test API Key
async function testApiKey() {
    const apiKey = elements.apiKeyInput.value.trim();
    const testBtn = document.getElementById('testApiBtn');
    const resultDiv = document.getElementById('apiTestResult');
    
    if (!apiKey) {
        resultDiv.className = 'api-test-result error';
        resultDiv.innerHTML = '❌ 请先输入 API Key';
        return;
    }
    
    // Show loading state
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    resultDiv.className = 'api-test-result loading';
    resultDiv.innerHTML = '⏳ 正在测试 API Key...';
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: 'Say "API key is valid" in exactly 4 words.'
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 50
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resultDiv.className = 'api-test-result success';
            resultDiv.innerHTML = `✅ API Key 有效！响应: "${text.trim()}"`;
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
            resultDiv.className = 'api-test-result error';
            resultDiv.innerHTML = `❌ API Key 无效: ${errorMsg}`;
        }
    } catch (error) {
        resultDiv.className = 'api-test-result error';
        resultDiv.innerHTML = `❌ 网络错误: ${error.message}`;
    }
    
    // Reset button
    testBtn.disabled = false;
    testBtn.textContent = '测试';
}

// Prevent closing settings when clicking inside
document.querySelector('.settings-content')?.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Close settings when clicking outside
elements.settingsModal?.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
        closeSettings();
    }
});

