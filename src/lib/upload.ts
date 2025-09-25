// lib/upload.ts
import multer from "multer";
import path from "path";
import fs from "fs";

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, file, cb) => {
        const dir =
            file.fieldname === "vehiclePhotoFile"
                ? "uploads/vehicles"
                : "uploads/avatars";
        ensureDir(dir);
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ts = Date.now();
        const ext = path.extname(file.originalname || "");
        const base =
            file.fieldname === "vehiclePhotoFile" ? "vehicle" : "avatar";
        cb(null, `${base}_${ts}${ext || ""}`);
    },
});

export const uploadMedia = multer({ storage });
