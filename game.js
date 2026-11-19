let compounds = [];
let soundEnabled = true;
let audioContext;
let testRandomMode = false;

function storageGet(key, fallback = null) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        // Storage can be unavailable in private or restricted browsers.
    }
}

function readStoredJson(key, fallback = []) {
    try {
        const value = storageGet(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        return fallback;
    }
}

const urlMode = new URLSearchParams(window.location.search).get("mode");
if (urlMode === "daily") {
    storageSet("chemdle-mode", "daily");
}
let unlimitedMode = urlMode !== "daily" && storageGet("chemdle-mode") === "unlimited";

const stage = document.getElementById("stage");
const molecule = document.getElementById("molecule");
const rollButton = document.getElementById("rollButton");
const soundButton = document.getElementById("soundButton");
const formula = document.getElementById("formula");
const moleculeName = document.getElementById("moleculeName");
const rarityKicker = document.getElementById("rarityKicker");
const hazardRow = document.getElementById("hazardRow");
const sidebarHazards = document.getElementById("sidebarHazards");
const toast = document.getElementById("toast");
const runningTally = document.getElementById("runningTally");
const runningTallyValue = document.getElementById("runningTallyValue");
const shareButton = document.getElementById("shareButton");
const sdsLink = document.getElementById("sdsLink");
const explosionLayer = document.getElementById("explosionLayer");
const dangerButton = document.getElementById("dangerButton");
const dangerPopup = document.getElementById("dangerPopup");
const dangerClose = document.getElementById("dangerClose");
const modeButton = document.getElementById("modeButton");

function getLocalDateKey(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

let today = getLocalDateKey();
let resultKey = "chemdle-result-" + today;
let activeRevealInterval = null;
let activeRevealTimeout = null;
let activeRevealGeneration = 0;
let currentShareResult = null;
const dailyHistoryKey = "chemdle-daily-history";
const unlimitedHistoryKey = "chemdle-unlimited-history";

const legacyDailyHistory = storageGet("chemdle-history");
if (legacyDailyHistory && !storageGet(dailyHistoryKey)) {
    storageSet(dailyHistoryKey, legacyDailyHistory);
}

function makeFormula(formulaText) {
    return formulaText
        .replace(/([₂₃₄₅₆₇₈₀₉]+)/g, "<sub>$1</sub>")
        .replace(/([A-Za-z][a-z]?|[)\]])([0-9]+)/g, "$1<sub>$2</sub>");
}

