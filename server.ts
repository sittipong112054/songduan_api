import http from "http";
import { app } from "./src/app";

const port = process.env.PORT || 3002;
const server = http.createServer(app);

server.listen(port, () => {
    console.log(`🚀 Server started on http://localhost:${port}`);
}).on("error", (error) => {
    console.error("❌ Server error:", error);
});
