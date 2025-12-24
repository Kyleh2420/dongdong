// --- CONFIG ---
const IS_PROD = !['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = IS_PROD ? "https://dong-dong-backend.onrender.com" : "http://127.0.0.1:8000";
const WS_BASE_URL = IS_PROD ? "wss://dong-dong-backend.onrender.com" : "ws://127.0.0.1:8000";

// --- DOM ELEMENTS ---
// Lobby
const lobbyScreen = document.getElementById("lobby-screen");
const createPlayerNameInput = document.getElementById("create-player-name");
const createRoomBtn = document.getElementById("create-room-btn");
const joinPlayerNameInput = document.getElementById("join-player-name");
const roomCodeInput = document.getElementById("room-code-input");
const joinRoomBtn = document.getElementById("join-room-btn");

// Tutorial
const showTutorialBtn = document.getElementById("show-tutorial-btn");
const tutorialModal = document.getElementById("tutorial-modal");
const closeTutorialBtn = document.getElementById("close-tutorial-btn");

// Spectator Toggle
const toggleSpectatorsBtn = document.getElementById("toggle-spectators-btn");

// Notification
const notificationContainer = document.getElementById("notification-container");


// Game
const gameContainer = document.getElementById("game-container");
const roomCodeDisplay = document.getElementById("room-code-display");
const roundNumberEl = document.getElementById("round-number");
const playerNameDisplayEl = document.getElementById("player-name-display");
const currentStackMasterColorEl = document.getElementById("current-stack-master-color");
const currentStackLeadColorEl = document.getElementById("current-stack-lead-color");
const playersContainer = document.getElementById("players-container");
const spectatorArea = document.getElementById("spectator-area");
const spectatorList = document.getElementById("spectator-list");
const eventLogArea = document.getElementById("event-log-area");
const eventLog = document.getElementById("event-log");
const stackTilesContainer = document.getElementById("stack-tiles");
const messageBar = document.getElementById("message-bar");
const actionArea = document.getElementById("action-area");
const betControls = document.getElementById("bet-controls");
const betInput = document.getElementById("bet-input");
const submitBetBtn = document.getElementById("submit-bet-btn");
const handArea = document.getElementById("hand-area");

// --- GLOBAL STATE ---
let gameState = {};
let myPlayerName = "";
let currentRoomId = "";
let socket = null;
let countdownTimer = null;
let notificationTimeout = null;

// --- HELPERS ---
const isMobile = () => window.innerWidth <= 768;

// --- RENDER FUNCTIONS ---
function showNotification(message) {
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }
    notificationContainer.textContent = message;
    notificationContainer.classList.remove('hidden');

    notificationTimeout = setTimeout(() => {
        notificationContainer.classList.add('hidden');
    }, 5000);
}

function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    let seconds = 5;
    messageBar.textContent = `Next stack starts in ${seconds}...`;
    countdownTimer = setInterval(() => {
        seconds--;
        if (seconds > 0) {
            messageBar.textContent = `Next stack starts in ${seconds}...`;
        } else {
            clearInterval(countdownTimer);
            countdownTimer = null;
            stackTilesContainer.innerHTML = ''; // Clear the stack area
            cachedStackPlays = {}; // Clear the cache
            
            // Manually update the message bar to the last known game state message
            // This prevents it from getting stuck on "Next stack starts in 1..."
            // The next render() call from the server will provide the correct new message.
            if(gameState && gameState.message) messageBar.textContent = gameState.message;
        }
    }, 1000);
}

