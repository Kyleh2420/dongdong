# How to Play Dong Dong Online

The game has been upgraded to a full multiplayer version with game rooms! Here is how to run and play it.

### Step 1: Run the Backend Server

1.  Open a terminal or command prompt in the project's root directory (`E:\Stony Brook University\Projects\DongDong`).
2.  Run the following command to start the FastAPI server. This server will manage game rooms and real-time communication.

    ```bash
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```

3.  You should see output indicating that the server is running on `http://127.0.0.1:8000`. Keep this terminal open while you are playing.

### Step 2: Play the Game

1.  **Open the Game in Your Browser:**
    Instead of opening the file directly, the `main.py` server is now also serving the `frontend` directory. However, for simplicity and to avoid potential issues, the recommended way is still to **open the `frontend/index.html` file directly in your browser**.

2.  **Create or Join a Room:**
    *   You will see a lobby screen.
    *   **To create a game,** enter your name and click "Create Room". You will be taken to the game screen and given a 4-digit room code.
    *   **To join a game,** enter your name and the 4-digit room code your friend gave you, then click "Join Room".

3.  **Play with Friends:**
    *   Share the room code with up to three other friends. They can join your game using the same steps.
    *   The game will update in real-time for all players in the room.

Enjoy the game!