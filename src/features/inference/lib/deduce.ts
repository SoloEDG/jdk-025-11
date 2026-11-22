import type { Analysis, PublicBoard } from "../../../shared/types";
import type { SeismicSurvey } from "../../../shared/types";
import { analyzeSeismic } from "../../seismic/lib/solver";
export function analyze(board: PublicBoard, surveys: SeismicSurvey[]): Analysis {
  return analyzeSeismic(board, surveys);
}
