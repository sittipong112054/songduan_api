import express from "express";
import { router as indexRouter } from "./controller/index";

export const app = express();

// Middleware
app.use(express.json());
app.use(express.text());

// Routes
app.use("/", indexRouter);