function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededRandom(seedText) {
    let seed = hashString(seedText);
    return () => {
        seed += 0x6D2B79F5;
        let value = seed;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function dailyCompound() {
    const random = seededRandom(today);
    const index = Math.floor(random() * compounds.length);
    return compounds[index];
}

function randomCompound() {
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const index = randomBuffer[0] % compounds.length;
    return compounds[index];
}

function normalizeCompoundName(name) {
    const normalizedNames = {
        "D-Glucose": "Glucose",
        "L-Glucose": "Glucose",
        "D-Fructose": "Fructose",
        "L-Fructose": "Fructose",
        "L-Tartaric acid": "Tartaric acid",
        "L-Ascorbic Acid": "Ascorbic acid",
        "Phosphorus": "White phosphorus",
        "2,4,6-Trinitrotoluene": "Trinitrotoluene",
        "1-Chloro-4-(2,2,2-trichloro-1-(4-chlorophenyl)ethyl)benzene": "DDT",
        "Aspirin": "Acetylsalicylic acid",
        "Methyl Ethyl Ketone": "2-Butanone"
    };
    if (normalizedNames[name]) return normalizedNames[name];
    return name
        .replace(/^[DLRSeZrx+\-]+\s+/i, "")
        .replace(/\s+(isomer|configuration|enantiomer)$/i, "");
}

function splitFormula(formulaText) {
    const tokens = [];
    const pattern = /([A-Z][a-z]?)(\d*)|(\d+)|([()])/g;
    let match;
    while ((match = pattern.exec(formulaText))) {
        if (match[1]) {
            tokens.push({ element: match[1], count: match[2] || "" });
        } else if (match[3]) {
            if (tokens.length && tokens[tokens.length - 1].element === ")") {
                tokens[tokens.length - 1].count = match[3];
            } else if (tokens.length && tokens[tokens.length - 1].count === "") {
                tokens[tokens.length - 1].count = match[3];
            } else {
                tokens.push({ element: "", count: match[3] });
            }
        } else {
            tokens.push({ element: match[4], count: "" });
        }
    }
    return tokens;
}

function partialFormula(tokens, revealedCount) {
    const visible = tokens.slice(0, revealedCount).map(token =>
        token.element + (token.count ? token.count : "")
    ).join("");
    const remaining = Math.max(0, tokens.length - revealedCount);
    if (!remaining) return visible;
    return visible + '<span class="formula-secret">' + "·".repeat(Math.min(remaining, 3)) + "</span>";
}

function playRarityArpeggio(rarity) {
    if (!soundEnabled) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const chords = {
        Common: [261.63],
        Uncommon: [261.63, 329.63],
        Rare: [261.63, 329.63, 392.0],
        Epic: [261.63, 329.63, 392.0, 523.25],
        Mythic: [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]
    };
    const notes = chords[rarity] || chords.Common;
    notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * .16;
        oscillator.frequency.value = frequency;
        oscillator.type = rarity === "Mythic" ? "triangle" : "sine";
        gain.gain.setValueAtTime(.001, start);
        gain.gain.linearRampToValueAtTime(.09, start + .03);
        gain.gain.exponentialRampToValueAtTime(.001, start + .55);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + .56);
    });
}

function playHazardNote(index) {
    if (!soundEnabled) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const cMajorScale = [
        261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88,
        523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77,
        1046.50, 1174.66, 1318.51, 1396.91, 1567.98, 1760.00, 1975.53,
        2093.00, 2349.32, 2637.02, 2793.83, 3135.96, 3520.00
    ];
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = cMajorScale[index % cMajorScale.length];
    oscillator.type = "sine";
    gain.gain.setValueAtTime(.09, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .38);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .38);
}

function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function archiveResult(item, allowDuplicate = false) {
    const historyKey = unlimitedMode ? unlimitedHistoryKey : dailyHistoryKey;
    const history = readStoredJson(historyKey);
    const hazards = item.hazards.map(hazard => ({ name: hazard, ...hazardScore(hazard) }));
    hazards.sort((a, b) => a.points - b.points);
    const score = hazards.reduce((sum, hazard) => sum + hazard.points, 0);
    const result = {
        date: today,
        name: normalizeCompoundName(item.name),
        formula: item.formula,
        rarity: dangerTierForScore(score),
        hazards: hazards,
        score,
        pubchemUrl: item.pubchemUrl || "",
        safetyUrl: item.safetyUrl || ""
    };
    if (allowDuplicate || !history.some(entry => entry.date === today)) {
        history.unshift(result);
        storageSet(historyKey, JSON.stringify(history.slice(0, 15)));
    }
}

