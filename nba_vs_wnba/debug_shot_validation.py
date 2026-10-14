from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent

path = (
    ROOT
    / "data"
    / "shot_locations"
    / "NBA_2024-25_integration_problems.csv"
)

df = pd.read_csv(path)

count_columns = [
    "RIM_FGA",
    "PAINT_FGA",
    "MIDRANGE_FGA",
    "LEFT_CORNER_FGA",
    "RIGHT_CORNER_FGA",
    "ABOVE_BREAK_FGA",
    "BACKCOURT_FGA",
    "TOTAL_FGA",
    "TOTAL_FG3A",
    "TOTAL_FTA",
]

df["FGA_DIFF"] = df["ZONE_FGA"] - df["TOTAL_FGA"]
df["THREE_DIFF"] = df["ZONE_FG3A"] - df["TOTAL_FG3A"]

df["MISSING_FIELDS"] = df[count_columns].apply(
    lambda row: ", ".join(row.index[row.isna()]),
    axis=1,
)

df["NEGATIVE_FIELDS"] = df[count_columns].apply(
    lambda row: ", ".join(row.index[row.lt(0)]),
    axis=1,
)

df["POSITIVE_TOTAL_FGA"] = df["TOTAL_FGA"].gt(0)

columns = [
    "PLAYER_NAME",
    "TOTAL_FGA",
    "ZONE_FGA",
    "FGA_DIFF",
    "TOTAL_FG3A",
    "ZONE_FG3A",
    "THREE_DIFF",
    "BACKCOURT_FGA",
    "MISSING_FIELDS",
    "NEGATIVE_FIELDS",
    "POSITIVE_TOTAL_FGA",
]

print(df[columns].to_string(index=False))