from similarity import build_profiles, find_counterparts
import pandas as pd

raw = pd.read_csv("data/player_seasons.csv")

players, profiles, models = build_profiles(raw)

selected = players[players["league"] == "WNBA"].iloc[0]

print("Selected player:", selected["PLAYER_NAME"])

print(
    find_counterparts(
        players,
        profiles,
        player_id=selected["PLAYER_ID"],
        league="WNBA",
        n=5,
    )
)