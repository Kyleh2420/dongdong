import random
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

# --- Data Structures ---

class Color(Enum):
    RED = "Red"
    BLACK = "Black"
    BLUE = "Blue"
    ORANGE = "Orange"

@dataclass(frozen=True, order=True)
class Tile:
    number: int
    color: Color
    def __str__(self): return f"[{self.color.value} {self.number}]"
    def to_dict(self): return {"number": self.number, "color": self.color.value}

@dataclass
class Player:
    name: str
    hand: List[Tile] = field(default_factory=list)
    score: int = 0
    bet: int = 0
    tricks_won: int = 0

    def to_dict(self):
        return {
            "name": self.name,
            "hand": sorted([t.to_dict() for t in self.hand], key=lambda x: (x['color'], x['number'])),
            "score": self.score,
            "bet": self.bet,
            "tricks_won": self.tricks_won,
        }
    
    def reset_for_round(self):
        self.hand = []
        self.bet = 0
        self.tricks_won = 0

# --- Game State and Engine ---

class GameState(Enum):
    LOBBY = "LOBBY"
    ROUND_STARTING = "ROUND_STARTING"
    AWAITING_BETS = "AWAITING_BETS"
    AWAITING_PLAY = "AWAITING_PLAY"
    TRICK_RESOLVING = "TRICK_RESOLVING"
    ROUND_OVER = "ROUND_OVER"
    GAME_OVER = "GAME_OVER"

