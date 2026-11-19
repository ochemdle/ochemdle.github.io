const historyGrid = document.getElementById("historyGrid");
let history = [];
try {
    const storedHistory = localStorage.getItem("ochemdle-daily-history");
    history = storedHistory ? JSON.parse(storedHistory) : [];
} catch (error) {
    history = [];
}
const safetyLevelNames = {
    Common: "Low concern",
    Uncommon: "Moderate danger",
    Rare: "High danger",
    Epic: "Severe danger",
    Mythic: "Extreme danger",
    Catastrophic: "Catastrophic",
    Casualty: "Casualty"
};

function dangerTierForScore(score) {
    if (score <= 100) return "Common";
    if (score <= 700) return "Uncommon";
    if (score <= 1300) return "Rare";
    if (score <= 2100) return "Epic";
    if (score <= 3000) return "Mythic";
    if (score <= 4000) return "Catastrophic";
    return "Casualty";
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
                <span>${safetyLevelNames[result.rarity] || safetyLevelNames[dangerTierForScore(result.score)]}</span>
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
    const known = {
        H2O4S: "H2SO4",
        ClNa: "NaCl",
        ClH: "HCl",
        MnO4K: "KMnO4",
        Cr2H2O7: "H2Cr2O7"
    };
    formulaText = known[formulaText] || formulaText;
    return formulaText
        .replace(/([₂₃₄₅₆₇₈₀₉]+)/g, "<sub>$1</sub>")
        .replace(/([A-Za-z\)\]])([0-9]+)/g, "$1<sub>$2</sub>");
}
