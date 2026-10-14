# Plan: put the NBA vs WNBA comparison app online

## Implementation status — 2026-10-14

- Phase 1 code changes are complete: dependencies pinned (including
  `nba_api==1.11.4`), all 14 deprecated width arguments replaced, bytecode
  untracked, root ignore rules added, and local run instructions corrected.
- The smoke test also covers profile navigation, all three profile datasets,
  percentage-unit regression checks, and return navigation. A discovered profile
  display bug was corrected: `TM_TOV_PCT` already uses percentage units and must
  not be multiplied by 100. The model and data are unchanged.
- Local AppTest and Chrome checks are documented in [REVIEW.md](REVIEW.md), along
  with model sensitivity observations and UI recommendations.
- The first cloud build failed during dependency installation: the installer split
  `NBA vs WNBA/requirements.txt` and tried to install `WNBA/requirements.txt`.
  The folder-name fallback is now applied locally: `nba_vs_wnba/`. README commands
  and the portfolio source link use the new path.
- The failed build used Python **3.14.8**, not the tested **3.13**. This did not
  cause the path-parsing error, but the replacement deployment should select 3.13.
- Before pushing the rename, delete the failed app in Community Cloud. Then push
  the prepared commit and redeploy with `nba_vs_wnba/app.py` and Python **3.13**.
  Streamlit recommends deleting the old deployment before changing its GitHub
  coordinates to preserve access to app administration:
  [entrypoint changes](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/rename-your-app),
  [Python version changes](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/upgrade-python).
- Phase 2 remains an owner login step. A public successful build is still pending.
- Phase 3 remains pending a real, verified public URL. The README has a clear
  placeholder; no speculative live link has been added to the portfolio.

The original preparation checklist follows for reference; Phase 2 below uses the corrected path.

## Goal

Recruiters visiting the portfolio (`Portfolio_Website/index.html`) can click a link and use the
Cross-League Player Comps app in their browser. Today the portfolio only links to source code on
GitHub, so nobody can see the comparisons without cloning the repo.

## What is already true (verified 2026-10-14)

- **The app works locally.** From this folder, `streamlit run app.py` starts it. A headless
  `streamlit.testing` run that searches "A'ja Wilson — WNBA (2025)" returns Anthony Davis,
  Jaren Jackson Jr., John Collins, ... with no exceptions or error boxes. It also works when
  launched from the repo root, which matters because Community Cloud runs apps from the repo root.
- **Working local versions:** Python 3.13.7, streamlit 1.64.0, pandas 3.0.5, numpy 2.5.3,
  scikit-learn 1.9.1, plotly 7.1.0, requests 2.34.2, Pillow 12.3.0, nba_api (installed).
