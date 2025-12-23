from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import asyncio
import json
import random
import string
from typing import Dict, List, Tuple

from dong_dong_engine import DongDongEngine, GameState

# --- In-Memory Storage ---

game_sessions: Dict[str, DongDongEngine] = {}
"""
Stores active game engines, keyed by room_id.
"""

class ConnectionManager:
    """Manages active WebSocket connections for each game room."""
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_json(message)

manager = ConnectionManager()

# --- FastAPI App Initialization ---

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dong-dong-frontend.onrender.com",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Functions ---

def generate_room_id():
    """Generates a unique 4-digit room ID."""
    while True:
        room_id = ''.join(random.choices(string.digits, k=4))
        if room_id not in game_sessions:
            return room_id

async def broadcast_gamestate(room_id: str):
    """Fetches and broadcasts the current game state to all clients in a room."""
    if room_id in game_sessions:
        engine = game_sessions[room_id]
        await manager.broadcast(room_id, {
            "type": "game_state",
            "payload": engine.get_state_for_frontend()
        })

# --- API Endpoints (for Lobby) ---

@app.post("/room/new")
async def create_room():
    """Creates a new game room and returns its ID."""
    room_id = generate_room_id()
    game_sessions[room_id] = DongDongEngine()
    return {"room_id": room_id}

@app.get("/room/exists/{room_id}")
async def room_exists(room_id: str):
    """Checks if a game room exists."""
    if room_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"exists": True}

# --- WebSocket Endpoint (for Gameplay) ---

async def handle_round_transition(room_id: str, engine: DongDongEngine):
    """Waits for a few seconds then starts the next round."""
    await asyncio.sleep(5) # Wait 5 seconds to let players see scores
    if engine.game_state == GameState.ROUND_OVER: # Check if state hasn't changed
        engine.start_new_round()
        await broadcast_gamestate(room_id)

@app.websocket("/ws/{room_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_name: str):
    if room_id not in game_sessions:
        await websocket.close(code=4000, reason="Room not found")
        return
        
    await manager.connect(websocket, room_id)
    
    engine = game_sessions[room_id]
    
    # Handle player joining logic
    if engine.game_state == GameState.LOBBY and len(engine.players) < 4:
        if any(p.name == player_name for p in engine.players):
             await websocket.close(code=4001, reason="Name already taken")
             manager.disconnect(websocket, room_id)
             return
        engine.add_player(player_name)
    else:
        if player_name not in engine.spectators and not any(p.name == player_name for p in engine.players):
            engine.add_spectator(player_name)
            
    await broadcast_gamestate(room_id)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            action = message.get("action")
            payload = message.get("payload", {})
            
            is_host = engine.players and player_name == engine.players[0].name
            
            if is_host and action == "start_game":
                engine.start_new_game()

            elif action == "place_bet":
                amount = payload.get("amount")
                success, error = engine.place_bet(player_name, amount)
                if not success and error == "FORBIDDEN_BET":
                    engine.log_event(f"🚫 {player_name} tried to bet {amount}, but it's not allowed.")
                elif not success:
                    print(f"Bet error for {player_name}: {error}")

            elif action == "play_tile":
                success, error = engine.play_tile(player_name, payload.get("tile"))
                if not success:
                    print(f"Play error for {player_name}: {error}")
            
            await broadcast_gamestate(room_id)

            # If the last move ended the round, trigger auto-advance
            if action == "play_tile" and engine.game_state == GameState.ROUND_OVER:
                asyncio.create_task(handle_round_transition(room_id, engine))

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        engine.remove_player_or_spectator(player_name)
        print(f"{player_name} disconnected from room {room_id}")
        await broadcast_gamestate(room_id)
    except Exception as e:
        print(f"An error occurred in room {room_id}: {e}")
        await manager.broadcast(room_id, {"type": "error", "message": str(e)})

# --- Static Files (Must be last) ---
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
