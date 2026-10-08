"""Export only the static app and its attribution, never local logs or credentials."""
import argparse
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "play.html", "compare.html", "pokedex.html")
DIRECTORIES = ("css", "js", "data", "assets")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="New, empty output directory")
    destination = parser.parse_args().destination.resolve()
    if destination == ROOT or destination in ROOT.parents:
        parser.error("Output cannot replace the project or its parents")
    if any(destination == ROOT / name or ROOT / name in destination.parents for name in DIRECTORIES):
        parser.error("Output cannot be inside a runtime source directory")
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        parser.error("Output must be empty; choose a new directory")
    destination.mkdir(parents=True, exist_ok=True)
    for name in PAGES:
        shutil.copy2(ROOT / name, destination / name)
    for name in DIRECTORIES:
        shutil.copytree(ROOT / name, destination / name, ignore=shutil.ignore_patterns(".DS_Store", "__pycache__"))
    (destination / ".nojekyll").touch()
    print(f"Static site exported to {destination}; serve it or upload it to a static host.")


if __name__ == "__main__":
    main()