- **Runtime files:** `app.py`, `similarity_v3.py`, `similarity.py` (imported by `similarity_v3.py`
  as `previous_model`; the README's file list leaves it out), `data/player_seasons.csv`, and
  `data/profile_stats/*.csv` (about 11 MB). All are committed. Paths are anchored to
  `Path(__file__)`, so the working directory does not matter.
- **Network at runtime:** only player headshots from `cdn.nba.com` / `cdn.wnba.com`. The app does
  not call `nba_api` or `stats.nba.com` at runtime; only the `download_*.py` scripts do.
- **Problems to fix before deploying:**
  - `requirements.txt` is unpinned, so a fresh cloud install may pull versions that behave
    differently from the tested ones.
  - `use_container_width=True` appears 14 times in `app.py`. Streamlit warns it "will be removed
    after 2025-12-31". It still works on 1.64.0 but will break on some future release.
  - `__pycache__/*.pyc` files are committed.
  - The folder name `NBA vs WNBA` contains spaces (see the fallback in step 5).

## Hosting decision

Use **Streamlit Community Cloud** (free; deploys straight from this GitHub repo). GitHub Pages
cannot run Python. Relevant platform rules (from docs.streamlit.io):

- The entrypoint can be in a subdirectory. `requirements.txt` is looked up next to the
  entrypoint first, then at the repo root. Keep it in `nba_vs_wnba/`; there is no root
  `requirements.txt` to conflict with it.
- `.streamlit/config.toml`, if used, must be at the **repo root**, not in this folder.
- Apps sleep after **12 hours without traffic**. Any visitor can wake one with a button on the
  sleep page (it takes roughly 30–60 s).

## Tasks for the agent (Phase 1: make it deployable)

Work only inside `NBA vs WNBA/` except where a step says otherwise. Do not change the similarity
model, feature weights, `MODEL_VERSION`, or anything under `data/`.

1. **Pin dependencies.** Rewrite `requirements.txt` with `==` pins matching the verified versions
   above. For `nba_api`, run `pip show nba_api` and pin that version.
2. **Replace the deprecated argument.** In `app.py`, change every `use_container_width=True` to
   `width="stretch"`. The 14 call sites are `st.image` (line ~425), `st.button` (~462, ~1446,
   ~1462), `st.dataframe` (~543, ~770, ~800, ~853, ~897, ~932, ~1059, ~1097) and
   `st.plotly_chart` (~1038, ~1524). Line numbers are approximate; grep for the string.
   Afterwards `grep -c use_container_width app.py` must print `0`, and the layout must look
   unchanged (full-width tables, charts and buttons).
3. **Stop tracking bytecode.** `git rm -r --cached "NBA vs WNBA/__pycache__"` and add a root
   `.gitignore` (none exists yet) containing `__pycache__/`, `*.pyc`, `.venv/`, `.DS_Store`.
4. **Add a smoke test** at `NBA vs WNBA/smoke_test.py`:

   ```python
   from pathlib import Path

   from streamlit.testing.v1 import AppTest

   APP = Path(__file__).resolve().parent / "app.py"

   at = AppTest.from_file(str(APP), default_timeout=180)
   at.run()
   assert not at.exception, [e.value for e in at.exception]

   search = at.selectbox[0]
   target = next(
       o for o in search.options
       if o.startswith("A'ja Wilson") and "WNBA" in o
   )
   search.select(target)
   at.run()
   assert not at.exception, [e.value for e in at.exception]
   assert not at.error, [e.value for e in at.error]

   labels = [b.label for b in at.button if b.label]
   assert labels and "Anthony Davis" in labels[0], labels
   print("OK:", labels[:3])
   ```

   Run it with `python3 smoke_test.py`. It must print `OK: ...` with no
   `use_container_width` warnings in the output.
5. **Folder name (fallback only).** Try deploying with the path as-is first. If the Community Cloud
   form rejects `NBA vs WNBA/app.py` or the build cannot find files, rename the folder with
   `git mv "NBA vs WNBA" nba_vs_wnba`, then update the "View code" link in
   `Portfolio_Website/index.html` (currently `.../tree/main/NBA%20vs%20WNBA`) and any paths in
   the README.
6. **Fix the README's run instructions.** Replace the "TO ACCESS THE APP, DOWNLOAD THESE
   FILES/FOLDERS" block at the top of `README.md` with:
   - a "Live app" line (placeholder until Phase 3 fills in the URL);
   - "Run locally": `cd nba_vs_wnba`, `pip install -r requirements.txt`,
     `streamlit run app.py`, then open http://localhost:8501;
   - the corrected runtime file list, including `similarity.py`.
7. **Commit** with a clear message and push to `main` once the smoke test passes.

## Phase 2: deploy (the repo owner does this; it needs their GitHub login)

1. Go to https://share.streamlit.io and sign in with the GitHub account `moloruns`.
   Delete the failed app before pushing the folder rename. In GitHub Desktop,
   push the prepared commit to `main` after deletion. Keep the current subdomain
   if you want to reuse it for the replacement deployment.
2. Click **Create app**, then **Deploy a public app from GitHub**:
   - Repository: `moloruns/moloruns.github.io`
   - Branch: `main`
   - Main file path: `nba_vs_wnba/app.py`
   - App URL: choose a readable subdomain, e.g. `nba-wnba-comps` → `https://nba-wnba-comps.streamlit.app`
   - Advanced settings → Python version: **3.13** (matches the tested environment)
3. Deploy, wait for the build, then open the URL in a private/incognito window and search a player.
4. If the build still fails, inspect the new log; it should reference
   `nba_vs_wnba/requirements.txt` and Python 3.13, without the old spaced path.

## Phase 3: link it from the portfolio (agent, after the URL exists)

1. In `Portfolio_Website/index.html`, in the "NBA vs. WNBA Player Comparison Tool" article, keep the
   "View code" link and add a live link after it, following the PokeJam and LeBron entries:

   ```html
   <a href="https://github.com/moloruns/moloruns.github.io/tree/main/nba_vs_wnba" target="_blank">View code</a>
   <br>
   <a href="https://<subdomain>.streamlit.app" target="_blank" rel="noopener noreferrer">Open the app</a>
   ```

   The existing CSS already styles project links; no CSS change is needed.
2. Put the same URL in the README's "Live app" line.

## Acceptance criteria

- In a logged-out browser, the Streamlit URL loads without a sign-in prompt.
- Searching "A'ja Wilson" shows ranked NBA counterparts, the radar chart and the player cards with
  headshots, with no red error boxes.
- Clicking a counterpart's person icon opens its profile page; the per-game, advanced and totals
  tabs show data.
- "Open the app" on the portfolio opens the live app in a new tab.
- `python3 smoke_test.py` passes, and `app.py` contains no `use_container_width`.

## Out of scope

- Refreshing data to newer seasons. `stats.nba.com` commonly blocks cloud IPs, so any refresh means
  running the `download_*.py` / `make_player_seasons.py` scripts locally and committing the CSVs.
- Model, weighting or UI redesign.
- Other projects in the repo (`PokeJam/`, `crossy_mon/`, `lebron_chat/`).

## Note for the repo owner

Because apps sleep after 12 hours idle, open the link yourself shortly before an interview or
application push so a recruiter does not land on the wake-up screen.
