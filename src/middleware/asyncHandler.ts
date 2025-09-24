import { Request, Response, NextFunction } from "express";

export const asyncHandler =
    <T extends (...args: any[]) => Promise<any>>(fn: T) =>
        (req: Request, res: Response, next: NextFunction) =>
            fn(req, res, next).catch(next);
