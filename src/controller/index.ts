import express from "express";

export const router = express.Router();

router.get("/", (req, res) => {
    res.send("GET in index.ts");
});

router.post("/", (req, res) => {
    const body = req.body;
    res.send("POST in index.ts, body: " + JSON.stringify(body));
});
