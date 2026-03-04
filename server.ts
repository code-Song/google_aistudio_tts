import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Initialize Database
  const db = new Database("voice_lab.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  app.use(express.json({ limit: '50mb' })); // Allow large audio samples

  // API Routes
  app.get("/api/profile", (req, res) => {
    try {
      const row = db.prepare("SELECT data FROM profiles WHERE id = 1").get() as { data: string } | undefined;
      if (row) {
        res.json(JSON.parse(row.data));
      } else {
        res.status(404).json({ error: "No profile found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profile", (req, res) => {
    try {
      const profileData = JSON.stringify(req.body);
      db.prepare(`
        INSERT INTO profiles (id, data, updated_at) 
        VALUES (1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
      `).run(profileData);
      res.json({ success: true });
    } catch (err) {
      console.error("DB Save Error:", err);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
