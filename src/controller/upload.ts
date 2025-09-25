import path from "path";
import { Router } from "express";

const router = Router();
export default router;

router.get("/:filename", (req, res) => {
    const filename = req.params.filename;
    const download = req.query.download || undefined;
    if (download === "true") {
        res.download(path.join(__dirname, "../uploads", filename));
    } else {
        res.sendFile(path.join(__dirname, "../uploads", filename));
    }
});