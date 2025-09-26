import { Router as _R } from "express";
import { conn as _conn } from "../lib/db";
import { asyncHandler } from "../middleware/asyncHandler";
// import { validateLatLng } from "../utils/geo";

const aRouter = _R();
export default aRouter;