function render() {
    if (!gameState || !gameState.gameState) {
        lobbyScreen.style.display = 'flex';
        gameContainer.style.display = 'none';
        return;
    }

    if (gameState.gameState === 'LOBBY' && !currentRoomId) {
        lobbyScreen.style.display = 'flex';
        gameContainer.style.display = 'none';
    } else {
        lobbyScreen.style.display = 'none';
        gameContainer.style.display = 'flex';
    }
    
    // Don't update message bar if a countdown is active
    if (!countdownTimer) {
        messageBar.textContent = gameState.message;
    }
    roomCodeDisplay.textContent = currentRoomId;
    playerNameDisplayEl.textContent = myPlayerName;
    roundNumberEl.textContent = gameState.currentRound || '--';
    
    currentStackMasterColorEl.textContent = gameState.masterColor || '--';
    if(gameState.masterColor) currentStackMasterColorEl.className = `tile-color-${gameState.masterColor}`;
    
    currentStackLeadColorEl.textContent = gameState.secondaryColor || '--';
    if(gameState.secondaryColor) currentStackLeadColorEl.className = `tile-color-${gameState.secondaryColor}`;

    // Render Players
    playersContainer.innerHTML = '';
    gameState.players.forEach(player => {
        const playerBox = document.createElement('div');
        playerBox.className = 'player-box';
        if (player.name === gameState.turnPlayerName) playerBox.classList.add('active-turn');

        if (isMobile()) {
            const truncatedName = player.name.length > 5 ? player.name.substring(0, 5) + '…' : player.name;
            playerBox.innerHTML = `
                <span class="player-name-mobile">${truncatedName}</span>
                <span><strong>S:</strong> ${player.score}</span>
                <span><strong>B:</strong> ${player.bet}</span>
                <span><strong>W:</strong> ${player.stacks_won}</span>
            `;
        } else {
            playerBox.innerHTML = `
                <h3>${player.name} ${player.name === myPlayerName ? "(You)" : ""}</h3>
                <p><strong>Score:</strong> ${player.score}</p>
                <p><strong>Bet:</strong> ${player.bet}</p>
                <p><strong>Stacks Won:</strong> ${player.stacks_won}</p>
            `;
        }
        playersContainer.appendChild(playerBox);
    });
    
    // Render Spectators
    spectatorList.innerHTML = '';
    if (gameState.spectators && gameState.spectators.length > 0) {
        gameState.spectators.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            spectatorList.appendChild(li);
        });
    }

    // Render Event Log
    eventLog.innerHTML = '';
    if (gameState.eventLog && gameState.eventLog.length > 0) {
        eventLogArea.style.display = 'flex';
        gameState.eventLog.forEach(logMsg => {
            const li = document.createElement('li');
            li.textContent = logMsg;
            eventLog.appendChild(li);
        });
        eventLog.scrollTop = eventLog.scrollHeight; // Auto-scroll to bottom
    } else {
        eventLogArea.style.display = 'none';
    }

    // Render Current Stack
    stackTilesContainer.innerHTML = '';
    for (const playerName in gameState.currentStackPlays) {
        if (Object.hasOwnProperty.call(gameState.currentStackPlays, playerName)) {
            const tileData = gameState.currentStackPlays[playerName];
            const tileWrapper = document.createElement('div');
            tileWrapper.className = 'played-tile-wrapper';
            const tileEl = createTileElement(tileData);
            const playerNameEl = document.createElement('div');
            playerNameEl.className = 'player-name';
            playerNameEl.textContent = playerName;
            tileWrapper.appendChild(tileEl);
            tileWrapper.appendChild(playerNameEl);
            stackTilesContainer.appendChild(tileWrapper);
        }
    }

    // Render Controls and Action Area
    const myPlayer = gameState.players.find(p => p.name === myPlayerName);
    const isMyTurn = myPlayer && myPlayer.name === gameState.turnPlayerName;
    const isHost = gameState.players.length > 0 && gameState.players[0].name === myPlayerName;

    actionArea.style.display = 'none';
    betControls.style.display = 'none';
    handArea.innerHTML = '';

    if (isHost && gameState.gameState === 'LOBBY' && gameState.players.length >= 2) {
        const startGameBtn = document.createElement('button');
        startGameBtn.id = 'start-game-btn';
        startGameBtn.className = 'start-game-tile-button';
        startGameBtn.textContent = 'Start Game';
        startGameBtn.onclick = () => sendSocketMessage({ action: 'start_game' });
        handArea.appendChild(startGameBtn);
        actionArea.style.display = 'block';
    }

    if (myPlayer) {
        actionArea.style.display = 'block';
        myPlayer.hand.forEach(tileData => {
            const isClickable = isMyTurn && gameState.gameState === 'AWAITING_PLAY';
            const tileEl = createTileElement(tileData, isClickable);
            if (isClickable) {
                tileEl.onclick = () => sendSocketMessage({ action: 'play_tile', payload: { tile: tileData } });
            }
            handArea.appendChild(tileEl);
        });
        
        if (isMyTurn && gameState.gameState === 'AWAITING_BETS') {
            betControls.style.display = 'flex';
            betInput.max = gameState.currentRound;
            betInput.placeholder = `Bet (0-${gameState.currentRound})`; // Reset placeholder
        }
    }
}

