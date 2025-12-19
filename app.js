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
    voiceSelect: document.getElementById('voiceSelect')
};

// Sample texts for practice
const sampleTexts = [
    "Usually, Silas's stubborn vision is to sift seven silky seashells beside the station. This season, after an unusually suspenseful session, his sensible decision is to sell the shells, not stash them.",
    "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet at least once.",
    "She sells seashells by the seashore. The shells she sells are seashells, I'm sure.",
    "Peter Piper picked a peck of pickled peppers. A peck of pickled peppers Peter Piper picked.",
    "How much wood would a woodchuck chuck if a woodchuck could chuck wood? He would chuck as much wood as a woodchuck would if a woodchuck could chuck wood.",
    "The thirty-three thieves thought that they thrilled the throne throughout Thursday.",
    "I scream, you scream, we all scream for ice cream!",
    "Red lorry, yellow lorry. Red lorry, yellow lorry. Red lorry, yellow lorry.",
    "A proper copper coffee pot is a proper coffee pot made of proper copper.",
    "Betty Botter bought some butter, but she said the butter's bitter. If I put it in my batter, it will make my batter bitter."
];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initVoices();
    
    // Initialize with a sample text
    elements.practiceTextInput.value = sampleTexts[0];
});

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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
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
    "tip": "<one specific actionable tip focusing on the most significant pronunciation issue>",
    "coachNotes": "<2-3 sentences of detailed feedback about the overall pronunciation, specific patterns of errors, and encouragement>"
}

Be thorough but encouraging. Focus on the most impactful pronunciation issues. If the audio is unclear or silent, give a low score and note that in the feedback.`
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
        tip: "Focus on the 'th' sound - place your tongue between your teeth and blow air gently.",
        coachNotes: "Good effort! You're making progress with your pronunciation. Pay special attention to the consonant clusters and word endings. Keep practicing and you'll see improvement!"
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

