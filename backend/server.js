
import express from "express";
import crypto from "node:crypto";

const app = express();

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-code");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "32kb" }));

const ACCESS_CODE = process.env.LADYDRIVE_ACCESS_CODE;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.get("/", (req, res) => {
  res.json({
    app: "LadyDrive AI",
    status: "online",
    provider: "gemini"
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!ACCESS_CODE || !GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Server configuration incomplete"
      });
    }

    const supplied = req.get("x-access-code") || "";
    const a = Buffer.from(supplied);
    const b = Buffer.from(ACCESS_CODE);

    if (a.length !== b.length ||
        !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const { message, car, history } = req.body || {};

    if (typeof message !== "string" ||
        !message.trim() ||
        message.length > 2000) {
      return res.status(400).json({
        error: "Invalid message"
      });
    }

    const safeCar = typeof car === "string"
      ? car.slice(0, 500)
      : JSON.stringify(car || {}).slice(0, 500);

    const safeHistory = Array.isArray(history)
      ? history.slice(-10)
          .filter(x =>
            x &&
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string"
          )
          .map(x => ({
            role: x.role === "assistant" ? "model" : "user",
            parts: [{ text: x.content.slice(0, 2000) }]
          }))
      : [];

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text:
                  "Ты LadyDrive, дружелюбный русскоязычный " +
                  "автомобильный ИИ-помощник. Помогай с " +
                  "диагностикой, обслуживанием и ремонтом. " +
                  "Не выдавай предположения за точный диагноз. " +
                  "При опасных неисправностях советуй " +
                  "остановиться и обратиться к специалисту. " +
                  "Данные автомобиля: " + safeCar
              }]
            },
            contents,
            generationConfig: {
              maxOutputTokens: 700
            }
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("Gemini API failed:", response.status);
      return res.status(502).json({
        error: "Gemini API error: " + response.status
      });
    }

    const data = await response.json();

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    res.json({
      reply: reply || "Не удалось получить ответ."
    });

  } catch (error) {
    console.error("Gemini request failed:", error.message);
    res.status(500).json({
      error: "AI service unavailable"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("LadyDrive Gemini server started");
});