const hazardScoring = {
    "Not a hazardous substance": { points: 100, tier: "Common", description: "Not classified as hazardous under standard safety labeling." },
    "No known hazards": { points: 100, tier: "Common", description: "No major hazards are identified from available safety data." },
    "Hexavalent chromium": { points: 500, tier: "Epic", description: "A highly toxic form of chromium known to damage lungs and DNA." },
    "Eye irritation": { points: 100, tier: "Common", description: "May cause temporary redness or discomfort to the eyes." },
    "Skin irritation": { points: 100, tier: "Common", description: "May cause reversible irritation or dryness on skin contact." },
    "Respiratory irritation": { points: 100, tier: "Common", description: "May irritate the nose, throat, or lungs after inhalation." },
    "Highly flammable": { points: 180, tier: "Uncommon", description: "Catches fire very easily, especially near heat or sparks." },
    "Flammable": { points: 180, tier: "Uncommon", description: "Can ignite when exposed to heat, sparks, or flame." },
    "Combustible": { points: 180, tier: "Uncommon", description: "Can burn under sufficiently high temperatures." },
    "Oxidizer": { points: 180, tier: "Uncommon", description: "Intensifies fire and may react dangerously with fuels." },
    "Acute toxicity": { points: 180, tier: "Uncommon", description: "Can cause harmful effects after a short exposure." },
    "Aquatic hazard": { points: 180, tier: "Uncommon", description: "May harm fish or other organisms in aquatic environments." },
    "Toxic to aquatic life": { points: 180, tier: "Uncommon", description: "Exposure can seriously damage aquatic organisms." },
    "Skin corrosion": { points: 320, tier: "Rare", description: "Can chemically destroy skin tissue on contact." },
    "Serious eye damage": { points: 320, tier: "Rare", description: "May cause permanent or severe eye injury." },
    "Corrosive": { points: 320, tier: "Rare", description: "Destroys living tissue or severely damages materials." },
    "Mutagen": { points: 320, tier: "Rare", description: "May cause permanent changes to genetic material." },
    "Aspiration hazard": { points: 320, tier: "Rare", description: "May enter the lungs and cause severe injury when swallowed." },
    "Carcinogen": { points: 500, tier: "Epic", description: "Known or suspected to cause cancer." },
    "Reproductive toxicity": { points: 500, tier: "Epic", description: "May harm fertility or an unborn child." },
    "Organ toxicity": { points: 500, tier: "Epic", description: "Can cause damage to organs after repeated or prolonged exposure." },
    "Neurotoxin": { points: 500, tier: "Epic", description: "Damages the nervous system or disrupts nerve function." },
    "Radioactive": { points: 800, tier: "Mythic", description: "Emits ionizing radiation that can cause severe biological damage." },
    "Fatal": { points: 800, tier: "Mythic", description: "Exposure may cause death in small or ordinary doses." },
    "Fatal if inhaled": { points: 800, tier: "Mythic", description: "Breathing the substance can rapidly be fatal." },
    "Explosive": { points: 800, tier: "Mythic", description: "May detonate or violently fragment under conditions." },
    "Pyrophoric": { points: 800, tier: "Mythic", description: "Ignites spontaneously on contact with air." }
};

function hazardScore(hazard) {
    return hazardScoring[hazard] || { points: 100, tier: "Common" };
}

const safetyLevelNames = {
    Common: "Low concern",
    Uncommon: "Moderate danger",
    Rare: "High danger",
    Epic: "Severe danger",
    Mythic: "Extreme danger"
};

function safetyLevelName(rarity) {
    return safetyLevelNames[rarity] || rarity;
}

function dangerTierForScore(score) {
    if (score <= 100) return "Common";
    if (score <= 1200) return "Uncommon";
    if (score <= 1800) return "Rare";
    if (score <= 2300) return "Epic";
    return "Mythic";
}

function revealFinalTally(rarity, score) {
    const dangerTier = dangerTierForScore(score);
    if (currentShareResult) {
        currentShareResult.score = score;
        currentShareResult.level = safetyLevelName(dangerTier);
    }
    const label = runningTally.querySelector(".running-tally-label");
    runningTally.classList.add("final-tally");
    label.textContent = safetyLevelName(dangerTier);
    runningTallyValue.textContent = score.toLocaleString() + " points";
    runningTallyValue.classList.remove("tally-pop");
    void runningTallyValue.offsetWidth;
    runningTallyValue.classList.add("tally-pop");
    shareButton.hidden = unlimitedMode || !currentShareResult;
    if (score > 2301) createExplosion();
}