function createTileElement(tileData, isClickable = false) {
    const tileEl = document.createElement('div');
    tileEl.className = 'tile';
    if(isClickable) tileEl.classList.add('clickable');
    tileEl.dataset.color = tileData.color;
    tileEl.textContent = tileData.number;
    return tileEl;
}

// --- WEBSOCKET & ACTIONS ---

function sendSocketMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        console.error("WebSocket is not connected.");
        messageBar.textContent = "Error: Disconnected from server.";
    }
}

function connectWebSocket(roomId, playerName) {
    if (socket) socket.close();
    
    currentRoomId = roomId;
    myPlayerName = playerName;

    socket = new WebSocket(`${WS_BASE_URL}/ws/${roomId}/${playerName}`);

    socket.onopen = () => console.log("WebSocket connection established.");

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'game_state') {
            const oldState = gameState.gameState;
            gameState = message.payload;
            
            render(); // Render first to show the final stack

            // If the round just ended, start the countdown
            if (oldState !== 'ROUND_OVER' && gameState.gameState === 'ROUND_OVER') {
                startCountdown();
            }
        } else if (message.type === 'error') {
            console.error("Received error from server:", message.message);
            showNotification(`Error: ${message.message}`);
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket connection closed:", event.reason, "with code", event.code);

        // Show a specific alert for known error codes from the server
        if (event.code === 4000 || event.code === 4001) {
            showNotification(`Connection failed: ${event.reason}`);
        }

        // Reset the UI and state
        messageBar.textContent = `Disconnected. Please refresh to start a new game.`;
        currentRoomId = "";
        myPlayerName = "";
        gameState = {};
        render();
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        messageBar.textContent = "A connection error occurred.";
    };
}

// --- EVENT HANDLERS ---
async function handleCreateRoom() {
    const playerName = createPlayerNameInput.value.trim();
    if (!playerName) {
        showNotification("Please enter your name.");
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/room/new`, { method: "POST" });
        const data = await response.json();
        if (data.room_id) connectWebSocket(data.room_id, playerName);
    } catch (error) {
        console.error("Failed to create room:", error);
        showNotification("Error creating room.");
    }
}

async function handleJoinRoom() {
    const playerName = joinPlayerNameInput.value.trim();
    const roomId = roomCodeInput.value.trim();
    if (!playerName || !roomId) {
        showNotification("Please enter your name and a room code.");
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/room/exists/${roomId}`);
        if (!response.ok) {
            // Assuming a 404 response means the room doesn't exist
            showNotification(`Error: Room ${roomId} not found.`);
            return;
        }
        connectWebSocket(roomId, playerName);
    } catch (error) {
         showNotification(`Error: Room ${roomId} not found or server is unreachable.`);
    }
}

function handleSubmitBet() {
    const amount = parseInt(betInput.value, 10);
    if(!isNaN(amount)) {
        sendSocketMessage({ action: 'place_bet', payload: { amount } });
        betInput.value = '';
    }
}

// --- INITIALIZATION ---
function init() {
    createRoomBtn.addEventListener("click", handleCreateRoom);
    joinRoomBtn.addEventListener("click", handleJoinRoom);
    submitBetBtn.addEventListener("click", handleSubmitBet);

    // Tutorial listeners
    showTutorialBtn.addEventListener("click", () => {
        tutorialModal.style.display = "flex";
    });
    closeTutorialBtn.addEventListener("click", () => {
        tutorialModal.style.display = "none";
    });
    window.addEventListener("click", (event) => {
        if (event.target == tutorialModal) {
            tutorialModal.style.display = "none";
        }
    });

    // Spectator toggle listener
    toggleSpectatorsBtn.addEventListener("click", () => {
        spectatorArea.classList.toggle("visible");
        const isVisible = spectatorArea.classList.contains("visible");
        toggleSpectatorsBtn.textContent = isVisible ? "Hide Spectators" : "Show Spectators";
    });
    
    render();
}

init();

