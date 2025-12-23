// --- CONFIG ---
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const API_BASE_URL = ""; // Relative path uses the same origin
const WS_BASE_URL = `${protocol}//${window.location.host}`;

// --- DOM ELEMENTS ---
// Lobby
const lobbyScreen = document.getElementById("lobby-screen");
const createPlayerNameInput = document.getElementById("create-player-name");
const createRoomBtn = document.getElementById("create-room-btn");
const joinPlayerNameInput = document.getElementById("join-player-name");
const roomCodeInput = document.getElementById("room-code-input");
const joinRoomBtn = document.getElementById("join-room-btn");

// Game
const gameContainer = document.getElementById("game-container");
const roomCodeDisplay = document.getElementById("room-code-display");
const roundNumberEl = document.getElementById("round-number");
const masterColorEl = document.getElementById("master-color");
const startGameBtn = document.getElementById("start-game-btn");
const playersContainer = document.getElementById("players-container");
const spectatorArea = document.getElementById("spectator-area");
const spectatorList = document.getElementById("spectator-list");
const eventLogArea = document.getElementById("event-log-area");
const eventLog = document.getElementById("event-log");
const trickTilesContainer = document.getElementById("trick-tiles");
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

// --- RENDER FUNCTIONS ---
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
    
    messageBar.textContent = gameState.message;
    roomCodeDisplay.textContent = currentRoomId;
    roundNumberEl.textContent = gameState.currentRound || '--';
    masterColorEl.textContent = gameState.masterColor || '--';
    if(gameState.masterColor) masterColorEl.className = `tile-color-${gameState.masterColor}`;

    // Render Players
    playersContainer.innerHTML = '';
    gameState.players.forEach(player => {
        const playerBox = document.createElement('div');
        playerBox.className = 'player-box';
        if (player.name === gameState.turnPlayerName) playerBox.classList.add('active-turn');
        playerBox.innerHTML = `
            <h3>${player.name} ${player.name === myPlayerName ? "(You)" : ""}</h3>
            <p><strong>Score:</strong> ${player.score}</p>
            <p><strong>Bet:</strong> ${player.bet}</p>
            <p><strong>Tricks Won:</strong> ${player.tricks_won}</p>
        `;
        playersContainer.appendChild(playerBox);
    });
    
    // Render Spectators
    spectatorList.innerHTML = '';
    if (gameState.spectators && gameState.spectators.length > 0) {
        spectatorArea.style.display = 'block';
        gameState.spectators.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            spectatorList.appendChild(li);
        });
    } else {
        spectatorArea.style.display = 'none';
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

    // Render Current Trick
    trickTilesContainer.innerHTML = '';
    const playedOrder = gameState.players.map(p => p.name);
    playedOrder.forEach(playerName => {
        if (gameState.currentTrickPlays[playerName]) {
            const tileData = gameState.currentTrickPlays[playerName];
            const tileWrapper = document.createElement('div');
            tileWrapper.className = 'played-tile-wrapper';
            const tileEl = createTileElement(tileData);
            const playerNameEl = document.createElement('div');
            playerNameEl.className = 'player-name';
            playerNameEl.textContent = playerName;
            tileWrapper.appendChild(tileEl);
            tileWrapper.appendChild(playerNameEl);
            trickTilesContainer.appendChild(tileWrapper);
        }
    });

    // Render Controls and Action Area
    const myPlayer = gameState.players.find(p => p.name === myPlayerName);
    const isMyTurn = myPlayer && myPlayer.name === gameState.turnPlayerName;
    const isHost = gameState.players.length > 0 && gameState.players[0].name === myPlayerName;

    actionArea.style.display = 'none';
    betControls.style.display = 'none';
    handArea.innerHTML = '';
    startGameBtn.style.display = 'none';

    if (isHost && gameState.gameState === 'LOBBY' && gameState.players.length >= 2) {
        startGameBtn.style.display = 'block';
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
            gameState = message.payload;
            render();
        } else if (message.type === 'error') {
            console.error("Received error from server:", message.message);
            alert(`Error: ${message.message}`);
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket connection closed:", event.reason);
        messageBar.textContent = `Disconnected: ${event.reason || "Connection closed"}. Please refresh to start a new game.`;
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
    if (!playerName) { alert("Please enter your name."); return; }
    try {
        const response = await fetch(`${API_BASE_URL}/room/new`, { method: "POST" });
        const data = await response.json();
        if (data.room_id) connectWebSocket(data.room_id, playerName);
    } catch (error) {
        console.error("Failed to create room:", error);
        alert("Error creating room.");
    }
}

async function handleJoinRoom() {
    const playerName = joinPlayerNameInput.value.trim();
    const roomId = roomCodeInput.value.trim();
    if (!playerName || !roomId) { alert("Please enter your name and a room code."); return; }
    try {
        await fetch(`${API_BASE_URL}/room/exists/${roomId}`);
        connectWebSocket(roomId, playerName);
    } catch (error) {
         alert(`Error: Room ${roomId} not found.`);
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
    startGameBtn.addEventListener("click", () => sendSocketMessage({ action: 'start_game' }));
    submitBetBtn.addEventListener("click", handleSubmitBet);
    
    render();
}

init();
