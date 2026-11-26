import { cache } from "react";
import { loadDataset } from "../engine/load";
import { getSql } from "./db";

/** The whole dataset, read once per request (layout and page share it via React cache). */
export const getDataset = cache(async () => loadDataset(getSql()));
