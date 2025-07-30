document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById('root');
  root.innerHTML = `<h1 style='text-align:center'>Loading Diabolicards...</h1>`;

  try {
    const [deckRes, zonesRes, rulesRes] = await Promise.all([
      fetch('diabolicards_deck_registry.json'),
      fetch('diabolicards_zone_slot_layout.json'),
      fetch('diabolicards_rule_engine_raw.json')
    ]);

    const deck = await deckRes.json();
    const zones = await zonesRes.json();
    const rules = await rulesRes.json();

    let hand = deck.sort(() => 0.5 - Math.random()).slice(0, 4);
    const log = [];

    const renderGame = () => {
      root.innerHTML = `
        <div style="padding:20px;color:white;font-family:sans-serif;background-color:#111">
          <h1>Diabolicards</h1>
          <div><strong>Hand:</strong> ${hand.map(c => c["Character's Name"]).join(", ")}</div>
          <div style="margin-top:20px;">
            <button id="playCard" style="padding:8px 16px;background:#fff;color:#000;">Play Random Card</button>
          </div>
          <div style="margin-top:30px;">
            <h3>Log:</h3>
            <ul>${log.map(l => `<li>${l}</li>`).join("")}</ul>
          </div>
        </div>
      `;
      document.getElementById("playCard").onclick = () => {
        if (hand.length === 0) return alert("No cards left!");
        const played = hand.shift();
        log.push(`Played ${played["Character's Name"]} (${played.Ability || "No Ability"})`);
        renderGame();
      };
    };

    renderGame();
  } catch (err) {
    root.innerHTML = `<p style="color:red;text-align:center">Error loading game: ${err.message}</p>`;
    console.error("Failed to load game assets:", err);
  }
});