async function shareDailyResult() {
    if (!currentShareResult || unlimitedMode) return;
    const score = currentShareResult.score;
    const text = `OChemdle ${today}\n${normalizeCompoundName(currentShareResult.item.name)} · ${currentShareResult.item.formula}\n${currentShareResult.level} · ${score.toLocaleString()} points · https://chemdle.github.io/`;
    try {
        if (navigator.share) {
            await navigator.share({ title: "Chemdle", text });
            return;
        }
        await navigator.clipboard.writeText(text);
        showToast("Result copied");
    } catch (error) {
        if (error.name !== "AbortError") showToast("Sharing unavailable");
    }
}

function createExplosion() {
    if (!explosionLayer) return;
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * .58;
    const colors = ["#b9d95f", "#e69a48", "#c95b50", "#185a46", "#7c5f98"];
    explosionLayer.innerHTML = "";
    for (let i = 0; i < 180; i++) {
        const particle = document.createElement("span");
        const angle = Math.random() * Math.PI * 2;
        const distance = 220 + Math.random() * Math.max(300, window.innerWidth * .55);
        particle.className = "explosion-particle";
        particle.style.left = originX + "px";
        particle.style.top = originY + "px";
        particle.style.setProperty("--particle-x", Math.cos(angle) * distance + "px");
        particle.style.setProperty("--particle-y", (Math.sin(angle) * distance + 180 + Math.random() * 220) + "px");
        particle.style.setProperty("--particle-duration", (900 + Math.random() * 900) + "ms");
        particle.style.setProperty("--particle-color", colors[i % colors.length]);
        particle.style.setProperty("--particle-width", (7 + Math.random() * 10) + "px");
        particle.style.setProperty("--particle-height", (10 + Math.random() * 16) + "px");
        particle.style.setProperty("--particle-spin", ((Math.random() - .5) * 1440) + "deg");
        explosionLayer.appendChild(particle);
        setTimeout(() => particle.remove(), 1900);
    }
}

