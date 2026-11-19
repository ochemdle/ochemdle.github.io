# Chemdle

Chemdle is a static daily/unlimited chemical hazard RNG game.

## GitHub Pages

1. Create a GitHub repository and push this folder to the repository root.
2. Open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Open `https://<username>.github.io/<repository>/chemdle.html`.

No build step or server-side runtime is required. All pages use relative asset paths.

## Local storage

The browser stores:

- the current daily result
- the selected daily/unlimited mode
- up to 15 daily history entries
- up to 15 unlimited history entries

Storage uses guarded read/write helpers. Restricted or private browsers may reject storage;
the game continues in memory for the current page session.