class DongDongEngine:
    def __init__(self):
        self.players: List[Player] = []
        self.spectators: List[str] = []
        self.event_log: List[str] = ["Lobby created. Waiting for players..."]
        
        self.main_deck = self._create_deck()
        self.color_chooser_deck = [Tile(1, c) for c in Color]
        
        self.game_state: GameState = GameState.LOBBY
        self.message: str = "Waiting for players to join the lobby."
        
        self.current_round: int = 0
        self.master_color: Optional[Color] = None
        self.secondary_color: Optional[Color] = None
        
        self.color_master_player_index: int = 0
        self.turn_player_index: int = 0
        self.trick_leader_index: int = 0
        self.bets_made: int = 0
        
        self.current_trick_plays: Dict[str, Tile] = {}
        self.last_trick_winner_name: str = ""

    def add_player(self, player_name: str):
        if len(self.players) < 4:
            self.players.append(Player(name=player_name))
            self.message = f"{player_name} joined the game. Waiting for more players..."
            self.event_log.append(f"➡️ {player_name} joined as a player.")

    def add_spectator(self, spectator_name: str):
        self.spectators.append(spectator_name)
        self.event_log.append(f"➡️ {spectator_name} started spectating.")
    
    def remove_player_or_spectator(self, name: str):
        was_player = any(p.name == name for p in self.players)
        self.players = [p for p in self.players if p.name != name]
        self.spectators = [s for s in self.spectators if s != name]
        
        self.message = f"{name} left the game."
        self.event_log.append(f"⬅️ {name} left the game.")

        if self.game_state != GameState.LOBBY and not self.players:
             self.game_state = GameState.LOBBY
             self.event_log.append("All players left. Game has returned to the lobby.")

    def log_event(self, event: str):
        self.event_log.append(event)
        if len(self.event_log) > 100: # Prevent log from getting too large
            self.event_log.pop(0)

    def _create_deck(self) -> List[Tile]:
        return [Tile(n, c) for c in Color for n in range(1, 14)]

    def start_new_game(self):
        if len(self.players) < 2:
            self.message = "Need at least 2 players to start a game."
            return

        self.log_event(f"🏁 Game started by {self.players[0].name} with {len(self.players)} players.")
        self.current_round = 0
        self.color_master_player_index = 0
        for p in self.players:
            p.score = 0
        self.start_new_round()

    def start_new_round(self):
        self.current_round += 1
        if self.current_round > 13:
            self.game_state = GameState.GAME_OVER
            self.message = "Game over! Final scores are on the board."
            self.log_event("GAME OVER! Thanks for playing.")
            return

        self.game_state = GameState.ROUND_STARTING
        self.log_event(f"🔄 Starting Round {self.current_round}...")
        
        for player in self.players:
            player.reset_for_round()

        round_deck = self.main_deck.copy()
        random.shuffle(round_deck)
        
        for _ in range(self.current_round):
            for player in self.players:
                if not round_deck: break
                player.hand.append(round_deck.pop())

        self.master_color = random.choice(self.color_chooser_deck).color
        self.log_event(f"👑 Master Color is {self.master_color.value}.")
        
        self.trick_leader_index = self.color_master_player_index
        self.turn_player_index = self.color_master_player_index
        self.bets_made = 0
        
        self.game_state = GameState.AWAITING_BETS
        turn_player_name = self.get_current_turn_player().name
        self.message = f"Round {self.current_round}. Master: {self.master_color.value}. {turn_player_name} to bet."
        self.log_event(f"Bidding starts with {turn_player_name}.")

    def get_current_turn_player(self) -> Optional[Player]:
        if not self.players or self.turn_player_index >= len(self.players):
            return None
        return self.players[self.turn_player_index]

    def place_bet(self, player_name: str, bet: int) -> Tuple[bool, str]:
        turn_player = self.get_current_turn_player()
        if self.game_state != GameState.AWAITING_BETS: return False, "Not time for betting."
        if not turn_player or player_name != turn_player.name: return False, "Not your turn to bet."

        is_last_player = (self.bets_made == len(self.players) - 1)
        total_bets = sum(p.bet for p in self.players)
        
        if not (0 <= bet <= self.current_round): return False, f"Bet must be between 0 and {self.current_round}."
        if is_last_player and (total_bets + bet) == self.current_round: return False, f"FORBIDDEN_BET"

        turn_player.bet = bet
        self.log_event(f"💰 {player_name} bet {bet}.")
        self.bets_made += 1
        self.turn_player_index = (self.turn_player_index + 1) % len(self.players)
        next_player = self.get_current_turn_player()

        if self.bets_made == len(self.players):
            self.game_state = GameState.AWAITING_PLAY
            self.turn_player_index = self.trick_leader_index
            self.message = f"All bets are in. {self.get_current_turn_player().name} starts."
            self.log_event("All bets are in. The first trick begins.")
        else:
            self.message = f"{next_player.name} to bet."
        
        return True, ""

    def play_tile(self, player_name: str, tile_dict: dict) -> Tuple[bool, str]:
        turn_player = self.get_current_turn_player()
        if self.game_state != GameState.AWAITING_PLAY: return False, "Not time for playing."
        if not turn_player or player_name != turn_player.name: return False, "Not your turn."

        try:
            tile_to_play = Tile(number=tile_dict['number'], color=Color(tile_dict['color']))
        except (KeyError, ValueError): return False, "Invalid tile."

        if tile_to_play not in turn_player.hand: return False, "Tile not in hand."

        valid_plays = self.get_valid_plays_for_player(turn_player)
        if tile_to_play not in valid_plays: return False, f"Invalid move. Must play {self.secondary_color.value}."

        if not self.current_trick_plays: 
            self.secondary_color = tile_to_play.color
            self.log_event(f"♦️ Trick started. Lead color is {self.secondary_color.value}.")


        turn_player.hand.remove(tile_to_play)
        self.current_trick_plays[turn_player.name] = tile_to_play
        self.log_event(f"{player_name} played {tile_to_play}.")

        self.turn_player_index = (self.turn_player_index + 1) % len(self.players)
        
        next_player = self.get_current_turn_player()
        if next_player: self.message = f"{next_player.name} to play."

        if len(self.current_trick_plays) == len(self.players):
            self.resolve_trick()
        
        return True, ""

    def get_valid_plays_for_player(self, player: Player) -> List[Tile]:
        if not self.secondary_color: return player.hand
        valid_plays = [t for t in player.hand if t.color == self.secondary_color]
        return valid_plays if valid_plays else player.hand

    def resolve_trick(self):
        self.game_state = GameState.TRICK_RESOLVING
        
        winner_name, winning_tile = self._determine_trick_winner()
        winner_player = next(p for p in self.players if p.name == winner_name)
        winner_player.tricks_won += 1
        self.last_trick_winner_name = winner_name
        
        self.message = f"{winner_name} won with {winning_tile}."
        self.log_event(f"🏆 {winner_name} won the trick with {winning_tile}.")
        
        self.current_trick_plays = {}
        self.secondary_color = None
        self.trick_leader_index = self.players.index(winner_player)
        self.turn_player_index = self.trick_leader_index

        if all(len(p.hand) == 0 for p in self.players):
            self._calculate_scores()
            self.game_state = GameState.ROUND_OVER
            self.message += " Round over. Host can start the next round."
            self.log_event("Round Over.")
            self.color_master_player_index = (self.color_master_player_index + 1) % len(self.players)
        else:
            self.game_state = GameState.AWAITING_PLAY
            self.message += f" {winner_name} leads next."

    def _determine_trick_winner(self) -> Tuple[str, Tile]:
        master_plays = {name: t for name, t in self.current_trick_plays.items() if t.color == self.master_color}
        if master_plays:
            winner_name = max(master_plays, key=lambda name: master_plays[name].number)
            return winner_name, master_plays[winner_name]

        secondary_plays = {name: t for name, t in self.current_trick_plays.items() if t.color == self.secondary_color}
        if secondary_plays:
            winner_name = max(secondary_plays, key=lambda name: secondary_plays[name].number)
            return winner_name, secondary_plays[winner_name]

        leader_name = self.players[self.trick_leader_index].name
        return leader_name, self.current_trick_plays[leader_name]

    def _calculate_scores(self):
        self.log_event("--- Scoring ---")
        for player in self.players:
            points = 10 + (player.bet ** 2) if player.bet == player.tricks_won else -((player.bet - player.tricks_won) ** 2)
            player.score += points
            result = "Correct!" if points > 0 else "Incorrect."
            sign = "+" if points > 0 else ""
            self.log_event(f"  {player.name} bet {player.bet}, won {player.tricks_won}. {result} ({sign}{points} points).")
            
    def get_state_for_frontend(self) -> dict:
        """Returns a JSON-serializable representation of the current game state."""
        turn_player = self.get_current_turn_player()
        return {
            "gameState": self.game_state.value,
            "message": self.message,
            "players": [p.to_dict() for p in self.players],
            "spectators": self.spectators,
            "eventLog": self.event_log,
            "turnPlayerName": turn_player.name if turn_player else "",
            "isHost": self.players and self.players[0].name,
            "currentRound": self.current_round,
            "masterColor": self.master_color.value if self.master_color else None,
            "currentTrickPlays": {name: tile.to_dict() for name, tile in self.current_trick_plays.items()},
            "bettingInfo": {
                "isLastPlayer": self.bets_made == len(self.players) - 1 if self.players else False,
                "forbiddenBet": (self.current_round - sum(p.bet for p in self.players)) if self.players and self.bets_made == len(self.players) - 1 else -1
            }
        }