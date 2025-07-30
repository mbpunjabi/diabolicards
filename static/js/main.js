
import React from "react";
import { createRoot } from "react-dom/client";

async function fetchGameData() {
  const [deck, zones, rules] = await Promise.all([
    fetch("data/deck_registry.json").then(res => res.json()),
    fetch("data/zone_slot_layout.json").then(res => res.json()),
    fetch("data/rule_engine.json").then(res => res.json()),
  ]);
  return { deck, zones, rules };
}

function Game({ deck, zones, rules }) {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Diabolicards</h1>
      <p>{deck.length} cards loaded | {zones.length} zones | Engine ready</p>
      <pre>{JSON.stringify(rules, null, 2)}</pre>
    </div>
  );
}

fetchGameData().then(({ deck, zones, rules }) => {
  const container = document.getElementById("root");
  const root = createRoot(container);
  root.render(<Game deck={deck} zones={zones} rules={rules} />);
});
