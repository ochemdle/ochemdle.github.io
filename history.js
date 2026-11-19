const historyGrid = document.getElementById("historyGrid");
let history = [];
try {
    const storedHistory = localStorage.getItem("chemdle-daily-history");
    history = storedHistory ? JSON.parse(storedHistory) : [];
} catch (error) {
    history = [];
}
const safetyLevelNames = {
    Common: "Low concern",
    Uncommon: "Moderate danger",
    Rare: "High danger",
    Epic: "Severe danger",
    Mythic: "Extreme danger"
};

function dangerTierForScore(score) {
    if (score <= 100) return "Common";
    if (score <= 1200) return "Uncommon";
    if (score <= 1800) return "Rare";
    if (score <= 2300) return "Epic";
    return "Mythic";
}

if (!history.length) {
    historyGrid.innerHTML = `
        <div class="card history-empty">
            <h2>No rolls yet</h2>
            <p>Complete today's molecule reveal to add it here.</p>
        </div>`;
} else {
    historyGrid.innerHTML = history.map(result => `
        <article class="card history-result">
            <div class="history-date">${result.date}</div>
            <h2 class="history-formula">${formatFormula(result.formula)}</h2>
            <div class="history-name">${result.name}</div>
            ${result.safetyUrl ? `<a class="sds-link" href="${result.safetyUrl}" target="_blank" rel="noopener noreferrer">View safety data reference</a>` : ""}
            <div class="compound-summary history-summary">
                <span>${safetyLevelNames[dangerTierForScore(result.score)]}</span>
                <strong>${result.score.toLocaleString()} points</strong>
            </div>
            <div class="history-hazards">
                ${result.hazards.map(hazard =>
                    `<article class="hazard-card ${hazard.tier.toLowerCase()}">
                        <div class="hazard-card-head"><span>${hazard.name}</span><strong>+${hazard.points} pts</strong></div>
                        <p>${hazard.description}</p>
                    </article>`
                ).join("")}
            </div>
        </article>
    `).join("");
}

function formatFormula(formulaText) {
    return formulaText
        .replace(/([₂₃₄₅₆₇₈₀₉]+)/g, "<sub>$1</sub>")
        .replace(/([A-Za-z\)\]])([0-9]+)/g, "$1<sub>$2</sub>");
}
