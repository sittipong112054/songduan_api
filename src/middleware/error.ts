import { Request, Response, NextFunction } from "express";

export function errorHandler(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    const status = Number(err?.status) || 500;
    const code = err?.code || "ERR_UNEXPECTED";
    const message = err?.message || "Unexpected error";
    if (status >= 500) {
        console.error("[ERR]", err);
    }
    res.status(status).json({ error: { code, message } });
}