function animateTally(from, to, duration = 420) {
    const start = performance.now();
    runningTallyValue.classList.remove("tally-pop");
    void runningTallyValue.offsetWidth;
    runningTallyValue.classList.add("tally-pop");

    function update(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        runningTallyValue.textContent = Math.round(from + (to - from) * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function renderResult(item, animateScore = false) {
    formula.innerHTML = makeFormula(item.formula);
    currentShareResult = {
        item,
        score: 0,
        level: "Low concern"
    };
    shareButton.hidden = true;
    const hazards = item.hazards.map(hazard => ({ name: hazard, ...hazardScore(hazard) }));
    hazards.sort((a, b) => a.points - b.points);
    const finalScore = hazards.reduce((sum, hazard) => sum + hazard.points, 0);
    const rarity = dangerTierForScore(finalScore);
    formula.className = "formula rarity-" + rarity.toLowerCase();
    moleculeName.textContent = normalizeCompoundName(item.name);
    rarityKicker.textContent = "Safety data revealed";
    runningTally.hidden = true;
    runningTallyValue.textContent = "0";
    runningTally.classList.remove("final-tally");
    runningTally.querySelector(".running-tally-label").textContent = "Running score";
    shareButton.hidden = true;
    sdsLink.hidden = true;
    if (item.safetyUrl) {
        sdsLink.hidden = false;
        sdsLink.href = item.safetyUrl;
    } else {
        sdsLink.hidden = true;
    }
    hazardRow.innerHTML = "";
    sidebarHazards.innerHTML = "";

    if (animateScore) {
        runningTally.hidden = false;
        let currentTally = 0;
        hazards.forEach((hazard, index) => {
            setTimeout(() => {
                const badge = document.createElement("article");
                badge.className = "hazard-card reveal " + hazard.tier.toLowerCase();
                badge.innerHTML = `
                    <div class="hazard-card-head">
                        <span>${hazard.name}</span><strong>+${hazard.points} pts</strong>
                    </div>
                    <p>${hazard.description}</p>`;
                sidebarHazards.appendChild(badge);
                sidebarHazards.scrollTo({
                    top: sidebarHazards.scrollHeight,
                    behavior: "smooth"
                });
                playHazardNote(index);
                animateTally(currentTally, currentTally + hazard.points);
                currentTally += hazard.points;
                if (index === hazards.length - 1) {
                    setTimeout(() => {
                        revealFinalTally(rarity, finalScore);
                        playRarityArpeggio(rarity);
                        if (unlimitedMode) {
                            rollButton.textContent = "Roll again";
                            rollButton.disabled = false;
                        }
                    }, 1200);
                }
            }, 1200 * (index + 1));
        });
    } else {
        sidebarHazards.innerHTML = hazards.map(hazard =>
            `<article class="hazard-card ${hazard.tier.toLowerCase()}">
                <div class="hazard-card-head"><span>${hazard.name}</span><strong>+${hazard.points} pts</strong></div>
                <p>${hazard.description}</p>
            </article>`
        ).join("");
        runningTally.hidden = false;
        revealFinalTally(rarity, finalScore);
    }
}

function revealItem(item, saveResult) {
    activeRevealGeneration++;
    const revealGeneration = activeRevealGeneration;
    rollButton.disabled = true;
    stage.classList.add("rolling");
    molecule.classList.remove("revealed");
    moleculeName.textContent = "Analyzing safety data...";
    rarityKicker.textContent = "Rolling today's compound";
    hazardRow.innerHTML = "";
    sidebarHazards.innerHTML = '<p class="hazard-placeholder">Analyzing hazards...</p>';

    const tokens = splitFormula(item.formula);
    let revealedCount = 0;
    formula.innerHTML = '<span class="formula-secret">···</span>';
    moleculeName.textContent = "Reading molecular formula";

    const formulaRevealDuration = 3000;
    const elementInterval = formulaRevealDuration / tokens.length;
    activeRevealInterval = setInterval(() => {
        if (revealGeneration !== activeRevealGeneration) return;
        revealedCount++;
        formula.innerHTML = makeFormula(partialFormula(tokens, Math.min(revealedCount, tokens.length)));
    }, elementInterval);

    activeRevealTimeout = setTimeout(() => {
        if (revealGeneration !== activeRevealGeneration) return;
        clearInterval(activeRevealInterval);
        activeRevealInterval = null;
        activeRevealTimeout = null;
        stage.classList.remove("rolling");
        molecule.classList.add("revealed");
        renderResult(item, true);

        if (saveResult && !unlimitedMode) {
            storageSet(resultKey, JSON.stringify(item));
            archiveResult(item);
        } else if (saveResult && unlimitedMode) {
            archiveResult(item, true);
        }
        if (!unlimitedMode) {
            rollButton.textContent = "Today's roll complete";
            rollButton.disabled = true;
        }
    }, formulaRevealDuration);
}

function rollDaily() {
    if (unlimitedMode) {
        revealItem(randomCompound(), true);
        return;
    }

    const saved = storageGet(resultKey);
    if (saved) {
        try {
            renderResult(JSON.parse(saved), false);
        } catch (error) {
            storageRemove(resultKey);
            return;
        }
        rollButton.textContent = "Today's roll complete";
        rollButton.disabled = true;
        return;
    }

    revealItem(testRandomMode ? randomCompound() : dailyCompound(), true);
}

function resetForLocalMidnight() {
    activeRevealGeneration++;
    if (activeRevealInterval) clearInterval(activeRevealInterval);
    if (activeRevealTimeout) clearTimeout(activeRevealTimeout);
    activeRevealInterval = null;
    activeRevealTimeout = null;
    testRandomMode = false;
    formula.innerHTML = "C<sub>?</sub>";
    formula.className = "formula";
    moleculeName.textContent = unlimitedMode ? "Unlimited compound pending" : "Daily compound pending";
    rarityKicker.textContent = unlimitedMode ? "Unlimited roll" : "Today's molecule";
    hazardRow.innerHTML = "";
    sidebarHazards.innerHTML = '<p class="hazard-placeholder">Hazards will appear here</p>';
    runningTally.hidden = true;
    runningTallyValue.textContent = "0";
    runningTally.classList.remove("final-tally");
    runningTally.querySelector(".running-tally-label").textContent = "Running score";
    sdsLink.hidden = true;
    rollButton.textContent = unlimitedMode ? "Roll unlimited molecule" : "Reveal today's molecule";
    rollButton.disabled = false;
}

function checkLocalMidnight() {
    const nextDate = getLocalDateKey();
    if (nextDate === today) return;
    today = nextDate;
    resultKey = "chemdle-result-" + today;
    resetForLocalMidnight();
    showToast("A new day has started");
}

function scheduleMidnightRollover() {
    function scheduleExactMidnight() {
        const now = new Date();
        const midnight = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0, 0, 0, 100
        );
        setTimeout(() => {
            checkLocalMidnight();
            scheduleExactMidnight();
        }, midnight.getTime() - now.getTime());
    }
    scheduleExactMidnight();
    setInterval(checkLocalMidnight, 30 * 1000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkLocalMidnight();
    });
    window.addEventListener("focus", checkLocalMidnight);
}

async function initialize() {
    try {
        const response = await fetch("compounds.json?v=100");
        if (!response.ok) throw new Error("Unable to load compounds.json");
        compounds = await response.json();
    } catch (error) {
        compounds = [
            { name: "Sodium chloride", formula: "NaCl", weight: 28, hazards: ["Not a hazardous substance"] },
            { name: "Water", formula: "H₂O", weight: 25, hazards: ["No known hazards"] },
            { name: "Acetic acid", formula: "C₂H₄O₂", weight: 20, hazards: ["Skin corrosion", "Serious eye damage", "Respiratory irritation"] },
            { name: "Ethanol", formula: "C₂H₅OH", weight: 13, hazards: ["Highly flammable", "Eye irritation"] },
            { name: "Hydrogen peroxide", formula: "H₂O₂", weight: 10, hazards: ["Oxidizer", "Acute toxicity", "Serious eye damage"] },
            { name: "Acetone", formula: "C₃H₆O", weight: 9, hazards: ["Highly flammable", "Eye irritation", "Respiratory irritation"] },
            { name: "Ammonia", formula: "NH₃", weight: 5.5, hazards: ["Corrosive", "Acute toxicity", "Toxic to aquatic life", "Respiratory irritation"] },
            { name: "Benzene", formula: "C₆H₆", weight: 4, hazards: ["Carcinogen", "Mutagen", "Flammable", "Aspiration hazard"] },
            { name: "Mercury", formula: "Hg", weight: 2, hazards: ["Reproductive toxicity", "Organ toxicity", "Aquatic hazard", "Neurotoxin"] },
            { name: "Hydrogen cyanide", formula: "HCN", weight: 1.4, hazards: ["Fatal if inhaled", "Highly flammable", "Acute toxicity"] },
            { name: "Dimethylmercury", formula: "C₂H₆Hg", weight: 0.8, hazards: ["Fatal", "Neurotoxin", "Carcinogen", "Reproductive toxicity"] },
            { name: "Arsine", formula: "AsH₃", weight: 0.25, hazards: ["Fatal if inhaled", "Explosive", "Organ toxicity", "Aquatic hazard"] },
            { name: "Plutonium-239", formula: "²³⁹Pu", weight: 0.07, hazards: ["Radioactive", "Carcinogen", "Organ toxicity", "Reproductive toxicity"] }
        ];
    }

    const saved = storageGet(resultKey);
    if (saved && !unlimitedMode) {
        try {
            renderResult(JSON.parse(saved), false);
        } catch (error) {
            storageRemove(resultKey);
        }
        if (!storageGet(resultKey)) {
            rollButton.disabled = false;
            rollButton.textContent = "Reveal today's molecule";
            return;
        }
        rollButton.textContent = "Today's roll complete";
        rollButton.disabled = true;
    } else {
        rollButton.disabled = false;
        rollButton.textContent = unlimitedMode ? "Roll unlimited molecule" : "Reveal today's molecule";
    }
    modeButton.textContent = unlimitedMode ? "Switch to daily" : "Switch to unlimited";
    modeButton.title = unlimitedMode ? "Switch to daily mode" : "Switch to unlimited mode";
    modeButton.setAttribute("aria-label", unlimitedMode ? "Switch to daily mode" : "Switch to unlimited roll mode");
    if (menuModeButton) menuModeButton.textContent = unlimitedMode ? "Switch to daily" : "Switch to unlimited";
}

rollButton.addEventListener("click", rollDaily);
modeButton.addEventListener("click", () => {
    unlimitedMode = !unlimitedMode;
    storageSet("chemdle-mode", unlimitedMode ? "unlimited" : "daily");
    modeButton.textContent = unlimitedMode ? "Switch to daily" : "Switch to unlimited";
    modeButton.title = unlimitedMode ? "Switch to daily mode" : "Switch to unlimited mode";
    modeButton.setAttribute("aria-label", unlimitedMode ? "Switch to daily mode" : "Switch to unlimited roll mode");
    formula.innerHTML = "C<sub>?</sub>";
    formula.className = "formula";
    moleculeName.textContent = unlimitedMode ? "Unlimited compound pending" : "Daily compound pending";
    rarityKicker.textContent = unlimitedMode ? "Unlimited roll" : "Today's molecule";
    runningTally.hidden = true;
    sdsLink.hidden = true;
    shareButton.hidden = true;
    sidebarHazards.innerHTML = '<p class="hazard-placeholder">Hazards will appear here</p>';
    rollButton.textContent = unlimitedMode ? "Roll unlimited molecule" : "Reveal today's molecule";
    rollButton.disabled = false;
    showToast(unlimitedMode ? "Unlimited roll mode" : "Daily roll mode");
});
dangerButton.addEventListener("click", () => {
    dangerPopup.hidden = !dangerPopup.hidden;
});
dangerClose.addEventListener("click", () => {
    dangerPopup.hidden = true;
});
shareButton.addEventListener("click", shareDailyResult);
soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundButton.textContent = soundEnabled ? "♪" : "×";
    if (menuSoundButton) menuSoundButton.textContent = soundEnabled ? "Sound on" : "Sound off";
    showToast(soundEnabled ? "Sound on" : "Sound off");
});

const headerDropdown = document.getElementById("headerDropdown");
const menuSoundButton = document.getElementById("menuSoundButton");
const menuModeButton = document.getElementById("menuModeButton");
const menuDangerButton = document.getElementById("menuDangerButton");

function closeHeaderDropdown() {
    if (headerDropdown) headerDropdown.open = false;
}

menuSoundButton.addEventListener("click", () => {
    soundButton.click();
    menuSoundButton.textContent = soundEnabled ? "Sound on" : "Sound off";
    closeHeaderDropdown();
});
menuModeButton.addEventListener("click", () => {
    modeButton.click();
    menuModeButton.textContent = unlimitedMode ? "Switch to daily" : "Switch to unlimited";
    closeHeaderDropdown();
});
menuDangerButton.addEventListener("click", () => {
    dangerPopup.hidden = !dangerPopup.hidden;
    closeHeaderDropdown();
});

menuSoundButton.textContent = soundEnabled ? "Sound on" : "Sound off";
menuModeButton.textContent = unlimitedMode ? "Switch to daily" : "Switch to unlimited";

initialize();
scheduleMidnightRollover();
